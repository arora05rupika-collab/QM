"""
Self-training engine for MigrateAI.

Every time this runs it:
1. Loads all confirmed/rejected field mappings from the database
2. Computes features for each pair (cosine sim, exact, substring, token, type)
3. Trains a LogisticRegression to find the best weight for each feature
4. Saves the learned weights back to SQLite
5. The next call to ai_mapper.map_fields() picks up the new weights automatically

Can be triggered:
  - Manually via POST /api/train
  - On a schedule via the daily background loop started in main.py
  - Directly: python3 trainer.py
"""

import json
import re
import asyncio
import numpy as np
from datetime import datetime, timezone
from database import get_conn

FEATURE_NAMES = ["semantic", "exact", "substring", "token", "type"]
MIN_SAMPLES   = 5    # need at least this many examples before training is useful


def _normalise(name: str) -> str:
    name = re.sub(r'([A-Z])', r' \1', name)
    name = re.sub(r'[_\-\.]', ' ', name)
    return name.lower().strip()


def _tokens(name: str) -> set:
    return set(_normalise(name).split())


def _type_compat(t1: str, t2: str) -> float:
    groups = [
        {"integer","number","numeric","float","double","decimal","bigint","int"},
        {"string","text","varchar","char","nvarchar"},
        {"boolean","bool","bit"},
        {"date","datetime","timestamp","time"},
    ]
    for g in groups:
        if t1.lower() in g and t2.lower() in g:
            return 1.0
    return 1.0 if t1.lower() == t2.lower() else 0.0


def _build_features_from_names(src_name: str, tgt_name: str,
                                src_type: str = "string", tgt_type: str = "string",
                                cos_sim: float = 0.5) -> list[float]:
    sn = _normalise(src_name)
    tn = _normalise(tgt_name)
    st = _tokens(src_name)
    tt = _tokens(tgt_name)
    exact     = 1.0 if sn == tn else 0.0
    substring = 1.0 if (sn in tn or tn in sn) else 0.0
    token_ov  = len(st & tt) / max(len(st | tt), 1)
    type_c    = _type_compat(src_type, tgt_type)
    return [cos_sim, exact, substring, token_ov, type_c]


def _encode_pairs(pairs: list[dict]) -> tuple[np.ndarray, np.ndarray]:
    """Encode feedback pairs into feature matrix X and label vector y."""
    from sentence_transformers import SentenceTransformer
    model = SentenceTransformer("all-MiniLM-L6-v2")

    texts  = []
    metas  = []
    for p in pairs:
        src_ctx = json.loads(p["source_context"] or "{}")
        tgt_ctx = json.loads(p["target_context"] or "{}")
        src_type = src_ctx.get("data_type", "string")
        tgt_type = tgt_ctx.get("data_type", "string")
        src_txt = f"{_normalise(p['source_field'])} {src_type}"
        tgt_txt = f"{_normalise(p['target_field'])} {tgt_type}"
        texts.append(src_txt)
        texts.append(tgt_txt)
        metas.append((p["source_field"], p["target_field"], src_type, tgt_type))

    embs = model.encode(texts, normalize_embeddings=True, show_progress_bar=False)

    X, y = [], []
    for i, (src_name, tgt_name, src_type, tgt_type) in enumerate(metas):
        src_emb = embs[i * 2]
        tgt_emb = embs[i * 2 + 1]
        cos_sim = float(max(0.0, np.dot(src_emb, tgt_emb)))
        feats = _build_features_from_names(src_name, tgt_name, src_type, tgt_type, cos_sim)
        X.append(feats)
        y.append(pairs[i]["confirmed"])

    return np.array(X, dtype=float), np.array(y, dtype=float)


def train() -> str:
    """
    Run one training cycle. Returns a human-readable log string.
    """
    conn = get_conn()
    rows = conn.execute(
        "SELECT source_field, target_field, source_context, target_context, confirmed "
        "FROM mapping_feedback ORDER BY ts"
    ).fetchall()
    conn.close()

    pairs = [dict(r) for r in rows]
    n = len(pairs)
    pos = sum(1 for p in pairs if p["confirmed"])
    neg = n - pos

    log_lines = [
        f"Training started at {datetime.now(timezone.utc).isoformat()}",
        f"Feedback samples: {n} total ({pos} positive, {neg} negative)",
    ]

    if n < MIN_SAMPLES:
        msg = (f"Need at least {MIN_SAMPLES} feedback samples to train "
               f"(have {n}). Keeping default weights.")
        log_lines.append(msg)
        _save_log("\n".join(log_lines))
        return "\n".join(log_lines)

    if pos == 0 or neg == 0:
        msg = "Need both positive and negative examples to train. Collect more feedback."
        log_lines.append(msg)
        _save_log("\n".join(log_lines))
        return "\n".join(log_lines)

    try:
        from sklearn.linear_model import LogisticRegression
        from sklearn.preprocessing import StandardScaler
        from sklearn.pipeline import Pipeline
        from sklearn.model_selection import cross_val_score

        X, y = _encode_pairs(pairs)

        pipe = Pipeline([
            ("scaler", StandardScaler()),
            ("clf",    LogisticRegression(max_iter=500, class_weight="balanced")),
        ])
        pipe.fit(X, y)

        # CV score
        if n >= 20:
            cv_scores = cross_val_score(pipe, X, y, cv=min(5, n//4), scoring="f1")
            log_lines.append(f"Cross-val F1: {cv_scores.mean():.3f} ± {cv_scores.std():.3f}")

        # Extract feature importances as new weights
        coef = pipe.named_steps["clf"].coef_[0]
        coef = np.abs(coef)
        total = coef.sum()
        if total > 0:
            coef = coef / total

        new_weights = {
            name: round(float(w), 4)
            for name, w in zip(FEATURE_NAMES, coef)
        }
        log_lines.append(f"Learned weights: {json.dumps(new_weights, indent=2)}")

        _save_weights(new_weights)
        log_lines.append("Weights saved to database.")

    except Exception as e:
        log_lines.append(f"Training error: {e}")

    result = "\n".join(log_lines)
    _save_log(result)
    return result


def _save_weights(weights: dict):
    conn = get_conn()
    conn.execute(
        "INSERT INTO model_state (key, value, updated_at) VALUES ('weights', ?, ?) "
        "ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
        (json.dumps(weights), datetime.now(timezone.utc).isoformat())
    )
    conn.commit()
    conn.close()


def _save_log(log: str):
    conn = get_conn()
    conn.execute(
        "INSERT INTO model_state (key, value, updated_at) VALUES ('last_train_log', ?, ?) "
        "ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
        (log, datetime.now(timezone.utc).isoformat())
    )
    conn.commit()
    conn.close()


# ── Daily scheduler ───────────────────────────────────────────────────────────

async def daily_training_loop(interval_hours: int = 24):
    """
    Runs forever in the background, retraining every `interval_hours`.
    Started automatically by main.py on boot.
    """
    import asyncio
    print(f"[trainer] Daily training loop started (every {interval_hours}h)")
    while True:
        await asyncio.sleep(interval_hours * 3600)
        print("[trainer] Running scheduled retraining...")
        try:
            result = train()
            print("[trainer]", result.split("\n")[0])
        except Exception as e:
            print(f"[trainer] Error: {e}")


if __name__ == "__main__":
    print(train())
