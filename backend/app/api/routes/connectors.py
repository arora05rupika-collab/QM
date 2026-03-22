import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from ...models.models import Connector, User
from ...schemas.schemas import ConnectorCreate, ConnectorResponse, SchemaOut
from ...core.security import encrypt_credential, decrypt_credential
from ...models.base import gen_uuid
from ..deps import get_db, get_current_user
from ...connectors import registry
from ...connectors.base import SchemaInfo

router = APIRouter(prefix="/connectors", tags=["Connectors"])


def _schema_to_out(schema: SchemaInfo) -> dict:
    return {
        "connector_type": schema.connector_type,
        "entities": [
            {
                "name": e.name,
                "fields": [
                    {"name": f.name, "data_type": f.data_type,
                     "nullable": f.nullable, "primary_key": f.primary_key,
                     "description": f.description}
                    for f in e.fields
                ],
                "record_count": e.record_count,
                "description": e.description,
            }
            for e in schema.entities
        ],
    }


@router.post("", response_model=ConnectorResponse, status_code=201)
async def create_connector(
    body: ConnectorCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Validate connector type is registered
    try:
        registry.get(body.connector_type.value)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Connector type '{body.connector_type}' not supported")

    encrypted = encrypt_credential(json.dumps(body.config))
    connector = Connector(
        id=gen_uuid(),
        org_id=user.org_id,
        name=body.name,
        connector_type=body.connector_type,
        encrypted_config=encrypted,
    )
    db.add(connector)
    await db.commit()
    await db.refresh(connector)
    return connector


@router.get("", response_model=list[ConnectorResponse])
async def list_connectors(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Connector).where(Connector.org_id == user.org_id, Connector.is_active == True)
    )
    return result.scalars().all()


@router.get("/{connector_id}", response_model=ConnectorResponse)
async def get_connector(
    connector_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Connector).where(Connector.id == connector_id, Connector.org_id == user.org_id)
    )
    c = result.scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=404, detail="Connector not found")
    return c


@router.post("/{connector_id}/test")
async def test_connector(
    connector_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Connector).where(Connector.id == connector_id, Connector.org_id == user.org_id)
    )
    c = result.scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=404, detail="Connector not found")

    config = json.loads(decrypt_credential(c.encrypted_config))
    connector = registry.build(c.connector_type.value, config)
    ok = await connector.test_connection()
    return {"connected": ok}


@router.post("/{connector_id}/schema", response_model=SchemaOut)
async def fetch_schema(
    connector_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from datetime import datetime

    result = await db.execute(
        select(Connector).where(Connector.id == connector_id, Connector.org_id == user.org_id)
    )
    c = result.scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=404, detail="Connector not found")

    config = json.loads(decrypt_credential(c.encrypted_config))
    connector = registry.build(c.connector_type.value, config)
    schema = await connector.get_schema()
    out = _schema_to_out(schema)

    # Cache schema on the connector record
    c.schema_snapshot = out
    c.schema_fetched_at = datetime.utcnow()
    await db.commit()
    return out


@router.delete("/{connector_id}")
async def delete_connector(
    connector_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Connector).where(Connector.id == connector_id, Connector.org_id == user.org_id)
    )
    c = result.scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=404, detail="Connector not found")
    c.is_active = False
    await db.commit()
    return {"message": "Connector deactivated"}
