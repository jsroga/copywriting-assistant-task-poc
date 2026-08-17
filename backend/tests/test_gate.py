from app.domain.gate import evaluate_readiness
from app.domain.models import (
    ConflictRecord,
    FieldStatus,
    FieldValue,
    GateStatus,
    ProductBrief,
)
from app.llm.fake_client import make_complete_brief


def test_missing_required_returns_needs_info():
    brief = ProductBrief(
        product_name=FieldValue(value="Bottle", status=FieldStatus.CONFIRMED),
    )
    decision = evaluate_readiness(brief)
    assert decision.status == GateStatus.NEEDS_INFO
    assert decision.next_field == "key_features"
    assert "key_features" in decision.fields


def test_vague_required_not_usable():
    brief = make_complete_brief()
    brief.target_audience = FieldValue(raw_text="people", status=FieldStatus.VAGUE)
    decision = evaluate_readiness(brief)
    assert decision.status == GateStatus.NEEDS_INFO
    assert decision.next_field == "target_audience"


def test_vague_price_does_not_satisfy_readiness():
    """Qualitative price is not ready: gate reads FieldStatus, not raw_text wording."""
    brief = make_complete_brief(price=None)
    brief.price = FieldValue(value=None, raw_text="cheap", status=FieldStatus.VAGUE)
    decision = evaluate_readiness(
        brief, optional_fields_prompted={"category", "brand_name"}
    )
    assert decision.status == GateStatus.NEEDS_INFO
    assert decision.next_field == "price"
    assert brief.price.value is None



def test_single_key_feature_is_enough_to_be_ready():
    brief = make_complete_brief(key_features=["only one"])
    decision = evaluate_readiness(brief)
    assert decision.status == GateStatus.READY


def test_no_meaningful_key_features_not_ready():
    brief = make_complete_brief()
    brief.key_features = FieldValue(value=[], status=FieldStatus.CONFIRMED)
    decision = evaluate_readiness(brief)
    assert decision.status == GateStatus.NEEDS_INFO
    assert decision.next_field == "key_features"

    # Short / filler noise is not a meaningful feature (see gate.meaningful_features).
    for noise in (["x"], ["ok"], ["!!"]):
        brief = make_complete_brief(key_features=noise)
        decision = evaluate_readiness(brief)
        assert decision.status == GateStatus.NEEDS_INFO
        assert decision.next_field == "key_features"


def test_unresolved_conflict_needs_clarification():
    brief = make_complete_brief()
    brief.category = FieldValue(value="750 ml", status=FieldStatus.CONFLICTED)
    brief.conflicts.append(
        ConflictRecord(
            field="category",
            old_value="750 ml",
            new_value="1 litre",
            turn=2,
            resolved=False,
        )
    )
    decision = evaluate_readiness(brief)
    assert decision.status == GateStatus.NEEDS_CLARIFICATION
    assert decision.next_field == "category"


def test_complete_brief_ready():
    brief = make_complete_brief()
    decision = evaluate_readiness(brief)
    assert decision.status == GateStatus.READY
    assert decision.fields == []
    assert decision.next_field is None


def test_missing_price_blocks_ready_even_if_marked_prompted():
    brief = make_complete_brief(price=None, category=None, brand_name=None)
    decision = evaluate_readiness(brief)
    assert decision.status == GateStatus.NEEDS_INFO
    assert decision.next_field == "price"

    # Price is required — prompting flags must not unlock READY.
    decision = evaluate_readiness(
        brief, optional_fields_prompted={"price", "category", "brand_name"}
    )
    assert decision.status == GateStatus.NEEDS_INFO
    assert decision.next_field == "price"


def test_optional_category_brand_can_be_skipped_after_prompted():
    brief = make_complete_brief(category=None, brand_name=None)
    decision = evaluate_readiness(brief)
    assert decision.next_field == "category"

    decision = evaluate_readiness(
        brief, optional_fields_prompted={"category", "brand_name"}
    )
    assert decision.status == GateStatus.READY


def test_field_priority_is_deterministic():
    brief = ProductBrief()
    decision = evaluate_readiness(brief)
    assert decision.next_field == "product_name"

    brief.product_name = FieldValue(value="X", status=FieldStatus.CONFIRMED)
    decision = evaluate_readiness(brief)
    assert decision.next_field == "key_features"
