from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.core.config import settings
from app.api.deps import create_tables
from app.api.routes import auth_router, connectors_router, migrations_router, automation_router

# Import connectors to trigger their @registry.register decorators
import app.connectors.postgresql_connector  # noqa: F401
import app.connectors.mysql_connector       # noqa: F401
import app.connectors.firebase_connector    # noqa: F401
import app.connectors.odoo_connector        # noqa: F401


@asynccontextmanager
async def lifespan(app: FastAPI):
    await create_tables()
    yield


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.VERSION,
    description="""
## AI-Powered ERP Migration Platform

Migrate data between any ERP systems with AI-driven schema mapping and automated validation.

### Features
- **Multi-ERP Connectors**: PostgreSQL, MySQL, Firebase, Odoo, SAP, Oracle, Dynamics
- **AI Schema Mapping**: Claude auto-maps fields across different data models
- **Migration Engine**: Batch processing with dry-run, rollback, and audit logging
- **Automation Workflows**: AI agents that execute recurring ERP tasks (replacing manual work)
- **Security**: Encrypted credentials, JWT auth, immutable audit trail
""",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api")
app.include_router(connectors_router, prefix="/api")
app.include_router(migrations_router, prefix="/api")
app.include_router(automation_router, prefix="/api")


@app.get("/health")
async def health():
    return {"status": "ok", "version": settings.VERSION}


@app.get("/api/connector-types")
async def connector_types():
    from app.connectors import registry
    return {"types": registry.list_types()}
