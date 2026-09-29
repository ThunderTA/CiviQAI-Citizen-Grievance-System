"""Civic grievance taxonomy: departments, categories and priority scoring.

The upstream `customer-complaint-agent_new` classifier targets a customer
support taxonomy (Billing / Technical / Delivery / Service / Security), which
is meaningless for a municipal grievance portal. This module replaces it with
the ULB (urban local body) department structure the SIH problem statement
implies.

This file is the single source of truth for categories and departments. The
Node API and the React client read them from `GET /taxonomy` rather than keeping
their own copies - three hand-maintained lists is how the admin dashboard ended
up offering departments the AI never assigns.

"Other" is a real category, not an error state. A complaint that fits nothing
below is filed there instead of being forced into the nearest match: staff only
see their own department's queue, so a wrong department hides a complaint from
the people who could act on it, while "Other" still has an owner.
"""
import re
from typing import Dict, List, Optional, Tuple

# Category -> owning department. `category` is what analytics group by;
# `department` is what routing and each official's queue filter on.
CATEGORY_TO_DEPARTMENT: Dict[str, str] = {
    # Roads and traffic
    "Pothole": "Public Works Department",
    "Road Damage": "Public Works Department",
    "Traffic & Signals": "Traffic & Transport Department",
    "Public Transport": "Traffic & Transport Department",
    # Water and drainage
    "Water Supply": "Water Supply Department",
    "Sewage": "Sewerage & Drainage Department",
    "Flooding & Waterlogging": "Sewerage & Drainage Department",
    # Sanitation
    "Waste Management": "Sanitation Department",
    "Public Toilets": "Sanitation Department",
    # Electricity
    "Street Light": "Electricity Department",
    "Power Supply": "Electricity Department",
    # Safety and health
    "Public Safety": "Public Safety Department",
    "Stray Animals": "Veterinary & Animal Control Department",
    "Public Health": "Public Health Department",
    # Environment
    "Air & Water Pollution": "Pollution Control Department",
    "Noise Pollution": "Pollution Control Department",
    "Parks & Recreation": "Parks & Horticulture Department",
    # Enforcement and civic buildings
    "Encroachment & Illegal Construction": "Town Planning & Enforcement Department",
    "Public Buildings & Amenities": "Public Works Department",
    # Administration
    "Government Services": "General Administration",
    "Other": "General Administration",
}

# One line each, shown to citizens so they can see what the portal covers.
CATEGORY_DESCRIPTIONS: Dict[str, str] = {
    "Pothole": "Potholes, craters and pits in the road surface",
    "Road Damage": "Broken roads, footpaths, speed breakers and bridges",
    "Traffic & Signals": "Faulty traffic lights, missing signs, illegal parking, congestion",
    "Public Transport": "Bus service, bus stops, auto and taxi fares",
    "Water Supply": "No water, low pressure, leaking pipes, dirty tap water",
    "Sewage": "Blocked or overflowing drains, sewers and manholes",
    "Flooding & Waterlogging": "Rainwater that will not drain, flooded streets and underpasses",
    "Waste Management": "Uncollected garbage, dumping, dustbins, street sweeping",
    "Public Toilets": "Dirty, locked, broken or missing public toilets",
    "Street Light": "Street lights that are off, dim, flickering or missing",
    "Power Supply": "Power cuts, low voltage, transformers, electricity meters",
    "Public Safety": "Live wires, open manholes, accidents, crime and other dangers",
    "Stray Animals": "Stray dogs, cattle and monkeys, dog bites",
    "Public Health": "Mosquito breeding, disease outbreaks, unhygienic food",
    "Air & Water Pollution": "Smoke, burning waste, chemical fumes, polluted lakes and rivers",
    "Noise Pollution": "Loudspeakers, night-time noise, constant honking",
    "Parks & Recreation": "Parks, playgrounds, gardens and trees",
    "Encroachment & Illegal Construction": "Blocked footpaths, unauthorised buildings and hoardings",
    "Public Buildings & Amenities": "Community halls, libraries, public buildings and benches",
    "Government Services": "Delayed certificates and licences, bribes, unresponsive offices",
    "Other": "Anything that does not fit the categories above",
}

CATEGORIES: List[str] = list(CATEGORY_TO_DEPARTMENT.keys())
DEPARTMENTS: List[str] = sorted(set(CATEGORY_TO_DEPARTMENT.values()))

