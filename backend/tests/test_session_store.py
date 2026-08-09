from pathlib import Path

from app.domain.models import FieldStatus, FieldValue
from app.llm.fake_client import make_complete_brief
from app.store import FileSessionStore


def test_file_session_store_survives_new_instance(tmp_path: Path):
    store_a = FileSessionStore(tmp_path)
    session = store_a.get_or_create("persist-1")
    session.brief = make_complete_brief(price="40 zl")
    session.brief.version = 4
    session.awaiting_generation_confirmation = True
    session.optional_fields_prompted.add("price")
    store_a.save(session)

    store_b = FileSessionStore(tmp_path)
    restored = store_b.get("persist-1")
    assert restored is not None
    assert restored.brief.version == 4
    assert restored.brief.price.value == "40 zl"
    assert restored.brief.price.status == FieldStatus.CONFIRMED
    assert restored.awaiting_generation_confirmation is True
    assert "price" in restored.optional_fields_prompted
    assert isinstance(restored.brief.product_name, FieldValue)
