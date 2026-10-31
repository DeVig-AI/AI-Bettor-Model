"""Research Lab constants. Every number here comes from research/RESEARCH_LAB_CONSTITUTION.md (v13: Part B NFL,
Part C college football, Part D NBA / NHL / MLB); the Constitution wins if they ever disagree.

The module holds one sport's settings at a time: NFL by default, `use("CFB")` (or "NBA", "NHL", "MLB") switches every
constant below to that sport's Part (the lab's commands take `--sport`, or the LAB_SPORT environment variable)."""
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
RESEARCH = os.path.join(ROOT, "research")
CONSTITUTION = "research/RESEARCH_LAB_CONSTITUTION.md"
CONSTITUTION_VERSION = "v13"
SPORT = "NFL"
REPO = "DeVig-AI/AI-Bettor-Model"
BLOB = f"https://github.com/{REPO}/blob/main/"

DATA_DIR = os.path.join(RESEARCH, "data", "nfl")
CANDIDATES = os.path.join(RESEARCH, "candidates")
QUEUE = os.path.join(RESEARCH, "queue")
BATCH = 18                     # A3.3b: at most this many confirmations per lab run
RESULTS = os.path.join(RESEARCH, "results")
LEDGER = os.path.join(RESEARCH, "LEDGER.csv")
EXAMS = os.path.join(RESEARCH, "exam", "EXAMS.csv")
PAPER_DIR = os.path.join(RESEARCH, "paper")
PROMOTED = os.path.join(RESEARCH, "promoted.json")
STATUS_JSON = os.path.join(RESEARCH, "status.json")
MARKETS = ("spread", "total")  # B3; Part D3 gives NHL and MLB a moneyline instead of a spread

# B2. Season split (v4; v2/v3 used 2006-12 / 2013-18 / 2019-24, v1 used training 2006-15 and gates 2016-18 / 2019-21 / 2022-24)
FIRST_SEASON = 1999            # ratings start here, from average
TRAIN = (1999, 2005)
SEARCH = (2006, 2016)          # the search (A3.3c) is given data up to SEARCH[1] and nothing later
SEARCH_DIR = os.path.join(RESEARCH, "search")
SEARCH_PERIODS = [(2006, 2009), (2010, 2013), (2014, 2016)]
GATES = [("2017–19", 2017, 2019), ("2020–22", 2020, 2022), ("2023–24", 2023, 2024)]
POOLED = ("Pooled 2017–24", 2017, 2024)
RULE_SPLITS = [("2017–20", 2017, 2020, "before the 17-game season"),
               ("2021–23", 2021, 2023, "17 games, from 2021"),
               ("2024", 2024, 2024, "new kickoff rule")]
LAB_MAX_SEASON = 2024          # the lab refuses anything later
# v12 A3.3e: injury signals (NFL only). Injury reports and snap counts start too late for the training seasons, so a
# model with an injury signal fits its weights on the training seasons plus these (the newest search seasons).
INJURY_FIRST = 2013            # first season with snap counts, so the first with injury features
INJURY_FIT = (2013, 2016)
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

SPORTS = ("NFL", "CFB", "NBA", "NHL", "MLB")
_NFL = {k: v for k, v in dict(globals()).items() if k.isupper() and k not in ("ROOT", "RESEARCH", "REPO", "BLOB",
                                                                             "CONSTITUTION", "SPORTS")}