# ---------------------------------------------------------------------------
# Keyword rules
#
# Entry syntax (see _rule_regex):
#   "garbage"          the word; a trailing s/es is accepted ("garbages", "benches")
#   "leak*"            a prefix: leak, leaks, leaking, leakage
#   "water ~ leak*"    both terms within a few words of each other, either order,
#                      so "water leakage" and "leaking water pipe" both match
#   "?park"            WEAK: worth half as much, so a generic word alone in the
#                      description is not enough to pick a category
#
# Rules are scored, not first-match: each category sums the entries it matched,
# an entry matching the TITLE counts double (it is the citizen's own summary of
# the problem), and the highest total wins. A total below MIN_CATEGORY_SCORE
# means nothing fits well enough, and the complaint is filed as "Other".
# ---------------------------------------------------------------------------

# Order only breaks exact ties: more specific categories come first.
CATEGORY_KEYWORDS: List[Tuple[str, List[str]]] = [
    ("Flooding & Waterlogging", [
        "flood*", "waterlog*", "water logg*", "water ~ logg*", "inundat*", "submerg*",
        "under water", "underpass ~ water", "low lying", "knee deep", "waist deep",
        "rain water ~ stand*", "rain water ~ accumulat*", "rain water ~ stagnat*",
        "rain water ~ stuck", "rain water ~ drain*", "rain water ~ collect*",
        "rainwater ~ stand*", "rainwater ~ accumulat*", "rainwater ~ stagnat*",
        "rainwater ~ stuck", "rainwater ~ drain*", "rainwater ~ collect*",
        "water ~ accumulat*", "water ~ entering ~ house*", "water ~ entered ~ house*",
        "ankle deep", "water ~ fills", "water ~ inside ~ shop*", "water ~ inside ~ house*", "water ~ inside ~ home*",
        "pump* ~ out ~ water", "no outlet", "?monsoon",
    ]),
    ("Sewage", [
        "sewage*", "sewer*", "drain*", "gutter*", "manhole*", "nala*", "nullah*",
        "nali*", "naali*", "ganda pani", "badbu ~ nali",
        "septic*", "choke*", "clog*", "black water", "foul ~ drain*",
        "overflow* ~ drain*", "overflow* ~ sewer*", "overflow* ~ gutter*",
        "overflow* ~ manhole*", "?blocked",
    ]),
    ("Public Toilets", [
        "toilet*", "urinal*", "latrine*", "shauchalay*", "sulabh*", "restroom*",
        "lavator*", "loo", "commode*", "washroom ~ dirty", "washroom ~ locked",
        "?washroom*", "water ~ toilet*", "open defecation", "defecat*", "public ~ toilet*",
    ]),
    ("Water Supply", [
        "water supply", "water ~ supply*", "no water", "tap water", "drinking water",
        "water pipe*", "water pipeline*", "pipeline*", "pipe ~ leak*", "pipe ~ burst",
        "water ~ leak*", "water pressure", "low pressure",
        "water tanker*", "tanker*", "borewell*", "bore well*", "handpump*", "hand pump*",
        "?pani*", "pani ~ nahi", "pani ~ nahin", "pani ~ pipe", "pani ~ supply", "pani ~ tanki", "pani ~ tanker", "supply ~ water", "taps ~ dry",
        "water ~ dirty", "water ~ yellow", "water ~ smell*", "dirty water",
        "muddy water", "contaminated water", "water quality", "water connection*",
        "water meter*", "water tank*", "water ~ timing*", "water ~ not coming",
        "tap ~ dry", "tap ~ no water", "municipal water", "water bill*", "?tap",
    ]),
    ("Power Supply", [
        "power cut*", "power outage*", "power failure*", "power ~ supply*",
        "power ~ fluctuat*", "power ~ restore*", "no power", "no electricity",
        "electricity ~ cut*", "electricity ~ outage*", "electricity ~ failure*",
        "electricity ~ not ~ available", "electricity ~ not ~ coming",
        "electricity ~ gone", "electricity ~ supply*", "electricity ~ bill*",
        "electricity ~ meter*", "electric ~ meter*", "electric ~ bill*",
        "no current", "current ~ gone", "current ~ cut", "current ~ off", "?current",
        "load shedding", "voltage*", "transformer*", "meter reading*", "blackout*",
        "bijli*", "?meter",
    ]),
    ("Street Light", [
        "street light*", "streetlight*", "street lamp*", "streetlamp*", "lamp post*",
        "lamppost*", "light pole*", "dark street*", "street ~ dark", "lane ~ dark",
        "lights ~ dead", "lights ~ out", "light ~ dead", "lights ~ glow*", "dark ~ road", "dark ~ path", "dark ~ colony", "dark ~ sunset", "dark ~ evening", 
        "pitch dark", "no lights", "no lighting", "bulb ~ fuse*", "lights ~ dim",
        "lights ~ off", "lights ~ not ~ working", "lights ~ flicker*", "lights ~ timer*",
        "lights ~ switch*", "lights ~ burning", "?lamp*",
    ]),
    ("Traffic & Signals", [
        "traffic signal*", "traffic light*", "traffic light ~ not ~ working",
        "signal ~ not ~ working", "signal ~ off", "signal ~ broken", "signal ~ green",
        "signal ~ red", "signal ~ timing*", "signal ~ timer*", "signal ~ blink*",
        "signal ~ flicker*", "signal lamp*", "zebra crossing*", "pedestrian crossing*",
        "traffic jam*", "congestion", "heavy traffic", "traffic ~ heavy",
        "traffic police*", "traffic policeman", "illegal parking", "wrong parking",
        "parked ~ blocking", "parked ~ both sides", "parking ~ blocking",
        "vehicles ~ stuck", "stuck ~ junction", "stuck ~ crossing", "stuck ~ chowk", "chowk ~ jam", "red light*", "green light*", "signal ~ dead", "lane discipline", "traffic cop*", "need ~ cop", "red light ~ dead", "red light ~ off", "red light ~ not", "red light ~ glow*", "?cop",
        "parking lot*", "parking space*", "parking ~ shortage", "parking ~ needed",
        "to park", "cannot park", "can't park",
        "wrong side", "one way", "sign board*", "signboard*", "road sign*",
        "no entry", "jump* ~ signal*", "rash driving", "over speeding", "overspeeding",
        "?signal*", "?traffic",
    ]),
    ("Public Transport", [
        "public transport", "bus stop*", "bus shelter*", "bus stand*", "bus route*",
        "bus service*", "bus ~ late", "bus ~ delay*", "bus ~ not coming", "bus ~ irregular",
        "bus ~ overcrowd*", "bus ~ crowded", "bus ~ skipping", "bus ~ conductor*",
        "bus ~ driver*", "bus ~ fare*", "bus ~ timetable*", "bus ~ start*", "bus ~ stop",
        "stopped running", "service ~ discontinu*", "route ~ discontinu*", "metro*", "share auto*",
        "conductor*", "timetable*", "route ~ bus", "auto rickshaw*", "autorickshaw*",
        "rickshaw*", "auto driver*", "auto ~ meter", "taxi*", "cab driver*",
        "meter ~ refus*", "overcharg* ~ fare*", "overcharg* ~ auto", "overcharg* ~ taxi",
        "overcharg* ~ bus", "?bus", "?fare*",
    ]),
    ("Pothole", [
        "pothole*", "pot hole*", "crater*", "gaddha*", "gadda*", "gadde*",
        "pit ~ road", "hole ~ road", "pits ~ lane",
        "road ~ dip", "road ~ depression", "khadda*", "khadde*", "ditch*", "sinkhole*",
        "sunken road", "road ~ sank", "road ~ cave*", "cave in", "tar ~ come off",
    ]),
    ("Road Damage", [
        "road damage*", "damaged road*", "broken road*", "bad road*", "uneven road*",
        "bumpy road*", "road repair*", "speed breaker*", "speed bump*",
        "road ~ broken", "road ~ damaged", "road ~ crack*", "road ~ repair*",
        "road ~ washed", "road ~ bumpy", "road ~ uneven", "road ~ dug", "road ~ resurfac*",
        "road ~ loose stones", "road ~ eroded",
        "tar ~ peel*", "road ~ peel*", "road surface ~ peel*", "sadak ~ kharab", "?gravel",
        "footpath ~ broken", "footpath ~ damaged", "footpath ~ tiles", "footpath ~ uneven",
        "pavement ~ broken", "pavement ~ damaged", "pavement ~ tiles", "pavement ~ uneven",
        "street ~ broken", "lane ~ broken", "lane ~ damaged",
        "bridge ~ broken", "bridge ~ damaged", "bridge ~ railing*", "bridge ~ crack*",
        "flyover ~ crack*", "flyover ~ damaged", "?footpath", "?pavement",
    ]),
    ("Stray Animals", [
        "dogs ~ attack*", "attack* ~ dog*", "street animals", "animals ~ attack*", "kutte*", "kutta", "gai", "saand",
        "stray*", "street dog*", "dog bite*", "bitten ~ dog*", "bite* ~ dog*", "rabies",
        "rabid", "cattle", "cow", "bull", "buffalo*", "monkey*", "langur*", "donkey*",
        "pig", "sterilis*", "sterilizat*", "animal ~ menace", "animal ~ control",
        "animal ~ shelter", "dogs ~ chase*", "dogs ~ bark*", "?dog", "?bark*",
    ]),
    ("Public Health", [
        "mosquito*", "dengue", "malaria", "chikungunya", "typhoid", "cholera", "jaundice",
        "outbreak*", "epidemic*", "fogging", "fumigat*", "larva*", "diarrh*", "vomiting",
        "stagnant water", "breeding", "unhygienic*", "unhygenic*", "hygiene",
        "food poisoning", "adulterat*", "expired ~ food", "expired ~ biscuit*",
        "expired ~ packaged", "expired ~ medicine*", "expired ~ milk",
        "food ~ stale", "food ~ unhygienic", "cockroach*", "pest*", "infest*", "rat",
        "vaccin*", "health ~ camp*", "health ~ team*", "health ~ check*",
        "health ~ centre*", "health ~ center*", "health ~ officer*", "hospital ~ dirty",
        "hospital ~ unhygienic", "fever ~ spreading", "?sick",
    ]),
    ("Air & Water Pollution", [
        "soot*", "black powder", "plant ~ smoke", "ash ~ falling",
        "air pollution", "smoke*", "smoky", "smog", "fume*", "toxic*", "chemical*",
        "effluent*", "emission*", "factory*", "foam", "dead fish", "fish ~ dying",
        "burn* ~ garbage", "burn* ~ waste", "burn* ~ plastic", "burn* ~ tyre*",
        "burn* ~ tire*", "burn* ~ leaves", "burn* ~ crop*", "industrial ~ waste",
        "industrial ~ discharge", "industrial ~ smoke", "lake ~ polluted", "lake ~ dirty",
        "lake ~ green", "lake ~ foam", "river ~ polluted", "river ~ pollution",
        "river ~ dirty", "river ~ effluent*", "pond ~ contaminat*", "pond ~ polluted",
        "pond ~ dirty", "oil ~ spill*", "oil ~ pond", "oil ~ river", "contaminat* ~ river",
        "contaminat* ~ lake", "air quality", "brick kiln*",
        "dust ~ construction", "?pollut*", "?dust",
    ]),
    ("Noise Pollution", [
        "drum*", "silencer*", "cannot ~ rest", "songs ~ night", "songs ~ till",
        "noise*", "noisy", "loudspeaker*", "loud speaker*", "loud ~ music", "loud ~ volume",
        "loud ~ sound", "loud ~ speaker*", "music ~ late", "music ~ midnight",
        "dj", "honk*", "horn", "sound pollution", "decibel*", "cannot sleep",
        "can't sleep", "cant sleep", "disturb* ~ sleep", "disturb* ~ students",
        "disturb* ~ study", "disturb* ~ exam*", "firecracker*", "crackers",
        "generator ~ noise", "generator ~ sound", "generator ~ loud", "deafening",
        "stage program*", "amplifier*", "?sound",
    ]),
    ("Waste Management", [
        "garbage*", "trash*", "rubbish*", "litter*", "dustbin*", "dust bin*", "solid waste",
        "waste ~ collect*", "waste ~ dump*", "waste ~ pile*", "waste ~ pick*",
        "sweep*", "swept", "sweeper*", "street cleaning", "cleaning ~ street",
        "dump yard", "dumpyard", "dumping*", "dump ~ roadside", "debris*", "rubble",
        "not collected", "not picked", "kachra*", "kooda*", "safai*", "dead animal*",
        "carcass*", "dead ~ dog", "dead ~ cow", "dead ~ cat", "landfill*", "bin ~ overflow*",
        "bin ~ full", "bin ~ empty", "pickup", "pick up", "door to door", "collect* ~ house", "?bin",
        "pile ~ garbage", "?waste", "?dump*", "?cleaning",
    ]),
    ("Encroachment & Illegal Construction", [
        "extended ~ road", "extended ~ footpath", "beyond ~ boundary", "boundary ~ road", "counters ~ road", "occup* ~ road", "occup* ~ lane",
        "encroach*", "illegal ~ construction", "illegal ~ building", "illegal ~ structure",
        "illegal ~ shop*", "illegal ~ stall*", "illegal ~ hoarding*", "illegal ~ floor*",
        "illegal ~ extension*", "unauthori* ~ construction", "unauthori* ~ structure",
        "unauthori* ~ hoarding*", "unauthori* ~ building", "unauthori* ~ shop*",
        "unauthori* ~ stall*", "unauthori* ~ balcony", "hawker*", "street vendor*",
        "vendor* ~ block*", "vendor* ~ occupy*", "squatter*", "hoarding*",
        "without ~ permission", "without ~ approval", "without ~ sanction", "sanction plan",
        "building ~ violat*", "violat* ~ sanction", "violat* ~ norms", "extra floor*",
        "occupied ~ footpath", "occupied ~ road", "occupied ~ pavement", 
        "footpath ~ goods", "public land", "government land",
        "stall* ~ occup*", "shed ~ built", "?illegal*", "?banner*",
    ]),
    ("Parks & Recreation", [
        # "nowhere to park" / "do not park" is a verb about parking, not a park.
        "re:(?<!to )(?<!not )park",
        "?garden*", "garden ~ gate", "garden ~ locked", "garden ~ dirty", "garden ~ broken",
        "garden ~ maintain*", "garden ~ neglect*", "garden ~ municipal", "garden ~ public",
        "playground*", "play area*", "swing*", "tree", "branch*", "trimming",
        "fallen tree", "tree ~ fell", "tree ~ fallen", "tree ~ cut", "grass", "lawn*",
        "mow*", "weeds", "overgrown", "greenery", "plant ~ trees", "sapling*", "plantation",
        "jogging track*", "open gym", "gym equipment", "horticulture", "?bench*", "?slide",
    ]),
    ("Public Buildings & Amenities", [
        "bhawan*", "bhavan*", "panchayat ~ hall", "panchayat ~ building", "reading room*",
        "community hall*", "community centre*", "community center*", "town hall",
        "public building*", "municipal ~ building*", "municipal ~ library", "municipal ~ auditorium",
        "municipal ~ school", "municipal ~ hall", "office building", "librar*", "auditorium*",
        "anganwadi*", "school building*", "hall ~ roof", "hall ~ repair*", "hall ~ paint*",
        "hall ~ leak*", "hall ~ maintenance", "building ~ repair*", "building ~ maintenance",
        "building ~ dirty", "building ~ paint*", "building ~ dilapidated", "walls ~ paint*",
        "windows ~ broken", "roof ~ leak*", "furniture ~ broken", "statue*", "monument*",
        "memorial*", "public ~ bench*", "public ~ square", "public ~ fountain",
        "public ~ amenit*", "amenit*", "repaint*", "crematorium*", "cemetery", "graveyard",
        "burial ground", "dharamshala*", "night shelter*", "?bench*", "?hall",
    ]),
    ("Government Services", [
        "chai paani", "chaipani", "speed money", "file ~ lying", "lying ~ office", "lying ~ officer", "lying ~ desk", "officer ~ not ~ respond*",
        "certificate*", "licen*", "property tax*", "house tax*", "tax ~ bill*", "tax ~ assessment",
        "pension*", "ration card*", "aadhaar*", "aadhar*", "voter ~ id", "mutation", "khata",
        "bribe*", "bribery", "corrupt*", "kickback*", "asking ~ money", "demand* ~ money",
        "demand* ~ bribe", "clerk*", "staff ~ rude", "rude ~ official*",
        "no response", "nobody ~ repl*", "not ~ respond*", "unresponsive", "red tape",
        "application ~ pending", "application ~ delay*", "application ~ rejected",
        "pending ~ months", "pending ~ weeks", "file ~ stuck", "building plan ~ pass*",
        "building plan ~ approval", "subsidy", "scholarship*", "delay ~ certificate*",
        "delay ~ approval", "office ~ staff", "official* ~ not ~ correct*", "?official*",
        "?office",
    ]),
    ("Public Safety", [
        "accident*", "collaps*", "theft*", "thief", "thieves", "robber*", "burglar*",
        "crime*", "harass*", "eve teas*", "molest*", "assault*", "stalk*", "murder*",
        "fire*", "fire brigade", "fire hydrant", "cctv", "chain snatch*", "drunk*",
        "police", "patrol*", "building ~ leaning", "building ~ tilted", "old building ~ fall*",
        "unsafe ~ building", "?unsafe", "?danger*", "?hazard*", "?risk*", "?fight*",
    ]),
]

