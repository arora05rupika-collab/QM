"""
Propagation Engine

When a user resolves one flashcard, this engine:
1. Stores a PropagationRule keyed on (entity, field, source_value) fingerprint
2. Finds all PENDING discrepancies with the same fingerprint
3. Applies the same resolution to them automatically
4. Returns the count of propagated discrepancies

This is the feature that cuts migration time dramatically —
fixing one thing fixes thousands of identical issues.
"""
from datetime import datetime
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from ..models.models import Discrepancy, DiscrepancyStatus, PropagationRule
from ..models.base import gen_uuid


async def resolve_and_propagate(
    db: AsyncSession,
    discrepancy: Discrepancy,
    resolution_type: str,      # "confirmed" | "corrected" | "rejected"
    resolved_value: str | None,
    resolved_by: str,
    notes: str | None = None,
) -> dict:
    """
    Resolve a single discrepancy and propagate to all matching pending ones.
    Returns {"resolved_id": ..., "propagated_count": N}
    """
    now = datetime.utcnow()

    # 1. Resolve the source discrepancy
    discrepancy.status = _status_from_type(resolution_type)
    discrepancy.resolved_value = resolved_value
    discrepancy.resolved_by = resolved_by
    discrepancy.resolved_at = now
    discrepancy.notes = notes

    # 2. Store or update the propagation rule
    existing_rule = await db.execute(
        select(PropagationRule).where(
            PropagationRule.migration_id == discrepancy.migration_id,
            PropagationRule.propagation_key == discrepancy.propagation_key,
        )
    )
    rule = existing_rule.scalar_one_or_none()

    if not rule:
        rule = PropagationRule(
            id=gen_uuid(),
            migration_id=discrepancy.migration_id,
            propagation_key=discrepancy.propagation_key,
            resolved_value=resolved_value,
            resolution_type=resolution_type,
            created_by=resolved_by,
        )
        db.add(rule)
    else:
        rule.resolved_value = resolved_value
        rule.resolution_type = resolution_type

    await db.flush()

    # 3. Find all other PENDING discrepancies with the same fingerprint
    matches_result = await db.execute(
        select(Discrepancy).where(
            Discrepancy.migration_id == discrepancy.migration_id,
            Discrepancy.propagation_key == discrepancy.propagation_key,
            Discrepancy.id != discrepancy.id,
            Discrepancy.status == DiscrepancyStatus.PENDING,
        )
    )
    matches = matches_result.scalars().all()

    # 4. Apply resolution to all matches
    for match in matches:
        match.status = DiscrepancyStatus.PROPAGATED
        match.resolved_value = resolved_value
        match.resolved_by = f"propagated_from:{discrepancy.id}"
        match.resolved_at = now
        match.notes = f"Auto-resolved by propagation rule (source: {discrepancy.id})"

    rule.applied_count = (rule.applied_count or 0) + len(matches)
    await db.commit()

    return {
        "resolved_id": discrepancy.id,
        "propagated_count": len(matches),
        "propagation_key": discrepancy.propagation_key,
    }


async def apply_existing_rules(
    db: AsyncSession,
    migration_id: str,
) -> int:
    """
    When new discrepancies are generated, check if existing propagation
    rules already cover them and auto-resolve.
    Called after each batch of discrepancies is inserted.
    """
    rules_result = await db.execute(
        select(PropagationRule).where(PropagationRule.migration_id == migration_id)
    )
    rules = rules_result.scalars().all()

    total_applied = 0
    now = datetime.utcnow()

    for rule in rules:
        pending_result = await db.execute(
            select(Discrepancy).where(
                Discrepancy.migration_id == migration_id,
                Discrepancy.propagation_key == rule.propagation_key,
                Discrepancy.status == DiscrepancyStatus.PENDING,
            )
        )
        pending = pending_result.scalars().all()
        for d in pending:
            d.status = DiscrepancyStatus.PROPAGATED
            d.resolved_value = rule.resolved_value
            d.resolved_by = f"rule:{rule.id}"
            d.resolved_at = now
            d.notes = "Auto-resolved by existing propagation rule"
        rule.applied_count = (rule.applied_count or 0) + len(pending)
        total_applied += len(pending)

    if total_applied:
        await db.commit()

    return total_applied


def _status_from_type(resolution_type: str) -> DiscrepancyStatus:
    return {
        "confirmed": DiscrepancyStatus.CONFIRMED,
        "corrected": DiscrepancyStatus.CORRECTED,
        "rejected": DiscrepancyStatus.REJECTED,
    }.get(resolution_type, DiscrepancyStatus.CONFIRMED)
