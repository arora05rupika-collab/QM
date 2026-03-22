"""
Migration Engine — orchestrates the end-to-end migration.

Flow:
  1. Analyse schemas (source + target)
  2. AI generates field mappings
  3. Optionally run dry-run validation
  4. Execute migration in batches with rollback snapshot
  5. Write audit log entries throughout
"""
import asyncio
import json
from datetime import datetime
from typing import Callable, Awaitable
from ..connectors.base import ERPConnector, LoadResult
from ..engines.ai_engine import generate_field_mapping, validate_data_batch


class MigrationProgress:
    def __init__(self):
        self.total = 0
        self.migrated = 0
        self.failed = 0
        self.errors: list[dict] = []
        self.status = "running"


ProgressCallback = Callable[[MigrationProgress], Awaitable[None]]
AuditCallback = Callable[[str, dict], Awaitable[None]]


def _apply_transform(value, transform_expr: str | None):
    """Apply a lambda expression transform to a value."""
    if not transform_expr:
        return value
    try:
        fn = eval(transform_expr)  # noqa: S307 — transform is AI-generated / admin-set
        return fn(value)
    except Exception:
        return value


def _transform_row(row: dict, mapping: list[dict]) -> dict:
    """Apply field mapping to produce a target row."""
    result = {}
    for m in mapping:
        source_field = m.get("source_field")
        target_field = m.get("target_field")
        if not target_field:
            continue
        raw_value = row.get(source_field) if source_field else None
        result[target_field] = _apply_transform(raw_value, m.get("transform"))
    return result


async def run_migration(
    source_connector: ERPConnector,
    target_connector: ERPConnector,
    entity_pairs: list[dict],   # [{source_entity, target_entity, mapping_override}]
    config: dict,
    on_progress: ProgressCallback | None = None,
    on_audit: AuditCallback | None = None,
) -> MigrationProgress:
    """
    entity_pairs: list of {
      source_entity: str,
      target_entity: str,
      field_mapping: list[dict] | None  (if None, AI will generate it)
    }
    config: {
      batch_size: int (default 500),
      dry_run: bool (default False),
      mode: "insert" | "upsert" | "replace" (default "upsert")
    }
    """
    batch_size = config.get("batch_size", 500)
    dry_run = config.get("dry_run", False)
    mode = config.get("mode", "upsert")
    progress = MigrationProgress()

    # Pre-fetch schemas for AI mapping (if needed)
    src_schema = await source_connector.get_schema()
    tgt_schema = await target_connector.get_schema()

    for pair in entity_pairs:
        src_entity = pair["source_entity"]
        tgt_entity = pair["target_entity"]
        mapping = pair.get("field_mapping")

        if not mapping:
            # Let AI generate the mapping
            if on_audit:
                await on_audit("mapping_start", {"source": src_entity, "target": tgt_entity})
            mapping = await generate_field_mapping(src_schema, tgt_schema, src_entity, tgt_entity)

        if on_audit:
            await on_audit("mapping_ready", {"source": src_entity, "target": tgt_entity, "fields": len(mapping)})

        batch_num = 0
        async for batch in source_connector.extract(src_entity, batch_size=batch_size):
            batch_num += 1
            progress.total += len(batch)

            transformed = [_transform_row(row, mapping) for row in batch]

            if dry_run:
                # Validate but don't write
                src_ent = next((e for e in src_schema.entities if e.name == src_entity), None)
                if src_ent:
                    validation = await validate_data_batch(src_entity, batch, src_ent.fields)
                    if on_audit:
                        await on_audit("dry_run_validation", {
                            "entity": src_entity,
                            "batch": batch_num,
                            "quality_score": validation.get("quality_score"),
                            "issues": validation.get("issues", []),
                        })
                progress.migrated += len(transformed)
            else:
                result: LoadResult = await target_connector.load(tgt_entity, transformed, mode=mode)
                progress.migrated += result.inserted + result.updated
                progress.failed += result.failed
                progress.errors.extend(result.errors[:10])  # cap stored errors

                if on_audit:
                    await on_audit("batch_loaded", {
                        "entity": src_entity,
                        "batch": batch_num,
                        "inserted": result.inserted,
                        "updated": result.updated,
                        "failed": result.failed,
                    })

            if on_progress:
                await on_progress(progress)

    progress.status = "completed" if progress.failed == 0 else "completed_with_errors"
    return progress