# A category needs at least this much evidence, AND at least one strong rule to
# have matched. Weak rules (marked "?") only corroborate; a generic word such as
# "waste" in "what a waste of my time" must never file a complaint by itself.
MIN_CATEGORY_SCORE = 2

# Text that is not a complaint at all: thanks, praise, adverts. Each match takes
# points off whatever category the rules would otherwise pick, so a lone stray
# keyword ("garden furniture for sale") falls back to Other, while a real
# complaint with several hits survives a polite "thanks".
NON_GRIEVANCE_CUES: List[str] = [
    "for sale", "thank*", "lovely", "beautiful", "well kept", "advertis*",
    "congratulat*", "appreciat*",
]

# Hazards that decide the routing on their own, whatever else the complaint
# mentions. A snapped conductor over a footpath is an electrical emergency, not
# a footpath repair. Kept deliberately narrow: only terms that are dangerous in
# every context belong here, never modifiers like "unsafe" or "hazard" that
# merely qualify some other issue.
OVERRIDING_HAZARDS: List[str] = [
    "bare wire*", "bare cable*", "naked wire*", "naked cable*", "live wire*", "live cable*", "live current", "open wire*", "loose wire*",
    "hanging wire*", "broken wire*", "snapped wire*", "fallen wire*", "exposed wire*",
    "electric* wire", "electric* cable", "power cable*",
    "wire* ~ expos*", "cable* ~ expos*", "wire* ~ snapped", "cable* ~ snapped",
    "wire* ~ hanging", "cable* ~ hanging", "wire* ~ loose", "cable* ~ loose",
    "wire* ~ fallen", "cable* ~ fallen", "wire* ~ sparking", "wire* ~ dangling",
    "cable* ~ dangling", "electric* ~ shock*", "electrocut*", "sparking",
    "short circuit*", "gas leak*", "gas cylinder ~ leak*", "smell ~ gas",
    "explosion*", "building collapse*", "wall collapse*", "roof collapse*",
    "open manhole*", "uncovered manhole*", "manhole ~ uncovered", "manhole ~ cover ~ missing",
    "uncovered drain*", "open borewell*", "open pit ~ children",
    "caught fire", "on fire", "big fire", "fire broke*", "fire in", "burning building",
]

