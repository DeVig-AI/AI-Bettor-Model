"""cfb_teams.py -- one college football team name, whoever wrote it. Kalshi ("Missouri St."), ESPN ("Missouri State",
"Missouri St", "Missouri State Bears"), CollegeFootballData ("Missouri State") and open models each spell schools
their own way, and their short codes don't agree either (Kalshi MOSU, ESPN MOST), so CFB games are matched by name.
Display and matching only.
"""
import re
import unicodedata

# spellings -> one key (left side already normalised by norm())
ALIASES = {
    "miami fl": "miami", "miami florida": "miami", "miami oh": "miami ohio", "miami of ohio": "miami ohio",
    "ole miss": "mississippi", "pitt": "pittsburgh", "byu": "brigham young", "ucf": "central florida",
    "usf": "south florida", "usc": "southern california", "lsu": "louisiana state", "tcu": "texas christian",
    "smu": "southern methodist", "uab": "alabama birmingham", "utsa": "texas san antonio", "ut san antonio": "texas san antonio",
    "utep": "texas el paso", "ut el paso": "texas el paso", "unlv": "nevada las vegas", "fiu": "florida international",
    "fau": "florida atlantic", "uconn": "connecticut", "umass": "massachusetts", "nc state": "north carolina state",
    "app state": "appalachian state", "southern miss": "southern mississippi", "ul monroe": "louisiana monroe",
    "ulm": "louisiana monroe", "ul lafayette": "louisiana", "louisiana lafayette": "louisiana",
    "middle tennessee state": "middle tennessee", "mtsu": "middle tennessee", "jax state": "jacksonville state",
    "sam houston state": "sam houston", "shsu": "sam houston", "wku": "western kentucky", "niu": "northern illinois",
    "army west point": "army", "hawai i": "hawaii", "san jose st": "san jose state", "texas a and m": "texas a m",
    "uc davis": "california davis", "cal": "california", "kent": "kent state", "bowling green state": "bowling green",
    "georgia st": "georgia state", "florida intl": "florida international", "louisiana tech bulldogs": "louisiana tech",
    "uh": "houston", "umd": "maryland", "unc": "north carolina", "vt": "virginia tech", "gt": "georgia tech",
}


def norm(s):
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode().lower()
    s = s.replace("&", " and ").replace("'", " ")
    s = re.sub(r"\((fl|florida)\)", " fl ", s)
    s = re.sub(r"\((oh|ohio)\)", " oh ", s)
    s = re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", s)).strip()
    s = re.sub(r"\bst$", "state", s)                 # "Missouri St." -> "missouri state"
    s = s.replace("texas a and m", "texas a m")
    return s


def key(s):
    n = norm(s)
    return ALIASES.get(n, n)


def same_team(a, b):
    return bool(a) and bool(b) and key(a) == key(b)


def matches_any(name, names):
    """True when `name` is the same school as any of `names` (e.g. ESPN's location, short and display names)."""
    k = key(name)
    return any(n and key(n) == k for n in names)
