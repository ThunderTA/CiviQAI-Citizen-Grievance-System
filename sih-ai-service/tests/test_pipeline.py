"""End-to-end checks for the grievance AI pipeline.

Runnable without pytest so a demo machine needs no extra dependency:

    .venv/bin/python tests/test_pipeline.py

Everything here runs on the deterministic path (LLM_ENABLED=false), so results
are reproducible and need no API key.
"""
import asyncio
import os
import shutil
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Must be set before app.sih.config is imported.
os.environ["LLM_ENABLED"] = "false"
_STORE = tempfile.mkdtemp(prefix="sih-vectors-")
os.environ["VECTOR_STORE_DIR"] = _STORE

from app.sih import taxonomy                      # noqa: E402
from app.sih.analyzer import analyze              # noqa: E402
from app.sih.duplicate_detector import DuplicateDetector, haversine_meters  # noqa: E402

PASSED, FAILED = 0, 0


def check(label: str, actual, expected) -> None:
    global PASSED, FAILED
    if actual == expected:
        PASSED += 1
        print(f"  [PASS] {label}")
    else:
        FAILED += 1
        print(f"  [FAIL] {label}\n         expected {expected!r}, got {actual!r}")


def check_true(label: str, condition) -> None:
    check(label, bool(condition), True)


# --------------------------------------------------------------------------
def test_routing() -> None:
    print("\nDepartment routing")
    cases = [
        ("Huge pothole on the highway", "Public Works Department"),
        ("No water supply for four days", "Water Supply Department"),
        ("Drain is overflowing onto the street", "Sewerage & Drainage Department"),
        ("Garbage has not been collected all week", "Sanitation Department"),
        ("Street light is not working in our lane", "Electricity Department"),
        ("Loudspeaker blaring all night", "Pollution Control Department"),
        ("Park playground swing is broken", "Parks & Horticulture Department"),
    ]
    for text, expected in cases:
        category = taxonomy.keyword_category(text)
        check(text[:44], taxonomy.department_for(category), expected)

    # Regression: "street" contains "tree", which a substring matcher routed to
    # Parks & Horticulture.
    check(
        "'street' does not match the Parks keyword 'tree'",
        taxonomy.keyword_category("live wire hanging over the street"),
        "Public Safety",
    )

    # Regression: an incidental infrastructure noun used to outrank an
    # electrical hazard, sending a life-safety report to Public Works.
    check(
        "a hazard outranks the infrastructure it sits on",
        taxonomy.keyword_category(
            "an electric wire snapped and hangs over the footpath"),
        "Public Safety",
    )

    # The other half of that decision: generic safety words must NOT hijack a
    # complaint that plainly belongs to another department.
    check(
        "'hazard' alone does not hijack a sanitation complaint",
        taxonomy.keyword_category(
            "the garbage dump behind our building is a health hazard"),
        "Waste Management",
    )
    check(
        "'dangerous' alone does not hijack a road complaint",
        taxonomy.keyword_category(
            "the pothole on the main road is dangerous for two-wheelers"),
        "Pothole",
    )


def test_priority() -> None:
    print("\nPriority scoring (1-5)")
    cases = [
        ("Live wire hanging at the school gate, children pass under it daily, "
         "someone will be electrocuted", 5),
        ("Drain overflowing for five days, mosquitoes breeding, children are "
         "falling sick", 4),
        ("Street light in our lane has been off for two weeks", 2),
        ("Please repaint the community park benches when convenient", 1),
    ]
    for text, expected in cases:
        category = taxonomy.keyword_category(text)
        score, _ = taxonomy.heuristic_priority(text, category)
        check(f"{text[:44]}... -> {expected}", score, expected)


def test_safety_net() -> None:
    print("\nSafety net for unrecognised dangerous vocabulary")
    text = ("A snapped power cable is dangling near the entrance, "
            "someone will get electrocuted")
    category = taxonomy.keyword_category(text)
    score, signals = taxonomy.heuristic_priority(text, category)
    routed = taxonomy.safety_net_category(category, score, signals)
    check_true("dangerous complaint never lands in General Administration",
               taxonomy.department_for(routed) != "General Administration")


def test_duplicates() -> None:
    print("\nSemantic duplicate detection")
    detector = DuplicateDetector(store_dir=tempfile.mkdtemp(prefix="sih-dup-"))
    detector.add(
        "complaint_A", "Large pothole on MG Road",
        "There is a very large pothole near the MG Road junction, "
        "vehicles are getting damaged.",
        latitude=12.9716, longitude=77.5946, category="Pothole",
    )
    detector.add(
        "complaint_B", "Garbage not collected in Sector 12",
        "Garbage has not been picked up for a week in Sector 12, it is stinking.",
        latitude=12.9750, longitude=77.6000, category="Waste Management",
    )

    near = detector.find_duplicate(
        "Big crater on M.G. Road",
        "Huge hole in the road at MG Road crossing, damaging cars.",
        12.9717, 77.5947)
    check("paraphrase 15m away is a duplicate", near["is_duplicate"], True)
    check("...and links to the right complaint", near["matched_complaint_id"], "complaint_A")

    far = detector.find_duplicate(
        "Large pothole on MG Road",
        "There is a very large pothole near the MG Road junction, "
        "vehicles are getting damaged.",
        13.3200, 77.5946)
    check("identical text 38km away is NOT a duplicate", far["is_duplicate"], False)
    check_true("...but is still similarity 1.0", far["similarity_score"] > 0.99)
    check_true("...and is marked rejected_by_distance",
               far["similar_complaints"][0]["rejected_by_distance"])

    other = detector.find_duplicate(
        "Street light not working",
        "The street lamp outside my house has been off for two weeks.",
        12.9716, 77.5946)
    check("unrelated issue at the same spot is NOT a duplicate", other["is_duplicate"], False)

    textonly = detector.find_duplicate(
        "Trash uncollected sector 12",
        "Waste has not been collected for seven days in Sector 12 and it smells.")
    check("paraphrase with no coordinates is a duplicate", textonly["is_duplicate"], True)
    check("...matched on the strict text rule", textonly["match_rule"], "text")

    # Re-indexing must update in place, not append a second row.
    before = detector.size
    detector.add("complaint_A", "Large pothole on MG Road", "Updated text.",
                 latitude=12.9716, longitude=77.5946)
    check("re-indexing an existing id does not duplicate the row", detector.size, before)

    check("removing a complaint works", detector.remove("complaint_B"), True)
    check("removing an unknown complaint returns False", detector.remove("nope"), False)


