"""LLM access for grievance analysis.

Prefers the upstream `customer-complaint-agent_new` client, which already
implements multi-key Gemini rotation and Groq model fallback - that work is
reused rather than reimplemented. If those modules cannot be imported (missing
`google-generativeai`, no keys configured), this degrades to a direct Groq call
and finally to "no LLM", at which point the caller uses its heuristic path.
"""
import asyncio
import json
import logging
import re
from typing import Optional

from app.sih import config

logger = logging.getLogger(__name__)

_upstream_ask = None
_UPSTREAM_REASON = "not attempted"

if config.LLM_ENABLED:
    try:
        # Upstream: app/agents/gemini_client.py -> async_ask_ai (Groq -> Gemini)
        from app.agents.gemini_client import async_ask_ai as _upstream_ask
        _UPSTREAM_REASON = "loaded"
    except Exception as exc:
        _UPSTREAM_REASON = f"unavailable ({exc})"
        logger.warning("Upstream LLM client %s", _UPSTREAM_REASON)

_direct_groq = None
if config.LLM_ENABLED and _upstream_ask is None and config.GROQ_API_KEY:
    try:
        from groq import AsyncGroq
        _direct_groq = AsyncGroq(api_key=config.GROQ_API_KEY, timeout=config.LLM_TIMEOUT_SECONDS,
                                 max_retries=0)
        logger.info("Using direct Groq client")
    except Exception as exc:
        logger.warning("Direct Groq client unavailable: %s", exc)


def llm_status() -> dict:
    if not config.LLM_ENABLED:
        return {"available": False, "provider": "disabled"}
    if _upstream_ask is not None:
        has_key = bool(config.GROQ_API_KEY or config.GEMINI_API_KEY)
        return {"available": has_key, "provider": "upstream-groq-gemini" if has_key else "no-api-key"}
    if _direct_groq is not None:
        return {"available": True, "provider": "groq-direct"}
    return {"available": False, "provider": f"none ({_UPSTREAM_REASON})"}


async def ask(prompt: str) -> Optional[str]:
    """Single LLM round trip, hard-bounded by LLM_TIMEOUT_SECONDS.

    Returns None on any failure; every caller must have a non-LLM path.
    """
    if not config.LLM_ENABLED:
        return None
    if not (config.GROQ_API_KEY or config.GEMINI_API_KEY):
        return None

    try:
        if _upstream_ask is not None:
            return await asyncio.wait_for(
                _upstream_ask(prompt), timeout=config.LLM_TIMEOUT_SECONDS
            )
        if _direct_groq is not None:
            completion = await asyncio.wait_for(
                _direct_groq.chat.completions.create(
                    model="llama-3.3-70b-versatile",
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.1,
                    max_tokens=512,
                ),
                timeout=config.LLM_TIMEOUT_SECONDS,
            )
            return (completion.choices[0].message.content or "").strip()
    except asyncio.TimeoutError:
        logger.warning("LLM timed out after %.1fs", config.LLM_TIMEOUT_SECONDS)
    except Exception as exc:
        logger.warning("LLM call failed: %s", exc)
    return None


_JSON_BLOCK = re.compile(r"\{.*\}", re.DOTALL)


def parse_json(text: Optional[str]) -> Optional[dict]:
    """Extract a JSON object from an LLM reply.

    Models wrap JSON in prose or ```json fences despite instructions, so the
    outermost brace-to-brace span is extracted before parsing.
    """
    if not text:
        return None
    cleaned = re.sub(r"```(?:json)?", "", text).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass
    match = _JSON_BLOCK.search(cleaned)
    if not match:
        return None
    try:
        return json.loads(match.group(0))
    except json.JSONDecodeError:
        return None
