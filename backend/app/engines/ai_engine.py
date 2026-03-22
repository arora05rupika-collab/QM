"""
AI Engine — powered by Claude.

Responsibilities:
  1. Schema mapping: auto-map fields between source and target schemas
  2. Data validation: detect anomalies and quality issues
  3. Transformation generation: produce transformation functions
  4. Automation agent: execute multi-step ERP workflows using tool use
"""
import json
import asyncio
from typing import Any
import anthropic
from ..core.config import settings
from ..connectors.base import SchemaInfo, FieldInfo


_client = None


def get_client() -> anthropic.AsyncAnthropic:
    global _client
    if _client is None:
        _client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    return _client


# ─── Schema Mapping ──────────────────────────────────────────────────────────

async def generate_field_mapping(
    source_schema: SchemaInfo,
    target_schema: SchemaInfo,
    source_entity: str,
    target_entity: str,
) -> list[dict]:
    """
    Use Claude to auto-map fields from source entity to target entity.
    Returns a list of mapping objects:
      {source_field, target_field, transform, confidence, notes}
    """
    source_ent = next((e for e in source_schema.entities if e.name == source_entity), None)
    target_ent = next((e for e in target_schema.entities if e.name == target_entity), None)

    if not source_ent or not target_ent:
        return []

    prompt = f"""You are an expert data migration engineer.

Source ERP: {source_schema.connector_type}
Target ERP: {target_schema.connector_type}

Source entity "{source_entity}" has these fields:
{_fields_to_text(source_ent.fields)}

Target entity "{target_entity}" has these fields:
{_fields_to_text(target_ent.fields)}

Produce a JSON array where each element is:
{{
  "source_field": "<field name or null if no match>",
  "target_field": "<target field name>",
  "transform": "<python lambda expression to transform the value, e.g. 'lambda x: str(x).upper()' or null if no transform needed>",
  "confidence": <0.0-1.0>,
  "notes": "<brief explanation>"
}}

Rules:
- Cover ALL target fields
- Set source_field=null and confidence=0 for fields with no match
- For type mismatches provide a transform lambda
- Consider semantic similarity (e.g. "cust_name" → "customer_name")
- Return ONLY the JSON array, no markdown.
"""

    client = get_client()
    message = await client.messages.create(
        model="claude-opus-4-6",
        max_tokens=4096,
        messages=[{"role": "user", "content": prompt}],
    )
    raw = message.content[0].text.strip()
    # Strip markdown fences if present
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    return json.loads(raw)


def _fields_to_text(fields: list[FieldInfo]) -> str:
    return "\n".join(
        f"  - {f.name} ({f.data_type}{'  PK' if f.primary_key else ''}{'  nullable' if f.nullable else ''})"
        for f in fields
    )


# ─── Data Validation ─────────────────────────────────────────────────────────

async def validate_data_batch(
    entity: str,
    rows: list[dict],
    schema_fields: list[FieldInfo],
) -> dict:
    """
    Ask Claude to analyse a sample batch for quality issues.
    Returns: {issues: [...], quality_score: float, recommendations: [...]}
    """
    sample = rows[:20]  # keep prompt small
    field_desc = _fields_to_text(schema_fields)

    prompt = f"""You are a data quality analyst.

Entity: {entity}
Schema:
{field_desc}

Sample records (up to 20):
{json.dumps(sample, indent=2, default=str)}

Analyse the data and respond with JSON:
{{
  "quality_score": <0-100>,
  "issues": [
    {{"field": "...", "type": "null|type_mismatch|outlier|format", "description": "...", "affected_rows": <count>}}
  ],
  "recommendations": ["..."]
}}

Return ONLY the JSON.
"""
    client = get_client()
    message = await client.messages.create(
        model="claude-opus-4-6",
        max_tokens=2048,
        messages=[{"role": "user", "content": prompt}],
    )
    raw = message.content[0].text.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    return json.loads(raw)


# ─── Automation Agent ─────────────────────────────────────────────────────────

