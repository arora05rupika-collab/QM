"""
Local AI field mapper — no external API required.

How it works:
1. Encode field names + context using sentence-transformers (all-MiniLM-L6-v2)
   - Tiny ~80 MB model, runs on CPU, downloads once automatically
2. Score every (source, target) pair using:
   - Semantic similarity (cosine of embeddings)
   - Exact / substring / token overlap heuristics
   - Data-type compatibility bonus
   - Learned weights from user feedback (stored in SQLite)
3. Pick the best source field for each target field
4. After user confirms / rejects mappings, those examples are saved
5. Daily retraining (trainer.py) updates the weights so the model
   keeps improving the more you use it
"""

import json
import re
import numpy as np
from typing import Optional
from database import get_conn

# ── Model singleton ───────────────────────────────────────────────────────────
_model = None

def _get_model():
    global _model
    if _model is None:
        from sentence_transformers import SentenceTransformer
        _model = SentenceTransformer("all-MiniLM-L6-v2")
    return _model


# ── Learned weights (updated by trainer.py) ───────────────────────────────────
DEFAULT_WEIGHTS = {
    "semantic":   0.55,
    "exact":      0.20,
    "substring":  0.10,
    "token":      0.10,
    "type":       0.05,
}

def _load_weights() -> dict:
    try:
        conn = get_conn()
        row = conn.execute(
            "SELECT value FROM model_state WHERE key='weights'"
        ).fetchone()
        conn.close()
        if row:
            return json.loads(row["value"])
    except Exception:
        pass
    return DEFAULT_WEIGHTS


# ── Feature extraction ────────────────────────────────────────────────────────

def _normalise(name: str) -> str:
    """snake_case / camelCase -> lowercase words joined by space."""
    name = re.sub(r'([A-Z])', r' \1', name)
    name = re.sub(r'[_\-\.]', ' ', name)
    return name.lower().strip()


def _tokens(name: str) -> set:
    return set(_normalise(name).split())


def _type_compat(t1: str, t2: str) -> float:
    groups = [
        {"integer", "number", "numeric", "float", "double", "decimal", "bigint", "int"},
        {"string", "text", "varchar", "char", "nvarchar"},
        {"boolean", "bool", "bit"},
        {"date", "datetime", "timestamp", "time"},
    ]
    for g in groups:
        if t1.lower() in g and t2.lower() in g:
            return 1.0
    return 1.0 if t1.lower() == t2.lower() else 0.0


def _field_text(name: str, dtype: str, samples: list) -> str:
    parts = [_normalise(name), dtype]
    if samples:
        parts.append("example: " + " ".join(str(s) for s in samples[:2]))
    return " ".join(parts)


def _score_pair(
    src_name: str, src_type: str, src_samples: list,
    tgt_name: str, tgt_type: str, tgt_samples: list,
    src_emb: np.ndarray, tgt_emb: np.ndarray,
    weights: dict,
) -> float:
    sn = _normalise(src_name)
    tn = _normalise(tgt_name)
    st = _tokens(src_name)
    tt = _tokens(tgt_name)

    cos       = float(max(0.0, np.dot(src_emb, tgt_emb)))
    exact     = 1.0 if sn == tn else 0.0
    substring = 1.0 if (sn in tn or tn in sn) else 0.0
    token_ov  = len(st & tt) / max(len(st | tt), 1)
    type_c    = _type_compat(src_type, tgt_type)

    return (
        weights["semantic"]  * cos +
        weights["exact"]     * exact +
        weights["substring"] * substring +
        weights["token"]     * token_ov +
        weights["type"]      * type_c
    )


def _confidence_reason(score: float, src_name: str, tgt_name: str):
    conf = min(score, 1.0)
    sn = _normalise(src_name)
    tn = _normalise(tgt_name)
    if sn == tn:
        return conf, "Exact name match"
    if sn in tn or tn in sn:
        return conf, f"'{src_name}' is a substring match for '{tgt_name}'"
    if conf >= 0.75:
        return conf, "High semantic similarity"
    if conf >= 0.50:
        return conf, "Moderate semantic similarity"
    return conf, "Low similarity — verify manually"


def _suggest_transform(src_type: str, tgt_type: str,
                        src_name: str, tgt_name: str) -> Optional[str]:
    s, t = src_type.lower(), tgt_type.lower()
    num = {"integer","number","numeric","float","double","decimal","bigint","int"}
    if s in {"string","text","varchar"} and t in num:
        return "lambda x: float(x) if x not in (None,'') else None"
    if t in {"string","text","varchar"} and s in num:
        return "lambda x: str(x) if x is not None else None"
    if s in {"string","text"} and t in {"date","datetime","timestamp"}:
        return "lambda x: x[:10] if x else None"
    if "date" in tgt_name.lower() and s in {"string","text"}:
        return "lambda x: x[:10] if x else None"
    return None


# ── Public API ────────────────────────────────────────────────────────────────

