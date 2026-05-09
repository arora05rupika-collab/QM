"""
Every connector inherits from BaseConnector.
Adding a new ERP = write one class, register it.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import AsyncIterator


@dataclass
class Field:
    name: str
    data_type: str          # string | number | boolean | date | object
    nullable: bool = True
    primary_key: bool = False
    sample: list = field(default_factory=list)

@dataclass
class Entity:
    name: str               # table / collection / endpoint name
    fields: list[Field]
    row_count: int = 0

@dataclass
class Schema:
    connector_type: str
    entities: list[Entity]

@dataclass
class LoadResult:
    inserted: int = 0
    updated: int = 0
    failed: int = 0
    errors: list = field(default_factory=list)


class BaseConnector(ABC):
    def __init__(self, config: dict):
        self.config = config

    @abstractmethod
    async def test(self) -> tuple[bool, str]:
        """Returns (ok, message)"""

    @abstractmethod
    async def get_schema(self) -> Schema:
        """Introspect and return the schema."""

    @abstractmethod
    async def extract(self, entity: str, batch: int = 500,
                      filters: dict = None) -> AsyncIterator[list[dict]]:
        """Stream rows in batches."""

    @abstractmethod
    async def load(self, entity: str, rows: list[dict],
                   mode: str = "upsert") -> LoadResult:
        """Write rows to target."""

    def to_schema_dict(self, schema: Schema) -> dict:
        return {
            "connector_type": schema.connector_type,
            "entities": [
                {
                    "name": e.name,
                    "row_count": e.row_count,
                    "fields": [
                        {"name": f.name, "data_type": f.data_type,
                         "nullable": f.nullable, "primary_key": f.primary_key,
                         "sample": f.sample[:3]}
                        for f in e.fields
                    ]
                }
                for e in schema.entities
            ]
        }
