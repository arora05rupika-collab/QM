"""PostgreSQL connector."""
import asyncio
from typing import AsyncIterator
from .base import BaseConnector, Schema, Entity, Field, LoadResult


class PostgreSQLConnector(BaseConnector):
    """Config: {host, port, database, user, password}"""

    async def _connect(self):
        import psycopg2
        return psycopg2.connect(
            host=self.config["host"],
            port=self.config.get("port", 5432),
            dbname=self.config["database"],
            user=self.config["user"],
            password=self.config["password"],
        )

    async def test(self):
        try:
            conn = await self._connect()
            cur = conn.cursor()
            cur.execute("SELECT 1")
            conn.close()
            return True, "Connected successfully"
        except Exception as e:
            return False, str(e)

    async def get_schema(self) -> Schema:
        conn = await self._connect()
        cur = conn.cursor()
        cur.execute("""
            SELECT table_name FROM information_schema.tables
            WHERE table_schema='public' AND table_type='BASE TABLE'
        """)
        tables = [r[0] for r in cur.fetchall()]
        entities = []
        for table in tables:
            cur.execute("""
                SELECT column_name, data_type, is_nullable,
                    (SELECT COUNT(*) FROM information_schema.key_column_usage k
                     JOIN information_schema.table_constraints tc
                       ON k.constraint_name=tc.constraint_name
                     WHERE tc.constraint_type='PRIMARY KEY'
                       AND k.table_name=c.table_name
                       AND k.column_name=c.column_name) as is_pk
                FROM information_schema.columns c
                WHERE table_name=%s AND table_schema='public'
                ORDER BY ordinal_position
            """, (table,))
            cols = cur.fetchall()
            cur.execute(f'SELECT COUNT(*) FROM "{table}"')
            count = cur.fetchone()[0]
            # Sample values
            cur.execute(f'SELECT * FROM "{table}" LIMIT 3')
            sample_rows = cur.fetchall()
            col_names = [d[0] for d in cur.description]
            fields = []
            for i, col in enumerate(cols):
                samples = [str(r[i]) for r in sample_rows if i < len(r)]
                fields.append(Field(
                    name=col[0],
                    data_type=self._map_type(col[1]),
                    nullable=col[2] == "YES",
                    primary_key=bool(col[3]),
                    sample=samples,
                ))
            entities.append(Entity(name=table, fields=fields, row_count=count))
        conn.close()
        return Schema(connector_type="postgresql", entities=entities)

    async def extract(self, entity, batch=500, filters=None):
        conn = await self._connect()
        cur = conn.cursor()
        where = ""
        vals = []
        if filters:
            clauses = [f'"{k}"=%s' for k in filters]
            where = "WHERE " + " AND ".join(clauses)
            vals = list(filters.values())
        offset = 0
        while True:
            cur.execute(f'SELECT * FROM "{entity}" {where} LIMIT %s OFFSET %s',
                        vals + [batch, offset])
            rows = cur.fetchall()
            if not rows:
                break
            cols = [d[0] for d in cur.description]
            yield [dict(zip(cols, r)) for r in rows]
            offset += batch
        conn.close()

    async def load(self, entity, rows, mode="upsert"):
        if not rows:
            return LoadResult()
        conn = await self._connect()
        cur = conn.cursor()
        result = LoadResult()
        cols = list(rows[0].keys())
        col_sql = ", ".join(f'"{c}"' for c in cols)
        placeholders = ", ".join(["%s"] * len(cols))
        sql = f'INSERT INTO "{entity}" ({col_sql}) VALUES ({placeholders})'
        if mode == "upsert":
            sql += " ON CONFLICT DO NOTHING"
        for row in rows:
            try:
                cur.execute(sql, [row.get(c) for c in cols])
                result.inserted += 1
            except Exception as e:
                result.failed += 1
                result.errors.append(str(e))
        conn.commit()
        conn.close()
        return result

    @staticmethod
    def _map_type(pg: str) -> str:
        if any(x in pg for x in ["int", "numeric", "float", "double", "decimal"]):
            return "number"
        if "bool" in pg:
            return "boolean"
        if any(x in pg for x in ["date", "time"]):
            return "date"
        if any(x in pg for x in ["json"]):
            return "object"
        return "string"