# Signals that push a grievance up the priority scale. Weighted because
# "children are getting sick" should outrank a bare "urgent".
CRITICAL_SIGNALS: Dict[str, int] = {
    "death": 45, "died": 45, "fatal": 45, "electrocution": 45,
    "electrocuted": 45, "live wire": 40, "collapse": 40, "collapsed": 35,
    "fire": 35, "gas leak": 40, "explosion": 40, "drowning": 40,
    "epidemic": 35, "outbreak": 35, "dengue": 30, "malaria": 30,
    "cholera": 35, "poisoning": 35, "contaminated": 30, "sewage mixing": 35,
    "typhoid": 30, "diarrhea": 25, "diarrhoea": 25, "vomiting": 25,
    "falling sick": 25, "getting sick": 25, "falling ill": 25,
    "getting ill": 25, "sick": 18, "ill": 15, "illness": 20,
    "infection": 22, "rashes": 18, "skin rash": 18,
    "accident": 30, "injured": 30, "injury": 25, "bleeding": 30,
    "emergency": 30, "life threatening": 40, "hospital": 20,
    "children": 20, "school": 15, "elderly": 15, "pregnant": 20,
    "no water for": 25, "days without": 25, "week without": 30,
    "dog bite": 30, "bitten": 25, "rabies": 30, "inundated": 25, "stranded": 25,
}

