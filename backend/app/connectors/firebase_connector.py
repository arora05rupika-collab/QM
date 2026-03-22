"""Firebase / Firestore connector."""
from typing import AsyncIterator
import asyncio
from .base import ERPConnector, SchemaInfo, EntityInfo, FieldInfo, LoadResult
from ..connectors import registry


@registry.register("firebase")
class FirebaseConnector(ERPConnector):
    """
    Config keys:
      project_id, credentials_json (service account JSON as a string)
    """

    def _get_client(self):
        import json
        import firebase_admin
        from firebase_admin import credentials, firestore

        cred_data = json.loads(self.config["credentials_json"])
        app_name = f"erp_{self.config['project_id']}"
        try:
            app = firebase_admin.get_app(app_name)
        except ValueError:
            cred = credentials.Certificate(cred_data)
            app = firebase_admin.initialize_app(cred, name=app_name)
        return firestore.client(app=app)

    async def test_connection(self) -> bool:
        try:
            db = self._get_client()
            # Try listing first collection
            await asyncio.get_event_loop().run_in_executor(
                None, lambda: list(db.collections())[:1]
            )
            return True
        except Exception:
            return False

    async def get_schema(self) -> SchemaInfo:
        db = self._get_client()
        loop = asyncio.get_event_loop()

        collections = await loop.run_in_executor(None, lambda: list(db.collections()))
        entities = []
        for col in collections:
            # Sample up to 5 docs to infer schema
            docs = await loop.run_in_executor(
                None, lambda c=col: list(c.limit(5).stream())
            )
            field_map: dict[str, FieldInfo] = {}
            count = await loop.run_in_executor(
                None, lambda c=col: len(list(c.stream()))
            )
            for doc in docs:
                data = doc.to_dict()
                for k, v in data.items():
                    if k not in field_map:
                        field_map[k] = FieldInfo(
                            name=k,
                            data_type=self._infer_type(v),
                            sample_values=[v],
                        )
            entities.append(
                EntityInfo(
                    name=col.id,
                    fields=list(field_map.values()),
                    record_count=count,
                )
            )
        return SchemaInfo(entities=entities, connector_type="firebase")

    async def extract(
        self,
        entity: str,
        batch_size: int = 500,
        filters: dict | None = None,
    ) -> AsyncIterator[list[dict]]:
        db = self._get_client()
        loop = asyncio.get_event_loop()
        col = db.collection(entity)
        query = col
        if filters:
            for k, v in filters.items():
                query = query.where(k, "==", v)

        docs = await loop.run_in_executor(None, lambda: list(query.stream()))
        for i in range(0, len(docs), batch_size):
            batch = docs[i : i + batch_size]
            yield [{"_id": d.id, **d.to_dict()} for d in batch]

    async def load(self, entity: str, rows: list[dict], mode: str = "upsert") -> LoadResult:
        db = self._get_client()
        loop = asyncio.get_event_loop()
        result = LoadResult()
        col = db.collection(entity)
        for row in rows:
            doc_id = str(row.pop("_id", None) or "")
            try:
                if doc_id and mode == "upsert":
                    await loop.run_in_executor(None, lambda: col.document(doc_id).set(row, merge=True))
                else:
                    await loop.run_in_executor(None, lambda: col.add(row))
                result.inserted += 1
            except Exception as e:
                result.failed += 1
                result.errors.append({"error": str(e)})
        return result

    @staticmethod
    def _infer_type(value) -> str:
        if isinstance(value, bool):
            return "boolean"
        if isinstance(value, (int, float)):
            return "number"
        if isinstance(value, dict):
            return "object"
        if isinstance(value, list):
            return "array"
        return "string"
