"""The unified /analyze-complaint endpoint and vector-store management."""
import logging

from fastapi import APIRouter, HTTPException

from app.sih import config, llm, taxonomy
from app.sih.analyzer import analyze
from app.sih.duplicate_detector import get_detector
from app.sih.schemas import (
    AnalyzeRequest,
    AnalyzeResponse,
    BulkIndexRequest,
    IndexRequest,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["grievance-ai"])


@router.post("/analyze-complaint", response_model=AnalyzeResponse)
async def analyze_complaint(payload: AnalyzeRequest) -> AnalyzeResponse:
    """Classify, prioritise and duplicate-check a grievance in one call.

    This is the single endpoint the Node portal calls before writing to
    MongoDB. It deliberately does **not** index the complaint by default: the
    portal indexes after a successful save, so the vector store only ever
    contains grievances that really exist and can be linked to by id.
    """
    if not (payload.title or "").strip() and not (payload.description or "").strip():
        raise HTTPException(status_code=422, detail="title or description is required")

    analysis = await analyze(
        payload.title, payload.description, payload.latitude, payload.longitude
    )

    detector = get_detector()
    duplicate = detector.find_duplicate(
        payload.title, payload.description, payload.latitude, payload.longitude
    )

    # Re-analysing an existing complaint must not match it against itself.
    if payload.complaint_id:
        duplicate["similar_complaints"] = [
            m for m in duplicate["similar_complaints"]
            if m["complaint_id"] != payload.complaint_id
        ]
        if duplicate["matched_complaint_id"] == payload.complaint_id:
            fresh = next(
                (m for m in duplicate["similar_complaints"]
                 if m["similarity"] >= config.DUPLICATE_THRESHOLD
                 and not m["rejected_by_distance"]),
                None,
            )
            duplicate["is_duplicate"] = fresh is not None
            duplicate["matched_complaint_id"] = fresh["complaint_id"] if fresh else None
            duplicate["matched_distance_meters"] = fresh["distance_meters"] if fresh else None

    if payload.index and payload.complaint_id:
        detector.add(
            complaint_id=payload.complaint_id,
            title=payload.title,
            description=payload.description,
            latitude=payload.latitude,
            longitude=payload.longitude,
            category=analysis["category"],
        )

    return AnalyzeResponse(**analysis, **duplicate)


@router.post("/index-complaint")
def index_complaint(payload: IndexRequest):
    """Add a saved complaint to the vector store, keyed by its MongoDB _id."""
    detector = get_detector()
    return detector.add(
        complaint_id=payload.complaint_id,
        title=payload.title,
        description=payload.description,
        latitude=payload.latitude,
        longitude=payload.longitude,
        category=payload.category,
        status=payload.status,
    )


@router.post("/index-complaints/bulk")
def bulk_index(payload: BulkIndexRequest):
    """Backfill the index from complaints already in MongoDB."""
    detector = get_detector()
    for complaint in payload.complaints:
        detector.add(
            complaint_id=complaint.complaint_id,
            title=complaint.title,
            description=complaint.description,
            latitude=complaint.latitude,
            longitude=complaint.longitude,
            category=complaint.category,
            status=complaint.status,
        )
    return {"indexed": len(payload.complaints), "total": detector.size}


@router.delete("/index-complaint/{complaint_id}")
def remove_complaint(complaint_id: str):
    """Drop a complaint from the index when the portal deletes it."""
    removed = get_detector().remove(complaint_id)
    if not removed:
        raise HTTPException(status_code=404, detail="complaint not indexed")
    return {"removed": True, "complaint_id": complaint_id}


@router.delete("/index")
def clear_index():
    """Empty the vector store.

    Needed because the index is a second system of record: if grievances are
    removed from MongoDB without being de-indexed, their embeddings linger and
    keep matching new complaints. Clear, then replay from MongoDB.
    """
    removed = get_detector().clear()
    return {"cleared": removed}


@router.get("/taxonomy")
def get_taxonomy():
    """Every category and its department, from the one place they are defined.

    The Node API and the React client read this instead of keeping their own
    lists - hand-maintained copies are how the admin dashboard came to offer
    departments the AI never assigns.
    """
    return taxonomy.taxonomy_payload()


@router.get("/ai-health")
def ai_health():
    """Reports which engines are actually live - not just that the process is up."""
    return {
        "status": "ok",
        "duplicate_engine": get_detector().engine,
        "llm": llm.llm_status(),
        "departments": taxonomy.DEPARTMENTS,
        "categories": taxonomy.CATEGORIES,
        "duplicate_radius_meters": config.DUPLICATE_RADIUS_METERS,
    }
