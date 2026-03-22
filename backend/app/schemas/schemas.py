from pydantic import BaseModel, EmailStr, Field
from typing import Optional, Any
from datetime import datetime
from ..models.models import ConnectorType, MigrationStatus, AutomationStatus


# ─── Auth ─────────────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    org_name: str
    email: EmailStr
    password: str = Field(min_length=8)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


# ─── Connectors ───────────────────────────────────────────────────────────────

class ConnectorCreate(BaseModel):
    name: str
    connector_type: ConnectorType
    config: dict  # raw credentials — encrypted before storage


class ConnectorResponse(BaseModel):
    id: str
    name: str
    connector_type: ConnectorType
    is_active: bool
    schema_fetched_at: Optional[datetime]
    created_at: datetime

    model_config = {"from_attributes": True}


class SchemaFieldOut(BaseModel):
    name: str
    data_type: str
    nullable: bool
    primary_key: bool
    description: str


class SchemaEntityOut(BaseModel):
    name: str
    fields: list[SchemaFieldOut]
    record_count: int
    description: str


class SchemaOut(BaseModel):
    entities: list[SchemaEntityOut]
    connector_type: str


# ─── Migration ────────────────────────────────────────────────────────────────

class EntityPairIn(BaseModel):
    source_entity: str
    target_entity: str
    field_mapping: Optional[list[dict]] = None  # None = let AI generate


class MigrationCreate(BaseModel):
    name: str
    source_connector_id: str
    target_connector_id: str
    entity_pairs: list[EntityPairIn]
    config: dict = Field(default_factory=lambda: {
        "batch_size": 500,
        "dry_run": False,
        "mode": "upsert",
    })


class MigrationResponse(BaseModel):
    id: str
    name: str
    source_connector_id: str
    target_connector_id: str
    status: MigrationStatus
    total_records: float
    migrated_records: float
    failed_records: float
    field_mapping: Optional[list]
    config: Optional[dict]
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    created_at: datetime

    model_config = {"from_attributes": True}


class MappingRequest(BaseModel):
    source_entity: str
    target_entity: str


# ─── Automation ───────────────────────────────────────────────────────────────

class AutomationCreate(BaseModel):
    connector_id: str
    name: str
    description: Optional[str] = None
    trigger: str  # human-readable: "every weekday at 8am" or "when new PO arrives"
    steps: list[dict]  # [{action, params, condition}]


class AutomationResponse(BaseModel):
    id: str
    name: str
    description: Optional[str]
    connector_id: str
    trigger: str
    status: AutomationStatus
    last_run_at: Optional[datetime]
    run_count: float
    created_at: datetime

    model_config = {"from_attributes": True}


class AutomationRunResponse(BaseModel):
    id: str
    workflow_id: str
    status: str
    input_data: Optional[dict]
    output_data: Optional[dict]
    steps_log: Optional[list]
    error: Optional[str]
    started_at: datetime
    completed_at: Optional[datetime]

    model_config = {"from_attributes": True}


# ─── Generic ──────────────────────────────────────────────────────────────────

class MessageResponse(BaseModel):
    message: str


class ErrorResponse(BaseModel):
    detail: str