AUTOMATION_TOOLS = [
    {
        "name": "execute_erp_action",
        "description": "Execute an action on the connected ERP system (create, update, approve, query records).",
        "input_schema": {
            "type": "object",
            "properties": {
                "action": {"type": "string", "description": "Action name, e.g. create_invoice, approve_po, query_inventory"},
                "model": {"type": "string", "description": "ERP model/entity, e.g. account.move"},
                "params": {"type": "object", "description": "Action parameters"},
            },
            "required": ["action", "model"],
        },
    },
    {
        "name": "send_notification",
        "description": "Send an email or webhook notification.",
        "input_schema": {
            "type": "object",
            "properties": {
                "channel": {"type": "string", "enum": ["email", "webhook", "slack"]},
                "recipient": {"type": "string"},
                "subject": {"type": "string"},
                "body": {"type": "string"},
            },
            "required": ["channel", "recipient", "body"],
        },
    },
    {
        "name": "query_erp",
        "description": "Read/query data from the ERP system.",
        "input_schema": {
            "type": "object",
            "properties": {
                "model": {"type": "string"},
                "filters": {"type": "object"},
                "fields": {"type": "array", "items": {"type": "string"}},
                "limit": {"type": "integer", "default": 100},
            },
            "required": ["model"],
        },
    },
]


async def run_automation_agent(
    workflow_description: str,
    trigger_data: dict,
    connector,  # ERPConnector instance
    notification_handler=None,
) -> dict:
    """
    Run an agentic loop: Claude plans and executes ERP automation steps.
    Returns the final result and step log.
    """
    client = get_client()
    steps_log = []
    messages = [
        {
            "role": "user",
            "content": f"""You are an ERP automation agent. Execute this workflow:

{workflow_description}

Trigger data:
{json.dumps(trigger_data, indent=2, default=str)}

Use the provided tools to interact with the ERP and complete the workflow.
When done, summarize what was accomplished.
""",
        }
    ]

    max_iterations = 10
    for _ in range(max_iterations):
        response = await client.messages.create(
            model="claude-opus-4-6",
            max_tokens=4096,
            tools=AUTOMATION_TOOLS,
            messages=messages,
        )

        # Collect text output
        for block in response.content:
            if hasattr(block, "text"):
                steps_log.append({"type": "thought", "content": block.text})

        if response.stop_reason == "end_turn":
            final_text = next(
                (b.text for b in response.content if hasattr(b, "text")), ""
            )
            return {"status": "success", "summary": final_text, "steps": steps_log}

        if response.stop_reason != "tool_use":
            break

        # Process tool calls
        tool_results = []
        for block in response.content:
            if block.type != "tool_use":
                continue
            tool_name = block.name
            tool_input = block.input
            steps_log.append({"type": "tool_call", "tool": tool_name, "input": tool_input})

            try:
                result = await _dispatch_tool(
                    tool_name, tool_input, connector, notification_handler
                )
            except Exception as e:
                result = {"error": str(e)}

            steps_log.append({"type": "tool_result", "tool": tool_name, "output": result})
            tool_results.append({
                "type": "tool_result",
                "tool_use_id": block.id,
                "content": json.dumps(result, default=str),
            })

        messages.append({"role": "assistant", "content": response.content})
        messages.append({"role": "user", "content": tool_results})

    return {"status": "max_iterations_reached", "steps": steps_log}


async def _dispatch_tool(name: str, inputs: dict, connector, notification_handler) -> dict:
    if name == "execute_erp_action":
        return await connector.execute_action(inputs["action"], inputs)

    if name == "query_erp":
        results = []
        async for batch in connector.extract(
            inputs["model"],
            batch_size=inputs.get("limit", 100),
            filters=inputs.get("filters"),
        ):
            results.extend(batch)
            if len(results) >= inputs.get("limit", 100):
                break
        return {"records": results[: inputs.get("limit", 100)]}

    if name == "send_notification":
        if notification_handler:
            await notification_handler(inputs)
        return {"sent": True, "channel": inputs["channel"]}

    raise ValueError(f"Unknown tool: {name}")
