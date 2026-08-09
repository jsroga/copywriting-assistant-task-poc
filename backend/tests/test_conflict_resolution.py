from app.domain.models import (
    ExtractionResult,
    FieldStatus,
    FieldUpdate,
    FieldValue,
    Intent,
    ProductBrief,
)
from app.domain.reducer import reduce_brief


def test_conflict_resolution_via_correction():
    brief = ProductBrief(
        category=FieldValue(value="750 ml", status=FieldStatus.CONFIRMED),
        version=1,
    )
    conflicted = reduce_brief(
        brief,
        ExtractionResult(
            intent=Intent.PROVIDE_INFO,
            updates=[
                FieldUpdate(field="category", value="1 litre", status="confirmed"),
            ],
        ),
        turn_number=2,
    )
    assert conflicted.category.status == FieldStatus.CONFLICTED

    resolved = reduce_brief(
        conflicted,
        ExtractionResult(
            intent=Intent.CORRECT_INFO,
            updates=[
                FieldUpdate(field="category", value="750 ml", status="confirmed"),
            ],
        ),
        turn_number=3,
    )
    assert resolved.category.status == FieldStatus.CONFIRMED
    assert resolved.category.value == "750 ml"
    assert all(c.resolved for c in resolved.conflicts)
