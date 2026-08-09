from app.domain.models import ExtractionResult, Intent
from app.llm.json_utils import parse_model_from_text, strip_json_fences


def test_strip_json_fences_removes_markdown_wrapper():
    raw = '```{\n "intent": "provide_info", "updates": [], "off_schema_requests": []\n}\n```'
    cleaned = strip_json_fences(raw)
    assert cleaned.startswith("{")
    parsed = parse_model_from_text(ExtractionResult, raw)
    assert parsed.intent == Intent.PROVIDE_INFO


def test_parse_model_from_json_fence_label():
    raw = (
        '```json\n{"intent":"provide_info","updates":[],'
        '"off_schema_requests":[]}\n```'
    )
    parsed = parse_model_from_text(ExtractionResult, raw)
    assert parsed.intent == Intent.PROVIDE_INFO
