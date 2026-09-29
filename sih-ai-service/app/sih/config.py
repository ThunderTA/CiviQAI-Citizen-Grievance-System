"""Runtime configuration for the grievance analysis service.

Every value has a working default so the service boots and answers requests
with zero configuration - important for a demo machine with no API keys.
"""
import os

from dotenv import load_dotenv

load_dotenv()


def _as_float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, default))
    except (TypeError, ValueError):
        return default


def _as_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, default))
    except (TypeError, ValueError):
        return default


# --- Duplicate detection -----------------------------------------------------

# Cosine similarity at or above this counts as a duplicate. The problem
# statement fixes this at 0.85; it stays tunable for demo purposes.
DUPLICATE_THRESHOLD = _as_float("DUPLICATE_THRESHOLD", 0.85)

# Two complaints with near-identical text but 40km apart are two potholes, not
# one. When both sides carry coordinates, a match further away than this is
# rejected. Set to 0 to disable the geo gate entirely.
DUPLICATE_RADIUS_METERS = _as_float("DUPLICATE_RADIUS_METERS", 500.0)

# Co-location is strong independent evidence of duplication. Measured on
# MiniLM embeddings, genuine civic paraphrases ("large pothole on MG Road" vs
# "huge hole in the road at MG Road crossing") land around 0.78-0.84 - just
# under the 0.85 text-only bar - because citizens describe the same defect in
# very different words. When two reports are within NEARBY_RADIUS of each
# other, the text bar is relaxed to this value. The strict 0.85 still governs
# every match that has no coordinates to corroborate it.
# 0.68 is measured, not guessed: see tools/eval_thresholds.py. On a labelled
# sample of civic paraphrases, true duplicates scored 0.68-0.90 and genuinely
# different grievances at the same location topped out at 0.64. 0.68 caught
# every true duplicate with no false merges; the 0.75 originally guessed here
# dropped 43% of them. Re-run that script against your own corpus before
# changing this - the gap is real but narrow.
DUPLICATE_NEARBY_RADIUS_METERS = _as_float("DUPLICATE_NEARBY_RADIUS_METERS", 100.0)
DUPLICATE_THRESHOLD_NEARBY = _as_float("DUPLICATE_THRESHOLD_NEARBY", 0.68)

# How many neighbours to pull from FAISS before applying the geo gate.
DUPLICATE_TOP_K = _as_int("DUPLICATE_TOP_K", 5)

EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")

# Where the FAISS index and its id/metadata sidecar are persisted.
VECTOR_STORE_DIR = os.getenv("VECTOR_STORE_DIR", "data/vector_store")

# --- LLM ---------------------------------------------------------------------

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

# Hard ceiling on any single LLM round trip. Grievance submission is a
# synchronous user action; a hung provider must not hold the citizen's form.
LLM_TIMEOUT_SECONDS = _as_float("LLM_TIMEOUT_SECONDS", 8.0)

# Set LLM_ENABLED=false to force the deterministic path (useful for offline
# demos and for reproducible tests).
LLM_ENABLED = os.getenv("LLM_ENABLED", "true").lower() not in {"false", "0", "no"}

SERVICE_PORT = _as_int("PORT", 8000)
