"""CSV connector — great for testing and one-off migrations."""
import pandas as pd
import os
from typing import AsyncIterator
from .base import BaseConnector, Schema, Entity, Field, LoadResult


class CSVConnector(BaseConnector):
    """
    Config: { "folder": "/path/to/csv/folder" }
    Each .csv file = one entity.
    """

    def _folder(self):
        path = self.config.get("folder_path") or self.config.get("folder", "~/Desktop")
        return os.path.expanduser(path)

    async def test(self):
        folder = self._folder()
        if not os.path.isdir(folder):
            return False, f"Folder not found: {folder}"
        files = [f for f in os.listdir(folder) if f.endswith(".csv")]
        return True, f"Found {len(files)} CSV files in {folder}"

    async def get_schema(self) -> Schema:
        folder = self._folder()
        entities = []
        for fname in os.listdir(folder):
            if not fname.endswith(".csv"):
                continue
            path = os.path.join(folder, fname)
            try:
                df = pd.read_csv(path, nrows=5)
                fields = []
                for col in df.columns:
                    dtype = df[col].dtype
                    t = "number" if pd.api.types.is_numeric_dtype(dtype) else \
                        "boolean" if pd.api.types.is_bool_dtype(dtype) else "string"
                    sample = [str(v) for v in df[col].dropna().tolist()[:3]]
                    fields.append(Field(name=col, data_type=t, sample=sample))
                full = pd.read_csv(path)
                entities.append(Entity(name=fname[:-4], fields=fields,
                                       row_count=len(full)))
            except Exception as e:
                entities.append(Entity(name=fname[:-4], fields=[
                    Field(name="error", data_type="string")
                ]))
        return Schema(connector_type="csv", entities=entities)

    async def extract(self, entity, batch=500, filters=None):
        path = os.path.join(self._folder(), f"{entity}.csv")
        df = pd.read_csv(path)
        if filters:
            for k, v in filters.items():
                if k in df.columns:
                    df = df[df[k] == v]
        df = df.where(pd.notnull(df), None)
        for i in range(0, len(df), batch):
            yield df.iloc[i:i+batch].to_dict("records")

    async def load(self, entity, rows, mode="upsert"):
        path = os.path.join(self._folder(), f"{entity}_migrated.csv")
        df = pd.DataFrame(rows)
        write_header = not os.path.exists(path) or mode == "replace"
        df.to_csv(path, mode="a" if mode == "upsert" else "w",
                  header=write_header, index=False)
        return LoadResult(inserted=len(rows))
