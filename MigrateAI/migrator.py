"""
Migration execution engine.
Runs in the background — extracts from source, transforms, loads to target.
Updates the DB with progress so the frontend can poll it.
"""
import asyncio
import json
from database import get_conn, log, now
from connectors import build
from ai_mapper import apply_mapping


async def run(migration_id: str):
    conn = get_conn()
    job = conn.execute(
        "SELECT * FROM migrations WHERE id=?", (migration_id,)
    ).fetchone()
    conn.close()

    if not job:
        return

    _set_status(migration_id, "running")
    log(migration_id, "Migration started")

    try:
        # Load connectors
        src_conn_row, tgt_conn_row = _get_connectors(job)
        src = build(src_conn_row["type"], json.loads(src_conn_row["config"]))
        tgt = build(tgt_conn_row["type"], json.loads(tgt_conn_row["config"]))

        entities = json.loads(job["entities"] or "[]")
        mapping  = json.loads(job["field_mapping"] or "[]")
        config   = json.loads(job["config"] or "{}")
        batch_sz = config.get("batch_size", 500)
        mode     = config.get("mode", "upsert")
        dry_run  = config.get("dry_run", False)

        total_inserted = 0
        total_failed = 0

        for pair in entities:
            src_entity = pair["source_entity"]
            tgt_entity = pair["target_entity"]
            log(migration_id, f"Migrating {src_entity} → {tgt_entity}")

            batch_num = 0
            async for batch in src.extract(src_entity, batch=batch_sz):
                batch_num += 1
                transformed = [apply_mapping(row, mapping) for row in batch]

                if dry_run:
                    log(migration_id,
                        f"[DRY RUN] batch {batch_num}: {len(transformed)} rows would be written")
                    total_inserted += len(transformed)
                else:
                    result = await tgt.load(tgt_entity, transformed, mode=mode)
                    total_inserted += result.inserted + result.updated
                    total_failed   += result.failed
                    if result.errors:
                        for err in result.errors[:3]:
                            log(migration_id, f"Error: {err}", level="error")

                _update_progress(migration_id,
                                 total_inserted + total_failed,
                                 total_inserted,
                                 total_failed)
                log(migration_id,
                    f"Batch {batch_num}: {len(batch)} rows processed")

        _set_status(migration_id, "done",
                    total=total_inserted + total_failed,
                    done=total_inserted,
                    fail=total_failed)
        log(migration_id,
            f"Migration complete. {total_inserted} rows migrated, {total_failed} failed.")

    except Exception as e:
        _set_status(migration_id, "failed")
        log(migration_id, f"FATAL: {e}", level="error")
        raise


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_connectors(job):
    conn = get_conn()
    src = conn.execute("SELECT * FROM connectors WHERE id=?",
                       (job["source_id"],)).fetchone()
    tgt = conn.execute("SELECT * FROM connectors WHERE id=?",
                       (job["target_id"],)).fetchone()
    conn.close()
    return src, tgt


def _set_status(mid, status, total=None, done=None, fail=None):
    conn = get_conn()
    if status in ("running",):
        conn.execute("UPDATE migrations SET status=?, started_at=? WHERE id=?",
                     (status, now(), mid))
    elif status in ("done", "failed"):
        conn.execute(
            "UPDATE migrations SET status=?, finished_at=?, "
            "total_records=COALESCE(?,total_records), "
            "done_records=COALESCE(?,done_records), "
            "fail_records=COALESCE(?,fail_records) WHERE id=?",
            (status, now(), total, done, fail, mid)
        )
    else:
        conn.execute("UPDATE migrations SET status=? WHERE id=?", (status, mid))
    conn.commit()
    conn.close()


def _update_progress(mid, total, done, fail):
    conn = get_conn()
    conn.execute(
        "UPDATE migrations SET total_records=?, done_records=?, fail_records=? WHERE id=?",
        (total, done, fail, mid)
    )
    conn.commit()
    conn.close()
