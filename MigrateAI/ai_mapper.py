"""
AI-powered field mapper using Claude.

Given source and target schemas, Claude:
1. Maps each target field to the best matching source field
2. Assigns a confidence score (0-1)
3. Suggests a transformation expression if types differ
4. Explains why it made each mapping choice
"""
import json
import anthropic
import os

client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY", ""))


def _schema_summary(schema_dict: dict, entity_name: str) -> str:
    entity = next((e for e in schema_dict.get("entities", [])
                   if e["name"] == entity_name), None)
    if not entity:
        return "Entity not found"
    lines = [f"Entity: {entity_name} ({entity.get('row_count',0)} rows)"]
    for f in entity["fields"]:
        sample = ", ".join(f.get("sample", [])[:2])
        pk = " [PK]" if f.get("primary_key") else ""
        lines.append(f"  - {f['name']} ({f['data_type']}){pk}  e.g. {sample}")
    return "\n".join(lines)


async def map_fields(
    source_schema: dict,
    target_schema: dict,
    source_entity: str,
    target_entity: str,
) -> list[dict]:
    """
    Returns list of:
    {
      source_field: str | null,
      target_field: str,
      confidence: float,       # 0.0 – 1.0
      transform: str | null,   # Python lambda e.g. "lambda x: str(x).upper()"
      reason: str
    }
    """
    src_summary = _schema_summary(source_schema, source_entity)
    tgt_summary = _schema_summary(target_schema, target_entity)

    prompt = f"""You are a data migration expert.

SOURCE system ({source_schema.get('connector_type','unknown')}):
{src_summary}

TARGET system ({target_schema.get('connector_type','unknown')}):
{tgt_summary}

Task: Map every TARGET field to the best SOURCE field.

Return a JSON array. Each element:
{{
  "source_field": "<source field name, or null if no match>",
  "target_field": "<target field name>",
  "confidence": <0.0 to 1.0>,
  "transform": "<python lambda like 'lambda x: str(x).upper()' or null>",
  "reason": "<one sentence explanation>"
}}

Rules:
- Cover ALL target fields
- Use semantic matching (e.g. "cust_name" → "customer_name", "amt" → "amount")
- Suggest transforms when types differ or values need conversion
- Confidence 1.0 = exact match, 0.5 = semantic match, 0.0 = no match found
- Return ONLY the JSON array, no markdown fences"""

    message = client.messages.create(
        model="claude-opus-4-6",
        max_tokens=4096,
        messages=[{"role": "user", "content": prompt}],
    )
    raw = message.content[0].text.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:].strip()

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        # Fallback: identity mapping
        tgt_entity = next(
            (e for e in target_schema.get("entities", [])
             if e["name"] == target_entity), None
        )
        if not tgt_entity:
            return []
        return [
            {"source_field": f["name"], "target_field": f["name"],
             "confidence": 0.5, "transform": None,
             "reason": "Fallback: name match only"}
            for f in tgt_entity["fields"]
        ]


def apply_mapping(row: dict, mapping: list[dict]) -> dict:
    """Transform a single source row into a target row using the mapping."""
    result = {}
    for m in mapping:
        src = m.get("source_field")
        tgt = m.get("target_field")
        if not tgt:
            continue
        value = row.get(src) if src else None
        transform = m.get("transform")
        if transform and value is not None:
            try:
                fn = eval(transform)  # noqa: S307
                value = fn(value)
            except Exception:
                pass  # keep original value on transform error
        result[tgt] = value
    return result
