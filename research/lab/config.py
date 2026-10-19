"""Research Lab constants. Every number here comes from research/RESEARCH_LAB_CONSTITUTION.md (v3: Part B NFL,
Part C college football); the Constitution wins if they ever disagree.

The module holds one sport's settings at a time: NFL by default, `use("CFB")` switches every constant below to
Part C (the lab's commands take `--sport`, or the LAB_SPORT environment variable)."""
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
RESEARCH = os.path.join(ROOT, "research")
CONSTITUTION = "research/RESEARCH_LAB_CONSTITUTION.md"
CONSTITUTION_VERSION = "v3"
SPORT = "NFL"
REPO = "DeVig-AI/AI-Bettor-Model"
BLOB = f"https://github.com/{REPO}/blob/main/"

DATA_DIR = os.path.join(RESEARCH, "data", "nfl")
CANDIDATES = os.path.join(RESEARCH, "candidates")
RESULTS = os.path.join(RESEARCH, "results")
LEDGER = os.path.join(RESEARCH, "LEDGER.csv")
EXAMS = os.path.join(RESEARCH, "exam", "EXAMS.csv")
PAPER_DIR = os.path.join(RESEARCH, "paper")
PROMOTED = os.path.join(RESEARCH, "promoted.json")
STATUS_JSON = os.path.join(RESEARCH, "status.json")

# B2. Season split
FIRST_SEASON = 2002            # warm-up starts
TRAIN = (2006, 2015)
GATES = [("2016–18", 2016, 2018), ("2019–21", 2019, 2021), ("2022–24", 2022, 2024)]
POOLED = ("Pooled 2016–24", 2016, 2024)
RULE_SPLITS = [("2016–20", 2016, 2020, "before the 17-game season"),
               ("2021–23", 2021, 2023, "17 games, from 2021"),
               ("2024", 2024, 2024, "new kickoff rule")]
LAB_MAX_SEASON = 2024          # the lab refuses anything later
SEALED_SEASON = 2025

# A4. Pricing
FEE_RATE = 0.07
PRICE = 0.5
FEE = FEE_RATE * PRICE * (1 - PRICE)          # 0.0175
COST = PRICE + FEE                             # 0.5175 = break-even win rate

# A5-A8
BOOT_N = 10000
BOOT_SEED = 20261019
P_BAR = 0.05
FADE_NEEDED = 0.5
EXAM_BUDGET = 3
EXAM_ALPHA = P_BAR / EXAM_BUDGET
EXAM_MIN_GAMES = 200
SKIP_SEASONS = ()               # seasons ratings walk through but that are never scored
EXTRA_SPLITS = ()               # extra reported splits: (label, kind, note)
KALSHI_SPORT = "NFL"
STATUS_MD = None                # None = RESEARCH/STATUS.md (NFL, as in v1)
LESSONS_MD = None
# A9. Stop rule
STOP_MIN_PICKS = 40
STOP_AFTER_WEEK = 9
STOP_Z = 1.6449                                # 90% two-sided Wilson interval

GAMES_URL = "https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv"
PBP_URL = "https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_{season}.csv.gz"

SPORTS = ("NFL", "CFB")
_NFL = {k: v for k, v in dict(globals()).items() if k.isupper() and k not in ("ROOT", "RESEARCH", "REPO", "BLOB",
                                                                             "CONSTITUTION", "SPORTS")}
CFB_DIR = os.path.join(RESEARCH, "cfb")
# Part C. College football
_CFB = dict(
    SPORT="CFB",
    DATA_DIR=os.path.join(CFB_DIR, "data"),
    CANDIDATES=os.path.join(CFB_DIR, "candidates"),
    RESULTS=os.path.join(CFB_DIR, "results"),
    LEDGER=os.path.join(CFB_DIR, "LEDGER.csv"),
    EXAMS=os.path.join(CFB_DIR, "exam", "EXAMS.csv"),
    PAPER_DIR=os.path.join(CFB_DIR, "paper"),
    PROMOTED=os.path.join(CFB_DIR, "promoted.json"),
    STATUS_MD=os.path.join(CFB_DIR, "STATUS.md"),
    LESSONS_MD=os.path.join(CFB_DIR, "LESSONS.md"),
    FIRST_SEASON=2009,                       # C2
    TRAIN=(2014, 2017),
    GATES=[("2018–19", 2018, 2019), ("2021–22", 2021, 2022), ("2023–24", 2023, 2024)],
    POOLED=("Pooled 2018–24 (no 2020)", 2018, 2024),
    SKIP_SEASONS=(2020,),
    RULE_SPLITS=[("2018–19", 2018, 2019, "before free transfers and NIL"),
                 ("2021–22", 2021, 2022, "free transfer + NIL, from 2021"),
                 ("2023–24", 2023, 2024, "running clock after first downs; 12-team playoff in 2024")],
    EXTRA_SPLITS=[("Lines ≤ 14", "line_small", "closing line of 14 points or less"),
                  ("Lines > 14", "line_big", "mismatches: closing line over 14 points"),
                  ("Regular season", "regular", "regular-season games"),
                  ("Postseason", "post", "bowls and playoff")],
    LAB_MAX_SEASON=2024,
    SEALED_SEASON=2025,
    EXAM_MIN_GAMES=400,                      # C5
    STOP_AFTER_WEEK=7,
    KALSHI_SPORT="NCAAF",
)


def use(sport):
    """Switch every constant to one sport's Part of the Constitution."""
    sport = (sport or "NFL").upper()
    if sport not in SPORTS:
        raise SystemExit(f"unknown sport {sport!r}: one of {', '.join(SPORTS)}")
    globals().update(_NFL)
    if sport == "CFB":
        globals().update(_CFB)
    return sport


def dir_for(sport):
    """{name: path} of one sport's files, without switching the module (used to read every sport's ledger)."""
    src = _CFB if sport == "CFB" else _NFL
    return {k: src[k] for k in ("LEDGER", "EXAMS", "RESULTS", "CANDIDATES")}


use(os.environ.get("LAB_SPORT", "NFL"))
