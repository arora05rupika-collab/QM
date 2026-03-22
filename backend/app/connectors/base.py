from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import AsyncIterator, Any
import asyncio


@dataclass
class FieldInfo:
    name: str
    data_type: str          # string | number | boolean | date | object | array
    nullable: bool = True
    primary_key: bool = False
    description: str = ""
    sample_values: list = field(default_factory=list)


@dataclass
class EntityInfo:
    name: str               # e.g. "Invoice", "Customer", "Product"
    fields: list[FieldInfo]
    record_count: int = 0
    description: str = ""


@dataclass
class SchemaInfo:
    entities: list[EntityInfo]
    connector_type: str
    version: str = ""


@dataclass
class LoadResult:
    inserted: int = 0
    updated: int = 0
    failed: int = 0
    errors: list[dict] = field(default_factory=list)


class ERPConnector(ABC):
    """Base class for all ERP/datasource connectors."""

    def __init__(self, config: dict):
        self.config = config

    @abstractmethod
    async def test_connection(self) -> bool:
        """Verify the connector can reach the target system."""

    @abstractmethod
    async def get_schema(self) -> SchemaInfo:
        """Introspect and return the data schema."""

    @abstractmethod
    async def extract(
        self,
        entity: str,
        batch_size: int = 500,
        filters: dict | None = None,
    ) -> AsyncIterator[list[dict]]:
        """Stream records from the source in batches."""

    @abstractmethod
    async def load(
        self,
        entity: str,
        rows: list[dict],
        mode: str = "upsert",   # insert | upsert | replace
    ) -> LoadResult:
        """Write rows into the target system."""

    async def execute_action(self, action: str, params: dict) -> dict:
        """
        Execute an automation action (create_invoice, approve_po, etc.).
        Override in connectors that support automation.
        """
        raise NotImplementedError(f"Connector does not support action: {action}")
