"""An adversarial test set for the category classifier.

DEV and HOLDOUT (category_eval_data.py) can no longer say anything about
real-world accuracy: the rules were written with both in view, so they agree
with them by construction. This set is written the other way round - against
the rules, using vocabulary they do NOT contain - so it errs pessimistic:

  synonyms      "dip in the road" for pothole, "current" for electricity
  typos         "garbadge", "pothol", "drenage"
  Hinglish      "pani nahi aa raha", "kutte", "gaddhe"
  false friends "business" (bus), "waste of time", "parking space", "bench of the court"
  mixed         two problems in one complaint
  terse         one word, no description

Each entry is (title, description, accepted) where `accepted` is one category or
a tuple of acceptable ones (for genuinely ambiguous or mixed complaints).
"Other" among the accepted means falling back is fine.
"""

STRESS = [
    # --- synonyms the rules do not list ------------------------------------
    ("Big dip in the road near my gate", "The road has a deep depression and scooter tyres get stuck in it.", ("Pothole", "Road Damage")),
    ("Tar peeling off", "The surface of the whole stretch is peeling and there is loose gravel everywhere.", ("Road Damage", "Pothole")),
    ("Vehicles stuck for an hour at the chowk", "Every morning nobody can move at Gandhi chowk, we need a cop there.", ("Traffic & Signals",)),
    ("Red light is dead", "The red light at the crossing does not glow at all, people just drive through.", ("Traffic & Signals",)),
    ("The 21A has stopped running", "Our colony had a direct service to the station and it has been discontinued.", ("Public Transport",)),
    ("Our taps are dry since Monday", "Not a drop is coming in our building, please look into it.", ("Water Supply",)),
    ("Ankle deep water in the market", "After just one hour of rain the whole market lane fills with water and shops are affected.", ("Flooding & Waterlogging",)),
    ("Bins are full and pickup never comes", "The guy who is supposed to collect from each house has vanished for two weeks.", ("Waste Management",)),
    ("Lavatory near the market unusable", "It is filthy and there is no light inside, women avoid it.", ("Public Toilets",)),
    ("Lights on our road dead for a month", "The whole road is dark after sunset and women are afraid to walk.", ("Street Light", "Public Safety")),
    ("No current since last night", "The whole street has no current and the office phone is not being picked up.", ("Power Supply",)),
    ("Bare wires touching the fence", "Bare wires are touching the metal fence near the playground and children play there.", ("Public Safety",)),
    ("Dogs attacked a cyclist", "Street animals ran after a man on a bicycle yesterday and he fell and was hurt.", ("Stray Animals", "Public Safety")),
    ("Everyone in our lane has fever", "Fever and body pain since a week in almost every house, could be from the dirty water nearby.", ("Public Health", "Water Supply", "Other")),
    ("Black soot on our balcony", "A black powder settles on everything every morning, comes from the plant nearby.", ("Air & Water Pollution", "Other")),
    ("Drums and songs till 3 am", "There is a procession practice every night and we cannot get any rest.", ("Noise Pollution", "Other")),
    ("Children's play area is filthy", "The play area has broken glass and dog waste, children cannot use it.", ("Parks & Recreation", "Waste Management")),
    ("Shops have extended onto the road", "Shopkeepers have put their counters beyond their boundary, half the lane is gone.", ("Encroachment & Illegal Construction", "Traffic & Signals")),
    ("Panchayat bhawan roof is leaking", "Water drips inside the hall during every rain and the records get wet.", ("Public Buildings & Amenities",)),
    ("My file is stuck at the ward office", "My file has been lying with the same officer for six months and nobody tells me anything.", ("Government Services",)),
    ("Officer asked for chai paani", "The inspector hinted that the work will only move if I pay something extra.", ("Government Services", "Other")),

    # --- typos --------------------------------------------------------------
    ("Streat light is nt working", "the streat light in front of my house is nt working from 10 days", ("Street Light", "Other")),
    ("Pothol on road", "big pothol near the school gate please repair", ("Pothole", "Other")),
    ("garbadge not collcted", "garbadge has not been collcted in our area from many days", ("Waste Management", "Other")),
    ("drenage overflowing", "the drenage near our house is overflowing and smells bad", ("Sewage", "Other")),

    # --- Hinglish -----------------------------------------------------------
    ("pani nahi aa raha", "hamare ghar me do din se pani nahi aa raha, koi sunta nahi", ("Water Supply", "Other")),
    ("bijli nahi hai", "kal raat se poore mohalle me bijli nahi hai", ("Power Supply", "Other")),
    ("kutte bahut hain gali me", "raat ko kutte bhaunkte hain aur bachon ko kaat sakte hain", ("Stray Animals", "Other")),
    ("raste me gaddhe hain", "sadak par bahut gaddhe hain, gaadi chalana mushkil hai", ("Pothole", "Other")),
    ("nali jam ho gayi hai", "ganda pani sadak par aa raha hai, badbu bahut hai", ("Sewage", "Other")),

    # --- false friends: must NOT be forced into a category -----------------
    ("Business is slow", "Since the new mall opened my small business is doing badly.", ("Other",)),
    ("What a waste of my time", "I stood in a queue for three hours for nothing.", ("Other",)),
    ("The bench of the High Court", "My case has been pending before the bench for years.", ("Other",)),
    ("Missing pet", "My dog has been missing since Tuesday, please help me find him.", ("Other",)),
    ("Fire safety drill was great", "Thank you for organising the fire drill at our society, it was very informative.", ("Other", "Public Safety")),
    ("Water bottle thrown at me", "A man threw an empty water bottle at me during the cricket match.", ("Other",)),
    ("Parking space needed", "There is nowhere to park at all in the new market, please build a parking lot.", ("Traffic & Signals", "Other")),
    ("Question about voting", "Where can I check my polling booth for the next election?", ("Government Services", "Other")),
    ("Kids are noisy", "The children next door play cricket in the afternoon and shout a lot.", ("Other", "Noise Pollution")),
    ("Beautiful park", "The park near our house is lovely and well kept, thanks to the gardener.", ("Other", "Parks & Recreation")),
    ("Garden furniture for sale", "I want to sell some garden furniture, where can I advertise?", ("Other",)),

    # --- mixed complaints ---------------------------------------------------
    ("Garbage piled and light is off", "Garbage is piled up near the lamp post and the light there is also off.", ("Waste Management", "Street Light")),
    ("Pothole causing accident", "A pothole on the highway caused a bike accident, the rider is in hospital.", ("Pothole", "Public Safety")),
    ("Broken pipe flooding the road", "A water pipe has burst and the whole road is flooded with clean water.", ("Water Supply", "Flooding & Waterlogging")),
    ("Dog dead near the park", "A dead dog near the park gate is spreading a terrible smell.", ("Waste Management", "Public Health")),

    # --- terse --------------------------------------------------------------
    ("water", "", ("Water Supply", "Other")),
    ("garbage", "", ("Waste Management",)),
    ("road", "", ("Other", "Road Damage", "Pothole")),
    ("help", "", ("Other",)),
    ("fvndifhfiuvewfe", "fvndifhfiuvewfe", ("Other",)),

    # --- all caps and noise -------------------------------------------------
    ("NO WATER SINCE 3 DAYS", "PLEASE HELP US WE HAVE SMALL CHILDREN", ("Water Supply",)),
    ("!!!!!!!", "urgent urgent urgent", ("Other",)),
]
