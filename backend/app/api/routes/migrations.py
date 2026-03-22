import json
import asyncio
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from ...models.models import Connector, MigrationJob, AuditLog, User, MigrationStatus
from ...schemas.schemas import (
    MigrationCreate, MigrationResponse, MappingRequest, MessageResponse
)
from ...core.security import decrypt_credential
from ...models.base import gen_uuid
from ..deps import get_db, get_current_user
from ...connectors import registry
from ...engines.ai_engine import generate_field_mapping
from ...engines.migration_engine import run_migration, MigrationProgress

router = APIRouter(prefix="/migrations", tags=["Migrations"])


async def _get_connector(connector_id: str, org_id: str, db: AsyncSession):
    result = await db.execute(
        select(Connector).where(Connector.id == connector_id, Connector.org_id == org_id)
    )
    c = result.scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=404, detail=f"Connector {connector_id} not found")
    config = json.loads(decrypt_credential(c.encrypted_config))
    return registry.build(c.connector_type.value, config), c


@router.post("", response_model=MigrationResponse, status_code=201)
async def create_migration(
    body: MigrationCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    job = MigrationJob(
        id=gen_uuid(),
        org_id=user.org_id,
        name=body.name,
        source_connector_id=body.source_connector_id,
        target_connector_id=body.target_connector_id,
        config=body.config,
        status=MigrationStatus.DRAFT,
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)
    return job


@router.post("/{job_id}/generate-mapping")
async def generate_mapping(
    job_id: str,
    body: MappingRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(MigrationJob).where(MigrationJob.id == job_id, MigrationJob.org_id == user.org_id)
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Migration job not found")

    src_conn, _ = await _get_connector(job.source_connector_id, user.org_id, db)
    tgt_conn, _ = await _get_connector(job.target_connector_id, user.org_id, db)

    src_schema = await src_conn.get_schema()
    tgt_schema = await tgt_conn.get_schema()

    mapping = await generate_field_mapping(
        src_schema, tgt_schema, body.source_entity, body.target_entity
    )
    job.field_mapping = mapping
    job.status = MigrationStatus.READY
    await db.commit()
    return {"mapping": mapping, "count": len(mapping)}


@router.post("/{job_id}/start", response_model=MessageResponse)
async def start_migration(
    job_id: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(MigrationJob).where(MigrationJob.id == job_id, MigrationJob.org_id == user.org_id)
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Migration job not found")

    if job.status == MigrationStatus.RUNNING:
        raise HTTPException(status_code=400, detail="Migration already running")

    job.status = MigrationStatus.RUNNING
    job.started_at = datetime.utcnow()
    await db.commit()

    background_tasks.add_task(_run_migration_task, job_id, user.org_id)
    return {"message": "Migration started"}


async def _run_migration_task(job_id: str, org_id: str):
    """Background task: run migration and update job status."""
    from ..deps import AsyncSessionLocal
    from ...connectors import registry
    from ...models.base import gen_uuid

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(MigrationJob).where(MigrationJob.id == job_id))
        job = result.scalar_one_or_none()
        if not job:
            return

        src_result = await db.execute(select(Connector).where(Connector.id == job.source_connector_id))
        tgt_result = await db.execute(select(Connector).where(Connector.id == job.target_connector_id))
        src_c = src_result.scalar_one_or_none()
        tgt_c = tgt_result.scalar_one_or_none()

        if not src_c or not tgt_c:
            job.status = MigrationStatus.FAILED
            await db.commit()
            return

        from ...core.security import decrypt_credential
        src_conn = registry.build(src_c.connector_type.value, json.loads(decrypt_credential(src_c.encrypted_config)))
        tgt_conn = registry.build(tgt_c.connector_type.value, json.loads(decrypt_credential(tgt_c.encrypted_config)))

        entity_pairs = job.config.get("entity_pairs", [])
        if job.field_mapping:
            # Apply stored mapping to the first entity pair
            if entity_pairs:
                entity_pairs[0]["field_mapping"] = job.field_mapping

        async def on_progress(p: MigrationProgress):
            job.total_records = p.total
            job.migrated_records = p.migrated
            job.failed_records = p.failed
            await db.commit()

        async def on_audit(event: str, details: dict):
            log = AuditLog(
                id=gen_uuid(),
                migration_id=job_id,
                event=event,
                details=details,
            )
            db.add(log)
            await db.commit()

        try:
            progress = await run_migration(
                source_connector=src_conn,
                target_connector=tgt_conn,
                entity_pairs=entity_pairs,
                config=job.config or {},
                on_progress=on_progress,
                on_audit=on_audit,
            )
            job.status = MigrationStatus.COMPLETED
            job.completed_at = datetime.utcnow()
            job.error_log = progress.errors[:50]
        except Exception as e:
            job.status = MigrationStatus.FAILED
            job.error_log = [{"error": str(e)}]

        await db.commit()


@router.get("", response_model=list[MigrationResponse])
async def list_migrations(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(MigrationJob).where(MigrationJob.org_id == user.org_id)
    )
    return result.scalars().all()


@router.get("/{job_id}", response_model=MigrationResponse)
async def get_migration(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(MigrationJob).where(MigrationJob.id == job_id, MigrationJob.org_id == user.org_id)
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Migration job not found")
    return job


@router.get("/{job_id}/audit")
async def get_audit_log(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Verify org ownership
    result = await db.execute(
        select(MigrationJob).where(MigrationJob.id == job_id, MigrationJob.org_id == user.org_id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Migration job not found")

    logs = await db.execute(
        select(AuditLog).where(AuditLog.migration_id == job_id).order_by(AuditLog.ts)
    )
    return [{"event": l.event, "details": l.details, "ts": l.ts} for l in logs.scalars().all()]
