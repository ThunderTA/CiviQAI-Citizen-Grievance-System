"""Seed the vector index with sample grievances so duplicate detection has
something to match against.

Against an empty index every complaint is trivially "not a duplicate", which
looks like the feature is broken. Run this before a demo:

    .venv/bin/python seed_demo.py            # against a running service
    .venv/bin/python seed_demo.py --direct   # write the index without the API
"""
import sys

SEED = [
    ("65f000000000000000000001", "Large pothole on MG Road",
     "A very large pothole has formed near the MG Road junction. Two-wheelers "
     "are skidding and cars are getting damaged every day.",
     12.9716, 77.5946, "Pothole"),
    ("65f000000000000000000002", "Garbage not collected in Sector 12",
     "Garbage has not been picked up for over a week in Sector 12. The pile is "
     "stinking and stray dogs are scattering it across the road.",
     12.9750, 77.6000, "Waste Management"),
    ("65f000000000000000000003", "Street light not working near park",
     "The street light outside the colony park has been off for two weeks. "
     "The whole lane is pitch dark after 7pm.",
     12.9730, 77.5960, "Street Light"),
    ("65f000000000000000000004", "No water supply for four days",
     "There has been no water supply in our building for four days. We are "
     "buying tankers at our own cost.",
     12.9700, 77.5930, "Water Supply"),
    ("65f000000000000000000005", "Drain overflowing outside the market",
     "The main drain outside the vegetable market is overflowing. Sewage is "
     "spreading across the footpath and mosquitoes are breeding.",
     12.9740, 77.5980, "Sewage"),
]


def main() -> int:
    direct = "--direct" in sys.argv

    if direct:
        from app.sih.duplicate_detector import get_detector
        detector = get_detector()
        for cid, title, desc, lat, lng, cat in SEED:
            detector.add(cid, title, desc, lat, lng, cat, "pending")
        print(f"Seeded {len(SEED)} grievances directly. Index size: {detector.size}")
        return 0

    import json
    import urllib.error
    import urllib.request

    base = "http://127.0.0.1:8000"
    for cid, title, desc, lat, lng, cat in SEED:
        body = json.dumps({
            "complaint_id": cid, "title": title, "description": desc,
            "latitude": lat, "longitude": lng, "category": cat, "status": "pending",
        }).encode()
        request = urllib.request.Request(
            f"{base}/index-complaint", data=body,
            headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                json.load(response)
            print(f"  indexed: {title}")
        except urllib.error.URLError as exc:
            print(f"Could not reach {base} ({exc}). Is the service running?")
            print("Start it, or re-run with --direct to write the index offline.")
            return 1
    print(f"\nSeeded {len(SEED)} grievances. Try POST /analyze-complaint with a "
          f"reworded version of any of them.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