MODERATE_SIGNALS: Dict[str, int] = {
    "urgent": 18, "immediately": 15, "asap": 15, "serious": 12,
    "dangerous": 20, "risk": 15, "hazard": 18, "unsafe": 18,
    "repeatedly": 12, "again and again": 12, "several times": 12,
    "months": 12, "weeks": 10, "no response": 12, "ignored": 12,
    "complaint": 4, "please": 2, "suffering": 15, "unbearable": 15,
    "overflowing": 12, "blocked": 8, "stagnant": 12, "mosquito": 12,
    "smell": 8, "stink": 10, "disease": 20,
    "flooded": 20, "knee deep": 15, "bribe": 10, "corruption": 10,
}

# Base priority floor per category: a live sewage overflow starts higher up the
# scale than a park bench complaint even with neutral wording.
CATEGORY_BASE_SCORE: Dict[str, int] = {
    "Public Safety": 4,
    "Water Supply": 3,
    "Sewage": 3,
    "Pothole": 3,
    "Road Damage": 3,
    "Flooding & Waterlogging": 3,
    "Power Supply": 3,
    "Stray Animals": 3,
    "Public Health": 3,
    "Air & Water Pollution": 3,
    "Street Light": 2,
    "Waste Management": 2,
    "Noise Pollution": 2,
    "Traffic & Signals": 2,
    "Public Transport": 2,
    "Public Toilets": 2,
    "Encroachment & Illegal Construction": 2,
    "Government Services": 2,
    "Parks & Recreation": 1,
    "Public Buildings & Amenities": 1,
    "Other": 2,
}

