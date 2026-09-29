"""Write the taxonomy snapshot the Node API falls back on.

    .venv/bin/python tools/export_taxonomy.py          # (re)write the snapshot
    .venv/bin/python tools/export_taxonomy.py --check  # exit 1 if it is stale

The Node API normally reads the taxonomy live from this service (GET /taxonomy).
The snapshot is only what it serves if this service is unreachable, so the
portal's filters and dropdowns still work. tests/test_pipeline.py runs the
--check, so a taxonomy change that forgets to refresh the snapshot fails.
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from app.sih import taxonomy  # noqa: E402

SNAPSHOT = os.path.normpath(os.path.join(
    ROOT, "..", "sih-web-portal", "server", "config", "taxonomy.json"))


def rendered() -> str:
    return json.dumps(taxonomy.taxonomy_payload(), indent=2, ensure_ascii=False) + "\n"


def main() -> int:
    if "--check" in sys.argv:
        try:
            current = open(SNAPSHOT, encoding="utf-8").read()
        except FileNotFoundError:
            print(f"missing: {SNAPSHOT}")
            return 1
        if current != rendered():
            print("taxonomy snapshot is stale - run tools/export_taxonomy.py")
            return 1
        print("taxonomy snapshot is current")
        return 0

    os.makedirs(os.path.dirname(SNAPSHOT), exist_ok=True)
    with open(SNAPSHOT, "w", encoding="utf-8") as handle:
        handle.write(rendered())
    print(f"wrote {SNAPSHOT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
