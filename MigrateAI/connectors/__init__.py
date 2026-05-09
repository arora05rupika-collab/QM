from .csv_connector import CSVConnector
from .postgres_connector import PostgreSQLConnector
from .mysql_connector import MySQLConnector
from .rest_connector import RESTConnector

REGISTRY = {
    "csv":        CSVConnector,
    "postgresql": PostgreSQLConnector,
    "mysql":      MySQLConnector,
    "rest_api":   RESTConnector,
    # Aliases for popular ERPs (all use REST under the hood)
    "salesforce": RESTConnector,
    "sap":        RESTConnector,
    "oracle":     RESTConnector,
    "dynamics":   RESTConnector,
    "netsuite":   RESTConnector,
    "quickbooks": RESTConnector,
    "hubspot":    RESTConnector,
    "zoho":       RESTConnector,
}

def build(connector_type: str, config: dict):
    cls = REGISTRY.get(connector_type.lower())
    if not cls:
        raise ValueError(f"Unknown connector type: {connector_type}")
    return cls(config)

def list_types():
    return list(REGISTRY.keys())