# priority_score (1-5) -> human labels used across the stack.
URGENCY_LEVELS: Dict[int, str] = {
    5: "Critical",
    4: "High",
    3: "Moderate",
    2: "Low",
    1: "Routine",
}

# The portal's Issue schema only accepts low | medium | high.
PORTAL_PRIORITY: Dict[int, str] = {
    5: "high", 4: "high", 3: "medium", 2: "low", 1: "low",
}

# Hours to resolution target, mirrored by the portal's SLA engine.
SLA_HOURS: Dict[int, int] = {5: 24, 4: 48, 3: 120, 2: 168, 1: 240}


# --- rule compilation -------------------------------------------------------

def _term(word: str, plural: bool) -> str:
    """One word as a regex. `*` makes it a prefix; otherwise a plural is allowed."""
    if word.endswith("*"):
        return re.escape(word[:-1]) + r"\w*"
    return re.escape(word) + (r"(?:e?s)?" if plural else "")


def _phrase(text: str) -> str:
    words = text.split()
    parts = [_term(w, plural=(i == len(words) - 1)) for i, w in enumerate(words)]
    return r"\s+".join(parts)


# Up to four words may sit between the two halves of a "a ~ b" rule.
_GAP = r"(?:\W+\w+){0,4}?\W+"


def _rule_regex(entry: str) -> Tuple[int, "re.Pattern"]:
    """Compile a rule entry to (weight, pattern). See the syntax note above."""
    weight = 2
    if entry.startswith("?"):
        weight, entry = 1, entry[1:]

    if entry.startswith("re:"):
        # Escape hatch for the rare rule the mini-syntax cannot express.
        return weight, re.compile(rf"(?<!\w)(?:{entry[3:]})(?!\w)")

    if " ~ " in entry:
        first, *rest = (part.strip() for part in entry.split(" ~ "))
        # Chained "a ~ b ~ c" means a..b..c in that order, any of the gaps small.
        if len(rest) == 1:
            a, b = _phrase(first), _phrase(rest[0])
            body = rf"(?:{a}{_GAP}{b}|{b}{_GAP}{a})"
        else:
            body = _GAP.join(_phrase(p) for p in [first, *rest])
    else:
        body = _phrase(entry)

    return weight, re.compile(rf"(?<!\w)(?:{body})(?!\w)")


