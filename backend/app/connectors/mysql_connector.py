"""MySQL / MariaDB connector."""
from typing import AsyncIterator
import aiomysql
from .base import ERPConnector, SchemaInfo, EntityInfo, FieldInfo, LoadResult
from ..connectors import registry


@registry.register("mysql")
class MySQLConnector(ERPConnector):

    async def _connect(self):
        return await aiomysql.connect(
            host=self.config["host"],
            port=self.config.get("port", 3306),
            user=self.config["user"],
            password=self.config["password"],
            db=self.config["database"],
            autocommit=True,
        )

    async def test_connection(self) -> bool:
        try:
            conn = await self._connect()
            conn.close()
            return True
        except Exception:
            return False

    async def get_schema(self) -> SchemaInfo:
        conn = await self._connect()
        async with conn.cursor(aiomysql.DictCursor) as cur:
            await cur.execute("SHOW TABLES")
            tables = [list(r.values())[0] for r in await cur.fetchall()]
            entities = []
            for table in tables:
                await cur.execute(f"DESCRIBE `{table}`")
                cols = await cur.fetchall()
                await cur.execute(f"SELECT COUNT(*) as cnt FROM `{table}`")
                count = (await cur.fetchone())["cnt"]
                fields = [
                    FieldInfo(
                        name=c["Field"],
                        data_type=self._mysql_type(c["Type"]),
                        nullable=c["Null"] == "YES",
                        primary_key=c["Key"] == "PRI",
                    )
                    for c in cols
                ]
                entities.append(EntityInfo(name=table, fields=fields, record_count=count))
        conn.close()
        return SchemaInfo(entities=entities, connector_type="mysql")

    async def extract(self, entity: str, batch_size: int = 500, filters: dict | None = None) -> AsyncIterator[list[dict]]:
        conn = await self._connect()
        async with conn.cursor(aiomysql.DictCursor) as cur:
            where = ""
            vals = []
            if filters:
                clauses = [f"`{k}` = %s" for k in filters]
                where = "WHERE " + " AND ".join(clauses)
                vals = list(filters.values())
            offset = 0
            while True:
                await cur.execute(f"SELECT * FROM `{entity}` {where} LIMIT %s OFFSET %s", vals + [batch_size, offset])
                rows = await cur.fetchall()
                if not rows:
                    break
                yield [dict(r) for r in rows]
                offset += batch_size
        conn.close()

    async def load(self, entity: str, rows: list[dict], mode: str = "upsert") -> LoadResult:
        if not rows:
            return LoadResult()
        conn = await self._connect()
        result = LoadResult()
        async with conn.cursor() as cur:
            cols = list(rows[0].keys())
            col_list = ", ".join(f"`{c}`" for c in cols)
            placeholders = ", ".join(["%s"] * len(cols))
            sql = f"INSERT {'IGNORE ' if mode != 'replace' else ''}INTO `{entity}` ({col_list}) VALUES ({placeholders})"
            if mode == "replace":
                sql = f"REPLACE INTO `{entity}` ({col_list}) VALUES ({placeholders})"
            for row in rows:
                try:
                    await cur.execute(sql, [row[c] for c in cols])
                    result.inserted += 1
                except Exception as e:
                    result.failed += 1
                    result.errors.append({"error": str(e)})
        conn.close()
        return result

    @staticmethod
    def _mysql_type(t: str) -> str:
        t = t.lower()
        if any(x in t for x in ["int", "decimal", "float", "double", "numeric"]):
            return "number"
        if any(x in t for x in ["date", "time", "year"]):
            return "date"
        if "bool" in t or "tinyint(1)" in t:
            return "boolean"
        if any(x in t for x in ["json", "blob"]):
            return "object"
        return "string"
