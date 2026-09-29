"""Labelled citizen complaints for measuring the category classifier.

Written from a citizen's point of view - short, messy, sometimes Hinglish - and
deliberately NOT derived from the keyword lists. Two splits:

  DEV      used while tuning the rules
  HOLDOUT  never looked at while tuning; measured once at the end, so the
           reported number is not just the rules agreeing with the examples
           they were fitted to

OTHER is a large, first-class part of the set: complaints that fit no civic
category and must be filed as "Other" rather than forced into the nearest one.
Misrouting matters more than falling back, because staff only see their own
department's queue - a wrong department hides the complaint from the people who
could act on it, while "Other" still has an owner.

Each entry is (title, description).
"""

DEV = {
    "Pothole": [
        ("Huge pothole near bus stand", "Vehicles are slowing down and bikes are skidding because of a deep pothole."),
        ("Pothole", "There is a big pothole in front of my house, filled with water after every rain."),
        ("Road has deep pits", "Many pits on the main road near the temple, dangerous for two wheelers."),
        ("Crater on the service road", "A crater has opened up and cars are getting damaged."),
        ("gaddha on road", "bahut bada gaddha hai sadak par, koi thik nahi kar raha"),
        ("Potholes everywhere after monsoon", "The entire lane is full of potholes since the rains, please repair."),
    ],
    "Road Damage": [
        ("Road is completely broken", "The road in our colony is damaged and full of loose stones."),
        ("Footpath tiles broken", "The pavement outside the market has broken tiles and people trip."),
        ("Speed breaker damaged", "The speed breaker near the school has broken and is uneven."),
        ("Road repair needed", "The road was dug for cable laying and never repaired, very uneven surface."),
        ("Cracked road near flyover", "Long cracks have appeared on the road surface near the flyover ramp."),
        ("Bridge railing broken", "The railing of the small bridge over the canal is broken."),
    ],
    "Traffic & Signals": [
        ("Traffic light not working", "The signal at the main crossing has been off since yesterday and there is chaos."),
        ("Zebra crossing faded", "The zebra crossing outside the school has faded and vehicles do not stop."),
        ("Illegal parking blocking road", "Cars are parked on both sides of the lane making it impossible to pass."),
        ("Heavy traffic jam every evening", "There is huge congestion at the junction between 6 and 8 pm, need a traffic policeman."),
        ("Road sign missing", "The one way sign board has fallen and drivers enter from the wrong side."),
        ("Signal timing is wrong", "The pedestrian signal turns green for just 3 seconds, old people cannot cross."),
    ],
    "Public Transport": [
        ("Bus not coming on route 45", "The bus on route 45 has not come for two hours, very irregular service."),
        ("Bus stop shelter broken", "The shelter at the bus stop has no roof and no seating, people stand in the rain."),
        ("Auto rickshaw drivers refusing meter", "Auto drivers refuse to go by meter and charge double fare."),
        ("Overcrowded buses", "The buses to the industrial area are extremely overcrowded in the morning, need more buses."),
        ("Conductor rude", "The bus conductor was rude and did not return the change on the city bus."),
        ("Need a bus route to the hospital", "There is no public transport from our colony to the district hospital, please start a bus."),
    ],
    "Water Supply": [
        ("No water in taps", "We have not got any water supply for three days in our lane."),
        ("Water pipe leaking", "A main water pipeline is leaking on the road and water is being wasted."),
        ("Dirty water coming from tap", "The tap water is yellow and smells bad, we cannot drink it."),
        ("Low water pressure", "Water pressure is very low on the upper floors since last month."),
        ("Pipeline burst near school", "A pipeline burst and water is flowing on the street."),
        ("Water tanker not sent", "We requested a tanker but none arrived in our society."),
    ],
    "Sewage": [
        ("Drain overflowing", "The drain near the market is overflowing onto the road with a terrible smell."),
        ("Sewer line blocked", "The sewer line in our street is choked and the sewage is coming up in our bathrooms."),
        ("Open drain in front of house", "An open drain runs in front of our houses and breeds flies."),
        ("Gutter clogged with plastic", "The gutter is clogged with plastic and dirty water is spilling."),
        ("Nala overflowing", "The nala behind our colony is overflowing with black water."),
        ("Sewage water on road", "Sewage water is flowing on the main road near the temple."),
    ],
    "Flooding & Waterlogging": [
        ("Waterlogging on main road", "Rain water is not draining and the road is waterlogged, buses are stuck."),
        ("Flooded underpass", "The railway underpass is flooded after every rain and vehicles get stuck."),
        ("Our colony gets flooded", "Whenever it rains heavily our whole colony gets flooded, water enters homes."),
        ("Water accumulation near crossing", "Rainwater accumulates at the crossing for days because there is no outlet."),
        ("Flood water entering houses", "Flood water has entered the ground floor houses, need immediate pumping."),
        ("Low lying area inundated", "The low lying area near the river is inundated, families are stranded."),
    ],
    "Waste Management": [
        ("Garbage not collected", "The garbage truck has not come to our street for 10 days."),
        ("Garbage dump on roadside", "People are dumping garbage on the roadside near the bridge and it is spreading."),
        ("Dustbin overflowing", "The public dustbin is overflowing and nobody empties it."),
        ("Street not swept", "The road sweeper does not come and the street is full of dust and leaves."),
        ("Kachra everywhere", "kachra pada hai poore gali me, safai wala nahi aata"),
        ("Dead animal on road", "A dead dog is lying on the road for two days, please remove it."),
    ],
    "Public Toilets": [
        ("Public toilet is dirty", "The public toilet near the bus stand is extremely dirty and unusable."),
        ("Toilet locked", "The community toilet is always locked and the caretaker is absent."),
        ("No water in public toilet", "There is no water supply inside the public toilet block."),
        ("Women's toilet broken doors", "The ladies toilet at the market has broken doors and no latch."),
        ("Need public toilet", "There is no public toilet in the whole market area, people suffer."),
        ("Urinal overflowing", "The urinal at the station is overflowing and stinking."),
    ],
    "Street Light": [
        ("Street light not working", "The street light in our lane has been off for two weeks."),
        ("Dark street at night", "Our street is completely dark at night, there are no lights."),
        ("Lamp post bulb fused", "The bulb on the lamp post near the park has fused."),
        ("Street lights on during day", "Street lights are burning all day and wasting electricity."),
        ("Streetlight flickering", "The streetlight outside my house keeps flickering at night."),
        ("Need more street lights", "Please install street lights on this stretch, it is pitch dark."),
    ],
    "Power Supply": [
        ("Frequent power cuts", "We have power cuts for 6 hours every day in our area."),
        ("Electricity not available since morning", "There is no electricity in our lane since morning and no one is responding."),
        ("Low voltage problem", "Voltage is very low in the evening, our appliances are not working."),
        ("Transformer not working", "The transformer near our society has failed and we have no power."),
        ("Faulty electricity meter", "The electricity meter is running too fast and the bill is very high."),
        ("Power outage in sector 7", "Power outage since last night in sector 7, please restore."),
    ],
    "Public Safety": [
        ("Live wire hanging", "An electric wire snapped and is hanging low near the school gate."),
        ("Open manhole on road", "There is an open manhole without a cover on the main road, very dangerous."),
        ("Accident prone junction", "Many accidents happen at this junction, please make it safer."),
        ("Building about to collapse", "An old building in our lane is leaning and cracks are visible, it might collapse."),
        ("Harassment near bus stop", "Girls are harassed by eve teasers near the bus stop every evening."),
        ("Fire in the dump yard", "There is a big fire in the dump yard and smoke is spreading."),
    ],
    "Stray Animals": [
        ("Stray dogs menace", "A pack of stray dogs chase people and two-wheelers in our lane."),
        ("Dog bite incident", "A stray dog bit a child in our society yesterday."),
        ("Cows on the road", "Stray cattle sit in the middle of the road and cause accidents."),
        ("Monkey menace", "Monkeys are entering houses and snatching food in our colony."),
        ("Too many street dogs", "The number of street dogs has increased a lot, they bark all night."),
        ("Bulls fighting on the main road", "Two stray bulls were fighting on the main road, very scary."),
    ],
    "Public Health": [
        ("Mosquito breeding", "Stagnant water is breeding mosquitoes in our area, please do fogging."),
        ("Dengue cases rising", "Several dengue cases in our building, the area needs fumigation."),
        ("Unhygienic street food", "The street food stalls near the school sell unhygienic food with no cover."),
        ("Fogging not done", "Anti mosquito fogging has not been done in our ward this season."),
        ("Outbreak in the slum", "Many people in the slum have diarrhoea and vomiting, looks like an outbreak."),
        ("Rats and pests", "Rats and cockroaches have infested the market lane, a health risk."),
    ],
    "Air & Water Pollution": [
        ("Burning of garbage", "People burn garbage every night and the smoke is choking us."),
        ("Factory smoke", "The factory next door releases thick black smoke all day."),
        ("Dust from construction", "Heavy dust from construction work is affecting our health, no water sprinkling."),
        ("Lake water polluted", "The lake water has turned green and is full of chemical foam."),
        ("River pollution", "Industrial effluent is being released into the river and fish are dying."),
        ("Bad smell from chemical unit", "A strong chemical smell from the unit is making people sick."),
    ],
    "Noise Pollution": [
        ("Loudspeaker all night", "A loudspeaker plays at full volume till 2 am every day."),
        ("Loud DJ music", "DJ music at the wedding hall is unbearably loud past midnight."),
        ("Constant honking", "Truck drivers honk constantly near the hospital zone."),
        ("Construction noise at night", "Construction machines run at night and we cannot sleep."),
        ("Noise from bar", "The bar below our flat plays loud music till late."),
        ("Firecrackers noise", "Loud firecrackers are being burst late at night every day."),
    ],
    "Parks & Recreation": [
        ("Park not maintained", "The colony park is overgrown with weeds and benches are broken."),
        ("Playground equipment broken", "The swings and slide in the children's playground are broken."),
        ("Fallen tree blocking road", "A tree fell on the road after the storm, please remove it."),
        ("Tree trimming needed", "Branches of the tree are touching the wires and need trimming."),
        ("Park gate locked", "The gate of the municipal garden is locked at all hours."),
        ("Open gym equipment broken", "The open air gym equipment in the park is rusted and broken."),
    ],
    "Encroachment & Illegal Construction": [
        ("Footpath encroachment", "Shopkeepers have occupied the entire footpath with their goods, pedestrians walk on the road."),
        ("Illegal construction next door", "The neighbour is building extra floors without any permission."),
        ("Hawkers blocking road", "Street hawkers have taken over the road near the station and block traffic."),
        ("Unauthorized hoardings", "Illegal hoardings and banners cover the road and are dangerous."),
        ("Encroachment on public land", "Someone has encroached on the public ground and built a shed."),
        ("Illegal shops on road", "Illegal shops have come up on the roadside overnight."),
    ],
    "Public Buildings & Amenities": [
        ("Community hall needs repair", "The roof of our community hall leaks and the walls need paint."),
        ("Library closed", "The municipal library has been closed for months, no staff."),
        ("Municipal school building in poor state", "The municipal school building has cracked walls and broken windows."),
        ("Public bench broken", "Benches at the public square are broken."),
        ("Ward office building dirty", "The ward office building is dirty and has broken furniture and no seating for citizens."),
        ("Statue damaged", "The statue in the square is damaged and needs repair."),
    ],
    "Government Services": [
        ("Birth certificate delayed", "I applied for my child's birth certificate two months ago and it is still pending."),
        ("Bribe demanded", "The clerk at the municipal office demanded a bribe to pass my building plan."),
        ("Property tax error", "My property tax bill is wrong and the office is not correcting it."),
        ("Trade licence pending", "My trade licence renewal has been pending for three months."),
        ("Office staff rude", "The staff at the ward office are rude and never available."),
        ("Pension not received", "My old age pension has not been credited for four months."),
    ],
    "Other": [
        ("Slow internet", "The broadband internet in our area is very slow since last week."),
        ("Landlord dispute", "My landlord is refusing to return my security deposit."),
        ("Petrol pump cheating", "The petrol pump gives less fuel than paid for."),
        ("School fees hike", "The private school has raised fees by 40 percent."),
        ("Thank you", "Thank you to the corporation team for the great work on our street."),
        ("Lost my wallet", "I lost my wallet somewhere near the market, please help."),
        ("Job request", "I am looking for a job, please help me get employment."),
        ("asdfghjkl", "qwerty zxcv"),
        ("Mobile network weak", "The mobile network coverage is very poor in our house."),
        ("Neighbour quarrel", "My neighbour and I had an argument about our children fighting."),
        ("Cricket tournament advice", "We want to organise a cricket tournament and need some advice."),
        ("Suggestion", "I think the city should have more cultural festivals every year."),
        ("Wedding invitation", "Please come to my daughter's wedding on Sunday."),
        ("Bank account frozen", "My bank has frozen my account without any reason."),
        ("Cinema ticket prices", "Cinema ticket prices at the multiplex are too high."),
        ("Weather", "It is too hot these days, government should do something."),
        ("Test", "This is a test complaint ignore it."),
        ("Need help with college admission", "I need help getting admission to a good college."),
        ("Delivery not received", "My online order was not delivered even after 10 days."),
        ("Colour of my house", "What colour should I paint my house?"),
    ],
}