def _compile_rules(entries) -> List[Tuple[int, "re.Pattern"]]:
    return [_rule_regex(e) for e in entries]


def _compile_plain(phrases) -> "re.Pattern":
    """Strict word-boundary matcher for the priority signals.

    Plain substring matching silently misfires on civic vocabulary: "street"
    contains "tree" (Parks), "firewood" contains "fire" (critical). Boundaries
    are required for correctness, not tidiness. These map back to a weight by
    their exact text, so - unlike the category rules - they take no wildcards.
    """
    ordered = sorted(phrases, key=len, reverse=True)
    return re.compile(
        r"(?<!\w)(?:" + "|".join(re.escape(p) for p in ordered) + r")(?!\w)"
    )


_CATEGORY_RULES = [(cat, _compile_rules(words)) for cat, words in CATEGORY_KEYWORDS]
_CATEGORY_ORDER = {cat: i for i, (cat, _) in enumerate(CATEGORY_KEYWORDS)}
_HAZARD_RULES = _compile_rules(OVERRIDING_HAZARDS)
_NON_GRIEVANCE_RULES = _compile_rules(NON_GRIEVANCE_CUES)
_CRITICAL_MATCHER = _compile_plain(CRITICAL_SIGNALS)
_MODERATE_MATCHER = _compile_plain(MODERATE_SIGNALS)


def normalise(text: Optional[str]) -> str:
    """Lower-case and flatten separators, so "street-light" and "street  light" agree."""
    lowered = (text or "").lower()
    lowered = re.sub(r"[-_/]+", " ", lowered)
    return re.sub(r"\s+", " ", lowered).strip()


# Words that mean somebody may be hurt. Used only as a routing safety net:
# a grievance that scores as dangerous but matches no category keyword must not
# be filed to General Administration, where nobody owns it.
LIFE_SAFETY_SIGNALS = frozenset({
    "death", "died", "fatal", "electrocution", "electrocuted", "live wire",
    "collapse", "collapsed", "fire", "gas leak", "explosion", "drowning",
    "accident", "injured", "injury", "bleeding", "emergency",
    "life threatening", "poisoning",
})


def safety_net_category(category: str, score: int, signals) -> str:
    """Reroute unclassified-but-dangerous grievances to Public Safety.

    Vocabulary drifts faster than any keyword list: "snapped power cable" is a
    live-wire report that no list anticipated. Leaving it as "Other" sends a
    life-safety issue to General Administration. When the priority signals say
    somebody could be hurt, ownership matters more than precision.
    """
    if category != "Other" or score < 4:
        return category
    if any(s in LIFE_SAFETY_SIGNALS for s in signals):
        return "Public Safety"
    return category


def department_for(category: str) -> str:
    return CATEGORY_TO_DEPARTMENT.get(category, "General Administration")


def score_to_urgency(score: int) -> str:
    return URGENCY_LEVELS.get(score, "Moderate")


def score_to_portal_priority(score: int) -> str:
    return PORTAL_PRIORITY.get(score, "medium")


def taxonomy_payload() -> Dict[str, object]:
    """What the API publishes so no other component keeps its own copy."""
    return {
        "categories": [
            {
                "name": name,
                "department": CATEGORY_TO_DEPARTMENT[name],
                "description": CATEGORY_DESCRIPTIONS.get(name, ""),
            }
            for name in CATEGORIES
        ],
        "departments": DEPARTMENTS,
        "fallback_category": "Other",
    }


