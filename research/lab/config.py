"""Research Lab constants. Every number here comes from research/RESEARCH_LAB_CONSTITUTION.md (v1); the Constitution
wins if they ever disagree."""
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
RESEARCH = os.path.join(ROOT, "research")
CONSTITUTION = "research/RESEARCH_LAB_CONSTITUTION.md"
CONSTITUTION_VERSION = "v2"
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

# B2. Season split (v2; v1 used training 2006-15 and gates 2016-18 / 2019-21 / 2022-24)
FIRST_SEASON = 1999            # ratings start here, from average
TRAIN = (1999, 2005)
SEARCH = (2006, 2016)          # the search (A3.3a) is given data up to SEARCH[1] and nothing later
SEARCH_PERIODS = [(2006, 2009), (2010, 2013), (2014, 2016)]
GATES = [("2017–19", 2017, 2019), ("2020–22", 2020, 2022), ("2023–24", 2023, 2024)]
POOLED = ("Pooled 2017–24", 2017, 2024)
RULE_SPLITS = [("2017–20", 2017, 2020, "before the 17-game season"),
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
# A9. Stop rule
STOP_MIN_PICKS = 40
STOP_AFTER_WEEK = 9
STOP_Z = 1.6449                                # 90% two-sided Wilson interval

GAMES_URL = "https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv"
PBP_URL = "https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_{season}.csv.gz"
