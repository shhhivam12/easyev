// Top 12 Trending Electric Vehicles in India Catalog & Preloaded Memory Dossiers

export const TOP_12_EVS = Object.freeze([
  // --- ELECTRIC CARS (4) ---
  {
    id: 'tata-punch-ev',
    name: 'Punch.ev',
    company: 'Tata Motors',
    category: 'Electric car',
    badge: 'Trending SUV',
    realImage: '/assets/vehicles/tata-punch-ev.jpg',
    priceMinLakh: 9.99,
    priceMaxLakh: 14.44,
    claimedRangeKm: 421,
    realWorldRangeKm: '290–330 km (City/Highway AC)',
    battery: '25 kWh / 35 kWh (LFP Prismatic)',
    charging: '56 min (10–80% 50kW DC Fast Charge) / 3.3kW-7.2kW AC Home',
    power: '122 PS / 190 Nm',
    acceleration: '0-100 km/h in 9.5s',
    topSpeed: '140 km/h',
    bootSpace: '366 Litres + 14L Frunk',
    groundClearance: '190 mm',
    warranty: '8 Years / 1,60,000 km on Battery & Motor',
    features: ['10.25" HD Harman Infotainment', 'Arcade.ev App Suite', '360° Surround Camera with Blind View', 'Ventilated Front Seats', 'Electronic Parking Brake with Auto Hold', 'Paddle Shifters for Multi-mode Regen', 'Voice-assisted Sunroof'],
    pros: ['Acti.ev dedicated EV architecture', 'Segment-leading 190mm ground clearance for bad Indian roads', 'High safety with 5-star Bharat NCAP rating', 'Feature loaded at under ₹15 Lakh'],
    cons: ['Real-world range drops on continuous 100+ km/h highway speeds', 'Rear middle seat best for children'],
    color3D: 0x18a957, // Signature Empowered Oxide / Emerald Green
    secondaryColor3D: 0x111111, // Gloss black dual tone roof
    modelType: 'suv',
    knowledgePrompt: `You are the dedicated vehicle expert for the Tata Punch.ev by Tata Motors.
Full Specs & Market Intelligence:
- Price: ₹9.99 Lakh to ₹14.44 Lakh (ex-showroom India).
- Battery: 25 kWh (Medium Range - 315 km ARAI) and 35 kWh (Long Range - 421 km ARAI). Real-world range is 220-250 km (MR) and 290-330 km (LR) in Indian city/highway mix with AC.
- Safety: 5-Star Bharat NCAP rating with 6 Airbags standard, ESP, and robust Acti.ev chassis.
- Fast Charging: 10% to 80% in 56 minutes on any 50kW DC fast charger (Tata Power EZ Charge, Jio-bp, Statiq, Zeon). Supports 3.3kW and 7.2kW AC home wallbox.
- Key Highlights: 190mm ground clearance, 366L boot + 14L frunk, 360-degree camera, ventilated front seats, paddle regen.
- Best for: Daily city commuters and small families wanting an affordable compact SUV with zero tailpipe emissions and strong build quality.
Speak warmly, informatively, and concisely in English, Hindi, or Hinglish.`
  },
  {
    id: 'tata-nexon-ev',
    name: 'Nexon.ev',
    company: 'Tata Motors',
    category: 'Electric car',
    badge: 'India’s #1 EV',
    realImage: '/assets/vehicles/tata-nexon-ev.jpg',
    priceMinLakh: 12.49,
    priceMaxLakh: 17.19,
    claimedRangeKm: 489,
    realWorldRangeKm: '340–380 km (City/Highway AC)',
    battery: '30 kWh / 45 kWh (Gen-2 High Energy LFP)',
    charging: '40 min (10–80% 60kW DC Fast Charge) / 7.2kW AC in 6 hrs',
    power: '145 PS / 215 Nm',
    acceleration: '0-100 km/h in 8.9s',
    topSpeed: '150 km/h',
    bootSpace: '350 Litres',
    groundClearance: '190 mm',
    warranty: '8 Years / 1,60,000 km on Battery & Motor',
    features: ['12.3" Cinematic Touchscreen', 'V2V (Vehicle-to-Vehicle) & V2L (Vehicle-to-Load) Charging', 'Full Width Cinematic Horizon LED Bars', 'JBL 9-Speaker Audio with Subwoofer', 'Wireless Android Auto/Apple CarPlay', 'Smart Digital Shifter'],
    pros: ['Proven track record across 70,000+ happy owners in India', 'New 45 kWh battery delivers genuine 350+ km highway range', 'Vehicle-to-Load lets you power appliances / camp gear', 'Refined suspension tuned for Indian roads'],
    cons: ['Rotary gear dial takes a moment to respond when parking quickly', 'Boot space slightly compromised compared to ICE Nexon'],
    color3D: 0x00d2ff, // Creative Ocean / Electric Teal
    secondaryColor3D: 0x0a141e,
    modelType: 'suv',
    knowledgePrompt: `You are the dedicated vehicle expert for the Tata Nexon.ev by Tata Motors.
Full Specs & Market Intelligence:
- Price: ₹12.49 Lakh to ₹17.19 Lakh (ex-showroom India).
- Battery: 30 kWh (Creative/Fearless) and 45 kWh (Empowered+ Long Range). ARAI range is 489 km on the 45 kWh pack; real-world is 340-380 km with full AC.
- Power: 145 PS motor delivering instant 215 Nm torque, 0-100 km/h in 8.9 seconds.
- Tech: Vehicle-to-Load (V2L) and Vehicle-to-Vehicle (V2V) power transfer, 12.3-inch touchscreen, JBL 9-speaker sound system, digital cockpit with navigation mirroring.
- Fast Charging: 10% to 80% in 40 minutes on 60kW DC charger.
- Best for: Families looking for India's benchmark electric compact SUV with long highway range, proven reliability, and extensive service network.
Speak warmly, informatively, and concisely in English, Hindi, or Hinglish.`
  },
  {
    id: 'mg-windsor-ev',
    name: 'Windsor EV',
    company: 'MG Motor India',
    category: 'Electric car',
    badge: 'Aero Lounge',
    realImage: '/assets/vehicles/mg-windsor-ev.jpg',
    priceMinLakh: 13.99,
    priceMaxLakh: 18.39,
    claimedRangeKm: 449,
    realWorldRangeKm: '310–350 km (City/Highway AC)',
    battery: '38 kWh / 52.9 kWh (Prismatic Cell LFP)',
    charging: '55 min (0–80% 45kW DC Fast Charge) / 7.4kW AC in 6.5 hrs',
    power: '136 PS / 200 Nm',
    acceleration: '0-100 km/h in 9.8s',
    topSpeed: '145 km/h',
    bootSpace: '604 Litres Aero Lounge Space',
    groundClearance: '186 mm',
    warranty: 'Lifetime Battery Warranty (for first owner under BaaS) or 8 Years / 1,60,000 km',
    features: ['15.6" Grandview Display', '135° Reclining Aero Lounge Luxury Rear Seats', 'Infinity View Glass Sunroof', 'BaaS (Battery-as-a-Service) Option at ₹3.5/km', 'Wireless Smartphone Charging', 'Smart Flush Door Handles'],
    pros: ['Unmatched rear seat comfort with 135-degree business-class recline', 'Huge 604L boot space', 'Massive 15.6" central entertainment display', 'Available with BaaS starting at ₹9.99L + battery rental'],
    cons: ['Almost all controls moved to touchscreen (few physical buttons)', 'Crossover styling divides opinions'],
    color3D: 0x9b51e0, // Starry Black / Deep Royal Purple
    secondaryColor3D: 0x1a1a2e,
    modelType: 'crossover',
    knowledgePrompt: `You are the dedicated vehicle expert for the MG Windsor EV by MG Motor India.
Full Specs & Market Intelligence:
- Price: ₹13.99 Lakh to ₹18.39 Lakh outright (also available on BaaS - Battery-as-a-Service at ₹9.99 Lakh + ₹3.5/km rental).
- Battery: 38 kWh and 52.9 kWh LFP battery packs. ARAI range up to 449 km; real-world range is 310-350 km in typical Indian conditions.
- Comfort: Known as the "Business Class on Wheels" featuring 135-degree reclining "Aero Lounge" rear seats and a massive 604L luggage trunk.
- Screen: 15.6-inch ultra-high-resolution Grandview infotainment system with Jio apps and wireless Apple CarPlay/Android Auto.
- Warranty: Lifetime battery warranty for first owner (under standard program terms) or 8 years / 1,60,000 km.
- Best for: Chauffeur-driven owners, families prioritizing extreme rear-seat comfort, and urban executives.
Speak warmly, informatively, and concisely in English, Hindi, or Hinglish.`
  },
  {
    id: 'mahindra-xuv400',
    name: 'XUV400 Pro',
    company: 'Mahindra Electric',
    category: 'Electric car',
    badge: 'Fastest in Segment',
    realImage: '/assets/vehicles/mahindra-xuv400.jpg',
    priceMinLakh: 15.49,
    priceMaxLakh: 19.39,
    claimedRangeKm: 456,
    realWorldRangeKm: '320–360 km (City/Highway AC)',
    battery: '34.5 kWh / 39.4 kWh (High-Density NMC Chemistry)',
    charging: '50 min (0–80% 50kW DC Fast Charge) / 7.2kW AC in 6 hrs',
    power: '150 PS / 310 Nm (Fastest in Segment)',
    acceleration: '0-100 km/h in 8.3s',
    topSpeed: '160 km/h',
    bootSpace: '378 Litres',
    groundClearance: '200 mm',
    warranty: '8 Years / 1,60,000 km on Battery and Motor',
    features: ['Dual 10.25" Screens with AdrenoX UI', 'Dual-Zone Automatic Climate Control', 'Copper Accent Styling', 'Fun/Fast/Fearless Drive Modes', 'IP67 Ingress Protection Battery', 'Wireless Phone Charger'],
    pros: ['Class-leading 310 Nm torque and 0-100 in 8.3 seconds', '200mm high ground clearance', 'Spacious 2600mm wheelbase with generous rear legroom', 'High-density NMC battery delivers punchy acceleration'],
    cons: ['Interior plastics could be more premium at ₹19L', 'DC fast charging speed caps around 50 kW'],
    color3D: 0xc87d2b, // Arctic Blue with Satin Copper Roof
    secondaryColor3D: 0x8b4513,
    modelType: 'suv',
    knowledgePrompt: `You are the dedicated vehicle expert for the Mahindra XUV400 Pro EV by Mahindra & Mahindra.
Full Specs & Market Intelligence:
- Price: ₹15.49 Lakh to ₹19.39 Lakh (ex-showroom India).
- Performance: Most powerful in its segment with 150 PS and 310 Nm torque, rocketing 0-100 km/h in just 8.3 seconds.
- Battery: 34.5 kWh (EC Pro) and 39.4 kWh (EL Pro) high-energy NMC battery. ARAI range is 456 km; real-world range is 320-360 km.
- Features: Dual 10.25-inch screens with Mahindra AdrenoX connected car suite, dual-zone climate control, and Alexa built-in.
- Dimensions: 4.2-meter SUV with 2600mm wheelbase, 200mm ground clearance, and 378L boot.
- Best for: Enthusiast drivers who want thrilling instant acceleration, robust Mahindra SUV stance, and generous cabin space.
Speak warmly, informatively, and concisely in English, Hindi, or Hinglish.`
  },

  // --- ELECTRIC SCOOTERS (4) ---
  {
    id: 'ather-rizta',
    name: 'Rizta',
    company: 'Ather Energy',
    category: 'Electric scooter',
    badge: 'Family Electric Scooter',
    realImage: '/assets/vehicles/ather-rizta.jpg',
    priceMinLakh: 1.10,
    priceMaxLakh: 1.49,
    claimedRangeKm: 159,
    realWorldRangeKm: '105–125 km (TrueRange City)',
    battery: '2.9 kWh / 3.7 kWh (IP67 Aluminium Die-cast)',
    charging: '0-80% in 4.5 hrs (Home Pod) / Ather Grid Fast Charging',
    power: '4.3 kW Peak / 22 Nm',
    acceleration: '0-40 km/h in 3.7s',
    topSpeed: '80 km/h',
    bootSpace: '34L Underseat + 22L Frunk (56L Total Storage)',
    groundClearance: '165 mm',
    warranty: '5 Years / 60,000 km with Ather Battery Protect',
    features: ['Largest Seat in Indian Scooter Market', 'SkidControl Traction Control System', 'FallSafe Auto Motor Cutoff', 'Ather DeepView 7" LCD / TFT', 'Emergency Stop Signal (ESS)', 'Magic Twist Regenerative Braking'],
    pros: ['Biggest and most comfortable family seat in India', 'Unmatched 56L combined storage capacity', 'SkidControl prevents slipping on wet or gravel roads', 'Bulletproof Ather reliability and resale value'],
    cons: ['Top speed limited to 80 km/h (family focused, not sporty)', 'TFT touchscreen available only on top variant'],
    color3D: 0x48bb78, // Pangong Blue / Mint Green
    secondaryColor3D: 0x222222,
    modelType: 'scooter',
    knowledgePrompt: `You are the dedicated vehicle expert for the Ather Rizta by Ather Energy.
Full Specs & Market Intelligence:
- Price: ₹1.10 Lakh to ₹1.49 Lakh (ex-showroom India).
- Focus: Purpose-built family scooter designed for supreme comfort, utility, and safety.
- Battery & Range: 2.9 kWh (123 km IDC / 105 km TrueRange) and 3.7 kWh (159 km IDC / 125 km TrueRange).
- Storage: Largest in India - 34 Litres under the seat + optional 22L front trunk organizer bag (56L total).
- Safety Innovations: SkidControl (India's first scooter traction control), FallSafe (cuts motor and flashes hazard lights on tilt), Emergency Stop Signal.
- Charging: Compatible with 2,500+ Ather Grid fast chargers across India (15 km in 10 mins).
- Best for: Families, couples, daily grocery runs, and commuters seeking safe, high-comfort city riding.
Speak warmly, informatively, and concisely in English, Hindi, or Hinglish.`
  },
  {
    id: 'ather-450x',
    name: '450X Gen 3',
    company: 'Ather Energy',
    category: 'Electric scooter',
    badge: 'Sport Performance',
    realImage: '/assets/vehicles/ather-450x.jpg',
    priceMinLakh: 1.47,
    priceMaxLakh: 1.57,
    claimedRangeKm: 161,
    realWorldRangeKm: '110–130 km (Warp/Ride Mode)',
    battery: '3.7 kWh (High-Rate Lithium-ion Pack)',
    charging: '0-80% in 4 hrs 30 min (Home) / Ather Grid Fast Charging',
    power: '6.4 kW Peak / 26 Nm (Warp Mode)',
    acceleration: '0-40 km/h in 3.3s',
    topSpeed: '90 km/h',
    bootSpace: '22 Litres',
    groundClearance: '170 mm',
    warranty: '5 Years / 60,000 km with Ather Battery Protect',
    features: ['7" Touchscreen Dashboard with Google Maps', 'Warp+ Hyper Acceleration Mode', 'Aluminium Chassis with 49:51 Weight Distribution', 'AutoHold Hill Assist', 'Park Assist Reverse Mode', 'AtherStack 6.0 OS'],
    pros: ['Razor-sharp cornering and sports handling', 'Real Google Maps navigation directly on dashboard', 'TrueRange prediction is accurate to within 1-2%', 'Ather Grid fast charging network access across all metros'],
    cons: ['Firm suspension setup tuned for performance over plush comfort', 'Boot space of 22L is smaller than Rizta'],
    color3D: 0xff3b30, // Hyper Red / Lunar Grey
    secondaryColor3D: 0x1a1a1a,
    modelType: 'scooter',
    knowledgePrompt: `You are the dedicated vehicle expert for the Ather 450X by Ather Energy.
Full Specs & Market Intelligence:
- Price: ₹1.47 Lakh to ₹1.57 Lakh (ex-showroom India).
- Persona: India's benchmark sporty electric scooter with sharp aerodynamics and aggressive acceleration.
- Performance: 6.4 kW motor with 26 Nm torque; blasts 0-40 km/h in 3.3 seconds in Warp Mode with a 90 km/h top speed.
- Battery & Range: 3.7 kWh pack delivering 161 km IDC (certified) and 110-130 km TrueRange with air conditioning not applicable.
- Tech: 7-inch IP65 waterproof touchscreen with onboard Google Maps, Bluetooth music & call control, AutoHold hill climb, and AtherStack OTA updates.
- Best for: Young professionals, college students, and performance enthusiasts wanting dynamic handling and premium software.
Speak warmly, informatively, and concisely in English, Hindi, or Hinglish.`
  },
  {
    id: 'tvs-iqube',
    name: 'iQube ST',
    company: 'TVS Motor Company',
    category: 'Electric scooter',
    badge: 'Reliable Family Choice',
    realImage: '/assets/vehicles/tvs-iqube.jpg',
    priceMinLakh: 0.95,
    priceMaxLakh: 1.85,
    claimedRangeKm: 150,
    realWorldRangeKm: '100–120 km (Eco/Power)',
    battery: '2.2 kWh / 3.4 kWh / 5.1 kWh (IP67 TVS Pack)',
    charging: '0-80% in 3 hrs (950W Fast Charger) / 15A Home Socket',
    power: '4.4 kW Peak / 140 Nm Wheel Torque',
    acceleration: '0-40 km/h in 4.2s',
    topSpeed: '82 km/h',
    bootSpace: '32 Litres (Fits 2 Helmets)',
    groundClearance: '157 mm',
    warranty: '3 Years / 50,000 km (Extendable to 5 Years / 70,000 km)',
    features: ['7" Full-Color Touchscreen with Alexa Connectivity', 'Dual Battery Temperature Sensors', 'Regenerative Braking with Q-Park Assist', 'Silent Hub Motor Technology', 'Live Vehicle Tracking & Geofencing'],
    pros: ['Ultra-smooth and silent hub motor ride', 'Wide pan-India TVS dealer and service network', 'Large 32L boot space accommodating two helmets', 'Very comfortable wide seat and neutral riding posture'],
    cons: ['Hub motor accelerates slightly more linearly than mid-drive Ather', 'App sync can occasionally have delays'],
    color3D: 0x3182ce, // Titanium Grey / Coral Blue
    secondaryColor3D: 0x1a202c,
    modelType: 'scooter',
    knowledgePrompt: `You are the dedicated vehicle expert for the TVS iQube by TVS Motor Company.
Full Specs & Market Intelligence:
- Price: ₹0.95 Lakh to ₹1.85 Lakh across 2.2 kWh, 3.4 kWh, and flagship 5.1 kWh variants.
- Powertrain: 4.4 kW silent BLDC hub motor with 140 Nm wheel torque; top speed 82 km/h.
- Range: 150 km IDC on 5.1 kWh pack; 100-120 km real-world on the 3.4 kWh pack.
- Practicality: 32L underseat storage (fits 2 full-size helmets), comfortable plush suspension, USB mobile charger, and wide floorboard.
- Brand Trust: Backed by TVS's 100+ year automotive legacy with over 4,000 service touchpoints across India.
- Best for: Daily commuters, mature buyers, and families seeking maximum peace of mind, silent ride, and trusted dealership backing.
Speak warmly, informatively, and concisely in English, Hindi, or Hinglish.`
  },
  {
    id: 'ola-s1-pro',
    name: 'S1 Pro Gen 2',
    company: 'Ola Electric',
    category: 'Electric scooter',
    badge: 'High Range & Speed',
    realImage: '/assets/vehicles/ola-s1-pro.jpg',
    priceMinLakh: 1.16,
    priceMaxLakh: 1.36,
    claimedRangeKm: 242,
    realWorldRangeKm: '170–195 km (Normal/Eco Mode)',
    battery: '4 kWh (Integrated Hybrid Frame Pack)',
    charging: '0-100% in 6.5 hrs (Home 750W) / Ola Hypercharger Network',
    power: '11 kW Peak Motor / 58 Nm Torque',
    acceleration: '0-40 km/h in 2.6s (Fastest in India)',
    topSpeed: '120 km/h',
    bootSpace: '34 Litres',
    groundClearance: '160 mm',
    warranty: '8 Years / 80,000 km standard battery warranty',
    features: ['MoveOS 4 with Party Mode & Concert Lighting', 'Twin Telescopic Front Suspension', 'Cruise Control & Proximity Unlock', 'Built-in Speakers for Music on the Go', 'Navigation with Hill Hold Assist'],
    pros: ['Fastest accelerating scooter in India (0-40 in 2.6s)', 'Industry-best 242 km claimed / 180+ km real-world range', '8-Year battery warranty included as standard', 'Modern flat floorboard with generous foot room'],
    cons: ['Service center turnaround times can vary across cities', 'Software requires occasional reboot'],
    color3D: 0xed8936, // Amethyst / Passion Red / Jet Black
    secondaryColor3D: 0x171923,
    modelType: 'scooter',
    knowledgePrompt: `You are the dedicated vehicle expert for the Ola S1 Pro Gen 2 by Ola Electric.
Full Specs & Market Intelligence:
- Price: ₹1.16 Lakh to ₹1.36 Lakh (ex-showroom India).
- Class-leading Power: 11 kW mid-drive motor; accelerates 0-40 km/h in 2.6 seconds with an exhilarating 120 km/h top speed.
- Battery & Range: Massive 4 kWh battery delivering 242 km certified range (ARAI) and a realistic 170-195 km in everyday Indian traffic.
- Warranty: Unprecedented 8 Years / 80,000 km standard battery warranty included at no extra cost.
- MoveOS Features: Cruise control, Party Mode light show, built-in external speaker music playback, proximity keyless unlock, document wallet.
- Best for: Tech-savvy riders and long-distance city commuters who want top acceleration, highest range, and loud speakers.
Speak warmly, informatively, and concisely in English, Hindi, or Hinglish.`
  },

  // --- ELECTRIC 3-WHEELERS (COMMERCIAL & PASSENGER) (4) ---
  {
    id: 'mahindra-treo-plus',
    name: 'Treo Plus',
    company: 'Mahindra Last Mile Mobility',
    category: 'Electric 3-wheeler',
    badge: 'India’s #1 Electric Auto',
    realImage: '/assets/vehicles/mahindra-treo-plus.jpg',
    priceMinLakh: 3.58,
    priceMaxLakh: 3.78,
    claimedRangeKm: 170,
    realWorldRangeKm: '135–150 km (Full Passenger Load)',
    battery: '10.24 kWh (LFP Battery with IP67 Ingress Rating)',
    charging: '0-100% in 4 hrs 20 min from Standard 16A 220V Socket',
    power: '8 kW / 42 Nm Torque',
    acceleration: 'Top Speed: 55 km/h',
    topSpeed: '55 km/h',
    bootSpace: 'Under-seat Lockable Luggage Box',
    groundClearance: '142 mm',
    warranty: '5 Years / 1,20,000 km on Battery & Drivetrain',
    features: ['Direct Drive Automatic Transmission', 'Rust-free Sheet Moulded Composite (SMC) Body Panels', 'Regenerative Braking for Extended Range', 'Side Doors for Passenger Safety', 'Telematics with i-MAXX Fleet Tracking'],
    pros: ['Over ₹3,50,000 fuel savings over 3 years compared to CNG auto', 'High strength rust-free composite body that does not dent easily', 'Comfortable king-size driver seat with ample passenger legroom', 'Backed by Mahindra’s massive commercial service network'],
    cons: ['Limited top speed of 55 km/h strictly for city commercial use', 'Basic dashboard display'],
    color3D: 0x38a169, // Mahindra Commercial Green & White
    secondaryColor3D: 0xffffff,
    modelType: 'threewheeler',
    knowledgePrompt: `You are the dedicated vehicle expert for the Mahindra Treo Plus electric auto-rickshaw by Mahindra Last Mile Mobility.
Full Specs & Commercial Intelligence:
- Price: ₹3.58 Lakh to ₹3.78 Lakh (on-road with state EV subsidies and FAME/PM E-Drive).
- Battery & Range: 10.24 kWh advanced LFP battery giving 170 km certified range and a solid 135-150 km real-world range with 3 passengers + driver.
- Charging: Plugs directly into any standard 16 Amp home/shop wall socket; full charge in ~4 hours 20 mins.
- Operating Cost: Just ~50 paise per km compared to ₹3.50/km for CNG and ₹5.50/km for Petrol/Diesel autos, saving drivers ₹10,000+ monthly in fuel.
- Build: Rust-free SMC body panels that withstand dings and harsh Indian weather.
- Warranty: 5 Years or 1,20,000 km standard battery warranty.
- Best for: Auto drivers and fleet operators looking to double their monthly take-home earnings with zero clutch and zero gears fatigue.
Speak warmly, informatively, and concisely in English, Hindi, or Hinglish.`
  },
  {
    id: 'bajaj-re-etec9',
    name: 'RE E-TEC 9.0',
    company: 'Bajaj Auto',
    category: 'Electric 3-wheeler',
    badge: 'Legendary Bajaj Reliability',
    realImage: '/assets/vehicles/bajaj-re-etec9.jpg',
    priceMinLakh: 3.33,
    priceMaxLakh: 3.55,
    claimedRangeKm: 178,
    realWorldRangeKm: '140–155 km (City Driving)',
    battery: '8.9 kWh (Liquid-Cooled IP67 Pack)',
    charging: '0-80% in 3 hrs 45 min (On-Board Charger)',
    power: '4.5 kW Continuous / 36 Nm',
    acceleration: 'Top Speed: 45 km/h',
    topSpeed: '45 km/h',
    bootSpace: 'Luggage Carrier Rack + Driver Storage',
    groundClearance: '180 mm',
    warranty: '5 Years / 1,00,000 km Warranty',
    features: ['2-Speed Automatic Transmission (Hill Assist & Drive Mode)', 'All-Steel Metal Body Construction', 'High Ground Clearance 180mm', 'Tubeless Tyres for Puncture Safety', 'Bajaj Anti-Theft Lock System'],
    pros: ['Traditional full-metal body preferred by classic auto mechanics', 'Unmatched Bajaj spare parts availability in every Indian corner', '2-speed gearbox allows effortless climbing on steep flyovers and ramps', 'Liquid-cooled battery handles extreme 48°C North Indian summers'],
    cons: ['Top speed capped at 45 km/h', 'Slightly higher kerb weight due to all-metal body'],
    color3D: 0xd69e2e, // Classic Bajaj Yellow & Green
    secondaryColor3D: 0x276749,
    modelType: 'threewheeler',
    knowledgePrompt: `You are the dedicated vehicle expert for the Bajaj RE E-TEC 9.0 by Bajaj Auto.
Full Specs & Commercial Intelligence:
- Price: ₹3.33 Lakh to ₹3.55 Lakh (ex-showroom India).
- Trust & Body: Built with Bajaj's iconic all-steel metal body that local mechanics across India know and trust.
- Battery & Cooling: 8.9 kWh IP67 liquid-cooled battery pack engineered specifically for scorching Indian summers (tested up to 50°C).
- Range & Charging: 178 km certified range (140-155 km realistic city range). On-board charger plugs into standard sockets.
- Unique Feature: 2-speed automatic transmission providing high torque hill-climb mode for loaded flyovers and smooth eco cruise.
- Cost Savings: Cuts running costs by up to 75% compared to petrol/CNG autos.
- Best for: Auto operators who swear by Bajaj's legendary durability and want unmatched service availability.
Speak warmly, informatively, and concisely in English, Hindi, or Hinglish.`
  },
  {
    id: 'piaggio-ape-ecity',
    name: 'Ape E-City FX Max',
    company: 'Piaggio Vehicles',
    category: 'Electric 3-wheeler',
    badge: 'Italian Engineering for India',
    realImage: '/assets/vehicles/piaggio-ape-ecity.jpg',
    priceMinLakh: 3.25,
    priceMaxLakh: 3.55,
    claimedRangeKm: 145,
    realWorldRangeKm: '115–130 km (Full City Passenger Load)',
    battery: '8 kWh (Fixed High Efficiency Lithium-ion)',
    charging: '0-100% in 3 hrs 45 min (Standard 16A Socket)',
    power: '5.4 kW / 29 Nm',
    acceleration: 'Top Speed: 50 km/h',
    topSpeed: '50 km/h',
    bootSpace: 'Rear Luggage Compartment',
    groundClearance: '163 mm',
    warranty: '5 Years / 1,75,000 km Best-in-Class Super Warranty',
    features: ['Best-in-Class 1,75,000 km Warranty', 'Advanced Digital Cluster with Distance-to-Empty', 'Hydraulic Brakes with Regenerative Assist', 'High Seating Position for Driver Comfort', 'I-Connect Telematics Support'],
    pros: ['Longest warranty in the 3-wheeler industry (1,75,000 km)', 'Compact turning radius of 2.1m for tight bazaar alleys', 'Low maintenance fixed battery design', 'Comfortable seat cushioning for 12-hour driver shifts'],
    cons: ['Real world range of ~120 km requires lunchtime top-up for very long 200 km shifts', 'Cabin plastics are utilitarian'],
    color3D: 0x319795, // Piaggio Teal / Italian Blue
    secondaryColor3D: 0x1d4044,
    modelType: 'threewheeler',
    knowledgePrompt: `You are the dedicated vehicle expert for the Piaggio Ape E-City FX Max by Piaggio Vehicles India.
Full Specs & Commercial Intelligence:
- Price: ₹3.25 Lakh to ₹3.55 Lakh (ex-showroom India).
- Super Warranty: Industry-leading 5 Years or 1,75,000 km comprehensive warranty coverage.
- Battery & Range: 8 kWh advanced fixed lithium battery providing 145 km certified range (115-130 km real passenger load).
- Manoeuvrability: Ultra-tight 2.1-meter turning radius making it the easiest auto to weave through congested wholesale markets and metro traffic.
- Efficiency: Consumes under 6.5 kWh per 100 km, giving an operational cost of ~45 paise per km.
- Best for: Urban passenger auto drivers who want maximum warranty protection and nimble handling in crowded city lanes.
Speak warmly, informatively, and concisely in English, Hindi, or Hinglish.`
  },
  {
    id: 'euler-hiload',
    name: 'HiLoad EV 2026',
    company: 'Euler Motors',
    category: 'Electric 3-wheeler',
    badge: 'Heavy Commercial Cargo',
    realImage: '/assets/vehicles/euler-hiload.jpg',
    priceMinLakh: 3.94,
    priceMaxLakh: 4.30,
    claimedRangeKm: 170,
    realWorldRangeKm: '120–140 km (Full 688 kg Payload)',
    battery: '13 kWh (Liquid-Cooled ArcReactor 200™ Pack)',
    charging: '15 min Fast Charge for 50 km Range (DC Flash Charge) / 3.5 hrs AC',
    power: '10.96 kW Peak / 88.55 Nm Torque (Highest in India)',
    acceleration: 'Top Speed: 45 km/h (Gradeability: 21% Loaded)',
    topSpeed: '45 km/h',
    bootSpace: '140 cu ft (3.96 cu m) High Deck Container',
    groundClearance: '190 mm',
    warranty: '5 Years / 1,50,000 km Commercial Battery Warranty',
    features: ['Highest Payload Capacity in 3W: 688 kg', 'Liquid-Cooled Battery with Active Thermal Management', 'Flash Charging (50 km in 15 mins)', '200mm Front Disc Brakes', 'Heavy-Duty Reinforced Steel Chassis Frame'],
    pros: ['Gigantic 688 kg payload capacity replaces 4-wheel commercial mini-trucks', 'Liquid cooling prevents battery degradation under heavy cargo loads', 'Flash charging allows mid-day top ups between delivery runs', 'Huge 140 cu.ft cargo container fits furniture, e-commerce pallets, FMCG crates'],
    cons: ['Higher upfront cost than passenger 3-wheelers (offset by high cargo revenue)', 'Heavy commercial vehicle meant strictly for logistics/cargo'],
    color3D: 0xdd6b20, // Industrial Orange & Steel Grey
    secondaryColor3D: 0x2d3748,
    modelType: 'threewheeler',
    knowledgePrompt: `You are the dedicated vehicle expert for the Euler HiLoad EV commercial cargo 3-wheeler by Euler Motors.
Full Specs & Logistics Intelligence:
- Price: ₹3.94 Lakh to ₹4.30 Lakh (ex-showroom India).
- Payload & Capacity: Category leader with 688 kg certified payload and 140 cubic feet cargo container volume (highest in India).
- Power & Torque: Monster 10.96 kW peak motor with 88.55 Nm torque and 21% gradeability for climbing steep warehouse ramps with full load.
- Battery & Cooling: 13 kWh liquid-cooled ArcReactor™ battery pack that delivers consistent range without overheating even in 48°C peak summer.
- Range: 170 km certified (120-140 km with full 688 kg payload).
- Flash Charge: 15 minutes of DC charging gives 50 km range for back-to-back delivery shifts.
- Best for: E-commerce logistics (Amazon, Flipkart, Blinkit, Zepto, Delhivery), FMCG distributors, dairy delivery, and heavy industrial cargo fleets.
Speak warmly, informatively, and concisely in English, Hindi, or Hinglish.`
  }
]);

export function getTop12Vehicles(category = null) {
  if (!category || category === 'All') return TOP_12_EVS;
  return TOP_12_EVS.filter((v) => v.category.toLowerCase().includes(category.toLowerCase()));
}

export function getVehicleById(id) {
  return TOP_12_EVS.find((v) => v.id === id || v.id.toLowerCase() === String(id || '').toLowerCase());
}
