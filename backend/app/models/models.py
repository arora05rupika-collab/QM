from sqlalchemy import Column, String, Text, DateTime, JSON, Float, Boolean, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from datetime import datetime
from enum import Enum
from .base import Base, gen_uuid


class ConnectorType(str, Enum):
    SAP = "sap"
    ORACLE = "oracle"
    DYNAMICS = "dynamics"
    NETSUITE = "netsuite"
    SALESFORCE = "salesforce"
    FIREBASE = "firebase"
    POSTGRESQL = "postgresql"
    MYSQL = "mysql"
    MONGODB = "mongodb"
    ODOO = "odoo"
    CUSTOM = "custom"


class MigrationStatus(str, Enum):
    DRAFT = "draft"
    ANALYZING = "analyzing"
    READY = "ready"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"
    ROLLED_BACK = "rolled_back"


class AutomationStatus(str, Enum):
    ACTIVE = "active"
    PAUSED = "paused"
    DISABLED = "disabled"


# ─── Users & Orgs ────────────────────────────────────────────────────────────

class Organization(Base):
    __tablename__ = "organizations"
    id = Column(String, primary_key=True, default=gen_uuid)
    name = Column(String(255), nullable=False)
    plan = Column(String(50), default="free")  # free / pro / enterprise
    created_at = Column(DateTime, server_default=func.now())
    users = relationship("User", back_populates="org")
    connectors = relationship("Connector", back_populates="org")
    migrations = relationship("MigrationJob", back_populates="org")
    automations = relationship("AutomationWorkflow", back_populates="org")


class User(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True, default=gen_uuid)
    org_id = Column(String, ForeignKey("organizations.id"), nullable=False)
    email = Column(String(255), unique=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(50), default="member")  # admin / member / viewer
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    org = relationship("Organization", back_populates="users")


# ─── Connectors ──────────────────────────────────────────────────────────────

class Connector(Base):
    """Represents a connection to an ERP system or data source."""
    __tablename__ = "connectors"
    id = Column(String, primary_key=True, default=gen_uuid)
    org_id = Column(String, ForeignKey("organizations.id"), nullable=False)
    name = Column(String(255), nullable=False)
    connector_type = Column(SAEnum(ConnectorType), nullable=False)
    # Encrypted JSON blob of credentials: host, user, password, api_key, etc.
    encrypted_config = Column(Text, nullable=False)
    # Cached schema snapshot (tables/fields/types)
    schema_snapshot = Column(JSON, nullable=True)
    schema_fetched_at = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    org = relationship("Organization", back_populates="connectors")


# ─── Migration Jobs ───────────────────────────────────────────────────────────

class MigrationJob(Base):
    __tablename__ = "migration_jobs"
    id = Column(String, primary_key=True, default=gen_uuid)
    org_id = Column(String, ForeignKey("organizations.id"), nullable=False)
    name = Column(String(255), nullable=False)
    source_connector_id = Column(String, ForeignKey("connectors.id"), nullable=False)
    target_connector_id = Column(String, ForeignKey("connectors.id"), nullable=False)
    status = Column(SAEnum(MigrationStatus), default=MigrationStatus.DRAFT)
    # AI-generated field mapping: [{source_field, target_field, transform, confidence}]
    field_mapping = Column(JSON, nullable=True)
    # User overrides on top of AI mapping
    mapping_overrides = Column(JSON, nullable=True)
    # Migration config: batch_size, dry_run, selected_entities, etc.
    config = Column(JSON, nullable=True)
    # Runtime progress
    total_records = Column(Float, default=0)
    migrated_records = Column(Float, default=0)
    failed_records = Column(Float, default=0)
    error_log = Column(JSON, nullable=True)
    # Rollback snapshot location
    rollback_snapshot_url = Column(Text, nullable=True)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    org = relationship("Organization", back_populates="migrations")
    source_connector = relationship("Connector", foreign_keys=[source_connector_id])
    target_connector = relationship("Connector", foreign_keys=[target_connector_id])
    audit_logs = relationship("AuditLog", back_populates="migration")


class AuditLog(Base):
    """Immutable audit trail of every migration action."""
    __tablename__ = "audit_logs"
    id = Column(String, primary_key=True, default=gen_uuid)
    migration_id = Column(String, ForeignKey("migration_jobs.id"), nullable=False)
    event = Column(String(255), nullable=False)
    entity_type = Column(String(255), nullable=True)
    record_id = Column(String(255), nullable=True)
    details = Column(JSON, nullable=True)
    ts = Column(DateTime, server_default=func.now())
    migration = relationship("MigrationJob", back_populates="audit_logs")


# ─── Automation Workflows ─────────────────────────────────────────────────────

class AutomationWorkflow(Base):
    """AI agent workflow that automates recurring ERP tasks."""
    __tablename__ = "automation_workflows"
    id = Column(String, primary_key=True, default=gen_uuid)
    org_id = Column(String, ForeignKey("organizations.id"), nullable=False)
    connector_id = Column(String, ForeignKey("connectors.id"), nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    # Natural-language trigger: "every day at 9am", "when new invoice arrives"
    trigger = Column(String(500), nullable=False)
    # Steps defined as JSON: [{action, params, condition}]
    steps = Column(JSON, nullable=False)
    status = Column(SAEnum(AutomationStatus), default=AutomationStatus.ACTIVE)
    last_run_at = Column(DateTime, nullable=True)
    run_count = Column(Float, default=0)
    created_at = Column(DateTime, server_default=func.now())
    org = relationship("Organization", back_populates="automations")
    connector = relationship("Connector")
    runs = relationship("AutomationRun", back_populates="workflow")


class AutomationRun(Base):
    __tablename__ = "automation_runs"
    id = Column(String, primary_key=True, default=gen_uuid)
    workflow_id = Column(String, ForeignKey("automation_workflows.id"), nullable=False)
    status = Column(String(50), default="running")  # running / success / failed
    input_data = Column(JSON, nullable=True)
    output_data = Column(JSON, nullable=True)
    steps_log = Column(JSON, nullable=True)
    error = Column(Text, nullable=True)
    started_at = Column(DateTime, server_default=func.now())
    completed_at = Column(DateTime, nullable=True)
    workflow = relationship("AutomationWorkflow", back_populates="runs")
