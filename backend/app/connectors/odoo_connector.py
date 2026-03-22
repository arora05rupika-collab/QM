"""Odoo ERP connector via XML-RPC."""
import asyncio
import xmlrpc.client
from typing import AsyncIterator
from .base import ERPConnector, SchemaInfo, EntityInfo, FieldInfo, LoadResult
from ..connectors import registry


@registry.register("odoo")
class OdooConnector(ERPConnector):
    """
    Config: host, port, database, user, password
    """

    def _get_uid(self):
        url = f"{self.config['host']}:{self.config.get('port', 8069)}"
        common = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/common")
        uid = common.authenticate(
            self.config["database"],
            self.config["user"],
            self.config["password"],
            {},
        )
        if not uid:
            raise ConnectionError("Odoo authentication failed")
        return url, uid

    def _models(self, url):
        return xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/object")

    async def test_connection(self) -> bool:
        try:
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, self._get_uid)
            return True
        except Exception:
            return False

    async def get_schema(self) -> SchemaInfo:
        loop = asyncio.get_event_loop()
        url, uid = await loop.run_in_executor(None, self._get_uid)
        models = self._models(url)

        # Common ERP entities in Odoo
        entity_names = [
            "res.partner", "account.move", "sale.order", "purchase.order",
            "stock.picking", "product.product", "hr.employee",
        ]
        entities = []
        for model in entity_names:
            try:
                fields_info = await loop.run_in_executor(
                    None,
                    lambda m=model: models.execute_kw(
                        self.config["database"], uid, self.config["password"],
                        m, "fields_get", [],
                        {"attributes": ["string", "type", "required"]},
                    ),
                )
                count = await loop.run_in_executor(
                    None,
                    lambda m=model: models.execute_kw(
                        self.config["database"], uid, self.config["password"],
                        m, "search_count", [[]], {},
                    ),
                )
                fields = [
                    FieldInfo(
                        name=k,
                        data_type=self._odoo_type(v.get("type", "char")),
                        nullable=not v.get("required", False),
                        description=v.get("string", ""),
                    )
                    for k, v in fields_info.items()
                ]
                entities.append(EntityInfo(name=model, fields=fields, record_count=count))
            except Exception:
                continue
        return SchemaInfo(entities=entities, connector_type="odoo")

    async def extract(self, entity: str, batch_size: int = 500, filters: dict | None = None) -> AsyncIterator[list[dict]]:
        loop = asyncio.get_event_loop()
        url, uid = await loop.run_in_executor(None, self._get_uid)
        models = self._models(url)
        domain = [[k, "=", v] for k, v in (filters or {}).items()]
        offset = 0
        while True:
            records = await loop.run_in_executor(
                None,
                lambda o=offset: models.execute_kw(
                    self.config["database"], uid, self.config["password"],
                    entity, "search_read", [domain],
                    {"limit": batch_size, "offset": o},
                ),
            )
            if not records:
                break
            yield records
            offset += batch_size

    async def load(self, entity: str, rows: list[dict], mode: str = "upsert") -> LoadResult:
        loop = asyncio.get_event_loop()
        url, uid = await loop.run_in_executor(None, self._get_uid)
        models = self._models(url)
        result = LoadResult()
        for row in rows:
            try:
                rec_id = row.pop("id", None)
                if rec_id and mode == "upsert":
                    await loop.run_in_executor(
                        None,
                        lambda: models.execute_kw(
                            self.config["database"], uid, self.config["password"],
                            entity, "write", [[rec_id], row],
                        ),
                    )
                    result.updated += 1
                else:
                    await loop.run_in_executor(
                        None,
                        lambda: models.execute_kw(
                            self.config["database"], uid, self.config["password"],
                            entity, "create", [row],
                        ),
                    )
                    result.inserted += 1
            except Exception as e:
                result.failed += 1
                result.errors.append({"error": str(e)})
        return result

    async def execute_action(self, action: str, params: dict) -> dict:
        """Execute an Odoo workflow method for automation."""
        loop = asyncio.get_event_loop()
        url, uid = await loop.run_in_executor(None, self._get_uid)
        models = self._models(url)
        model = params.get("model", "")
        ids = params.get("ids", [])
        result = await loop.run_in_executor(
            None,
            lambda: models.execute_kw(
                self.config["database"], uid, self.config["password"],
                model, action, [ids], params.get("kwargs", {}),
            ),
        )
        return {"result": result}

    @staticmethod
    def _odoo_type(t: str) -> str:
        mapping = {
            "integer": "number", "float": "number", "monetary": "number",
            "char": "string", "text": "string", "selection": "string",
            "boolean": "boolean",
            "date": "date", "datetime": "date",
            "many2one": "object", "one2many": "array", "many2many": "array",
        }
        return mapping.get(t, "string")
