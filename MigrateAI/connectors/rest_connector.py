"""
Generic REST API connector — works with SAP, Salesforce, Oracle,
NetSuite, QuickBooks, HubSpot, Zoho, Freshworks, or any REST ERP.

Config:
{
  "base_url": "https://api.example.com",
  "auth_type": "api_key" | "bearer" | "basic" | "oauth2",
  "api_key": "...",          -- for api_key auth
  "token": "...",            -- for bearer auth
  "username": "...",         -- for basic auth
  "password": "...",         -- for basic auth
  "endpoints": [             -- list of entities to discover
    {"name": "customers", "path": "/customers", "method": "GET",
     "data_key": "results",  -- JSON key holding the array
     "id_field": "id"}
  ],
  "pagination": {
    "type": "page" | "offset" | "cursor" | "none",
    "page_param": "page",
    "size_param": "limit",
    "page_size": 100
  }
}
"""
import httpx
from typing import AsyncIterator
from .base import BaseConnector, Schema, Entity, Field, LoadResult


class RESTConnector(BaseConnector):

    def _headers(self) -> dict:
        auth = self.config.get("auth_type", "none")
        if auth == "api_key":
            key_header = self.config.get("key_header", "X-API-Key")
            return {key_header: self.config["api_key"]}
        if auth == "bearer":
            return {"Authorization": f"Bearer {self.config['token']}"}
        if auth == "basic":
            import base64
            creds = base64.b64encode(
                f"{self.config['username']}:{self.config['password']}".encode()
            ).decode()
            return {"Authorization": f"Basic {creds}"}
        return {}

    async def test(self):
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                url = self.config["base_url"].rstrip("/")
                r = await client.get(url, headers=self._headers())
                if r.status_code < 400:
                    return True, f"Connected (HTTP {r.status_code})"
                return False, f"HTTP {r.status_code}: {r.text[:200]}"
        except Exception as e:
            return False, str(e)

    async def get_schema(self) -> Schema:
        endpoints = self.config.get("endpoints", [])
        entities = []
        async with httpx.AsyncClient(timeout=30) as client:
            for ep in endpoints:
                try:
                    url = self.config["base_url"].rstrip("/") + ep["path"]
                    r = await client.request(
                        ep.get("method", "GET"), url,
                        headers=self._headers(),
                        params={self.config.get("pagination", {}).get("size_param", "limit"): 3}
                    )
                    data = r.json()
                    # Unwrap the data array
                    data_key = ep.get("data_key")
                    if data_key and isinstance(data, dict):
                        rows = data.get(data_key, [])
                    elif isinstance(data, list):
                        rows = data
                    else:
                        rows = [data]

                    fields = []
                    if rows:
                        for k, v in rows[0].items():
                            t = "number" if isinstance(v, (int, float)) else \
                                "boolean" if isinstance(v, bool) else \
                                "object" if isinstance(v, (dict, list)) else "string"
                            sample = [str(r.get(k, "")) for r in rows[:3]]
                            fields.append(Field(name=k, data_type=t, sample=sample))

                    total = data.get("total", data.get("count", len(rows))) \
                        if isinstance(data, dict) else len(rows)
                    entities.append(Entity(
                        name=ep["name"], fields=fields,
                        row_count=int(total) if isinstance(total, (int, float)) else 0
                    ))
                except Exception as e:
                    entities.append(Entity(
                        name=ep.get("name", "unknown"),
                        fields=[Field(name="error", data_type="string",
                                      sample=[str(e)])],
                    ))
        return Schema(connector_type="rest_api", entities=entities)

    async def extract(self, entity, batch=100, filters=None):
        ep = next((e for e in self.config.get("endpoints", [])
                   if e["name"] == entity), None)
        if not ep:
            return

        pagination = self.config.get("pagination", {"type": "none"})
        ptype = pagination.get("type", "none")
        url = self.config["base_url"].rstrip("/") + ep["path"]
        data_key = ep.get("data_key")
        page = 1
        offset = 0

        async with httpx.AsyncClient(timeout=60) as client:
            while True:
                params = {}
                if filters:
                    params.update(filters)
                if ptype == "page":
                    params[pagination.get("page_param", "page")] = page
                    params[pagination.get("size_param", "limit")] = batch
                elif ptype == "offset":
                    params[pagination.get("offset_param", "offset")] = offset
                    params[pagination.get("size_param", "limit")] = batch

                r = await client.request(
                    ep.get("method", "GET"), url,
                    headers=self._headers(), params=params
                )
                data = r.json()
                rows = data.get(data_key, data) if isinstance(data, dict) and data_key else \
                       data if isinstance(data, list) else [data]

                if not rows:
                    break
                yield rows
                if ptype == "none" or len(rows) < batch:
                    break
                page += 1
                offset += batch

    async def load(self, entity, rows, mode="upsert"):
        ep = next((e for e in self.config.get("endpoints", [])
                   if e["name"] == entity), None)
        if not ep:
            return LoadResult(failed=len(rows),
                              errors=["No endpoint config for this entity"])

        result = LoadResult()
        base_url = self.config["base_url"].rstrip("/")
        id_field = ep.get("id_field", "id")

        async with httpx.AsyncClient(timeout=30) as client:
            for row in rows:
                try:
                    rec_id = row.get(id_field)
                    if rec_id and mode == "upsert":
                        r = await client.put(
                            f"{base_url}{ep['path']}/{rec_id}",
                            headers={**self._headers(), "Content-Type": "application/json"},
                            json=row,
                        )
                        result.updated += 1
                    else:
                        r = await client.post(
                            f"{base_url}{ep['path']}",
                            headers={**self._headers(), "Content-Type": "application/json"},
                            json=row,
                        )
                        result.inserted += 1
                except Exception as e:
                    result.failed += 1
                    result.errors.append(str(e))
        return result
