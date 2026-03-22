"""PostgreSQL connector — also serves as the reference implementation."""
from typing import AsyncIterator
import asyncpg
from .base import ERPConnector, SchemaInfo, EntityInfo, FieldInfo, LoadResult
from ..connectors import registry


@registry.register("postgresql")
class PostgreSQLConnector(ERPConnector):

    async def _connect(self) -> asyncpg.Connection:
        return await asyncpg.connect(
            host=self.config["host"],
            port=self.config.get("port", 5432),
            user=self.config["user"],
            password=self.config["password"],
            database=self.config["database"],
        )

    async def test_connection(self) -> bool:
        try:
            conn = await self._connect()
            await conn.execute("SELECT 1")
            await conn.close()
            return True
        except Exception:
            return False

    async def get_schema(self) -> SchemaInfo:
        conn = await self._connect()
        try:
            tables = await conn.fetch(
                """
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
                """
            )
            entities = []
            for row in tables:
                table = row["table_name"]
                cols = await conn.fetch(
                    """
                    SELECT column_name, data_type, is_nullable,
                           (SELECT COUNT(*) FROM information_schema.table_constraints tc
                            JOIN information_schema.key_column_usage kcu
                              ON tc.constraint_name = kcu.constraint_name
                            WHERE tc.constraint_type = 'PRIMARY KEY'
                              AND kcu.table_name = c.table_name
                              AND kcu.column_name = c.column_name) as is_pk
                    FROM information_schema.columns c
                    WHERE table_name = $1 AND table_schema = 'public'
                    ORDER BY ordinal_position
                    """,
                    table,
                )
                count = await conn.fetchval(f'SELECT COUNT(*) FROM "{table}"')
                fields = [
                    FieldInfo(
                        name=c["column_name"],
                        data_type=self._pg_type_to_generic(c["data_type"]),
                        nullable=c["is_nullable"] == "YES",
                        primary_key=bool(c["is_pk"]),
                    )
                    for c in cols
                ]
                entities.append(EntityInfo(name=table, fields=fields, record_count=count))
            return SchemaInfo(entities=entities, connector_type="postgresql")
        finally:
            await conn.close()

    async def extract(
        self,
        entity: str,
        batch_size: int = 500,
        filters: dict | None = None,
    ) -> AsyncIterator[list[dict]]:
        conn = await self._connect()
        try:
            where = ""
            if filters:
                clauses = [f'"{k}" = ${i+1}' for i, k in enumerate(filters)]
                where = "WHERE " + " AND ".join(clauses)
            values = list(filters.values()) if filters else []
            offset = 0
            while True:
                rows = await conn.fetch(
                    f'SELECT * FROM "{entity}" {where} LIMIT {batch_size} OFFSET {offset}',
                    *values,
                )
                if not rows:
                    break
                yield [dict(r) for r in rows]
                offset += batch_size
        finally:
            await conn.close()

    async def load(self, entity: str, rows: list[dict], mode: str = "upsert") -> LoadResult:
        if not rows:
            return LoadResult()
        conn = await self._connect()
        result = LoadResult()
        try:
            cols = list(rows[0].keys())
            col_list = ", ".join(f'"{c}"' for c in cols)
            placeholders = ", ".join(f"${i+1}" for i in range(len(cols)))
            if mode == "insert":
                sql = f'INSERT INTO "{entity}" ({col_list}) VALUES ({placeholders})'
            else:
                # upsert — requires primary key; simplified version
                sql = (
                    f'INSERT INTO "{entity}" ({col_list}) VALUES ({placeholders}) '
                    f'ON CONFLICT DO NOTHING'
                )
            for row in rows:
                try:
                    vals = [row[c] for c in cols]
                    await conn.execute(sql, *vals)
                    result.inserted += 1
                except Exception as e:
                    result.failed += 1
                    result.errors.append({"row": row, "error": str(e)})
        finally:
            await conn.close()
        return result

    @staticmethod
    def _pg_type_to_generic(pg_type: str) -> str:
        mapping = {
            "integer": "number", "bigint": "number", "numeric": "number",
            "real": "number", "double precision": "number",
            "character varying": "string", "text": "string", "character": "string",
            "boolean": "boolean",
            "date": "date", "timestamp without time zone": "date",
            "timestamp with time zone": "date",
            "json": "object", "jsonb": "object",
            "ARRAY": "array",
        }
        return mapping.get(pg_type, "string")
