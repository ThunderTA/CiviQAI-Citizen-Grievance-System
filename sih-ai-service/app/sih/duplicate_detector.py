"""Semantic duplicate detection: SentenceTransformers embeddings + FAISS.

Ported from `AI_Powered_Grievance_Redressal_System/src/qna_faiss.py`, with
three changes that the original could not support as a duplicate detector:

1. **Cosine, not L2.** The upstream script builds `IndexFlatL2`, whose raw
   distances are unbounded and cannot be compared against the 0.85 cosine
   threshold the problem statement specifies. Here vectors are L2-normalised
   and stored in an `IndexFlatIP`, where inner product *is* cosine similarity.
2. **Incremental and persistent.** The upstream builds one index at import time
   from a CSV that is not in the repository. This store is written to disk and
   grows one complaint at a time as citizens file them.
3. **Geo-aware.** Two identically worded pothole reports 40km apart are two
   potholes. When both complaints carry coordinates, a candidate further than
   `DUPLICATE_RADIUS_METERS` is rejected.

Both heavy dependencies degrade gracefully: without `sentence-transformers` a
deterministic hashing encoder is used, and without `faiss` a NumPy brute-force
search runs instead. The active engine is reported in the API response so a
demo never silently claims semantic matching it is not doing.
"""
import json
import logging
import math
import os
import re
import threading
from typing import Dict, List, Optional

import numpy as np

from app.sih import config

logger = logging.getLogger(__name__)

# --- optional heavy dependencies --------------------------------------------

try:
    from sentence_transformers import SentenceTransformer
    _ST_AVAILABLE = True
except Exception as exc:  # pragma: no cover - depends on install
    SentenceTransformer = None
    _ST_AVAILABLE = False
    logger.warning("sentence-transformers unavailable (%s); using hashing encoder", exc)

try:
    import faiss
    _FAISS_AVAILABLE = True
except Exception as exc:  # pragma: no cover - depends on install
    faiss = None
    _FAISS_AVAILABLE = False
    logger.warning("faiss unavailable (%s); using NumPy brute-force search", exc)


_TOKEN_RE = re.compile(r"[a-z0-9]+")

# Dropped before hashing so the fallback encoder is not dominated by the filler
# words every complaint shares ("the road near my house is ...").
_STOPWORDS = frozenset("""
a an the is are was were be been being am and or but if then than that this these those
of in on at to for from by with without into onto over under near about as it its
i we you he she they my our your their me us them there here have has had do does did
not no very too so such please kind sir madam respected dear
""".split())

_HASH_DIM = 384


def _normalise_text(title: str, description: str) -> str:
    return f"{(title or '').strip()}. {(description or '').strip()}".strip()


