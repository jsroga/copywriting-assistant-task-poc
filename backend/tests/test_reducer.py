from app.domain.models import (
    ExtractionResult,
    FieldStatus,
    FieldUpdate,
    FieldValue,
    Intent,
    ProductBrief,
)
from app.domain.reducer import reduce_brief


def test_new_value_populates_missing_field():
    brief = ProductBrief()
    extraction = ExtractionResult(
        intent=Intent.PROVIDE_INFO,
        updates=[
            FieldUpdate(
                field="product_name",
                value="AquaPure",
                status="confirmed",
            )
        ],
    )
    result = reduce_brief(brief, extraction, turn_number=1)
    assert result.product_name.value == "AquaPure"
    assert result.product_name.status == FieldStatus.CONFIRMED
    assert result.version == 1


def test_explicit_correction_overwrites_and_keeps_history():
    brief = ProductBrief(
        price=FieldValue(value="$299", status=FieldStatus.CONFIRMED),
        version=1,
    )
    extraction = ExtractionResult(
        intent=Intent.CORRECT_INFO,
        updates=[
            FieldUpdate(field="price", value="$199", status="confirmed"),
        ],
    )
    result = reduce_brief(brief, extraction, turn_number=2)
    assert result.price.value == "$199"
    assert result.price.status == FieldStatus.CONFIRMED
    assert result.price.history == ["$299"]
    assert result.version == 2
    assert all(c.resolved for c in result.conflicts) or not result.conflicts


def test_ambiguous_contradiction_becomes_conflicted():
    brief = ProductBrief(
        category=FieldValue(value="750 ml", status=FieldStatus.CONFIRMED),
        version=1,
    )
    extraction = ExtractionResult(
        intent=Intent.PROVIDE_INFO,
        updates=[
            FieldUpdate(field="category", value="1 litre", status="confirmed"),
        ],
    )
    result = reduce_brief(brief, extraction, turn_number=2)
    assert result.category.status == FieldStatus.CONFLICTED
    assert result.category.value == "750 ml"
    assert len(result.conflicts) == 1
    assert result.conflicts[0].old_value == "750 ml"
    assert result.conflicts[0].new_value == "1 litre"
    assert result.conflicts[0].resolved is False
    assert result.version == 2


def test_vague_value_remains_vague():
    brief = ProductBrief()
    extraction = ExtractionResult(
        intent=Intent.PROVIDE_INFO,
        updates=[
            FieldUpdate(
                field="price",
                value=None,
                raw_text="cheap",
                status="vague",
            )
        ],
    )
    result = reduce_brief(brief, extraction, turn_number=1)
    assert result.price.status == FieldStatus.VAGUE
    assert result.price.value is None
    assert result.price.raw_text == "cheap"
    assert result.version == 1


def test_version_unchanged_when_same_confirmed_value():
    brief = ProductBrief(
        product_name=FieldValue(value="AquaPure", status=FieldStatus.CONFIRMED),
        version=3,
    )
    extraction = ExtractionResult(
        intent=Intent.PROVIDE_INFO,
        updates=[
            FieldUpdate(field="product_name", value="AquaPure", status="confirmed"),
        ],
    )
    result = reduce_brief(brief, extraction, turn_number=4)
    assert result.product_name.value == "AquaPure"
    assert result.version == 3
