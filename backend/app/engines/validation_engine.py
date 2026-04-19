"""
Validation Engine

After a migration batch runs, this engine:
1. Scores every record (0-100% confidence) based on field mapping confidence + nulls + type issues
2. Generates Discrepancy rows for any field below the confidence threshold
3. Assigns each discrepancy to an owner using ERP metadata fields
"""
import hashlib
import json
from datetime import datetime
from ..models.models import Discrepancy, DiscrepancyStatus
from ..models.base import gen_uuid

# Fields commonly used as owner references in ERP systems
OWNER_FIELD_CANDIDATES = [
    "owner", "assigned_to", "user_id", "created_by", "salesperson",
    "account_manager", "responsible", "work_order_owner", "manager",
    "ap_contact", "buyer", "requestor",
]

CONFIDENCE_THRESHOLD = 0.75   # below this → generate a discrepancy
HIGH_RISK_THRESHOLD = 0.40    # below this → risk_level = high


def _propagation_key(entity: str, field: str, source_value) -> str:
    """Stable fingerprint for matching similar discrepancies."""
    raw = f"{entity}|{field}|{str(source_value)}"
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


def _risk_level(confidence: float) -> str:
    if confidence < HIGH_RISK_THRESHOLD:
        return "high"
    if confidence < CONFIDENCE_THRESHOLD:
        return "medium"
    return "low"


def _find_owner(record: dict) -> tuple[str | None, str | None]:
    """Return (owner_value, owner_field) from a record dict."""
    for candidate in OWNER_FIELD_CANDIDATES:
        for key in record:
            if key.lower() == candidate:
                val = record[key]
                if val:
                    return str(val), key
    return None, None


def score_record(record: dict, field_mapping: list[dict]) -> float:
    """
    Compute an overall confidence score (0-1) for a single record.
    Weighs field-level confidence + penalises nulls on mapped fields.
    """
    if not field_mapping:
        return 0.5

    total_weight = 0.0
    weighted_sum = 0.0

    for m in field_mapping:
        conf = float(m.get("confidence", 0.5))
        src_field = m.get("source_field")
        value = record.get(src_field) if src_field else None

        # Penalise missing values on high-confidence mappings
        if value is None and conf > 0.7:
            conf *= 0.5

        weighted_sum += conf
        total_weight += 1.0

    return round(weighted_sum / total_weight, 4) if total_weight else 0.5


def generate_discrepancies(
    migration_id: str,
    entity: str,
    records: list[dict],
    field_mapping: list[dict],
) -> list[Discrepancy]:
    """
    For each record, for each mapped field below the confidence threshold,
    create a Discrepancy object ready to be bulk-inserted.
    """
    discrepancies = []

    for record in records:
        record_id = str(record.get("id") or record.get("_id") or "")
        owner, owner_field = _find_owner(record)

        for m in field_mapping:
            conf = float(m.get("confidence", 1.0))
            if conf >= CONFIDENCE_THRESHOLD:
                continue  # good enough, no flashcard needed

            src_field = m.get("source_field")
            tgt_field = m.get("target_field")
            source_value = record.get(src_field) if src_field else None
            ai_suggested = m.get("suggested_value") or m.get("transform")

            prop_key = _propagation_key(entity, tgt_field or src_field or "", source_value)

            d = Discrepancy(
                id=gen_uuid(),
                migration_id=migration_id,
                entity=entity,
                record_id=record_id,
                field=tgt_field or src_field or "",
                source_value=str(source_value) if source_value is not None else None,
                ai_suggested_value=str(ai_suggested) if ai_suggested else None,
                confidence=conf,
                risk_level=_risk_level(conf),
                assigned_to=owner,
                owner_field=owner_field,
                status=DiscrepancyStatus.PENDING,
                propagation_key=prop_key,
            )
            discrepancies.append(d)

    return discrepancies


def build_validation_report(
    migration_id: str,
    discrepancies: list,
    total_records: int,
    field_mapping: list[dict],
) -> dict:
    """
    Produce the summary validation report shown on the report page.
    """
    pending = [d for d in discrepancies if d.status == DiscrepancyStatus.PENDING]
    resolved = [d for d in discrepancies if d.status not in (
        DiscrepancyStatus.PENDING,
    )]
    high_risk = [d for d in discrepancies if d.risk_level == "high"]

    avg_confidence = (
        sum(d.confidence for d in discrepancies) / len(discrepancies)
        if discrepancies else 1.0
    )

    by_entity: dict[str, int] = {}
    for d in discrepancies:
        by_entity[d.entity] = by_entity.get(d.entity, 0) + 1

    by_field: dict[str, int] = {}
    for d in discrepancies:
        by_field[d.field] = by_field.get(d.field, 0) + 1

    return {
        "migration_id": migration_id,
        "total_records": total_records,
        "total_discrepancies": len(discrepancies),
        "pending_review": len(pending),
        "resolved": len(resolved),
        "high_risk_count": len(high_risk),
        "overall_confidence_pct": round(avg_confidence * 100, 1),
        "migration_ready": len(pending) == 0 and avg_confidence >= CONFIDENCE_THRESHOLD,
        "discrepancies_by_entity": by_entity,
        "discrepancies_by_field": dict(
            sorted(by_field.items(), key=lambda x: x[1], reverse=True)[:10]
        ),
        "generated_at": datetime.utcnow().isoformat(),
    }
