// Car registry — two config formats supported:
//  • classic spin (punch-ev, citroen-c3): { folder, pattern, frames }
//  • multi-view (nexon-ev-carwale): { views: { exterior, open, interior } }
// To add: download via download_car.py / download_carwale.py, then add 1 line.
const CARS = [
  {
    id: "punch-ev",
    name: "Tata Punch EV",
    configUrl: "cars/punch-ev/config.json",
    thumb: "cars/punch-ev/images/frame-00.jpg"
  },
  {
    id: "citroen-c3",
    name: "Citroen C3",
    configUrl: "cars/citroen-c3/config.json",
    thumb: "cars/citroen-c3/images/frame-00.jpg"
  },
  {
    id: "nexon-ev-carwale",
    name: "Tata Nexon EV (3 views)",
    configUrl: "cars/nexon-ev-carwale/config.json",
    thumb: "cars/nexon-ev-carwale/exterior/frame-00.jpg"
  },
  {
    id: "comet-ev-carwale",
    name: "MG Comet EV (2 views)",
    configUrl: "cars/comet-ev-carwale/config.json",
    thumb: "cars/comet-ev-carwale/exterior/frame-00.jpg"
  }
];
