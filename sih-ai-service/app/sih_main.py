"""SIH26-S02 grievance AI service.

A lean entrypoint that exposes only the unified grievance endpoints. The
upstream `app/main.py` (the full customer-complaint-agent stack with its own
SQL database, auth and email routers) is left intact and unused: this service
holds no system of record, because MongoDB in the Node portal is the single
source of truth for grievances. Run that one instead if you want the legacy
agent console.
"""
import logging
import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.sih.router import router

load_dotenv()

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)

app = FastAPI(
    title="SIH26-S02 Grievance AI Service",
    description=(
        "Classification, prioritisation and semantic duplicate detection for "
        "citizen grievances."
    ),
    version="1.0.0",
)

# The Node portal is the only intended caller, but the React client is allowed
# too so the duplicate warning can be shown live as the citizen types.
_origins = [
    o.strip().rstrip("/")
    for o in os.getenv(
        "ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:5173"
    ).split(",")
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.get("/")
def root():
    return {"service": "SIH26-S02 Grievance AI", "docs": "/docs", "health": "/ai-health"}


@app.get("/health")
def health():
    """Liveness only - no model or index work, so orchestrators get a fast answer."""
    return {"status": "ok"}


@app.on_event("startup")
def warm_up():
    """Load the embedding model at boot.

    Without this the first citizen to file a grievance pays the model load
    (several seconds), which looks like a hung form.
    """
    from app.sih.duplicate_detector import get_detector

    engine = get_detector().engine
    logging.getLogger(__name__).info("Duplicate engine ready: %s", engine)