def _schema_entity(schema_dict: dict, entity_name: str):
    return next(
        (e for e in schema_dict.get("entities", []) if e["name"] == entity_name),
        None
    )


async def map_fields(
    source_schema: dict,
    target_schema: dict,
    source_entity: str,
    target_entity: str,
) -> list[dict]:
    """
    Returns list of:
    {source_field, target_field, confidence, transform, reason}
    """
    src_entity = _schema_entity(source_schema, source_entity)
    tgt_entity = _schema_entity(target_schema, target_entity)

    if not src_entity or not tgt_entity:
        return []

    src_fields = src_entity.get("fields", [])
    tgt_fields = tgt_entity.get("fields", [])

    if not src_fields or not tgt_fields:
        return []

    model   = _get_model()
    weights = _load_weights()

    src_texts = [_field_text(f["name"], f.get("data_type","string"), f.get("sample",[])) for f in src_fields]
    tgt_texts = [_field_text(f["name"], f.get("data_type","string"), f.get("sample",[])) for f in tgt_fields]

    all_texts  = src_texts + tgt_texts
    embeddings = model.encode(all_texts, normalize_embeddings=True, show_progress_bar=False)
    src_embs   = embeddings[:len(src_fields)]
    tgt_embs   = embeddings[len(src_fields):]

    result = []
    NO_MATCH_THRESHOLD = 0.20

    for ti, tf in enumerate(tgt_fields):
        best_score = -1.0
        best_si    = None

        for si, sf in enumerate(src_fields):
            score = _score_pair(
                sf["name"], sf.get("data_type","string"), sf.get("sample",[]),
                tf["name"], tf.get("data_type","string"), tf.get("sample",[]),
                src_embs[si], tgt_embs[ti], weights,
            )
            if score > best_score:
                best_score = score
                best_si    = si

        if best_si is not None and best_score >= NO_MATCH_THRESHOLD:
            sf = src_fields[best_si]
            conf, reason = _confidence_reason(best_score, sf["name"], tf["name"])
            transform = _suggest_transform(
                sf.get("data_type","string"), tf.get("data_type","string"),
                sf["name"], tf["name"]
            )
            result.append({
                "source_field": sf["name"],
                "target_field": tf["name"],
                "confidence":   round(conf, 3),
                "transform":    transform,
                "reason":       reason,
            })
        else:
            result.append({
                "source_field": None,
                "target_field": tf["name"],
                "confidence":   0.0,
                "transform":    None,
                "reason":       "No matching source field found",
            })

    return result


def apply_mapping(row: dict, mapping: list[dict]) -> dict:
    """Transform a single source row into a target row using the mapping."""
    result = {}
    for m in mapping:
        src = m.get("source_field")
        tgt = m.get("target_field")
        if not tgt:
            continue
        value = row.get(src) if src else None
        transform = m.get("transform")
        if transform and value is not None:
            try:
                fn = eval(transform)   # noqa: S307
                value = fn(value)
            except Exception:
                pass
        result[tgt] = value
    return result


# ── Feedback storage ──────────────────────────────────────────────────────────

def save_feedback(feedback_list: list[dict], migration_id: str = None):
    """
    feedback_list: [{source_field, target_field, source_context, target_context, confirmed}]
    confirmed=True = correct mapping, False = wrong.
    """
    conn = get_conn()
    for fb in feedback_list:
        conn.execute(
            "INSERT INTO mapping_feedback "
            "(source_field, target_field, source_context, target_context, confirmed, migration_id) "
            "VALUES (?,?,?,?,?,?)",
            (
                fb.get("source_field", ""),
                fb.get("target_field", ""),
                json.dumps(fb.get("source_context", {})),
                json.dumps(fb.get("target_context", {})),
                1 if fb.get("confirmed") else 0,
                migration_id,
            )
        )
    conn.commit()
    conn.close()


def feedback_stats() -> dict:
    conn = get_conn()
    total    = conn.execute("SELECT COUNT(*) FROM mapping_feedback").fetchone()[0]
    positive = conn.execute("SELECT COUNT(*) FROM mapping_feedback WHERE confirmed=1").fetchone()[0]
    last     = conn.execute("SELECT MAX(ts) FROM mapping_feedback").fetchone()[0]
    w_row    = conn.execute("SELECT value, updated_at FROM model_state WHERE key='weights'").fetchone()
    t_row    = conn.execute("SELECT value FROM model_state WHERE key='last_train_log'").fetchone()
    conn.close()
    return {
        "total_feedback":   total,
        "positive":         positive,
        "negative":         total - positive,
        "last_feedback_at": last,
        "weights_updated":  w_row["updated_at"] if w_row else None,
        "current_weights":  json.loads(w_row["value"]) if w_row else DEFAULT_WEIGHTS,
        "last_train_log":   t_row["value"] if t_row else "Not trained yet",
        "model":            "all-MiniLM-L6-v2 (local, no API key needed)",
    }
