"""
Discrepancy / Flashcard API

GET  /discrepancies/{migration_id}          → list all discrepancies
GET  /discrepancies/{migration_id}/next     → next pending flashcard
POST /discrepancies/{migration_id}/resolve  → resolve + propagate
GET  /discrepancies/{migration_id}/report   → validation summary report
POST /discrepancies/{migration_id}/generate → run validation engine on existing data
"""
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel
from typing import Optional

from ...models.models import (
    Discrepancy, DiscrepancyStatus, MigrationJob, Connector, User
)
from ...models.base import gen_uuid
from ...engines.validation_engine import (
    generate_discrepancies, build_validation_report, score_record
)
from ...engines.propagation_engine import resolve_and_propagate, apply_existing_rules
from ..deps import get_db, get_current_user
from ...core.security import decrypt_credential
from ...connectors import registry
import json

router = APIRouter(prefix="/discrepancies", tags=["Discrepancies"])


# ─── Schemas ──────────────────────────────────────────────────────────────────

class ResolveRequest(BaseModel):
    discrepancy_id: str
    resolution_type: str        # confirmed | corrected | rejected
    resolved_value: Optional[str] = None
    notes: Optional[str] = None


class DiscrepancyOut(BaseModel):
    id: str
    entity: str
    record_id: Optional[str]
    field: str
    source_value: Optional[str]
    ai_suggested_value: Optional[str]
    resolved_value: Optional[str]
    confidence: float
    risk_level: str
    assigned_to: Optional[str]
    status: str
    notes: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


# ─── Helpers ──────────────────────────────────────────────────────────────────

async def _get_migration(migration_id: str, org_id: str, db: AsyncSession) -> MigrationJob:
    result = await db.execute(
        select(MigrationJob).where(
            MigrationJob.id == migration_id,
            MigrationJob.org_id == org_id,
        )
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Migration not found")
    return job


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.post("/{migration_id}/generate")
async def generate_discrepancies_for_migration(
    migration_id: str,
    sample_size: int = 200,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Connect to the source ERP, pull a sample of records, run the
    validation engine to generate discrepancy flashcards.
    """
    job = await _get_migration(migration_id, user.org_id, db)

    if not job.field_mapping:
        raise HTTPException(status_code=400, detail="Run AI mapping first before generating discrepancies")

    # Load source connector
    src_result = await db.execute(select(Connector).where(Connector.id == job.source_connector_id))
    src_c = src_result.scalar_one_or_none()
    if not src_c:
        raise HTTPException(status_code=404, detail="Source connector not found")

    config = json.loads(decrypt_credential(src_c.encrypted_config))
    connector = registry.build(src_c.connector_type.value, config)

    entity_pairs = job.config.get("entity_pairs", [])
    if not entity_pairs:
        raise HTTPException(status_code=400, detail="No entity pairs configured")

    total_generated = 0
    for pair in entity_pairs:
        entity = pair.get("source_entity", "")
        records = []
        async for batch in connector.extract(entity, batch_size=sample_size):
            records.extend(batch)
            if len(records) >= sample_size:
                break

        new_discrepancies = generate_discrepancies(
            migration_id=migration_id,
            entity=entity,
            records=records[:sample_size],
            field_mapping=job.field_mapping,
        )

        for d in new_discrepancies:
            db.add(d)
        total_generated += len(new_discrepancies)

    await db.commit()

    # Apply any existing propagation rules immediately
    auto_resolved = await apply_existing_rules(db, migration_id)

    return {
        "generated": total_generated,
        "auto_resolved_by_rules": auto_resolved,
        "pending": total_generated - auto_resolved,
    }


@router.get("/{migration_id}", response_model=list[DiscrepancyOut])
async def list_discrepancies(
    migration_id: str,
    status: Optional[str] = None,
    risk_level: Optional[str] = None,
    assigned_to: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _get_migration(migration_id, user.org_id, db)

    query = select(Discrepancy).where(Discrepancy.migration_id == migration_id)
    if status:
        query = query.where(Discrepancy.status == status)
    if risk_level:
        query = query.where(Discrepancy.risk_level == risk_level)
    if assigned_to:
        query = query.where(Discrepancy.assigned_to == assigned_to)

    query = query.order_by(Discrepancy.confidence.asc()).limit(limit).offset(offset)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{migration_id}/next", response_model=Optional[DiscrepancyOut])
async def next_flashcard(
    migration_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Return the next pending flashcard (lowest confidence first)."""
    await _get_migration(migration_id, user.org_id, db)

    result = await db.execute(
        select(Discrepancy)
        .where(
            Discrepancy.migration_id == migration_id,
            Discrepancy.status == DiscrepancyStatus.PENDING,
        )
        .order_by(Discrepancy.confidence.asc())
        .limit(1)
    )
    return result.scalar_one_or_none()


@router.get("/{migration_id}/stats")
async def discrepancy_stats(
    migration_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _get_migration(migration_id, user.org_id, db)

    result = await db.execute(
        select(Discrepancy.status, func.count(Discrepancy.id))
        .where(Discrepancy.migration_id == migration_id)
        .group_by(Discrepancy.status)
    )
    counts = {str(row[0]).split(".")[-1]: row[1] for row in result.all()}

    total = sum(counts.values())
    pending = counts.get("pending", 0)
    return {
        "total": total,
        "pending": pending,
        "confirmed": counts.get("confirmed", 0),
        "corrected": counts.get("corrected", 0),
        "rejected": counts.get("rejected", 0),
        "propagated": counts.get("propagated", 0),
        "progress_pct": round((1 - pending / total) * 100, 1) if total else 100,
    }


@router.post("/{migration_id}/resolve")
async def resolve_flashcard(
    migration_id: str,
    body: ResolveRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Resolve a flashcard and auto-propagate to all matching discrepancies."""
    await _get_migration(migration_id, user.org_id, db)

    disc_result = await db.execute(
        select(Discrepancy).where(
            Discrepancy.id == body.discrepancy_id,
            Discrepancy.migration_id == migration_id,
        )
    )
    disc = disc_result.scalar_one_or_none()
    if not disc:
        raise HTTPException(status_code=404, detail="Discrepancy not found")

    if disc.status != DiscrepancyStatus.PENDING:
        raise HTTPException(status_code=400, detail="Discrepancy already resolved")

    result = await resolve_and_propagate(
        db=db,
        discrepancy=disc,
        resolution_type=body.resolution_type,
        resolved_value=body.resolved_value,
        resolved_by=user.email,
        notes=body.notes,
    )
    return result


@router.get("/{migration_id}/report")
async def validation_report(
    migration_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    job = await _get_migration(migration_id, user.org_id, db)

    disc_result = await db.execute(
        select(Discrepancy).where(Discrepancy.migration_id == migration_id)
    )
    discrepancies = disc_result.scalars().all()

    return build_validation_report(
        migration_id=migration_id,
        discrepancies=discrepancies,
        total_records=int(job.total_records or 0),
        field_mapping=job.field_mapping or [],
    )
