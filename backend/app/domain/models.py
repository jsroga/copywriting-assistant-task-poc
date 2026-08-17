from __future__ import annotations

from enum import Enum
from typing import Literal, get_args

from pydantic import BaseModel, Field


class FieldStatus(str, Enum):
    MISSING = "missing"
    VAGUE = "vague"
    CONFIRMED = "confirmed"
    CONFLICTED = "conflicted"


class Intent(str, Enum):
    PROVIDE_INFO = "provide_info"
    CORRECT_INFO = "correct_info"
    REQUEST_GENERATION = "request_generation"
    REFINE_OUTPUT = "refine_output"
    META_INSTRUCTION = "meta_instruction"
    OFF_TOPIC = "off_topic"


class GateStatus(str, Enum):
    NEEDS_INFO = "needs_info"
    NEEDS_CLARIFICATION = "needs_clarification"
    READY = "ready"


class ViolationCode(str, Enum):
    MISSING_PRICE = "missing_price"
    DESCRIPTION_LENGTH = "description_length"
    EMAIL_LENGTH = "email_length"
    MISSING_CTA = "missing_cta"
    SUBJECT_TOO_LONG = "subject_too_long"
    PLACEHOLDER_TEXT = "placeholder_text"


BriefFieldName = Literal[
    "product_name",
    "key_features",
    "target_audience",
    "tone",
    "category",
    "price",
    "brand_name",
]

BRIEF_FIELDS: tuple[BriefFieldName, ...] = get_args(BriefFieldName)

REQUIRED_FIELDS: tuple[BriefFieldName, ...] = (
    "product_name",
    "key_features",
    "target_audience",
    "tone",
    "price",
)

OPTIONAL_FIELDS: tuple[BriefFieldName, ...] = (
    "category",
    "brand_name",
)

QUESTION_PRIORITY: tuple[BriefFieldName, ...] = (
    "product_name",
    "key_features",
    "target_audience",
    "tone",
    "price",
    "category",
    "brand_name",
)


class FieldValue(BaseModel):
    value: str | list[str] | None = None
    raw_text: str | None = None
    status: FieldStatus = FieldStatus.MISSING
    updated_at_turn: int | None = None
    history: list[str | list[str]] = Field(default_factory=list)


class ConflictRecord(BaseModel):
    field: str
    old_value: str | list[str] | None
    new_value: str | list[str] | None
    turn: int
    resolved: bool = False


class ProductBrief(BaseModel):
    product_name: FieldValue = Field(default_factory=FieldValue)
    key_features: FieldValue = Field(default_factory=FieldValue)
    target_audience: FieldValue = Field(default_factory=FieldValue)
    tone: FieldValue = Field(default_factory=FieldValue)
    category: FieldValue = Field(default_factory=FieldValue)
    price: FieldValue = Field(default_factory=FieldValue)
    brand_name: FieldValue = Field(default_factory=FieldValue)
    assumptions: list[str] = Field(default_factory=list)
    conflicts: list[ConflictRecord] = Field(default_factory=list)
    version: int = 0


"""The only two statuses extraction may propose; the reducer decides the rest."""
IncomingStatus = Literal["confirmed", "vague"]


class FieldUpdate(BaseModel):
    field: BriefFieldName
    value: str | list[str] | None = None
    raw_text: str | None = None
    status: IncomingStatus


class ExtractionResult(BaseModel):
    intent: Intent
    updates: list[FieldUpdate] = Field(default_factory=list)
    off_schema_requests: list[str] = Field(default_factory=list)


class GateDecision(BaseModel):
    status: GateStatus
    fields: list[str] = Field(default_factory=list)
    next_field: str | None = None


class MarketingEmail(BaseModel):
    subject: str
    body: str
    cta: str


class MarketingEmailMeta(BaseModel):
    subject: str
    cta: str


class GeneratedCopy(BaseModel):
    product_description: str
    marketing_email: MarketingEmail


class Violation(BaseModel):
    code: ViolationCode
    message: str
    artifact: Literal["description", "email", "both"]


class ValidationResult(BaseModel):
    repaired: bool = False
    passed: bool = False
    violations: list[Violation] = Field(default_factory=list)
    pre_repair_violations: list[Violation] = Field(default_factory=list)


class JudgeVerdict(BaseModel):
    passed: bool
    score: int = Field(ge=1, le=10)
    summary: str
    strengths: list[str] = Field(default_factory=list)
    issues: list[str] = Field(default_factory=list)


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str
    turn: int


class Session(BaseModel):
    id: str
    brief: ProductBrief = Field(default_factory=ProductBrief)
    messages: list[ChatMessage] = Field(default_factory=list)
    turn_number: int = 0
    last_copy: GeneratedCopy | None = None
    last_validation: ValidationResult | None = None
    clarified_vague_optionals: set[str] = Field(default_factory=set)
    # Optional fields we already asked about (missing or vague); do not re-ask forever.
    optional_fields_prompted: set[str] = Field(default_factory=set)
    last_asked_field: str | None = None
    awaiting_generation_confirmation: bool = False
    streaming_description: str = ""
