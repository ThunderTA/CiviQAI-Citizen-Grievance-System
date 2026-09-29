"""Measure where true and false duplicate pairs actually separate.

The duplicate thresholds are the single most consequential constant in this
system: too high silently drops real duplicates, too low merges distinct
grievances and hides them from the department that should act. Picking the
number by intuition is guesswork - this script makes it evidence-based.

    .venv/bin/python tools/eval_thresholds.py

Extend LABELLED_TRUE / LABELLED_FALSE with grievances from your own corpus and
re-run before changing DUPLICATE_THRESHOLD_NEARBY. The sample below is small
and hand-written: treat it as indicative, not as a benchmark.
"""
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("LLM_ENABLED", "false")

from app.sih.duplicate_detector import DuplicateDetector  # noqa: E402

CORPUS = [
    ("A", "Large pothole on MG Road",
     "A very large pothole has formed near the MG Road junction. Two-wheelers "
     "are skidding and cars are getting damaged every day."),
    ("B", "Garbage not collected in Sector 12",
     "Garbage has not been picked up for over a week in Sector 12. The pile is "
     "stinking and stray dogs are scattering it across the road."),
    ("C", "Street light not working near park",
     "The street light outside the colony park has been off for two weeks. "
     "The whole lane is pitch dark after 7pm."),
    ("D", "No water supply for four days",
     "There has been no water supply in our building for four days. We are "
     "buying tankers at our own cost."),
    ("E", "Drain overflowing outside the market",
     "The main drain outside the vegetable market is overflowing. Sewage is "
     "spreading across the footpath and mosquitoes are breeding."),
]

# The same grievance, re-reported in a different citizen's words.
LABELLED_TRUE = [
    ("A", "Huge crater on M.G. Road",
     "There is a big hole in the road at the MG Road crossing. Bikes are "
     "slipping and cars keep getting damaged."),
    ("A", "Road has a deep pit near MG Road",
     "Deep pit on MG road junction, very risky for scooters, my car was damaged."),
    ("B", "Trash uncollected in sector 12",
     "Waste has not been collected for seven days in Sector 12, it smells and "
     "dogs spread it around."),
    ("B", "Rubbish piling up sector 12",
     "Nobody has cleared the garbage in sector twelve for a week, it stinks badly."),
    ("C", "Lamp post dead near the park",
     "The lamp outside the park has not worked for a fortnight, the street is "
     "completely dark at night."),
    ("D", "Water not coming for 4 days",
     "No water in our building since four days, we have to order tankers ourselves."),
    ("E", "Sewage spilling near vegetable market",
     "The drain by the sabzi market is overflowing, dirty water on the footpath "
     "and mosquitoes everywhere."),
]

# Genuinely different grievances that share vocabulary or location - the pairs
# a naive threshold would wrongly merge.
LABELLED_FALSE = [
    ("A", "Street light broken on MG Road",
     "The street lamp at MG Road junction is not working at night."),
    ("B", "Stray dogs in Sector 12",
     "Aggressive stray dogs are roaming in Sector 12 and chasing children."),
    ("C", "Park benches are broken",
     "The benches inside the colony park are broken and need repair."),
    ("D", "Water pipeline leaking",
     "A water pipeline is leaking on the main road and water is being wasted."),
    ("E", "Footpath is damaged near market",
     "The footpath tiles outside the vegetable market are broken and uneven."),
]


def main() -> int:
    detector = DuplicateDetector(store_dir=tempfile.mkdtemp(prefix="sih-eval-"))
    for cid, title, description in CORPUS:
        detector.add(cid, title, description, 12.97, 77.59)

    def score(pairs, own_only: bool):
        """Similarity for each labelled pair.

        For true pairs, the score against its own original. For false pairs the
        *highest* score against anything, since any match above threshold would
        be a wrong merge.
        """
        values = []
        for cid, title, description in pairs:
            result = detector.find_duplicate(title, description)
            by_id = {m["complaint_id"]: m["similarity"]
                     for m in result["similar_complaints"]}
            own = by_id.get(cid, 0.0)
            values.append(own if own_only else max([own] + list(by_id.values())))
        return values

    true_scores = score(LABELLED_TRUE, own_only=True)
    false_scores = score(LABELLED_FALSE, own_only=False)

    print(f"  TRUE  n={len(true_scores)}  min={min(true_scores):.4f}  "
          f"max={max(true_scores):.4f}  mean={sum(true_scores)/len(true_scores):.4f}")
    print(f"  FALSE n={len(false_scores)}  min={min(false_scores):.4f}  "
          f"max={max(false_scores):.4f}  mean={sum(false_scores)/len(false_scores):.4f}")

    worst_true, worst_false = min(true_scores), max(false_scores)
    if worst_true > worst_false:
        print(f"\n  Separable: worst true {worst_true:.4f} > worst false "
              f"{worst_false:.4f} (gap {worst_true - worst_false:.4f})")
        print(f"  Midpoint of the gap: {(worst_true + worst_false) / 2:.4f}")
    else:
        print(f"\n  NOT separable on this sample: worst true {worst_true:.4f} "
              f"<= worst false {worst_false:.4f}. A better embedding model is "
              f"needed, not a different threshold.")

    print("\n  threshold   recall   false-merges")
    for threshold in (0.60, 0.65, 0.68, 0.70, 0.72, 0.75, 0.80, 0.85):
        recall = sum(1 for v in true_scores if v >= threshold) / len(true_scores)
        merges = sum(1 for v in false_scores if v >= threshold)
        print(f"    {threshold:.2f}      {recall:5.0%}      {merges}/{len(false_scores)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
