"""
Step 2: Build a column catalog for every table in the DuckDB warehouse,
embed the column descriptions for semantic retrieval, and separately
index free-text column values for semantic search over cell content.

Usage:
    python catalog.py --db data/warehouse.duckdb --lancedir data/lancedb
"""

import argparse
import duckdb
import lancedb
import pandas as pd
from sentence_transformers import SentenceTransformer

TEXT_LEN_THRESHOLD = 40      # avg string length above this -> treat as "free text"
SAMPLE_ROWS = 200            # rows sampled per column to infer type/content
MAX_TEXT_VALUES_PER_TABLE = 200_000  # safety cap when indexing free text


def infer_column_kind(con, table, col, dtype):
    """Cheaply classify a column as numeric / categorical / free_text."""
    if any(t in dtype.lower() for t in ["int", "double", "float", "decimal", "numeric"]):
        return "numeric"

    sample = con.execute(
        f'SELECT "{col}" FROM {table} WHERE "{col}" IS NOT NULL USING SAMPLE {SAMPLE_ROWS} ROWS'
    ).fetchdf()[col].astype(str)

    if sample.empty:
        return "categorical"

    avg_len = sample.str.len().mean()
    n_unique = sample.nunique()

    if avg_len >= TEXT_LEN_THRESHOLD:
        return "free_text"
    if n_unique <= max(20, SAMPLE_ROWS * 0.2):
        return "categorical"
    return "numeric_like_text"


def build_catalog(db_path: str, lancedir: str):
    con = duckdb.connect(db_path)
    tables = [r[0] for r in con.execute("SHOW TABLES").fetchall()]

    model = SentenceTransformer("all-MiniLM-L6-v2")  # runs locally on CPU
    db = lancedb.connect(lancedir)

    catalog_rows = []

    for table in tables:
        print(f"\nScanning table '{table}' ...")
        schema = con.execute(f"DESCRIBE {table}").fetchdf()

        for _, row in schema.iterrows():
            col, dtype = row["column_name"], row["column_type"]
            kind = infer_column_kind(con, table, col, dtype)

            sample_vals = con.execute(
                f'SELECT DISTINCT "{col}" FROM {table} WHERE "{col}" IS NOT NULL LIMIT 5'
            ).fetchdf()[col].astype(str).tolist()

            description = (
                f"Table '{table}', column '{col}'. Type: {dtype} ({kind}). "
                f"Example values: {', '.join(sample_vals)[:200]}"
            )

            catalog_rows.append({
                "table": table,
                "column": col,
                "dtype": dtype,
                "kind": kind,
                "description": description,
            })

        # Index free-text column values separately for semantic search over content
        text_cols = [r["column"] for r in catalog_rows
                     if r["table"] == table and r["kind"] == "free_text"]

        if text_cols:
            print(f"  Indexing free-text values for columns: {text_cols}")
            index_free_text(con, db, table, text_cols, model)

    # Embed and store the column catalog itself (for column retrieval at query time)
    print("\nEmbedding column catalog ...")
    cat_df = pd.DataFrame(catalog_rows)
    embeddings = model.encode(cat_df["description"].tolist(), show_progress_bar=True)
    cat_df["vector"] = list(embeddings)

    if "column_catalog" in db.table_names():
        db.drop_table("column_catalog")
    db.create_table("column_catalog", data=cat_df)

    con.close()
    print(f"\nCatalog built: {len(cat_df)} columns across {len(tables)} tables.")
    print(f"LanceDB tables: {db.table_names()}")


def index_free_text(con, db, table, text_cols, model, primary_key="rowid"):
    """
    Build a semantic index over free-text column values so we can
    later find matching rows by meaning, not just exact SQL filters.
    Assumes each table has an implicit rowid (DuckDB provides this).
    """
    for col in text_cols:
        df = con.execute(f"""
            SELECT rowid AS row_id, "{col}" AS value
            FROM {table}
            WHERE "{col}" IS NOT NULL
            LIMIT {MAX_TEXT_VALUES_PER_TABLE}
        """).fetchdf()

        if df.empty:
            continue

        df["value"] = df["value"].astype(str)
        embeddings = model.encode(df["value"].tolist(), show_progress_bar=False)
        df["vector"] = list(embeddings)
        df["table"] = table
        df["column"] = col

        lance_table_name = f"text_{table}_{col}"
        if lance_table_name in db.table_names():
            db.drop_table(lance_table_name)
        db.create_table(lance_table_name, data=df)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default="data/warehouse.duckdb")
    ap.add_argument("--lancedir", default="data/lancedb")
    args = ap.parse_args()
    build_catalog(args.db, args.lancedir)


if __name__ == "__main__":
    main()