# "near the bus stop", "outside the school", "beside the park": what follows one
# of these names WHERE the problem is, not WHAT it is. Up to two words may sit
# between the preposition and the match ("near the colony park").
_LOCATIVE = re.compile(
    r"(?:near|nearby|beside|opposite|outside|behind|adjacent to|next to|in front of|close to)"
    r"\s+(?:\w+\s+){0,2}$"
)


def _evidence(pattern: "re.Pattern", weight: int, headline: str, body: str) -> Tuple[int, bool]:
    """(points, is_strong) for one rule.

    Double for the title, half if it only names a place. A rule counts as
    STRONG evidence only if it is not marked weak and did not merely name a
    place - a mention of "near the bus stop" must not be able to carry a
    category on its own.
    """
    for haystack, factor in ((headline, 2), (body, 1)):
        if not haystack:
            continue
        match = pattern.search(haystack)
        if match:
            points = weight * factor
            strong = weight >= 2
            if _LOCATIVE.search(haystack[:match.start()]):
                points, strong = max(1, points // 2), False
            return points, strong
    return 0, False


def _haystacks(text: str, title: Optional[str]) -> Tuple[str, str]:
    body = normalise(f"{title or ''} {text or ''}" if title and title not in (text or "") else text)
    return body, (normalise(title) if title else "")


def category_evidence(text: str, title: Optional[str] = None) -> Dict[str, Tuple[int, int]]:
    """{category: (points, strong_rule_count)} - exposed so a call can be explained."""
    body, headline = _haystacks(text, title)

    evidence: Dict[str, Tuple[int, int]] = {}
    for category, rules in _CATEGORY_RULES:
        points = strong = 0
        for weight, pattern in rules:
            got, is_strong = _evidence(pattern, weight, headline, body)
            points += got
            strong += 1 if is_strong else 0
        if points:
            evidence[category] = (points, strong)
    return evidence


def category_scores(text: str, title: Optional[str] = None) -> Dict[str, int]:
    return {cat: pts for cat, (pts, _) in category_evidence(text, title).items()}


def keyword_category(text: str, title: Optional[str] = None) -> str:
    """Deterministic classification. Returns 'Other' when nothing fits well enough."""
    body = normalise(f"{title or ''} {text or ''}" if title and title not in (text or "") else text)

    # Decisive hazards outrank whatever infrastructure they happen to sit on.
    if any(pattern.search(body) for _, pattern in _HAZARD_RULES):
        return "Public Safety"

    evidence = category_evidence(text, title)
    if not evidence:
        return "Other"

    # Politeness and adverts take points off; they are not a complaint.
    penalty = 2 * sum(1 for _, pattern in _NON_GRIEVANCE_RULES if pattern.search(body))

    category, (points, strong) = max(
        evidence.items(), key=lambda kv: (kv[1][0], -_CATEGORY_ORDER[kv[0]])
    )
    if strong < 1 or points - penalty < MIN_CATEGORY_SCORE:
        return "Other"
    return category


def heuristic_priority(text: str, category: str) -> Tuple[int, List[str]]:
    """Rule-based 1-5 priority with the signals that produced it.

    Returned alongside the score so the admin dashboard can show *why* a
    grievance was escalated instead of an unexplained number.
    """
    lowered = normalise(text)
    weight = 0
    signals: List[str] = []

    for phrase in set(_CRITICAL_MATCHER.findall(lowered)):
        weight += CRITICAL_SIGNALS[phrase]
        signals.append(phrase)

    for phrase in set(_MODERATE_MATCHER.findall(lowered)):
        weight += MODERATE_SIGNALS[phrase]
        signals.append(phrase)

    # Shouting and pile-ups of exclamation marks carry real signal in citizen
    # complaints, but cap the contribution so they cannot alone reach Critical.
    if text:
        exclamations = min(text.count("!"), 3) * 4
        weight += exclamations
        letters = [c for c in text if c.isalpha()]
        if len(letters) > 15:
            caps_ratio = sum(1 for c in letters if c.isupper()) / len(letters)
            if caps_ratio > 0.6:
                weight += 10
                signals.append("all caps")

    base = CATEGORY_BASE_SCORE.get(category, 2)
    if weight >= 70:
        score = 5
    elif weight >= 45:
        score = 4
    elif weight >= 22:
        score = 3
    elif weight >= 8:
        score = 2
    else:
        score = 1

    # The category floor keeps inherently dangerous grievances from being
    # filed as routine just because the citizen wrote calmly.
    score = max(score, base)
    return min(score, 5), signals[:5]
