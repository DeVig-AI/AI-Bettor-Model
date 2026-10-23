"""What the back-to-back loop queues next (Constitution v8 A8): the sealed exam of a sport that has a lab pass and an
exam left, otherwise the next loop run. Prints 'exam <SPORT>' (NFL, CFB, NBA, NHL, MLB) or 'loop'.

    python3 -m research.lab.next_run [research/status.json]
"""
import json
import sys


def blocks(status):
    yield status.get("sport") or status.get("scope") or "NFL", status
    for sport, b in (status.get("by_sport") or {}).items():
        yield sport, b


def decide(status):
    for sport, b in blocks(status):
        left = (b.get("counts") or {}).get("exam_budget_left") or 0
        if left > 0 and any(c.get("state") == "lab_pass" for c in b.get("candidates") or []):
            return f"exam {sport}"
    return "loop"


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else "research/status.json"
    try:
        with open(path) as f:
            print(decide(json.load(f)))
    except (OSError, ValueError):
        print("loop")
