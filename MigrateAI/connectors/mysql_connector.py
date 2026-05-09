"""MySQL / MariaDB connector."""
from typing import AsyncIterator
from .base import BaseConnector, Schema, Entity, Field, LoadResult


class MySQLConnector(BaseConnector):
    """Config: {host, port, database, user, password}"""

    def _connect(self):
        import pymysql
        return pymysql.connect(
            host=self.config["host"],
            port=int(self.config.get("port", 3306)),
            db=self.config["database"],
            user=self.config["user"],
            password=self.config["password"],
            cursorclass=pymysql.cursors.DictCursor,
            autocommit=True,
        )

    async def test(self):
        try:
            conn = self._connect()
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
            conn.close()
            return True, "Connected successfully"
        except Exception as e:
            return False, str(e)

    async def get_schema(self) -> Schema:
        conn = self._connect()
        entities = []
        with conn.cursor() as cur:
            cur.execute("SHOW TABLES")
            tables = [list(r.values())[0] for r in cur.fetchall()]
            for table in tables:
                cur.execute(f"DESCRIBE `{table}`")
                cols = cur.fetchall()
                cur.execute(f"SELECT COUNT(*) as c FROM `{table}`")
                count = cur.fetchone()["c"]
                cur.execute(f"SELECT * FROM `{table}` LIMIT 3")
                samples = cur.fetchall()
                fields = []
                for col in cols:
                    col_samples = [str(r.get(col["Field"], "")) for r in samples]
                    fields.append(Field(
                        name=col["Field"],
                        data_type=self._map_type(col["Type"]),
                        nullable=col["Null"] == "YES",
                        primary_key=col["Key"] == "PRI",
                        sample=col_samples,
                    ))
                entities.append(Entity(name=table, fields=fields, row_count=count))
        conn.close()
        return Schema(connector_type="mysql", entities=entities)

    async def extract(self, entity, batch=500, filters=None):
        conn = self._connect()
        with conn.cursor() as cur:
            where = ""
            vals = []
            if filters:
                clauses = [f"`{k}`=%s" for k in filters]
                where = "WHERE " + " AND ".join(clauses)
                vals = list(filters.values())
            offset = 0
            while True:
                cur.execute(f"SELECT * FROM `{entity}` {where} LIMIT %s OFFSET %s",
                            vals + [batch, offset])
                rows = cur.fetchall()
                if not rows:
                    break
                yield list(rows)
                offset += batch
        conn.close()

    async def load(self, entity, rows, mode="upsert"):
        if not rows:
            return LoadResult()
        conn = self._connect()
        result = LoadResult()
        cols = list(rows[0].keys())
        col_sql = ", ".join(f"`{c}`" for c in cols)
        placeholders = ", ".join(["%s"] * len(cols))
        kw = "IGNORE" if mode == "upsert" else ""
        sql = f"INSERT {kw} INTO `{entity}` ({col_sql}) VALUES ({placeholders})"
        with conn.cursor() as cur:
            for row in rows:
                try:
                    cur.execute(sql, [row.get(c) for c in cols])
                    result.inserted += 1
                except Exception as e:
                    result.failed += 1
                    result.errors.append(str(e))
        conn.close()
        return result

    @staticmethod
    def _map_type(t: str) -> str:
        t = t.lower()
        if any(x in t for x in ["int", "decimal", "float", "double"]):
            return "number"
        if "bool" in t or "tinyint(1)" in t:
            return "boolean"
        if any(x in t for x in ["date", "time", "year"]):
            return "date"
        return "string"
