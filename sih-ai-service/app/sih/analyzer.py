"""Grievance classification, prioritisation and urgency extraction.

Layered exactly like the upstream `customer-complaint-agent_new` agents
(deterministic first, LLM last) but targeting the civic taxonomy:

  Layer 1  keyword rules      - instant, always runs, always produces a result
  Layer 2  LLM (Groq/Gemini)  - nuance the keywords miss, bounded by a timeout
  Layer 3  validation         - LLM output is reconciled against Layer 1

Layer 3 matters: an LLM will happily invent a department that does not exist,
or rate a burst water main as "Routine". Anything outside the known taxonomy is
discarded, and the rules keep a floor under the priority score.
"""
import logging
from typing import Dict, List, Optional, Tuple

from app.sih import llm, taxonomy

logger = logging.getLogger(__name__)

_SENTIMENTS = {"positive", "negative", "neutral"}

_PROMPT = """You are triaging a citizen grievance for an Indian municipal corporation.

Grievance title: {title}
Grievance description: {description}
{location_line}
Return ONLY a JSON object, no prose and no code fences:
{{
  "category": one of [{categories}] - use "Other" if none of them genuinely fits,
                    do not force the nearest one,
  "priority_score": integer 1-5 where 5 = danger to life or public health emergency,
                    4 = serious disruption, 3 = significant inconvenience,
                    2 = minor issue, 1 = routine request,
  "urgency_level": one of [Critical, High, Moderate, Low, Routine],
  "sentiment": one of [positive, negative, neutral],
  "summary": one factual sentence, max 25 words,
  "reasoning": max 15 words on why this priority
}}"""


def _coerce_score(value) -> Optional[int]:
    try:
        score = int(round(float(value)))
    except (TypeError, ValueError):
        return None
    return score if 1 <= score <= 5 else None


def rule_classify(title: str, description: str) -> Tuple[str, int, List[str]]:
    """Category and priority from the deterministic rules alone.

    The one place the rule path is defined, so the evaluation harness measures
    exactly what production does when no LLM is available.
    """
    # Joined with a full stop, not a space: the rules look a few words back to
    # tell "near the bus stop" (a place) from "bus stop broken" (the problem), and
    # without a sentence break the end of the title bleeds into the description.
    text = f"{title or ''}. {description or ''}".strip()

    # The title is the citizen's own summary of the problem, so it is weighted
    # above the body when the rules score the categories.
    category = taxonomy.keyword_category(text, title=title)
    score, signals = taxonomy.heuristic_priority(text, category)

    # A dangerous grievance that matched no category keyword still needs an
    # owner; route it to Public Safety rather than the General Administration
    # catch-all. Applied before the LLM so it holds even with no API key.
    category = taxonomy.safety_net_category(category, score, signals)
    return category, score, signals


async def analyze(
    title: str,
    description: str,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
) -> Dict:
    """Classify a grievance and score its priority.

    Always returns a complete result; the LLM is an enhancement, never a
    dependency. `source` reports which layer decided, so the demo can show
    whether the AI path or the rule path was used.
    """
    text = f"{title or ''} {description or ''}".strip()

    # --- Layer 1: deterministic ---------------------------------------------
    rule_category, rule_score, signals = rule_classify(title, description)

    category = rule_category
    score = rule_score
    sentiment = "negative" if rule_score >= 3 else "neutral"
    summary = (description or title or "")[:200]
    reasoning = f"Rule signals: {', '.join(signals)}" if signals else "No escalation signals found"
    source = "rules"

    # --- Layer 2: LLM --------------------------------------------------------
    location_line = ""
    if latitude is not None and longitude is not None:
        location_line = f"Reported at coordinates: {latitude}, {longitude}\n"

    raw = await llm.ask(
        _PROMPT.format(
            title=title or "(none)",
            description=description or "(none)",
            location_line=location_line,
            categories=", ".join(taxonomy.CATEGORIES),
        )
    )
    parsed = llm.parse_json(raw)

    # --- Layer 3: validate and reconcile -------------------------------------
    if parsed:
        source = "llm+rules"

        llm_category = str(parsed.get("category", "")).strip()
        if llm_category in taxonomy.CATEGORY_TO_DEPARTMENT:
            # The keyword pass is high-precision: when it commits to something
            # other than "Other" it beats the model's guess.
            category = rule_category if rule_category != "Other" else llm_category
        elif llm_category:
            logger.warning("LLM returned unknown category %r; keeping %r", llm_category, category)

        llm_score = _coerce_score(parsed.get("priority_score"))
        if llm_score is not None:
            # Take the higher of the two. Under-triaging a live-wire report is
            # far more costly than over-triaging a pothole.
            score = max(llm_score, rule_score)

        llm_sentiment = str(parsed.get("sentiment", "")).strip().lower()
        if llm_sentiment in _SENTIMENTS:
            sentiment = llm_sentiment

        llm_summary = str(parsed.get("summary", "")).strip()
        if llm_summary:
            summary = llm_summary

        llm_reasoning = str(parsed.get("reasoning", "")).strip()
        if llm_reasoning:
            reasoning = llm_reasoning
    elif raw:
        logger.warning("LLM reply was not parseable as JSON; using rule output")

    # The score is authoritative; urgency_level is derived so the two can never
    # disagree, even when the model returns a mismatched pair.
    return {
        "category": category,
        "department": taxonomy.department_for(category),
        "priority_score": score,
        "urgency_level": taxonomy.score_to_urgency(score),
        "portal_priority": taxonomy.score_to_portal_priority(score),
        "sentiment": sentiment,
        "summary": summary,
        "reasoning": reasoning,
        "sla_hours": taxonomy.SLA_HOURS.get(score, 120),
        "analysis_source": source,
        "rule_signals": signals,
    }