def test_haversine() -> None:
    print("\nDistance calculation")
    # Bengaluru -> Mumbai is ~845km.
    km = haversine_meters(12.9716, 77.5946, 19.0760, 72.8777) / 1000
    check_true(f"Bengaluru-Mumbai ~845km (got {km:.0f}km)", 830 < km < 860)
    check("identical points are 0m", round(haversine_meters(12.97, 77.59, 12.97, 77.59)), 0)


def test_analyzer_contract() -> None:
    print("\nAnalyzer response contract")
    result = asyncio.run(analyze(
        "Live wire hanging near school gate",
        "An electric wire snapped and hangs over the footpath outside the "
        "school. Children walk under it every morning. Very dangerous.",
        12.9716, 77.5946))
    for field in ("department", "priority_score", "urgency_level", "category",
                  "portal_priority", "sentiment", "summary", "sla_hours"):
        check_true(f"'{field}' present", field in result)
    check("department", result["department"], "Public Safety Department")
    check("priority_score", result["priority_score"], 5)
    check("urgency_level", result["urgency_level"], "Critical")
    check("portal_priority is a valid Issue enum value",
          result["portal_priority"] in {"low", "medium", "high"}, True)
    check_true("priority_score is in range 1-5", 1 <= result["priority_score"] <= 5)
    check("urgency_level agrees with priority_score",
          result["urgency_level"], taxonomy.score_to_urgency(result["priority_score"]))
    check("no LLM key means the rule path ran", result["analysis_source"], "rules")


def test_llm_validation() -> None:
    """A model that returns nonsense must not be able to corrupt triage."""
    print("\nLLM output validation (mocked model)")
    from app.sih import analyzer as analyzer_mod

    def with_reply(reply, title, description):
        original = analyzer_mod.llm.ask

        async def fake(_prompt):
            return reply

        analyzer_mod.llm.ask = fake
        try:
            return asyncio.run(analyzer_mod.analyze(title, description))
        finally:
            analyzer_mod.llm.ask = original

    hazard = ("Live wire hanging near school",
              "Snapped cable over the footpath, children walk under it, "
              "someone will be electrocuted")

    result = with_reply(
        '{"category":"Department of Magic","priority_score":2,'
        '"urgency_level":"Low","sentiment":"neutral","summary":"x","reasoning":"y"}',
        *hazard)
    check("invented department is rejected",
          result["department"] in taxonomy.DEPARTMENTS, True)

    result = with_reply(
        '{"category":"Public Safety","priority_score":1,"urgency_level":"Routine",'
        '"sentiment":"neutral","summary":"minor","reasoning":"trivial"}',
        *hazard)
    check_true("model cannot under-triage a rule-detected hazard",
               result["priority_score"] >= 4)

    result = with_reply(
        '{"category":"Pothole","priority_score":99,"urgency_level":"Critical",'
        '"sentiment":"negative","summary":"s","reasoning":"r"}',
        "Pothole on the road", "Deep pothole")
    check_true("out-of-range score is discarded",
               1 <= result["priority_score"] <= 5)

    result = with_reply(
        '{"category":"Pothole","priority_score":4,"urgency_level":"Routine",'
        '"sentiment":"negative","summary":"s","reasoning":"r"}',
        "Pothole on the road", "Deep pothole causing accidents")
    check("urgency_level is derived, never taken from the model",
          result["urgency_level"], taxonomy.score_to_urgency(result["priority_score"]))

    result = with_reply(
        'Sure! Here you go:\n```json\n{"category":"Water Supply","priority_score":3,'
        '"urgency_level":"Moderate","sentiment":"negative","summary":"No water",'
        '"reasoning":"days"}\n```\nHope that helps!',
        "No water", "No water supply for three days")
    check("JSON wrapped in prose and fences is still parsed",
          result["department"], "Water Supply Department")

    result = with_reply("I'm sorry, I can't help with that.",
                        "Garbage not collected", "Trash piled up for a week")
    check("unparseable reply falls back to the rule path",
          result["analysis_source"], "rules")
    check("...and still routes correctly",
          result["department"], "Sanitation Department")


if __name__ == "__main__":
    print("=" * 62)
    print("SIH26-S02 grievance AI pipeline — deterministic path")
    print("=" * 62)
    try:
        test_routing()
        test_priority()
        test_safety_net()
        test_duplicates()
        test_haversine()
        test_analyzer_contract()
        test_llm_validation()
    finally:
        shutil.rmtree(_STORE, ignore_errors=True)

    print("\n" + "=" * 62)
    print(f"  {PASSED} passed, {FAILED} failed")
    print("=" * 62)
    sys.exit(1 if FAILED else 0)
