from .auth import router as auth_router
from .connectors import router as connectors_router
from .migrations import router as migrations_router
from .automation import router as automation_router

__all__ = ["auth_router", "connectors_router", "migrations_router", "automation_router"]
