"""
Connector plugin system.

Each connector implements the ERPConnector abstract base, exposing:
  - test_connection()      → bool
  - get_schema()           → SchemaInfo
  - extract(entity, ...)   → AsyncIterator[list[dict]]
  - load(entity, rows)     → LoadResult
  - execute_action(action, params) → dict   (used by automation)
"""
from .base import ERPConnector, SchemaInfo, LoadResult
from .registry import ConnectorRegistry

registry = ConnectorRegistry()
