// The survival guide. Each step pairs confirmed science (with a source) with proposed
// procedures, which are our suggestions and have never been tested on Mars.
// `widget` names an interactive piece in src/components/guide/.

export const PRIORITY = ['air', 'pressure', 'heat', 'power']
export const PRIORITY_LABEL = {
  air: { word: 'Air', line: 'Can everyone breathe? Oxygen in, carbon dioxide out.' },
  pressure: { word: 'Pressure', line: 'Is the suit or room holding pressure? Seal it or move.' },
  heat: { word: 'Heat', line: 'Can you stay warm? Mars nights fall far below freezing.' },
  power: { word: 'Power', line: 'Keep air and heat machines running. Switch off everything else.' },
}

export const EMERGENCIES = [
  {
    id: 'leak', name: 'Pressure leak', icon: 'leak', first: 'pressure',
    science: 'Spacecraft have lost pressure before. In August 2018 the space station crew found a tiny hole in a docked Soyuz capsule and sealed it.',
    source: 'soyuz',
    steps: ['Sound the alarm.', 'Put on your suit or move to a sealed room and close the hatch.', 'Find the leak by watching which room loses pressure.', 'Patch it, then tell Earth.'],
  },
  {
    id: 'power', name: 'Power failure', icon: 'power', first: 'power',
    science: 'In 1970 the Apollo 13 crew survived a damaged spacecraft by switching off almost everything and keeping only life support running.',
    source: 'apollo13',
    steps: ['Switch off everything you do not need.', 'Keep the air cleaners and heaters on first.', 'Run from batteries.', 'Turn systems back on one at a time.'],
  },
  {
    id: 'suit', name: 'Suit problem outside', icon: 'suit', first: 'air',
    science: 'In July 2013 water leaked into an astronaut’s helmet during a spacewalk outside the space station. The spacewalk was ended early and he got back inside safely.',
    source: 'eva23',
    steps: ['Say it out loud on the radio.', 'Head for the nearest airlock with your buddy.', 'Switch to backup oxygen if you have it.', 'Do not wait to see if it gets better.'],
  },
  {
    id: 'fire', name: 'Fire or bad air', icon: 'fire', first: 'air',
    science: 'In 1997 a fire broke out on the Mir space station and filled the cabin with smoke. The crew used masks and extinguishers and put it out.',
    source: 'mir',
    steps: ['Sound the alarm and close off the room.', 'Switch off power in that room.', 'Put on masks and use the extinguisher.', 'Test the air before taking masks off.'],
  },
  {
    id: 'dark', name: 'Caught out at sunset', icon: 'dark', first: 'heat',
    science: 'Mars has a thin atmosphere that holds little heat. The planet averages about −63 °C, and nights are colder than days.',
    source: 'marsFacts',
    steps: ['Stop and tell the habitat where you are.', 'Turn on suit heaters and lights; switch off anything else.', 'Walk home on the path you came, not a shortcut.', 'If you cannot walk, stay put and wait for the rover.'],
  },
]