HOLDOUT = {
    "Pothole": [
        ("Deep hole in road", "There is a deep hole in the middle of the road near the signal, an accident waiting to happen."),
        ("Pothole on Nehru Marg", "Water collects in a big pothole and two-wheelers fall daily."),
        ("Broken tar with big pothole", "Tar has come off and a big pothole formed outside the school."),
    ],
    "Road Damage": [
        ("Road washed away", "The heavy rain washed away one side of the road in our village lane."),
        ("Uneven road surface", "The road is very bumpy and uneven since the last resurfacing was done badly."),
        ("Damaged pavement", "The footpath is broken and unusable for pedestrians and wheelchairs."),
    ],
    "Traffic & Signals": [
        ("No traffic police at junction", "There is no traffic police at the busy crossing during peak hours and vehicles jump signals."),
        ("Wrong side driving", "Vehicles keep coming from the wrong side on the one-way road near the market."),
        ("Signal only blinking", "The signal at the crossing only blinks yellow all day, drivers are confused."),
    ],
    "Public Transport": [
        ("Bus timetable not displayed", "The bus stop has no timetable or route board so passengers don't know when the next bus comes."),
        ("City bus skipping stops", "City buses do not stop at the stop near the college even when people wave."),
        ("Taxi drivers overcharging at station", "Taxi drivers at the railway station charge extra from tourists and refuse the meter."),
    ],
    "Water Supply": [
        ("Water Leakage near park", "Water leakage from the road pipe near the park."),
        ("Water supply timing", "The water comes only at 4 am for 10 minutes, please fix the schedule."),
        ("Borewell handpump broken", "The public borewell handpump in our lane is broken and we have no other source."),
    ],
    "Sewage": [
        ("Manhole overflowing", "The manhole is overflowing with dirty water in the lane."),
        ("Choked drainage line", "The drainage line in sector 5 has been choked for a month."),
        ("Sewage smell", "A foul sewage smell comes from the drain by our building all day."),
    ],
    "Flooding & Waterlogging": [
        ("Street under water", "The street is under water since morning rain and nobody has come to pump it out."),
        ("Rainwater not draining", "Rainwater does not drain from our lane and stands knee deep for hours."),
        ("Water logging near school gate", "Every monsoon there is water logging outside the school gate."),
    ],
    "Waste Management": [
        ("Construction debris on footpath", "A pile of construction debris has been dumped on the footpath for weeks."),
        ("No dustbins in market", "There are no dustbins in the market so people throw waste on the road."),
        ("Trash pile behind hotel", "A huge trash pile behind the hotel is stinking and attracting rats."),
    ],
    "Public Toilets": [
        ("Sulabh toilet not clean", "The Sulabh toilet complex is not cleaned by the staff and charges money."),
        ("Toilets in park closed", "The toilets inside the municipal park are closed for months."),
        ("Open defecation near railway track", "People are forced to defecate in the open near the railway track since there is no toilet."),
    ],
    "Street Light": [
        ("Main road lights very dim", "The lights on the main road are very dim."),
        ("Street light timer faulty", "The street lights switch off at midnight because the timer is faulty."),
        ("No lights on the bridge", "There are no lights on the bridge and it is unsafe to walk after dark."),
    ],
    "Power Supply": [
        ("Voltage fluctuation", "Voltage keeps fluctuating and burnt our fridge compressor."),
        ("Electricity bill wrong", "Meter reading was not taken and we got an inflated electricity bill."),
        ("Power failure in hospital area", "There is a power failure in the hospital area and the generator is not working."),
    ],
    "Public Safety": [
        ("Loose electric cable on footpath", "A loose electric cable is lying on the footpath near the tea stall."),
        ("Theft in colony", "There have been repeated thefts in our colony at night, need police patrol."),
        ("Gas smell from shop", "There is a strong smell of gas from the shop next door, someone should check."),
    ],
    "Stray Animals": [
        ("Aggressive dogs near school", "Aggressive stray dogs near the school gate scare the children."),
        ("Buffaloes blocking street", "Stray buffaloes are roaming in the street and blocking traffic."),
        ("Request for dog sterilisation", "Please arrange sterilisation of stray dogs in our area, the population is exploding."),
    ],
    "Public Health": [
        ("Malaria fever spreading", "Many neighbours have fever and malaria, please send a health team."),
        ("Expired food sold in shop", "A grocery shop is selling expired biscuits and packaged food."),
        ("Health camp request", "Please organise a health check-up camp in our ward for the elderly."),
    ],
    "Air & Water Pollution": [
        ("Vehicle emissions", "Old smoky buses and trucks pollute the air near the school."),
        ("Toxic fumes at night", "Toxic fumes come out of the dyeing unit at night."),
        ("Pond contaminated", "The village pond is contaminated with oil and waste from the workshop."),
    ],
    "Noise Pollution": [
        ("Generator noise", "A big generator runs all day near our window and the sound is deafening."),
        ("Loudspeaker at 4 am", "The loudspeaker starts at 4 am and disturbs the students."),
        ("Sound pollution near hospital", "There is heavy sound pollution from a stage program near the hospital."),
    ],
    "Parks & Recreation": [
        ("Grass overgrown", "The garden is not mowed and snakes are seen in the tall grass."),
        ("Trees needed", "Please plant more trees along our road, it is very hot."),
        ("Jogging track damaged", "The jogging track in the park has broken tiles and roots coming up."),
    ],
    "Encroachment & Illegal Construction": [
        ("Unauthorised structure on pavement", "A small shrine-like structure has been built on the pavement without approval."),
        ("Building violation", "This building violates the sanction plan with an unauthorised balcony over the road."),
        ("Stalls occupying the street", "Food stalls have illegally occupied the entrance and the street."),
    ],
    "Public Buildings & Amenities": [
        ("Please repaint the community hall", "The community hall walls have faded paint and look shabby."),
        ("Anganwadi building needs repair", "The anganwadi building roof leaks and the floor is broken."),
        ("Auditorium needs maintenance", "The municipal auditorium has broken seats and a leaking ceiling."),
    ],
    "Government Services": [
        ("No response to complaints", "I have complained several times to the corporation but nobody replies."),
        ("Ration card correction", "My ration card has wrong names and the officials are not correcting them."),
        ("Death certificate", "I need a death certificate for my father and the office keeps asking for money."),
    ],
    "Other": [
        ("Cable TV not working", "Cable TV connection has been down for two days."),
        ("Rent increase", "The owner has raised my rent suddenly."),
        ("Restaurant service slow", "The restaurant near the station has very slow service."),
        ("Income tax query", "I have a query about filing my income tax return."),
        ("Hello", "Hello, is anyone there?"),
        ("Movie recommendation", "Can you suggest a good movie?"),
        ("Gym membership refund", "The gym is not refunding my membership fee."),
        ("Cricket bat lost", "I lost my cricket bat at the ground."),
        ("Flight delayed", "My flight was delayed by five hours."),
        ("Exam results", "My exam results have not been declared by the university."),
    ],
}


def flatten(split):
    """[(title, description, expected_category), ...]"""
    return [(t, d, label) for label, items in split.items() for t, d in items]