def _l2_normalise(matrix: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    # Zero vectors (empty text) would divide by zero and poison the index.
    norms[norms == 0] = 1.0
    return matrix / norms


def haversine_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in metres."""
    radius = 6_371_000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    return 2 * radius * math.asin(math.sqrt(a))


class _HashingEncoder:
    """Dependency-free stand-in for SentenceTransformer.

    Bag-of-words hashed into a fixed-width vector with sublinear term weighting.
    It catches literal restatements ("garbage not collected" vs "garbage is not
    being collected") but not genuine paraphrase, so it is a fallback for
    keeping a demo alive, never the intended production path.
    """

    name = "hashing-fallback"
    dimension = _HASH_DIM

    def encode(self, texts: List[str]) -> np.ndarray:
        vectors = np.zeros((len(texts), _HASH_DIM), dtype="float32")
        for row, text in enumerate(texts):
            counts: Dict[int, float] = {}
            tokens = [t for t in _TOKEN_RE.findall((text or "").lower()) if t not in _STOPWORDS]
            for token in tokens:
                bucket = hash(token) % _HASH_DIM
                counts[bucket] = counts.get(bucket, 0.0) + 1.0
            # Bigrams give the fallback a little word-order sensitivity.
            for first, second in zip(tokens, tokens[1:]):
                bucket = hash(f"{first}_{second}") % _HASH_DIM
                counts[bucket] = counts.get(bucket, 0.0) + 0.5
            for bucket, count in counts.items():
                vectors[row, bucket] = 1.0 + math.log(count)
        return vectors


class _TransformerEncoder:
    def __init__(self, model_name: str):
        self._model = SentenceTransformer(model_name)
        self.name = model_name
        # Renamed in sentence-transformers 6.x; the old name still works but
        # warns. Support both so the service is quiet on either version.
        getter = getattr(self._model, "get_embedding_dimension", None) or \
            self._model.get_sentence_embedding_dimension
        self.dimension = int(getter())

    def encode(self, texts: List[str]) -> np.ndarray:
        return np.asarray(
            self._model.encode(texts, show_progress_bar=False), dtype="float32"
        ).reshape(len(texts), -1)


def _build_encoder():
    if _ST_AVAILABLE and SentenceTransformer is not None:
        try:
            encoder = _TransformerEncoder(config.EMBEDDING_MODEL)
            logger.info("Embedding model loaded: %s (dim=%d)", encoder.name, encoder.dimension)
            return encoder
        except Exception as exc:
            # Most commonly: no network on first run to fetch model weights.
            logger.warning("Could not load %s (%s); using hashing encoder",
                           config.EMBEDDING_MODEL, exc)
    return _HashingEncoder()


class DuplicateDetector:
    """Persistent cosine-similarity store over filed grievances."""

    def __init__(self, store_dir: Optional[str] = None):
        self._lock = threading.Lock()
        self._store_dir = store_dir or config.VECTOR_STORE_DIR
        self._index_path = os.path.join(self._store_dir, "grievances.faiss")
        self._meta_path = os.path.join(self._store_dir, "grievances.meta.json")

        self._encoder = _build_encoder()
        self._dim = self._encoder.dimension
        self._records: List[Dict] = []
        # Mirrors the FAISS index so the NumPy fallback (and rebuilds) work.
        self._matrix = np.zeros((0, self._dim), dtype="float32")
        self._index = faiss.IndexFlatIP(self._dim) if _FAISS_AVAILABLE else None
        # complaint_id -> row, so re-indexing the same complaint updates it.
        self._id_to_row: Dict[str, int] = {}

        os.makedirs(self._store_dir, exist_ok=True)
        self._load()

    # --- properties ---------------------------------------------------------

    @property
    def size(self) -> int:
        return len(self._records)

    @property
    def engine(self) -> Dict[str, object]:
        return {
            "embedding_model": self._encoder.name,
            "semantic": isinstance(self._encoder, _TransformerEncoder),
            "vector_backend": "faiss" if _FAISS_AVAILABLE else "numpy",
            "dimension": self._dim,
            "indexed_complaints": self.size,
            "threshold": config.DUPLICATE_THRESHOLD,
            "threshold_nearby": config.DUPLICATE_THRESHOLD_NEARBY,
            "nearby_radius_meters": config.DUPLICATE_NEARBY_RADIUS_METERS,
        }

    # --- persistence --------------------------------------------------------

    def _load(self) -> None:
        if not os.path.exists(self._meta_path):
            return
        try:
            with open(self._meta_path, "r", encoding="utf-8") as handle:
                payload = json.load(handle)
            # An index built by a different encoder has incomparable geometry;
            # discard rather than return meaningless similarities.
            if payload.get("encoder") != self._encoder.name or payload.get("dimension") != self._dim:
                logger.warning("Vector store was built with a different encoder; rebuilding empty.")
                return
            self._records = payload.get("records", [])
            self._id_to_row = {r["complaint_id"]: i for i, r in enumerate(self._records)}

            vectors_path = os.path.join(self._store_dir, "grievances.npy")
            if os.path.exists(vectors_path):
                self._matrix = np.load(vectors_path).astype("float32")
            if _FAISS_AVAILABLE and os.path.exists(self._index_path):
                self._index = faiss.read_index(self._index_path)
            elif _FAISS_AVAILABLE and len(self._matrix):
                self._index = faiss.IndexFlatIP(self._dim)
                self._index.add(self._matrix)
            logger.info("Loaded vector store: %d complaints", self.size)
        except Exception as exc:
            logger.warning("Could not load vector store (%s); starting empty", exc)
            self._records, self._id_to_row = [], {}
            self._matrix = np.zeros((0, self._dim), dtype="float32")
            self._index = faiss.IndexFlatIP(self._dim) if _FAISS_AVAILABLE else None

    def _persist(self) -> None:
        try:
            np.save(os.path.join(self._store_dir, "grievances.npy"), self._matrix)
            if _FAISS_AVAILABLE and self._index is not None:
                faiss.write_index(self._index, self._index_path)
            with open(self._meta_path, "w", encoding="utf-8") as handle:
                json.dump(
                    {
                        "encoder": self._encoder.name,
                        "dimension": self._dim,
                        "records": self._records,
                    },
                    handle,
                )
        except Exception as exc:
            logger.error("Failed to persist vector store: %s", exc)

    # --- core ---------------------------------------------------------------

    def _embed(self, title: str, description: str) -> np.ndarray:
        text = _normalise_text(title, description)
        return _l2_normalise(self._encoder.encode([text]))

    def _rebuild_index(self) -> None:
        if not _FAISS_AVAILABLE:
            return
        self._index = faiss.IndexFlatIP(self._dim)
        if len(self._matrix):
            self._index.add(self._matrix)

    def add(
        self,
        complaint_id: str,
        title: str,
        description: str,
        latitude: Optional[float] = None,
        longitude: Optional[float] = None,
        category: Optional[str] = None,
        status: Optional[str] = None,
    ) -> Dict:
        """Index a complaint. Re-indexing an existing id replaces its vector."""
        vector = self._embed(title, description)
        record = {
            "complaint_id": str(complaint_id),
            "title": title or "",
            "description": (description or "")[:500],
            "latitude": latitude,
            "longitude": longitude,
            "category": category,
            "status": status,
        }

        with self._lock:
            existing_row = self._id_to_row.get(str(complaint_id))
            if existing_row is not None:
                self._records[existing_row] = record
                self._matrix[existing_row] = vector[0]
                self._rebuild_index()
            else:
                self._records.append(record)
                self._matrix = (
                    vector if not len(self._matrix) else np.vstack([self._matrix, vector])
                )
                self._id_to_row[str(complaint_id)] = len(self._records) - 1
                if _FAISS_AVAILABLE and self._index is not None:
                    self._index.add(vector)
            self._persist()
            return {"indexed": True, "complaint_id": str(complaint_id), "total": self.size}

    def remove(self, complaint_id: str) -> bool:
        """Drop a complaint. FAISS IndexFlat has no delete, so the index is rebuilt."""
        with self._lock:
            row = self._id_to_row.get(str(complaint_id))
            if row is None:
                return False
            self._records.pop(row)
            self._matrix = np.delete(self._matrix, row, axis=0)
            self._id_to_row = {r["complaint_id"]: i for i, r in enumerate(self._records)}
            self._rebuild_index()
            self._persist()
            return True

    def clear(self) -> int:
        """Drop every vector.

        The store is a separate system of record from MongoDB, so deleting
        grievances there can leave orphaned embeddings behind that keep
        matching new complaints. Rebuilding from MongoDB starts here.
        """
        with self._lock:
            removed = len(self._records)
            self._records = []
            self._id_to_row = {}
            self._matrix = np.zeros((0, self._dim), dtype="float32")
            self._rebuild_index()
            self._persist()
            return removed

    def _search(self, vector: np.ndarray, top_k: int):
        """Return (score, row) pairs, best first."""
        if not len(self._matrix):
            return []
        k = min(top_k, len(self._matrix))
        if _FAISS_AVAILABLE and self._index is not None and self._index.ntotal:
            scores, rows = self._index.search(vector, k)
            return [(float(s), int(r)) for s, r in zip(scores[0], rows[0]) if r >= 0]
        scores = (self._matrix @ vector[0]).astype("float32")
        rows = np.argsort(-scores)[:k]
        return [(float(scores[r]), int(r)) for r in rows]

    def find_duplicate(
        self,
        title: str,
        description: str,
        latitude: Optional[float] = None,
        longitude: Optional[float] = None,
        threshold: Optional[float] = None,
    ) -> Dict:
        """Look for an already-filed grievance describing the same problem.

        Returns the verdict plus the near-miss candidates, so an admin can
        review borderline matches instead of only seeing a boolean.
        """
        limit = config.DUPLICATE_THRESHOLD if threshold is None else threshold
        vector = self._embed(title, description)

        with self._lock:
            hits = self._search(vector, config.DUPLICATE_TOP_K)

            matches: List[Dict] = []
            for score, row in hits:
                if row >= len(self._records):
                    continue
                record = self._records[row]
                distance = None
                if (
                    config.DUPLICATE_RADIUS_METERS > 0
                    and latitude is not None
                    and longitude is not None
                    and record.get("latitude") is not None
                    and record.get("longitude") is not None
                ):
                    distance = haversine_meters(
                        latitude, longitude, record["latitude"], record["longitude"]
                    )

                # Cosine can drift a hair above 1.0 through float error.
                similarity = round(min(max(score, -1.0), 1.0), 4)
                rejected_by_distance = (
                    distance is not None and distance > config.DUPLICATE_RADIUS_METERS
                )

                # Two reports at the same spot corroborate each other, so the
                # text bar is relaxed. Without coordinates, the strict bar holds.
                nearby = (
                    distance is not None
                    and distance <= config.DUPLICATE_NEARBY_RADIUS_METERS
                )
                effective = min(limit, config.DUPLICATE_THRESHOLD_NEARBY) if nearby else limit

                matches.append(
                    {
                        "complaint_id": record["complaint_id"],
                        "title": record["title"],
                        "category": record.get("category"),
                        "status": record.get("status"),
                        "similarity": similarity,
                        "distance_meters": None if distance is None else round(distance, 1),
                        "rejected_by_distance": rejected_by_distance,
                        "threshold_applied": round(effective, 4),
                        "match_rule": "text+proximity" if nearby else "text",
                    }
                )

            duplicate = next(
                (m for m in matches
                 if m["similarity"] >= m["threshold_applied"]
                 and not m["rejected_by_distance"]),
                None,
            )

        return {
            "is_duplicate": duplicate is not None,
            "matched_complaint_id": duplicate["complaint_id"] if duplicate else None,
            "similarity_score": duplicate["similarity"] if duplicate else (
                matches[0]["similarity"] if matches else 0.0
            ),
            "matched_distance_meters": duplicate["distance_meters"] if duplicate else None,
            "match_rule": duplicate["match_rule"] if duplicate else None,
            "similar_complaints": matches,
        }


_detector: Optional[DuplicateDetector] = None
_detector_lock = threading.Lock()


def get_detector() -> DuplicateDetector:
    """Lazily construct the process-wide detector (model load is expensive)."""
    global _detector
    if _detector is None:
        with _detector_lock:
            if _detector is None:
                _detector = DuplicateDetector()
    return _detector