export const STEPS = [
  {
    id: 'danger',
    title: 'The danger',
    question: 'What makes Mars dangerous?',
    lead: 'Mars will not attack you. It simply has nothing you need to stay alive, so you bring it or make it.',
    widget: 'pressure',
    facts: [
      { text: 'Mars air is about 95% carbon dioxide, and the pressure is less than 1% of Earth’s. Without a suit you would pass out in about 15 seconds.', source: 'marsFacts' },
      { text: 'The average temperature is about −63 °C.', source: 'marsFacts' },
      { text: 'A radio message takes between about 3 and 22 minutes to reach Earth, depending on where the planets are. Rockets home can only leave about every 26 months.', source: 'mars24' },
    ],
    procedure: ['Treat every seal as life or death.', 'Never open a hatch or helmet without checking pressure.', 'Always know where the nearest safe room is.'],
    quiz: { q: 'Mars air pressure compared with Earth’s is about…', options: ['Half', 'One tenth', 'Less than one hundredth'], answer: 2 },
  },
  {
    id: 'landing',
    title: 'Landing',
    question: 'What do I do right after landing?',
    lead: 'Landing is not the finish line. Check your shelter is safe before anything else.',
    widget: 'edl',
    facts: [
      { text: 'Landing on Mars takes about seven minutes, from hitting the top of the air at about 19,500 km/h to touching down. It is fully automatic, because Earth is too far away to steer.', source: 'edl' },
      { text: 'A Mars day, called a sol, lasts 24 hours 39 minutes.', source: 'marsFacts' },
    ],
    procedure: ['Stay strapped in until the lander is stable.', 'Check cabin pressure and air.', 'Send Earth a short message: landed, crew OK, systems OK.', 'Watch pressure for 30 minutes to catch slow leaks.', 'No walks outside on the first sol.'],
    quiz: { q: 'Who flies the lander during the last seven minutes?', options: ['Mission control on Earth', 'The lander’s own computer', 'The crew by hand'], answer: 1 },
  },
  {
    id: 'air',
    title: 'Air',
    question: 'Where does my oxygen come from?',
    lead: 'An adult breathes about 0.84 kg of oxygen a day. You can carry it, or make it from Mars air.',
    widget: 'oxygen',
    facts: [
      { text: 'An adult needs about 0.84 kg of oxygen per day.', source: 'o2Need' },
      { text: 'MOXIE, on the Perseverance rover, made oxygen from Martian carbon dioxide: up to 12 grams an hour. It was a small test, not a life-support system.', source: 'moxie' },
    ],
    procedure: ['Watch oxygen and carbon dioxide all the time.', 'Keep at least 7 days of reserve oxygen.', 'Clean carbon dioxide out of the air before it reaches the alarm level.'],
    quiz: { q: 'MOXIE was…', options: ['A life-support system for astronauts', 'A small test that made oxygen from Mars air', 'A plant that grows oxygen'], answer: 1 },
  },
  {
    id: 'water',
    title: 'Water & food',
    question: 'How do I get water and food?',
    lead: 'Recycle every drop. Grow food as a bonus, not as the plan.',
    widget: 'farm',
    facts: [
      { text: 'The space station recovers about 98% of its water from sweat, breath and urine.', source: 'issWater' },
      { text: 'Martian soil contains perchlorate, a toxic salt. It must be removed before soil can grow food.', source: 'perchlorate' },
      { text: 'Water ice exists at the poles and buried under the ground at middle latitudes. Radar on MRO found buried glaciers at places like Deuteronilus Mensae.', source: 'ezWorkshop' },
    ],
    procedure: ['Recycle all water and test it before drinking.', 'Count food in days remaining.', 'Grow plants in water (hydroponics), not in raw Mars soil.'],
    quiz: { q: 'Can you grow potatoes straight in Mars soil?', options: ['Yes, it is like desert sand', 'Not until toxic perchlorate salts are removed', 'Only at night'], answer: 1 },
  },
  {
    id: 'farm',
    title: 'Farmable land',
    question: 'Where on Mars could you grow food?',
    lead: 'Nowhere in the open air. But some places give a sealed greenhouse far more to work with: water you can dig up, and more sun for light and power.',
    widget: 'land',
    facts: [
      { text: 'Mars gets about 43% of the sunlight Earth does: 586 W/m² on average above the air, against 1,361 W/m² at Earth.', source: 'nssdc' },
      { text: 'Martian soil contains perchlorate, a toxic salt, at about half a percent at the Phoenix site. It has to be washed out before soil can grow food.', source: 'perchlorate' },
      { text: 'When Curiosity heated Gale Crater soil, about 2% of its weight came off as water.', source: 'leshin' },
      { text: 'Radar on MRO found buried glacier ice in the middle northern latitudes, at places like Deuteronilus Mensae.', source: 'ezWorkshop' },
    ],
    procedure: ['Land where water is within reach: buried ice first, water-rich minerals second.', 'Wash perchlorate out of any soil before plants touch it, or grow in water instead.', 'Build the farm sealed, pressurised and shielded, and add lamps when the sun is low or dust is high.'],
    quiz: { q: 'What makes a landing site better for farming on Mars?', options: ['Open fields of rich soil', 'Water you can dig up, and plenty of sunlight', 'Being near the poles, where it is coldest'], answer: 1 },
  },
  {
    id: 'shelter',
    title: 'Shelter',
    question: 'How do I stay safe from radiation?',
    lead: 'Mars has no global magnetic field and thin air, so space radiation reaches the ground. Rock and soil above you block it.',
    widget: 'dose',
    facts: [
      { text: 'NASA’s Curiosity rover measured about 0.64 mSv of radiation a day on the surface, and about 1.8 mSv a day inside the spacecraft on the way to Mars.', source: 'rad' },
      { text: 'NASA’s limit for an astronaut’s whole career is 600 mSv.', source: 'nasaStd' },
      { text: 'Orbiters have seen what may be lava tubes on Mars, but none has been explored. They are not a confirmed shelter.', source: 'marsFacts' },
    ],
    procedure: ['Sleep in the best-shielded room.', 'Go inside during solar storms.', 'Keep a personal radiation log.'],
    quiz: { q: 'Where does most of a Mars trip’s radiation dose come from?', options: ['The flight there and back', 'Walking outside', 'The habitat walls'], answer: 0 },
  },
  {
    id: 'time',
    title: 'Mars time',
    question: 'What is a day on Mars like?',
    lead: 'A sol is 39 minutes longer than an Earth day. And Earth is always minutes away.',
    widget: 'time',
    facts: [
      { text: 'A sol lasts 24 hours 39 minutes 35 seconds, so an Earth clock drifts by about 39 minutes every day.', source: 'marsFacts' },
      { text: 'Rover teams have worked on Mars time. Isolation studies such as Mars-500 and HI-SEAS showed fixed routines help crews.', source: 'analog' },
    ],
    procedure: ['Set clocks to sol time.', 'Sleep at the same sol hours.', 'Send Earth full reports: what happened, your plan, what you need.'],
    quiz: { q: 'If you message Earth and wait for the reply, it takes at least…', options: ['A few seconds', 'About 6 minutes', 'A whole day'], answer: 1 },
  },
  {
    id: 'storms',
    title: 'Dust storms',
    question: 'When are dust storms most likely?',
    lead: 'Most big storms come in the same part of the Mars year. Pick a site and a month to see the record.',
    widget: 'storms',
    facts: [
      { text: 'Orbiters cataloged 14,974 dust storms over 8 Mars years. Most began between Ls 140° and 250°, around southern spring and summer.', source: 'mdad' },
      { text: 'Planet-wide storms began near Ls 185° in both 2001 and 2018.', source: 'dustOnset2018' },
      { text: 'The 2018 storm ended solar-powered Opportunity. Curiosity, on a plutonium generator, kept working under a haze opacity above 8.', source: 'curiosity2018' },
    ],
    procedure: ['Check the season before planning a long walk.', 'Keep power and air reserves for days without sun.', 'Read the latest orbiter weather before every walk.'],
    quiz: { q: 'Which part of the Mars year has had the most big dust storms?', options: ['Ls 0–90°, northern spring', 'Ls 140–250°, around southern spring and summer', 'They are spread evenly'], answer: 1 },
  },
  {
    id: 'emergency',
    title: 'Emergencies',
    question: 'What do I do if something breaks?',
    lead: 'Learn the order: air, pressure, heat, power. Everything else can wait.',
    widget: 'drill',
    facts: [
      { text: 'Real crews have survived leaks, fires, power failures and suit problems by following simple rules in order.', source: 'apollo13' },
    ],
    procedure: ['Fix air first.', 'Then pressure.', 'Then heat.', 'Then power.'],
    quiz: { q: 'Your helmet is filling with water during a walk. First move?', options: ['Finish the science stop', 'Call it out and head for the airlock', 'Take the helmet off to look'], answer: 1 },
  },
  {
    id: 'ready',
    title: 'Ready to walk?',
    question: 'Am I ready to walk outside?',
    lead: 'Tick each item only when you could do it without help.',
    widget: 'checklist',
    facts: [],
    procedure: [],
  },
]

export const CHECKLIST = [
  ['Pressure, seals and air quality checked', 'landing'],
  ['Power, heat and radio link confirmed', 'landing'],
  ['Oxygen reserve covers at least 7 days', 'air'],
  ['Water recycling running; ice source known', 'water'],
  ['Food counted in days remaining', 'water'],
  ['Batteries sized for a dust storm', 'shelter'],
  ['Radiation shelter chosen', 'shelter'],
  ['Exercise planned every sol', 'time'],
  ['Suit checked and buddy assigned before every walk', 'emergency'],
  ['Emergency order memorised: air, pressure, heat, power', 'emergency'],
  ['Daily supply log started', 'time'],
  ['Radio windows set; reports written in full', 'time'],
]
