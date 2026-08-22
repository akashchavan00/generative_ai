# Excel QA Pipeline (local, DuckDB + LanceDB + Groq)

Sketch pipeline for question-answering over a large multi-sheet Excel workbook
(millions of rows, thousands of columns) without ever loading the full data
into an LLM's context window.

## How it works
1. **`ingest.py`** — streams each sheet out to Parquet in chunks, then loads
   it into a local DuckDB file as a table (one table per sheet).
2. **`catalog.py`** — builds a description for every column, embeds those
   descriptions for semantic column retrieval, and separately builds a
   vector index over any free-text column's *values* for semantic row search.
3. **`query.py`** — for each question: classifies it (SQL / semantic / mixed),
   retrieves only the relevant columns from the catalog, optionally narrows
   to semantically matched rows, generates SQL, executes it against DuckDB
   (retrying once on error), and writes a final answer grounded in the
   returned rows only.

## Setup
```bash
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

Add your key to a `.env` file in the project root (already present):
```
GROQ_API_KEY=your_key_here
```
`query.py` loads this automatically via `python-dotenv`. Model used: `openai/gpt-oss-120b` via Groq's OpenAI-compatible API.

## Run
```bash
# 1. Ingest the workbook (one time, or whenever data changes)
python ingest.py --xlsx path/to/workbook.xlsx --outdir data --db data/warehouse.duckdb

# 2. Build the column + text catalog (one time, or whenever schema/data changes)
python catalog.py --db data/warehouse.duckdb --lancedir data/lancedb

# 3. Ask questions
python query.py --db data/warehouse.duckdb --lancedir data/lancedb \
  --question "What is the total revenue for orders where the notes mention delayed shipment?"
```

## Notes / things to tune for your real data
- **Column classification** (`infer_column_kind` in `catalog.py`) is a cheap
  heuristic. For 4000 columns you may want to spot-check a sample and adjust
  the thresholds, or swap in an LLM pass if the heuristic misclassifies a lot.
- **`rowid`** is used as DuckDB's implicit row identifier for joining semantic
  search hits back to full rows. If you truncate/rebuild tables often, prefer
  adding an explicit surrogate key instead of relying on `rowid`.
- **Performance**: DuckDB can query Parquet directly without loading it into
  the `.duckdb` file if you're tight on disk — swap `CREATE TABLE ... AS SELECT`
  for a `CREATE VIEW` over `read_parquet(...)` in `ingest.py` if so.
- **Cost/latency**: `TOP_K_COLUMNS` and `TOP_K_TEXT_MATCHES` in `query.py`
  control how much context goes into each Claude call — tune down for speed,
  up for recall on very wide/sparse data.
- **Retry logic** in `run_sql_with_retry` only retries once — bump
  `max_retries` if you see it giving up too early on complex questions.
