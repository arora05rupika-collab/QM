"""
MigrateAI — main server
Run:  python3 main.py
Open: http://localhost:8000
"""
import json, uuid, os, asyncio
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

import database as db
import connectors as registry
import ai_mapper
import migrator
import trainer

# ── Boot ──────────────────────────────────────────────────────────────────────
db.init()
app = FastAPI(title="MigrateAI", version="1.0.0")

@app.on_event("startup")
async def _start_trainer():
    asyncio.create_task(trainer.daily_training_loop(interval_hours=24))
app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_methods=["*"], allow_headers=["*"])

# ── Serve frontend ─────────────────────────────────────────────────────────────
@app.get("/", response_class=HTMLResponse)
def root():
    path = os.path.join(os.path.dirname(__file__), "index.html")
    return open(path).read()

# ── Connector types ────────────────────────────────────────────────────────────
@app.get("/api/connector-types")
def connector_types():
    return {
        "types": [
            {"id": "csv",        "label": "CSV Files",       "icon": "📄"},
            {"id": "postgresql", "label": "PostgreSQL",       "icon": "🐘"},
            {"id": "mysql",      "label": "MySQL / MariaDB",  "icon": "🐬"},
            {"id": "salesforce", "label": "Salesforce",       "icon": "☁️"},
            {"id": "sap",        "label": "SAP",              "icon": "🏭"},
            {"id": "oracle",     "label": "Oracle ERP",       "icon": "🔴"},
            {"id": "dynamics",   "label": "MS Dynamics 365",  "icon": "🪟"},
            {"id": "netsuite",   "label": "NetSuite",         "icon": "🌐"},
            {"id": "quickbooks", "label": "QuickBooks",       "icon": "💚"},
            {"id": "hubspot",    "label": "HubSpot",          "icon": "🧡"},
            {"id": "zoho",       "label": "Zoho",             "icon": "🟣"},
            {"id": "rest_api",   "label": "Generic REST API", "icon": "🔌"},
        ]
    }

# ── Connectors ─────────────────────────────────────────────────────────────────
class ConnectorIn(BaseModel):
    name: str
    type: str
    config: dict

@app.post("/api/connectors", status_code=201)
def create_connector(body: ConnectorIn):
    cid = str(uuid.uuid4())
    conn = db.get_conn()
    conn.execute(
        "INSERT INTO connectors (id,name,type,config) VALUES (?,?,?,?)",
        (cid, body.name, body.type, json.dumps(body.config))
    )
    conn.commit(); conn.close()
    return {"id": cid, "name": body.name, "type": body.type}

@app.get("/api/connectors")
def list_connectors():
    conn = db.get_conn()
    rows = conn.execute("SELECT id,name,type,tested_ok,created_at FROM connectors").fetchall()
    conn.close()
    return db.rows_to_list(rows)

@app.get("/api/connectors/{cid}")
def get_connector(cid: str):
    conn = db.get_conn()
    row = conn.execute("SELECT id,name,type,tested_ok,schema_json,created_at FROM connectors WHERE id=?", (cid,)).fetchone()
    conn.close()
    if not row: raise HTTPException(404, "Connector not found")
    d = db.row_to_dict(row)
    if d.get("schema_json"):
        d["schema"] = json.loads(d["schema_json"])
    return d

@app.post("/api/connectors/{cid}/test")
async def test_connector(cid: str):
    row = _get_connector_row(cid)
    c = registry.build(row["type"], json.loads(row["config"]))
    ok, msg = await c.test()
    conn = db.get_conn()
    conn.execute("UPDATE connectors SET tested_ok=? WHERE id=?", (1 if ok else 0, cid))
    conn.commit(); conn.close()
    return {"ok": ok, "message": msg}

@app.post("/api/connectors/{cid}/schema")
async def get_schema(cid: str):
    row = _get_connector_row(cid)
    c = registry.build(row["type"], json.loads(row["config"]))
    schema = await c.get_schema()
    schema_dict = c.to_schema_dict(schema)
    conn = db.get_conn()
    conn.execute("UPDATE connectors SET schema_json=? WHERE id=?",
                 (json.dumps(schema_dict), cid))
    conn.commit(); conn.close()
    return schema_dict

@app.delete("/api/connectors/{cid}")
def delete_connector(cid: str):
    conn = db.get_conn()
    conn.execute("DELETE FROM connectors WHERE id=?", (cid,))
    conn.commit(); conn.close()
    return {"ok": True}

# ── Migrations ─────────────────────────────────────────────────────────────────
class MigrationIn(BaseModel):
    name: str
    source_id: str
    target_id: str
    entities: list[dict]          # [{source_entity, target_entity}]
    config: Optional[dict] = None # {batch_size, mode, dry_run}

@app.post("/api/migrations", status_code=201)
def create_migration(body: MigrationIn):
    mid = str(uuid.uuid4())
    conn = db.get_conn()
    conn.execute(
        "INSERT INTO migrations (id,name,source_id,target_id,entities,config) VALUES (?,?,?,?,?,?)",
        (mid, body.name, body.source_id, body.target_id,
         json.dumps(body.entities),
         json.dumps(body.config or {"batch_size": 500, "mode": "upsert", "dry_run": False}))
    )
    conn.commit(); conn.close()
    return {"id": mid}

