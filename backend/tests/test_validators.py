from app.domain.models import (
    GeneratedCopy,
    MarketingEmail,
    Violation,
    ViolationCode,
)
from app.llm.fake_client import make_complete_brief, make_valid_copy
from app.domain.validation import validate
from app.domain.validation.text import word_count


def _pad(text: str, min_words: int) -> str:
    count = word_count(text)
    if count >= min_words:
        return text
    return text + " " + " ".join(f"pad{i}" for i in range(min_words - count))


def test_price_presence_pass_and_fail():
    brief = make_complete_brief(price="$299")
    good = make_valid_copy(brief)
    assert not any(v.code == ViolationCode.MISSING_PRICE for v in validate(good, brief))

    bad = make_valid_copy(brief)
    bad.product_description = bad.product_description.replace("$299", "affordable")
    bad.marketing_email.body = bad.marketing_email.body.replace("$299", "affordable")
    codes = {v.code for v in validate(bad, brief)}
    assert ViolationCode.MISSING_PRICE in codes


def test_price_presence_rejects_substring_of_longer_price():
    """Regression: confirmed $49 must not pass against copy that only has $499."""
    brief = make_complete_brief(price="$49")
    copy = make_valid_copy(brief)
    copy.product_description = copy.product_description.replace("$49", "$499")
    copy.marketing_email.body = copy.marketing_email.body.replace("$49", "$499")
    codes = {v.code for v in validate(copy, brief)}
    assert ViolationCode.MISSING_PRICE in codes

    # Exact token still passes.
    exact = make_valid_copy(brief)
    assert not any(v.code == ViolationCode.MISSING_PRICE for v in validate(exact, brief))


def test_description_and_email_length():
    brief = make_complete_brief(price=None)
    short = GeneratedCopy(
        product_description="Too short",
        marketing_email=MarketingEmail(subject="Hi", body="Short", cta="Buy"),
    )
    codes = {v.code for v in validate(short, brief)}
    assert ViolationCode.DESCRIPTION_LENGTH in codes
    assert ViolationCode.EMAIL_LENGTH in codes

    good = make_valid_copy(brief)
    assert ViolationCode.DESCRIPTION_LENGTH not in {
        v.code for v in validate(good, brief)
    }
    assert ViolationCode.EMAIL_LENGTH not in {v.code for v in validate(good, brief)}


def test_cta_and_subject():
    brief = make_complete_brief(price=None)
    copy = make_valid_copy(brief)
    copy.marketing_email.cta = ""
    copy.marketing_email.subject = ""
    codes = {v.code for v in validate(copy, brief)}
    assert ViolationCode.MISSING_CTA in codes
    assert ViolationCode.SUBJECT_TOO_LONG in codes

    copy = make_valid_copy(brief)
    copy.marketing_email.subject = "x" * 61
    assert any(v.code == ViolationCode.SUBJECT_TOO_LONG for v in validate(copy, brief))


def test_placeholder_detection():
    brief = make_complete_brief(price=None)
    copy = make_valid_copy(brief)
    copy.product_description = _pad("Intro [TODO] " + copy.product_description, 60)
    assert any(v.code == ViolationCode.PLACEHOLDER_TEXT for v in validate(copy, brief))


def test_validate_uses_injected_chain_in_order():
    brief = make_complete_brief(price=None)
    copy = GeneratedCopy(
        product_description="Too short",
        marketing_email=MarketingEmail(subject="Hi", body="Short", cta="Buy"),
    )

    def first(_output: GeneratedCopy, _brief) -> list[Violation]:
        return [
            Violation(
                code=ViolationCode.MISSING_CTA,
                message="first",
                artifact="email",
            )
        ]

    def second(_output: GeneratedCopy, _brief) -> list[Violation]:
        return [
            Violation(
                code=ViolationCode.MISSING_PRICE,
                message="second",
                artifact="description",
            )
        ]

    violations = validate(copy, brief, validators=[first, second])
    assert [v.message for v in violations] == ["first", "second"]
    assert [v.code for v in violations] == [
        ViolationCode.MISSING_CTA,
        ViolationCode.MISSING_PRICE,
    ]
    assert ViolationCode.DESCRIPTION_LENGTH not in {v.code for v in violations}
    assert ViolationCode.EMAIL_LENGTH not in {v.code for v in violations}
