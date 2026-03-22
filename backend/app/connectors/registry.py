from typing import Type
from .base import ERPConnector


class ConnectorRegistry:
    """Plugin registry: maps connector_type strings to ERPConnector subclasses."""

    def __init__(self):
        self._registry: dict[str, Type[ERPConnector]] = {}

    def register(self, connector_type: str):
        """Decorator: @registry.register('sap')"""
        def decorator(cls: Type[ERPConnector]):
            self._registry[connector_type] = cls
            return cls
        return decorator

    def get(self, connector_type: str) -> Type[ERPConnector]:
        cls = self._registry.get(connector_type)
        if not cls:
            raise ValueError(f"No connector registered for type: {connector_type}")
        return cls

    def list_types(self) -> list[str]:
        return list(self._registry.keys())

    def build(self, connector_type: str, config: dict) -> ERPConnector:
        cls = self.get(connector_type)
        return cls(config)
