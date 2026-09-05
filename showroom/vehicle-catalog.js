const A = "/showroom-assets";

export const VEHICLES = [
  {
    id: "tata-punch-ev", name: "Tata Punch.ev", company: "Tata Motors",
    category: "Cars", powertrain: "Electric", badge: "Electric compact SUV",
    price: "₹9.69 lakh", priceNote: "Starting ex-showroom · checked Sep 2026",
    thumbnail: `${A}/cars/punch-ev/images/frame-00.jpg`,
    sourceUrl: "https://ev.tata.cars/punch/ev/price.html",
    specNote: "Figures span the current 30 kWh and 40 kWh variants.",
    specs: [["Certified range","375–468 km"],["Battery","30 / 40 kWh"],["Power","65 / 95 kW"],["Boot","366 L"],["Ground clearance","195 mm"],["Seats","5"]],
    features: ["Four-level regenerative braking","Liquid-cooled IP67 battery","Multi-drive modes","Compact 4.9 m turning radius"],
    views: { exterior: { label:"Exterior 360°", type:"spin", folder:`${A}/cars/punch-ev/images`, pattern:"frame-{nn}.jpg", frames:24, angleFrames:{ front:0, right:6, back:12, left:18 } } },
    greeting: "Meet the Tata Punch.ev. Drag to inspect it, or ask about range, charging, space, or daily usability.",
    knowledgePrompt: "You are the Tata Punch.ev showroom expert in India. Current variants use 30 or 40 kWh batteries with manufacturer-certified range of 375 or 468 km. It seats five, has a 366-litre boot, 195 mm ground clearance, a PMSM motor and multi-level regen. Say that specifications vary by variant. Never invent price or availability."
  },
  {
    id: "tata-nexon-ev", name: "Tata Nexon.ev", company: "Tata Motors",
    category: "Cars", powertrain: "Electric", badge: "Electric compact SUV",
    price: "₹12.49 lakh", priceNote: "Starting ex-showroom · checked Sep 2026",
    thumbnail: `${A}/cars/nexon-ev-carwale/exterior/frame-00.jpg`,
    sourceUrl: "https://ev.tata.cars/nexon/ev/price.html",
    specNote: "Nexon.ev 45 figures; actual range and charging depend on conditions.",
    specs: [["Certified range","489 km"],["Battery","46.08 kWh"],["Power / torque","110 kW / 215 Nm"],["DC 10–80%","40 min"],["Boot","350 L"],["Seats","5"]],
    features: ["Open-door 360° sequence","Interactive interior panorama","V2L-capable EV platform","Four regenerative braking levels"],
    views: {
      exterior: { label:"Exterior", type:"spin", folder:`${A}/cars/nexon-ev-carwale/exterior`, pattern:"frame-{nn}.jpg", frames:72, frameStep:3, angleFrames:{ front:0, right:18, back:36, left:54 } },
      open: { label:"Doors open", type:"spin", folder:`${A}/cars/nexon-ev-carwale/open`, pattern:"frame-{nn}.jpg", frames:72, frameStep:3, angleFrames:{ front:0, right:18, back:36, left:54 } },
      interior: { label:"Interior", type:"cubemap", folder:`${A}/cars/nexon-ev-carwale/interior`, faces:["face-0.jpg","face-1.jpg","face-2.jpg","face-3.jpg","face-4.jpg","face-5.jpg"] }
    },
    greeting: "This Nexon.ev includes exterior, open-door, and interior views. Ask me to open the doors or take you inside.",
    knowledgePrompt: "You are the Tata Nexon.ev 45 showroom expert in India. Use these manufacturer figures: 46.08 kWh battery, 110 kW, 215 Nm, 489 km certified MIDC range, 350–375 km C75 estimate, 40 minutes for 10–80% at 60 kW DC, 350-litre boot and 190 mm ground clearance. Separate certified range from real-world estimates. Never invent current price or stock."
  },
  {
    id: "mg-comet-ev", name: "MG Comet EV", company: "JSW MG Motor India",
    category: "Cars", powertrain: "Electric", badge: "Urban electric car",
    price: "₹7.80 lakh", priceNote: "Outright ex-showroom · checked Sep 2026",
    thumbnail: `${A}/cars/comet-ev-carwale/exterior/frame-00.jpg`,
    sourceUrl: "https://www.mgmotor.co.in/vehicles/comet-ev-electric-car-in-india",
    specNote: "Certified range under standard test conditions; real usage varies.",
    specs: [["Certified range","230 km"],["Battery","17.4 kWh"],["Seats","4"],["Body","2-door hatch"],["Use case","Urban mobility"],["Drive","Rear-wheel drive"]],
    features: ["Open-door 360° sequence","Compact city footprint","Connected digital cockpit","Rotary gear selector"],
    views: {
      exterior: { label:"Exterior", type:"spin", folder:`${A}/cars/comet-ev-carwale/exterior`, pattern:"frame-{nn}.jpg", frames:72, frameStep:3, angleFrames:{ front:0, right:18, back:36, left:54 } },
      open: { label:"Doors open", type:"spin", folder:`${A}/cars/comet-ev-carwale/open`, pattern:"frame-{nn}.jpg", frames:72, frameStep:3, angleFrames:{ front:0, right:18, back:36, left:54 } }
    },
    greeting: "The MG Comet EV is built around compact urban mobility. Spin it, open the doors, or ask how its range fits city use.",
    knowledgePrompt: "You are the MG Comet EV showroom expert in India. Use manufacturer-backed facts: 17.4 kWh prismatic lithium-ion battery, around 230 km certified range under standard test conditions, four seats, compact two-door body, rear-wheel drive and connected digital controls. It is primarily an urban EV. Say actual range and charging vary. Never invent current pricing."
  },
  {
    id: "citroen-c3", name: "Citroën C3", company: "Citroën India",
    category: "Cars", powertrain: "Petrol", badge: "Petrol car · reference model",
    price: "₹4.99 lakh", priceNote: "Starting ex-showroom · checked Sep 2026",
    thumbnail: `${A}/cars/citroen-c3/images/frame-00.jpg`,
    sourceUrl: "https://www.citroen.in/models/c3.html",
    specNote: "This supplied asset is the petrol C3, not the electric ë-C3.",
    specs: [["Engine","1.2 L petrol"],["Output","82 / 110 PS"],["Efficiency","18.3–19.3 km/l"],["Boot","315 L"],["Wheelbase","2,540 mm"],["Seats","5"]],
    features: ["26 cm touchscreen","Wireless Apple CarPlay and Android Auto","315-litre boot","Six airbags on equipped variants"],
    views: { exterior: { label:"Exterior 360°", type:"spin", folder:`${A}/cars/citroen-c3/images`, pattern:"frame-{nn}.jpg", frames:24, angleFrames:{ front:0, right:6, back:12, left:18 } } },
    greeting: "This is the petrol Citroën C3 reference vehicle included with your assets. I’ll keep fuel and EV comparisons clearly separated.",
    knowledgePrompt: "You are the showroom expert for the petrol Citroën C3 in India, not the electric e-C3. Explain its 1.2-litre PureTech choices: 82 PS naturally aspirated or 110 PS turbo, 18.3–19.3 km/l stated efficiency depending on transmission, five seats, 315-litre boot and 2540 mm wheelbase. Never describe this model as electric or invent current pricing."
  },
  {
    id: "ather-rizta", name: "Ather Rizta", company: "Ather Energy",
    category: "Scooters", powertrain: "Electric", badge: "Family electric scooter",
    price: "₹1.22 lakh", priceNote: "Starting ex-showroom · checked Sep 2026",
    thumbnail: `${A}/bikes/ather-rizta/exterior/frame-00.jpg`,
    sourceUrl: "https://www.atherenergy.com/rizta/specifications",
    specNote: "Battery and range figures vary by Rizta S/Z configuration.",
    specs: [["IDC range","123 / 161 km"],["Battery","2.7–3.5 kWh"],["Peak power","4.3 kW"],["Top speed","80 km/h"],["0–40 km/h","4.7 sec"],["Torque","22 Nm"]],
    features: ["Family-focused seat and storage","AutoHold","FallSafe and emergency stop signal","SkidControl on equipped variants"],
    views: { exterior: { label:"Exterior 360°", type:"spin", folder:`${A}/bikes/ather-rizta/exterior`, pattern:"frame-{nn}.jpg", frames:36, angleFrames:{ front:0, right:9, back:18, left:27 } } },
    greeting: "Meet the Ather Rizta family scooter. Drag to inspect it, or ask about range, charging, storage, and safety.",
    knowledgePrompt: "You are the Ather Rizta showroom expert in India. Current configurations offer 123 or 161 km IDC range with 2.7 to 3.5 kWh battery choices, a 4.3 kW PMSM, 22 Nm, 80 km/h top speed and 0–40 km/h in 4.7 seconds. AutoHold and core safety functions are available; SkidControl depends on variant. Separate IDC from practical range. Never invent current pricing."
  },
  {
    id: "tvs-king-kargo-ev-hd", name: "TVS King Kargo HD EV", company: "TVS Motor Company",
    category: "3-Wheelers", powertrain: "Electric", badge: "Electric cargo three-wheeler",
    price: "₹3.95 lakh", priceNote: "Starting ex-showroom, Delhi · checked Sep 2026",
    thumbnail: `${A}/three-wheelers/king-kargo-ev-hd/white/fixed-side-deck/frame-00.webp`,
    sourceUrl: "https://www.tvsmotor.com/three-wheelers/king-kargo-ev-hd",
    specNote: "Certified range shown for the Fixed Side Deck configuration.",
    specs: [["Certified range","156 km"],["Battery","8.9 kWh LFP"],["Charge 0–100%","3 h 10 min"],["Top speed","60 km/h"],["Max torque","40 Nm"],["GVW","998 kg"]],
    features: ["Four cargo body configurations","Pristine White and Neptune Blue","Eco, City and Power modes","Connected fleet and navigation features"],
    colors: { white:"Pristine White", blue:"Neptune Blue" },
    variants: { "fixed-side-deck":"Fixed Side Deck", platform:"PF Platform", "cab-chassis":"Cab Chassis", container:"Container" },
    makeView(color, variant) {
      return { label:`${this.variants[variant]} · ${this.colors[color]}`, type:"spin", folder:`${A}/three-wheelers/king-kargo-ev-hd/${color}/${variant}`, pattern:"frame-{nn}.webp", frames:12, angleFrames:{ front:0, right:3, back:6, left:9 } };
    },
    greeting: "This TVS King Kargo HD EV includes two colours and four cargo-body configurations. Choose one, spin it, or ask about fleet use.",
    knowledgePrompt: "You are the TVS King Kargo HD EV showroom expert in India. Use manufacturer figures: 8.9 kWh LFP battery, 156 km certified Fixed Side Deck range, about 143 km stated actual range, 3 h 10 min for 0–100% with the 3 kW charger, 11.2 kW, 40 Nm, 60 km/h, 998 kg GVW and 235 mm ground clearance. It has Eco, City and Power modes and four body configurations. Never invent price or payload."
  }
];

export const CATEGORIES = ["All","Cars","Scooters","3-Wheelers"];
export const SHOWROOM_ACTIONS = Object.freeze({
  SELECT_VEHICLE:"SELECT_VEHICLE", SELECT_VIEW:"SELECT_VIEW", SELECT_COLOR:"SELECT_COLOR",
  SELECT_VARIANT:"SELECT_VARIANT", ROTATE_LEFT:"ROTATE_LEFT", ROTATE_RIGHT:"ROTATE_RIGHT",
  FOCUS_ORIENTATION:"FOCUS_ORIENTATION", START_TOUR:"START_TOUR", STOP_TOUR:"STOP_TOUR"
});
export function getShowroomVehicleById(id) {
  return VEHICLES.find((vehicle) => vehicle.id === id || vehicle.id.toLowerCase() === String(id || "").toLowerCase());
}