@app.get("/api/migrations")
def list_migrations():
    conn = db.get_conn()
    rows = conn.execute(
        "SELECT m.id, m.name, m.status, m.total_records, m.done_records, "
        "m.fail_records, m.created_at, m.started_at, m.finished_at, "
        "s.name as source_name, t.name as target_name "
        "FROM migrations m "
        "LEFT JOIN connectors s ON s.id=m.source_id "
        "LEFT JOIN connectors t ON t.id=m.target_id "
        "ORDER BY m.created_at DESC"
    ).fetchall()
    conn.close()
    return db.rows_to_list(rows)

@app.get("/api/migrations/{mid}")
def get_migration(mid: str):
    conn = db.get_conn()
    row = conn.execute("SELECT * FROM migrations WHERE id=?", (mid,)).fetchone()
    conn.close()
    if not row: raise HTTPException(404, "Migration not found")
    d = db.row_to_dict(row)
    for key in ("entities", "field_mapping", "config"):
        if d.get(key):
            d[key] = json.loads(d[key])
    return d

class MappingIn(BaseModel):
    source_entity: str
    target_entity: str
    override: Optional[list] = None  # user-provided mapping (skips AI)

@app.post("/api/migrations/{mid}/map")
async def generate_mapping(mid: str, body: MappingIn):
    conn = db.get_conn()
    job = conn.execute("SELECT * FROM migrations WHERE id=?", (mid,)).fetchone()
    if not job: raise HTTPException(404, "Migration not found")

    if body.override:
        mapping = body.override
    else:
        src_row = conn.execute("SELECT * FROM connectors WHERE id=?",
                               (job["source_id"],)).fetchone()
        tgt_row = conn.execute("SELECT * FROM connectors WHERE id=?",
                               (job["target_id"],)).fetchone()
        conn.close()
        if not src_row or not src_row["schema_json"]:
            raise HTTPException(400, "Fetch source schema first")
        if not tgt_row or not tgt_row["schema_json"]:
            raise HTTPException(400, "Fetch target schema first")

        src_schema = json.loads(src_row["schema_json"])
        tgt_schema = json.loads(tgt_row["schema_json"])
        mapping = await ai_mapper.map_fields(
            src_schema, tgt_schema,
            body.source_entity, body.target_entity
        )
    else:
        conn.close()

    conn2 = db.get_conn()
    conn2.execute("UPDATE migrations SET field_mapping=?, status='ready' WHERE id=?",
                  (json.dumps(mapping), mid))
    conn2.commit(); conn2.close()
    return {"mapping": mapping, "count": len(mapping)}

@app.post("/api/migrations/{mid}/run")
async def start_migration(mid: str, background: BackgroundTasks):
    conn = db.get_conn()
    job = conn.execute("SELECT status FROM migrations WHERE id=?", (mid,)).fetchone()
    conn.close()
    if not job: raise HTTPException(404)
    if job["status"] == "running":
        raise HTTPException(400, "Already running")

    background.add_task(_run_async, mid)
    return {"message": "Migration started", "id": mid}

@app.get("/api/migrations/{mid}/logs")
def get_logs(mid: str):
    conn = db.get_conn()
    rows = conn.execute(
        "SELECT level, message, ts FROM logs WHERE migration_id=? ORDER BY ts",
        (mid,)
    ).fetchall()
    conn.close()
    return db.rows_to_list(rows)

# ── Dashboard stats ────────────────────────────────────────────────────────────
@app.get("/api/stats")
def stats():
    conn = db.get_conn()
    total_migs  = conn.execute("SELECT COUNT(*) FROM migrations").fetchone()[0]
    done_migs   = conn.execute("SELECT COUNT(*) FROM migrations WHERE status='done'").fetchone()[0]
    connectors  = conn.execute("SELECT COUNT(*) FROM connectors").fetchone()[0]
    total_recs  = conn.execute("SELECT COALESCE(SUM(done_records),0) FROM migrations").fetchone()[0]
    conn.close()
    return {
        "total_migrations": total_migs,
        "done_migrations": done_migs,
        "total_connectors": connectors,
        "total_records_migrated": int(total_recs),
    }

# ── AI Training ───────────────────────────────────────────────────────────────
class FeedbackIn(BaseModel):
    migration_id: Optional[str] = None
    feedback: list[dict]   # [{source_field, target_field, source_context, target_context, confirmed}]

@app.post("/api/feedback")
def submit_feedback(body: FeedbackIn):
    ai_mapper.save_feedback(body.feedback, body.migration_id)
    return {"saved": len(body.feedback)}

@app.get("/api/train/stats")
def train_stats():
    return ai_mapper.feedback_stats()

@app.post("/api/train")
async def trigger_train(background: BackgroundTasks):
    background.add_task(_do_train)
    return {"message": "Training started in background"}

# ── Helpers ────────────────────────────────────────────────────────────────────
def _get_connector_row(cid: str):
    conn = db.get_conn()
    row = conn.execute("SELECT * FROM connectors WHERE id=?", (cid,)).fetchone()
    conn.close()
    if not row: raise HTTPException(404, "Connector not found")
    return row

async def _run_async(mid: str):
    await migrator.run(mid)

def _do_train():
    trainer.train()

if __name__ == "__main__":
    import uvicorn
    print("\n" + "="*50)
    print("  MigrateAI — ERP Migration Platform")
    print("="*50)
    print(f"  Database : {db.DB_PATH}")
    print(f"  AI Model : Local (sentence-transformers, no API key needed)")
    print(f"  Training : Auto every 24h + manual via /api/train")
    print(f"  Open     : http://localhost:8000")
    print("="*50 + "\n")
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=False)
