"""Measure the category classifier against labelled citizen complaints.

    .venv/bin/python tools/eval_categories.py                 # dev split, with failures
    .venv/bin/python tools/eval_categories.py --holdout       # the held-out split
    .venv/bin/python tools/eval_categories.py --both          # numbers for both

The metric that matters most is not raw accuracy. A complaint filed under the
WRONG department (a "misroute") is worse than one that falls back to "Other":
officials only see their own department's queue, so a misroute hides the
complaint from the people who could act on it, whereas "Other" still has an
owner. The report therefore separates:

  correct    right category
  fallback   a real category was expected but "Other" was returned  (safe miss)
  misroute   a real category was expected but a DIFFERENT one was returned (bad)
  false-fit  the complaint fits nothing, yet it was forced into a category (bad)
"""
import argparse
import os
import sys
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("LLM_ENABLED", "false")

import category_eval_data as data  # noqa: E402
from app.sih import taxonomy       # noqa: E402

OTHER = "Other"


def predict(title: str, description: str) -> str:
    """The category production would assign with no LLM available."""
    try:
        from app.sih.analyzer import rule_classify
        return rule_classify(title, description)[0]
    except ImportError:
        text = f"{title} {description}"
        category = taxonomy.keyword_category(text)
        score, signals = taxonomy.heuristic_priority(text, category)
        return taxonomy.safety_net_category(category, score, signals)


def evaluate(examples):
    rows = []
    for title, description, expected in examples:
        rows.append((title, description, expected, predict(title, description)))
    return rows


def summarise(rows):
    total = len(rows)
    correct = sum(1 for _, _, e, p in rows if e == p)
    fallback = sum(1 for _, _, e, p in rows if e != OTHER and p == OTHER)
    misroute = sum(1 for _, _, e, p in rows if e != OTHER and p not in (OTHER, e))
    false_fit = sum(1 for _, _, e, p in rows if e == OTHER and p != OTHER)
    others = sum(1 for _, _, e, _ in rows if e == OTHER)
    return {
        "total": total, "correct": correct, "fallback": fallback, "misroute": misroute,
        "false_fit": false_fit, "others": others,
        "real": total - others,
    }


def print_summary(name, rows):
    s = summarise(rows)
    pct = lambda n, d: f"{(100 * n / d):5.1f}%" if d else "  n/a "
    print(f"\n{name}  (n={s['total']})")
    print(f"  accuracy          {pct(s['correct'], s['total'])}   {s['correct']}/{s['total']}")
    print(f"  fallback to Other {pct(s['fallback'], s['real'])}   {s['fallback']} of {s['real']} real complaints   (safe miss)")
    print(f"  MISROUTED         {pct(s['misroute'], s['real'])}   {s['misroute']} of {s['real']} real complaints   (hides it from the right office)")
    print(f"  FALSE-FIT         {pct(s['false_fit'], s['others'])}   {s['false_fit']} of {s['others']} out-of-scope complaints forced into a category")
    return s


def print_per_category(rows):
    by = defaultdict(list)
    for _, _, e, p in rows:
        by[e].append(p)
    print(f"\n  {'category':<38}{'n':>3}  {'ok':>3} {'->Other':>8} {'wrong':>6}   wrongly sent to")
    for cat in data.DEV:
        preds = by.get(cat, [])
        ok = sum(1 for p in preds if p == cat)
        to_other = sum(1 for p in preds if p == OTHER and cat != OTHER)
        wrong = [p for p in preds if p not in (cat, OTHER)] if cat != OTHER else [p for p in preds if p != OTHER]
        flag = '' if not wrong else '   ' + ', '.join(f'{k} x{v}' for k, v in Counter(wrong).most_common(3))
        print(f"  {cat:<38}{len(preds):>3}  {ok:>3} {to_other:>8} {len(wrong):>6}{flag}")


def print_failures(rows, limit=60):
    bad = [r for r in rows if r[2] != r[3]]
    if not bad:
        return
    print(f"\n  failures ({len(bad)}):")
    for title, _, expected, got in bad[:limit]:
        kind = ('fallback' if got == OTHER else 'FALSE-FIT' if expected == OTHER else 'MISROUTE')
        print(f"    [{kind:<9}] {title[:44]:<44} expected {expected:<24} got {got}")


def run_stress(quiet=False):
    """The adversarial set. `accepted` may list several right answers."""
    import category_eval_stress as stress
    rows = []
    for title, description, accepted in stress.STRESS:
        accepted = (accepted,) if isinstance(accepted, str) else tuple(accepted)
        rows.append((title, description, accepted, predict(title, description)))

    n = len(rows)
    ok = [r for r in rows if r[3] in r[2]]
    fell_back = [r for r in rows if r[3] == OTHER and OTHER not in r[2]]
    false_fit = [r for r in rows if r[3] != OTHER and r[2] == (OTHER,)]
    misroute = [r for r in rows if r[3] not in r[2] and r[3] != OTHER and r not in false_fit]
    print(f"\nSTRESS  (n={n}, adversarial)")
    print(f"  acceptable        {100*len(ok)/n:5.1f}%   {len(ok)}/{n}")
    print(f"  fell back to Other{100*len(fell_back)/n:5.1f}%   {len(fell_back)}   (safe miss)")
    print(f"  MISROUTED         {100*len(misroute)/n:5.1f}%   {len(misroute)}   (wrong specific category)")
    print(f"  FALSE-FIT         {100*len(false_fit)/n:5.1f}%   {len(false_fit)}   (out-of-scope forced into a category)")
    if not quiet:
        for title, _, accepted, got in rows:
            if got in accepted:
                continue
            kind = 'fallback' if got == OTHER else ('FALSE-FIT' if accepted == (OTHER,) else 'MISROUTE')
            print(f"    [{kind:<9}] {title[:42]:<42} want {'/'.join(accepted)[:44]:<44} got {got}")
    return rows


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--holdout", action="store_true", help="evaluate the held-out split only")
    parser.add_argument("--both", action="store_true", help="report both splits")
    parser.add_argument("--quiet", action="store_true", help="numbers only, no per-category table or failures")
    parser.add_argument("--stress", action="store_true", help="the adversarial set (pessimistic by design)")
    args = parser.parse_args()

    known = set(taxonomy.CATEGORIES)
    missing = sorted(set(data.DEV) - known)
    if missing:
        print(f"note: {len(missing)} labelled categories do not exist in the taxonomy yet:")
        for m in missing:
            print(f"      - {m}")

    if args.stress:
        run_stress(args.quiet)
        return

    splits = []
    if args.both or not args.holdout:
        splits.append(("DEV", data.DEV))
    if args.both or args.holdout:
        splits.append(("HOLDOUT", data.HOLDOUT))

    for name, split in splits:
        rows = evaluate(data.flatten(split))
        print_summary(name, rows)
        if not args.quiet and name == "DEV":
            print_per_category(rows)
            print_failures(rows)


if __name__ == "__main__":
    main()