CFB_DIR = os.path.join(RESEARCH, "cfb")
# Part C. College football
_CFB = dict(
    SPORT="CFB",
    DATA_DIR=os.path.join(CFB_DIR, "data"),
    CANDIDATES=os.path.join(CFB_DIR, "candidates"),
    QUEUE=os.path.join(CFB_DIR, "queue"),             # A3.3a, per sport: never the NFL queue
    RESULTS=os.path.join(CFB_DIR, "results"),
    LEDGER=os.path.join(CFB_DIR, "LEDGER.csv"),
    EXAMS=os.path.join(CFB_DIR, "exam", "EXAMS.csv"),
    PAPER_DIR=os.path.join(CFB_DIR, "paper"),
    PROMOTED=os.path.join(CFB_DIR, "promoted.json"),
    STATUS_MD=os.path.join(CFB_DIR, "STATUS.md"),
    LESSONS_MD=os.path.join(CFB_DIR, "LESSONS.md"),
    FIRST_SEASON=2009,                       # C2 (v5: search 2018, 2019, 2021; confirmation 2022 / 2023 / 2024)
    TRAIN=(2014, 2017),
    SEARCH=(2018, 2021),
    SEARCH_PERIODS=[(2018, 2018), (2019, 2019), (2021, 2021)],
    SEARCH_DIR=os.path.join(CFB_DIR, "search"),
    GATES=[("2022", 2022, 2022), ("2023", 2023, 2023), ("2024", 2024, 2024)],
    POOLED=("Pooled 2022–24", 2022, 2024),
    SKIP_SEASONS=(2020,),
    RULE_SPLITS=[("2022", 2022, 2022, "free transfer + NIL era"),
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


# Part D. NBA, NHL and MLB: one archive (D1, pinned by commit and fingerprint), one season split (D2)
SBR_COMMIT = "1a820e50c6fbd0276cde073c22bfffae78930868"
SBR_URL = "https://raw.githubusercontent.com/flancast90/sportsbookreview-scraper/" + SBR_COMMIT + "/data/{name}"


def _part_d(sport, folder, markets, exam_min, stop_after, sbr_file, sbr_sha, kalshi):
    d = os.path.join(RESEARCH, folder)
    return dict(
        SPORT=sport, MARKETS=markets,
        DATA_DIR=os.path.join(d, "data"), CANDIDATES=os.path.join(d, "candidates"), QUEUE=os.path.join(d, "queue"),
        RESULTS=os.path.join(d, "results"), LEDGER=os.path.join(d, "LEDGER.csv"),
        EXAMS=os.path.join(d, "exam", "EXAMS.csv"), PAPER_DIR=os.path.join(d, "paper"),
        PROMOTED=os.path.join(d, "promoted.json"), STATUS_MD=os.path.join(d, "STATUS.md"),
        LESSONS_MD=os.path.join(d, "LESSONS.md"), SEARCH_DIR=os.path.join(d, "search"),
        FIRST_SEASON=2011,                       # warm-up 2011: ratings only, never scored or fit on
        TRAIN=(2012, 2013),
        SEARCH=(2014, 2016),
        SEARCH_PERIODS=[(2014, 2014), (2015, 2015), (2016, 2016)],
        GATES=[("2017", 2017, 2017), ("2018", 2018, 2018), ("2019", 2019, 2019)],
        POOLED=("Pooled 2017–19", 2017, 2019),
        SKIP_SEASONS=(2020,),                    # COVID seasons: played through, never scored
        RULE_SPLITS=[], EXTRA_SPLITS=[],
        LAB_MAX_SEASON=2020,
        SEALED_SEASON=2021,
        EXAM_MIN_GAMES=exam_min,
        STOP_AFTER_WEEK=stop_after,              # D5, in weeks of the season (NBA/NHL ~ January 31, MLB ~ July 1)
        KALSHI_SPORT=kalshi,
        SBR_FILE=sbr_file, SBR_SHA=sbr_sha,
    )


_NBA = _part_d("NBA", "nba", ("spread", "total"), 800, 15, "nba_archive_10Y.json",
               "0c9858489d224c54dcf2f2d1b70c3a122675381d35ae03ce0a81204f739f0e98", "NBA")
_NHL = _part_d("NHL", "nhl", ("moneyline", "total"), 800, 16, "nhl_archive_10Y.json",
               "399b65039c909907011827907285ede97982b3ce89e6224c323c5031c2885168", "NHL")
_MLB = _part_d("MLB", "mlb", ("moneyline", "total"), 1500, 14, "mlb_archive_10Y.json",
               "ee4904dee0ee1474e7ac75697cea2c28f0084e5fb576553e48627e4cf90dd77d", "MLB")
_PARTS = {"CFB": _CFB, "NBA": _NBA, "NHL": _NHL, "MLB": _MLB}


def use(sport):
    """Switch every constant to one sport's Part of the Constitution."""
    sport = (sport or "NFL").upper()
    if sport not in SPORTS:
        raise SystemExit(f"unknown sport {sport!r}: one of {', '.join(SPORTS)}")
    globals().update(_NFL)
    globals().update(_PARTS.get(sport, {}))
    return sport


def dir_for(sport):
    """{name: path} of one sport's files, without switching the module (used to read every sport's ledger)."""
    src = _PARTS.get(sport, _NFL)
    return {k: src[k] for k in ("LEDGER", "EXAMS", "RESULTS", "CANDIDATES")}


use(os.environ.get("LAB_SPORT", "NFL"))
