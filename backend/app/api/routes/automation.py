import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from ...models.models import AutomationWorkflow, AutomationRun, Connector, User, AutomationStatus
from ...schemas.schemas import AutomationCreate, AutomationResponse, AutomationRunResponse
from ...core.security import decrypt_credential
from ...models.base import gen_uuid
from ..deps import get_db, get_current_user
from ...connectors import registry
from ...engines.ai_engine import run_automation_agent

router = APIRouter(prefix="/automation", tags=["Automation"])


@router.post("", response_model=AutomationResponse, status_code=201)
async def create_workflow(
    body: AutomationCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Verify connector belongs to org
    result = await db.execute(
        select(Connector).where(Connector.id == body.connector_id, Connector.org_id == user.org_id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Connector not found")

    workflow = AutomationWorkflow(
        id=gen_uuid(),
        org_id=user.org_id,
        connector_id=body.connector_id,
        name=body.name,
        description=body.description,
        trigger=body.trigger,
        steps=body.steps,
        status=AutomationStatus.ACTIVE,
    )
    db.add(workflow)
    await db.commit()
    await db.refresh(workflow)
    return workflow


@router.get("", response_model=list[AutomationResponse])
async def list_workflows(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(AutomationWorkflow).where(AutomationWorkflow.org_id == user.org_id)
    )
    return result.scalars().all()


@router.get("/{workflow_id}", response_model=AutomationResponse)
async def get_workflow(
    workflow_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(AutomationWorkflow).where(
            AutomationWorkflow.id == workflow_id,
            AutomationWorkflow.org_id == user.org_id,
        )
    )
    wf = result.scalar_one_or_none()
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return wf


@router.post("/{workflow_id}/run")
async def run_workflow(
    workflow_id: str,
    trigger_data: dict = {},
    background_tasks: BackgroundTasks = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(AutomationWorkflow).where(
            AutomationWorkflow.id == workflow_id,
            AutomationWorkflow.org_id == user.org_id,
        )
    )
    wf = result.scalar_one_or_none()
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")

    if wf.status != AutomationStatus.ACTIVE:
        raise HTTPException(status_code=400, detail="Workflow is not active")

    run = AutomationRun(
        id=gen_uuid(),
        workflow_id=workflow_id,
        status="running",
        input_data=trigger_data,
    )
    db.add(run)
    await db.commit()

    background_tasks.add_task(_execute_automation_run, run.id, wf.id, user.org_id, trigger_data)
    return {"run_id": run.id, "message": "Automation started"}


async def _execute_automation_run(run_id: str, workflow_id: str, org_id: str, trigger_data: dict):
    from ..deps import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        wf_result = await db.execute(select(AutomationWorkflow).where(AutomationWorkflow.id == workflow_id))
        wf = wf_result.scalar_one_or_none()

        conn_result = await db.execute(select(Connector).where(Connector.id == wf.connector_id))
        connector_model = conn_result.scalar_one_or_none()

        run_result = await db.execute(select(AutomationRun).where(AutomationRun.id == run_id))
        run = run_result.scalar_one_or_none()

        config = json.loads(decrypt_credential(connector_model.encrypted_config))
        connector = registry.build(connector_model.connector_type.value, config)

        workflow_description = f"""
Workflow: {wf.name}
Description: {wf.description or ''}
Trigger: {wf.trigger}
Steps:
{json.dumps(wf.steps, indent=2)}
"""
        try:
            result = await run_automation_agent(
                workflow_description=workflow_description,
                trigger_data=trigger_data,
                connector=connector,
            )
            run.status = result.get("status", "success")
            run.output_data = {"summary": result.get("summary")}
            run.steps_log = result.get("steps", [])
        except Exception as e:
            run.status = "failed"
            run.error = str(e)

        run.completed_at = datetime.utcnow()
        wf.last_run_at = datetime.utcnow()
        wf.run_count = (wf.run_count or 0) + 1
        await db.commit()


@router.get("/{workflow_id}/runs", response_model=list[AutomationRunResponse])
async def list_runs(
    workflow_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Verify ownership
    wf_result = await db.execute(
        select(AutomationWorkflow).where(
            AutomationWorkflow.id == workflow_id,
            AutomationWorkflow.org_id == user.org_id,
        )
    )
    if not wf_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Workflow not found")

    runs = await db.execute(
        select(AutomationRun)
        .where(AutomationRun.workflow_id == workflow_id)
        .order_by(AutomationRun.started_at.desc())
        .limit(50)
    )
    return runs.scalars().all()


@router.patch("/{workflow_id}/status")
async def toggle_workflow_status(
    workflow_id: str,
    status: AutomationStatus,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(AutomationWorkflow).where(
            AutomationWorkflow.id == workflow_id,
            AutomationWorkflow.org_id == user.org_id,
        )
    )
    wf = result.scalar_one_or_none()
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")
    wf.status = status
    await db.commit()
    return {"status": status}
