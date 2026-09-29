"""Request/response contracts for the unified grievance endpoint."""
from typing import List, Optional

from pydantic import BaseModel, Field


class AnalyzeRequest(BaseModel):
    title: str = Field(..., description="Short grievance title")
    description: str = Field("", description="Full grievance text")
    latitude: Optional[float] = Field(None, ge=-90, le=90)
    longitude: Optional[float] = Field(None, ge=-180, le=180)

    # Optional extras the portal can send; ignored by clients that do not.
    complaint_id: Optional[str] = Field(
        None, description="Existing id, excluded from its own duplicate search"
    )
    index: bool = Field(
        False, description="Index this complaint after analysis (needs complaint_id)"
    )


class SimilarComplaint(BaseModel):
    complaint_id: str
    title: str
    category: Optional[str] = None
    status: Optional[str] = None
    similarity: float
    distance_meters: Optional[float] = None
    rejected_by_distance: bool = False
    threshold_applied: float = 0.85
    match_rule: str = "text"


class AnalyzeResponse(BaseModel):
    # --- the four fields the problem statement requires ---
    department: str
    priority_score: int = Field(..., ge=1, le=5)
    urgency_level: str
    is_duplicate: bool
    matched_complaint_id: Optional[str] = None

    # --- supporting detail the portal and admin dashboard consume ---
    category: str
    portal_priority: str
    sentiment: str
    summary: str
    reasoning: str
    sla_hours: int
    similarity_score: float
    matched_distance_meters: Optional[float] = None
    # 'text' (strict 0.85) or 'text+proximity' (relaxed, corroborated by GPS)
    match_rule: Optional[str] = None
    similar_complaints: List[SimilarComplaint] = []
    analysis_source: str
    rule_signals: List[str] = []


class IndexRequest(BaseModel):
    complaint_id: str
    title: str
    description: str = ""
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    category: Optional[str] = None
    status: Optional[str] = None


class BulkIndexRequest(BaseModel):
    complaints: List[IndexRequest]
