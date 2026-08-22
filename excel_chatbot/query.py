"""
Step 3: Ask questions over the warehouse.

Flow per question:
  1. Classify: numeric/lookup (needs SQL), semantic (needs text search), or mixed.
  2. Retrieve the most relevant columns from the embedded column catalog
     (so we never dump a 4000-column schema into the prompt).
  3. If semantic: search the free-text vector index for matching rows first.
  4. Generate SQL against only the shortlisted schema (+ optional row-id filter
     from step 3), execute in DuckDB, retry once on error using the error message.
  5. Synthesize a final natural-language answer strictly from the returned rows.

Usage:
    # GROQ_API_KEY must be set in a .env file in this directory (see README)
    python query.py --db data/warehouse.duckdb --lancedir data/lancedb \
        --question "What was total revenue for customers in the notes mentioning 'delayed shipment'?"
"""

import argparse
import json
import duckdb
import lancedb
from dotenv import load_dotenv
from sentence_transformers import SentenceTransformer
from groq import Groq

load_dotenv()  # pulls GROQ_API_KEY out of .env into the environment

MODEL = "openai/gpt-oss-120b"
TOP_K_COLUMNS = 40
TOP_K_TEXT_MATCHES = 50

client = Groq()  # reads GROQ_API_KEY from the environment
embedder = SentenceTransformer("all-MiniLM-L6-v2")


def call_llm(prompt: str, max_completion_tokens: int) -> str:
    """
    Wrapper around the Groq chat completion call.

    openai/gpt-oss-120b is a reasoning model: it spends some of its token
    budget on hidden "reasoning" tokens before writing the final answer.
    We use `reasoning_effort="low"` to keep that overhead small, and size
    `max_completion_tokens` with enough headroom for both the reasoning
    and the actual answer (the deprecated `max_tokens` param does not
    leave room for this and can silently return an empty answer).
    """
    resp = client.chat.completions.create(
        model=MODEL,
        max_completion_tokens=max_completion_tokens,
        reasoning_effort="low",
        messages=[{"role": "user", "content": prompt}],
    )
    return (resp.choices[0].message.content or "").strip()


def classify_question(question: str) -> str:
    prompt = f"""Classify this question about a tabular dataset into exactly one label:
- "sql": needs numeric aggregation, filtering, sorting, or exact-field lookup
- "semantic": needs finding rows based on the *meaning* of free-text content
- "mixed": needs both (e.g. filter by text meaning, then aggregate/compute)

Question: {question}

Reply with only the single label word."""
    return call_llm(prompt, max_completion_tokens=60).lower()


def retrieve_relevant_columns(db, question: str, k: int = TOP_K_COLUMNS):
    cat_table = db.open_table("column_catalog")
    qvec = embedder.encode([question])[0]
    results = cat_table.search(qvec).limit(k).to_pandas()
    return results[["table", "column", "dtype", "kind", "description"]]


def semantic_row_search(db, con, question: str, k: int = TOP_K_TEXT_MATCHES):
    """Search all free-text indexes and return matching (table, row_id) pairs."""
    qvec = embedder.encode([question])[0]
    matches = {}
    for name in db.table_names():
        if not name.startswith("text_"):
            continue
        tbl = db.open_table(name)
        res = tbl.search(qvec).limit(k).to_pandas()
        if res.empty:
            continue
        table = res["table"].iloc[0]
        matches.setdefault(table, set()).update(res["row_id"].tolist())
    return matches


def build_schema_snippet(cols_df) -> str:
    lines = []
    for _, r in cols_df.iterrows():
        lines.append(f'- {r["table"]}."{r["column"]}" ({r["dtype"]}, {r["kind"]})')
    return "\n".join(lines)


def generate_sql(question: str, schema_snippet: str, row_filter_hint: str = "") -> str:
    prompt = f"""You are generating a single DuckDB SQL query to answer a question.

Relevant columns (only use these, quote column names exactly as given):
{schema_snippet}

{row_filter_hint}

Question: {question}

Rules:
- Return ONLY the SQL query, no explanation, no markdown fences.
- Use only tables/columns listed above.
- If you need to limit result size for readability, add a reasonable LIMIT.
"""
    sql = call_llm(prompt, max_completion_tokens=1000)
    return sql.strip("`").replace("sql\n", "", 1) if sql.startswith("```") else sql


def run_sql_with_retry(con, sql: str, question: str, schema_snippet: str, max_retries: int = 1):
    for attempt in range(max_retries + 1):
        try:
            return con.execute(sql).fetchdf(), sql
        except Exception as e:
            if attempt == max_retries:
                raise
            fix_prompt = f"""This DuckDB SQL query failed:

{sql}

Error: {e}

Relevant columns:
{schema_snippet}

Question it was meant to answer: {question}

Return ONLY a corrected SQL query, no explanation, no markdown fences."""
            sql = call_llm(fix_prompt, max_completion_tokens=1000).strip("`")


def synthesize_answer(question: str, result_df) -> str:
    preview = result_df.head(200).to_csv(index=False)
    prompt = f"""Answer the question using ONLY the data below. Be concise and specific.
If the data doesn't answer the question, say so.

Question: {question}

Data (CSV):
{preview}

Answer:"""
    return call_llm(prompt, max_completion_tokens=1000)


def answer_question(con, db, question: str):
    qtype = classify_question(question)
    print(f"[classified as: {qtype}]")

    cols_df = retrieve_relevant_columns(db, question)
    schema_snippet = build_schema_snippet(cols_df)

    row_filter_hint = ""
    if qtype in ("semantic", "mixed"):
        matches = semantic_row_search(db, con, question)
        if matches:
            # Give the SQL generator a concrete way to restrict to semantically matched rows
            filters = []
            for table, row_ids in matches.items():
                ids_list = ",".join(str(i) for i in list(row_ids)[:500])
                filters.append(f"{table}.rowid IN ({ids_list})")
            row_filter_hint = (
                "Semantic search already found relevant rows. Restrict your query to these:\n"
                + "\n".join(filters)
            )

    sql = generate_sql(question, schema_snippet, row_filter_hint)
    print(f"[generated SQL]\n{sql}\n")

    result_df, final_sql = run_sql_with_retry(con, sql, question, schema_snippet)
    print(f"[{len(result_df)} rows returned]")

    return synthesize_answer(question, result_df)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default="data/warehouse.duckdb")
    ap.add_argument("--lancedir", default="data/lancedb")
    ap.add_argument("--question", required=True)
    args = ap.parse_args()

    con = duckdb.connect(args.db)
    db = lancedb.connect(args.lancedir)

    answer = answer_question(con, db, args.question)
    print("\n=== ANSWER ===")
    print(answer)

    con.close()


if __name__ == "__main__":
    main()
