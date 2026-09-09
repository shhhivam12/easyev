import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const $ = id => document.getElementById(id);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const HALLS = {
  four: {
    center: 0,
    camera: [0, 4.75, 16.4],
    target: [0, 0.85, 0],
    kicker: 'GALLERY 01',
    name: 'The EV car hall',
    count: 'Four vehicles on display',
    title: 'Electric cars, properly presented.',
    description: 'Walk up to any vehicle to inspect it, or let the EasyEV guide take you through the gallery.',
    commentary: 'Welcome to the EV car gallery. Four vehicles share one premium display floor with space to inspect every angle.'
  },
  two: {
    center: 26,
    camera: [26, 3.45, 9.8],
    target: [26, 0.9, 0],
    kicker: 'GALLERY 02',
    name: 'The two-wheeler studio',
    count: 'Two electric scooters on display',
    title: 'Electric mobility, made personal.',
    description: 'A separate studio for compact urban EVs, reached through the illuminated EasyEV path.',
    commentary: 'You are now in the two-wheeler studio. The OLA and Vespa displays have their own lighting, scale, and inspection stops.'
  }
};

const VEHICLES = [
  {
    id: 'tata-punch-ev', section: 'four', name: 'Tata Punch.ev', category: 'ELECTRIC COMPACT SUV',
    description: 'A practical compact electric SUV with a city-friendly footprint.',
    model: '/static/models/tata-punch.glb', position: [-5.9, 0.24, -1.35], length: 3.9, yaw: Math.PI,
    camera: [-4.55, 1.9, 3.15], display: 'Prototype 3D shell',
    brand: 'Tata.ev', price: 'Request current Tata quote', availability: 'India - variant dependent', colour: 'Grey display', sunroof: 'Available on equipped variants',
    brandStory: 'Tata.ev brings the Punch.ev into its acti.ev electric architecture family, focused on practical Indian city use and compact-SUV packaging.',
    specs: [['Certified range', 'Up to 468 km'], ['Battery', '30 / 40 kWh'], ['Power', '65 / 95 kW'], ['0–100 km/h', '9.0 sec'], ['Boot space', '366 L'], ['Ground clearance', '195 mm']],
    highlights: ['Choice of 30 kWh and 40 kWh battery packs', 'Four regenerative-braking levels with paddle control', 'Six airbags and connected-car technology on supported variants'],
    note: 'The supplied Tripo-generated Punch model is a prototype visual. Current official Punch.ev specifications are shown.',
    source: 'https://ev.tatamotors.com/punch/ev/specifications.html',
    greeting: 'The Tata Punch.ev returns to the car hall as a compact electric SUV reference with up to 468 kilometres of certified range.',
    tour: 'We begin with the Tata Punch dot EV. The current long-range version uses a 40 kilowatt-hour battery, produces 95 kilowatts, and carries an official certified range of up to 468 kilometres.'
  },
  {
    id: 'byd-han-ev', section: 'four', name: 'BYD Han EV', category: 'ELECTRIC PERFORMANCE SEDAN',
    description: 'A low, full-size flagship sedan built around Blade Battery technology.',
    model: '/showroom-models/2022_byd_han_ev_facelift.glb', position: [-2.55, 0.24, 1.05], length: 4.75, yaw: 0,
    camera: [-0.2, 1.85, 5.45], display: 'Exact 2022 facelift shell',
    brand: 'BYD', price: 'No official India listing', availability: 'Global reference display', colour: 'Orange display', sunroof: 'Panoramic sunroof',
    brandStory: 'BYD develops its own batteries, motors and vehicle electronics. The Han is its flagship electric sedan built around the Blade Battery platform.',
    specs: [['Range', '521 km WLTP'], ['Battery', '85.4 kWh'], ['Power', '380 kW'], ['0–100 km/h', '3.9 sec'], ['Torque', '700 Nm'], ['Drive', 'Electric AWD']],
    highlights: ['Cobalt-free BYD Blade Battery', 'Electric all-wheel drive with sports-car acceleration', 'Rotating 15.6-inch central display'],
    note: 'The supplied shell identifies itself as the 2022 BYD Han EV facelift. European combined-range specification shown.',
    source: 'https://media.byd.com/byd-han/?lang=eng',
    greeting: 'The BYD Han EV is now facing the gallery correctly, ready to inspect from the front, side, or rear.',
    tour: 'The BYD Han EV combines an 85.4 kilowatt-hour Blade Battery with all-wheel drive, 521 kilometres of WLTP range, and a 3.9-second sprint to 100.'
  },
  {
    id: 'kia-electric-range', section: 'four', name: 'Kia electric range', category: 'KIA EV TECHNOLOGY DISPLAY',
    description: 'Official Kia EV6 information presented through the supplied showcase shell.',
    model: '/showroom-models/kia_sportage_gt_line_2023.glb', position: [2.6, 0.24, 1.05], length: 4.55, yaw: Math.PI,
    camera: [4.85, 1.9, 5.35], display: 'Demo-mapped visual shell',
    brand: 'Kia', price: '\u20B9 60.97 lakh*', availability: 'India - ex-showroom reference', colour: 'Black display', sunroof: 'Wide electric sunroof',
    brandStory: 'Kia positions the EV6 as its dedicated-platform electric flagship in India, pairing long-distance range with rapid charging and vehicle-to-load capability.',
    specs: [['Reference EV', 'Kia EV6 AWD'], ['Range', '663 km ARAI'], ['Battery', '84 kWh'], ['Fast charge', '18 minutes'], ['Power', '325 PS'], ['Torque', '605 Nm']],
    highlights: ['Dedicated electric platform with all-wheel drive', '10–80 percent charging in 18 minutes on a 350 kW charger', 'Vehicle-to-load support and a technology-rich cabin'],
    note: 'Demo mapping: the supplied model is a 2023 Sportage GT-Line shell. The specifications are official Kia EV6 GT-Line AWD figures.',
    source: 'https://www.kia.com/in/our-vehicles/ev6/specs/compare-trims.html',
    greeting: 'This Kia technology display is visibly marked as a demo mapping and uses official EV6 GT-Line AWD information.',
    tour: 'This Kia technology display uses official EV6 information: an 84 kilowatt-hour battery, 663 kilometres of ARAI range, and a quoted 18-minute 10 to 80 percent fast charge.'
  },
  {
    id: 'mg-comet-ev', section: 'four', name: 'MG Comet EV', category: 'URBAN ELECTRIC CAR',
    description: 'A compact four-seat EV designed around short city journeys.',
    model: '/showroom-models/mg_comet.glb', position: [5.95, 0.24, -1.35], length: 3.05, yaw: Math.PI,
    camera: [7.7, 1.65, 3.1], display: 'Exact-model shell',
    brand: 'JSW MG Motor India', price: 'Request current MG quote', availability: 'India - variant dependent', colour: 'White display', sunroof: 'No sunroof listed',
    brandStory: 'MG designed the Comet EV around short urban journeys: a tiny footprint, four seats and connected features for dense city driving.',
    specs: [['Range', '230 km ARAI'], ['Battery', '17.3 kWh'], ['Power', '42 hp'], ['Seats', '4'], ['Charge 0–100%', '7 hours'], ['Turning radius', '4.2 m']],
    highlights: ['Extremely compact body for dense city use', 'Four-seat cabin with connected-car features', 'Simple home charging through a Type 2 connection'],
    note: 'The supplied 3D asset identifies itself as MG Comet. Current official MG India specifications are shown.',
    source: 'https://www.mgmotor.co.in/content/mgmotor/language-masters/en/vehicles/comet-ev-electric-car-in-india.html',
    greeting: 'The MG Comet EV completes the car hall with the smallest footprint and the clearest urban focus.',
    tour: 'The MG Comet EV is under three metres long yet seats four. MG lists a 230 kilometre range, a 17.4 kilowatt-hour battery, and a tight 4.2 metre turning radius.'
  },
  {
    id: 'ola-s1-pro-reference', section: 'two', name: 'OLA S1 Pro', category: 'ELECTRIC PERFORMANCE SCOOTER',
    description: 'A connected electric scooter reference for everyday urban travel.',
    model: '/showroom-models/ola_electric_scooter_black_color.glb', position: [-2.05, 0.24, 0], length: 2.05, yaw: 0,
    camera: [26.1, 1.55, 3.85], display: 'OLA range reference',
    brand: 'OLA Electric', price: 'Request current OLA quote', availability: 'India - variant dependent', colour: 'Black display', sunroof: 'Not applicable',
    brandStory: 'OLA Electric builds the S1 range around a software-led scooter experience, combining MoveOS connectivity with performance-oriented electric commuting.',
    specs: [['Range', '242 km IDC'], ['Battery', '4 kWh'], ['Peak power', '11 kW'], ['Top speed', '125 km/h'], ['0–40 km/h', '2.7 sec'], ['Charge 0–80%', '4 h 50 min']],
    highlights: ['Mid-drive electric motor with integrated controller', 'Four ride modes including Hyper and Eco', 'Connected MoveOS experience with a seven-inch touchscreen'],
    note: 'The supplied asset is a generic OLA electric scooter. Current official S1 Pro 4 kWh specifications are used as the range reference.',
    source: 'https://www.olaelectric.com/s1pro-gen3',
    greeting: 'The OLA display now stands squarely on its own stage in the dedicated two-wheeler studio.',
    tour: 'The OLA S1 Pro reference uses a 4 kilowatt-hour battery with a 242 kilometre IDC range, 11 kilowatts of peak power, and a claimed top speed of 125 kilometres per hour.'
  },
  {
    id: 'vespa-elettrica-reference', section: 'two', name: 'Vespa Elettrica', category: 'ELECTRIC URBAN SCOOTER',
    description: 'Classic Vespa proportions interpreted for quiet electric travel.',
    model: '/showroom-models/vespa.glb', position: [2.05, 0.24, 0], length: 1.9, yaw: -Math.PI / 2,
    camera: [30.1, 1.5, 3.75], display: 'Vespa EV range reference',
    brand: 'Vespa', price: 'No official India listing', availability: 'Global reference display', colour: 'Yellow display', sunroof: 'Not applicable',
    brandStory: 'Vespa carries its classic steel-body design language into an electric city scooter built for quiet, stylish short-distance travel.',
    specs: [['Range', 'Up to 80 km'], ['Battery', '4.2 kWh'], ['Charge time', '4 hours'], ['Drive modes', '3'], ['Motor', 'Rear-wheel'], ['Regeneration', 'Yes']],
    highlights: ['Silent rear-wheel electric motor', 'Eco, Power, and Reverse riding modes', 'Energy recovery during deceleration'],
    note: 'Demo mapping: the supplied shell is a generic Vespa. Official Primavera Tech Elettrica specifications are shown.',
    source: 'https://www.vespa.com/en_EN/models/primavera/primavera-tech-elettrica-70-electric-motorcycle-2024/',
    greeting: 'The Vespa Elettrica display is aligned beside the OLA in a quieter, more intimate scooter gallery.',
    tour: 'The Vespa electric reference lists a 4.2 kilowatt-hour battery, up to 80 kilometres of WMTC range, and a four-hour charge time.'
  }
];

const canvas = $('world');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x04130b);
scene.fog = new THREE.FogExp2(0x06150d, 0.018);

const camera = new THREE.PerspectiveCamera(41, innerWidth / innerHeight, 0.1, 100);
camera.position.fromArray(HALLS.four.camera);
const controls = new OrbitControls(camera, canvas);
controls.target.fromArray(HALLS.four.target);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.enablePan = false;
controls.minDistance = 2.2;
controls.maxDistance = 18;
controls.minPolarAngle = 0.58;
controls.maxPolarAngle = 1.5;

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.025).texture;
pmrem.dispose();

scene.add(new THREE.HemisphereLight(0xc8f2d5, 0x010603, 1.18));
const hallGroups = new Map();
const bayByVehicle = new Map();
const modelByVehicle = new Map();
const failedModels = new Set();
const selectable = [];
const brandPatternCanvas = document.createElement('canvas');
brandPatternCanvas.width = 1536;
brandPatternCanvas.height = 768;
const brandPatternTexture = new THREE.CanvasTexture(brandPatternCanvas);
brandPatternTexture.colorSpace = THREE.SRGBColorSpace;
brandPatternTexture.anisotropy = Math.min(2, renderer.capabilities.getMaxAnisotropy());

function paintBrandPattern(image) {
  const context = brandPatternCanvas.getContext('2d');
  const columns = 4;
  const rows = 3;
  const cellWidth = brandPatternCanvas.width / columns;
  const cellHeight = brandPatternCanvas.height / rows;
  context.clearRect(0, 0, brandPatternCanvas.width, brandPatternCanvas.height);
  context.strokeStyle = 'rgba(87,244,125,.16)';
  context.lineWidth = 2;
  for (let column = 0; column <= columns; column++) {
    context.beginPath();
    context.moveTo(column * cellWidth, 0);
    context.lineTo(column * cellWidth, brandPatternCanvas.height);
    context.stroke();
  }
  for (let row = 0; row <= rows; row++) {
    context.beginPath();
    context.moveTo(0, row * cellHeight);
    context.lineTo(brandPatternCanvas.width, row * cellHeight);
    context.stroke();
  }
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const offset = row % 2 ? cellWidth * 0.08 : 0;
      const x = column * cellWidth + cellWidth * 0.18 + offset;
      const y = row * cellHeight + cellHeight * 0.51;
      context.globalAlpha = 0.7;
      if (image?.complete || image?.width) context.drawImage(image, x, y - 48, 58, 58);
      context.fillStyle = '#eaffef';
      context.font = '800 48px Figtree, system-ui, sans-serif';
      context.textAlign = 'left';
      context.fillText('EasyEV', x + 72, y);
      context.globalAlpha = 0.52;
      context.fillStyle = '#57f47d';
      context.font = '800 16px Figtree, system-ui, sans-serif';
      context.fillText('AI EXPERIENCE CENTRE', x + 75, y + 28);
    }
  }
  context.globalAlpha = 1;
  brandPatternTexture.needsUpdate = true;
}

paintBrandPattern();
const logoTexture = new THREE.TextureLoader().load('/assets/icon.png', texture => {
  paintBrandPattern(texture.image);
  invalidate();
});
logoTexture.colorSpace = THREE.SRGBColorSpace;
logoTexture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());

function canvasTexture(title, subtitle, options = {}) {
  const c = document.createElement('canvas');
  c.width = options.width || 1024;
  c.height = options.height || 256;
  const g = c.getContext('2d');
  if (!options.transparent) {
    g.fillStyle = options.background || '#061b0f';
    g.fillRect(0, 0, c.width, c.height);
  }
  if (options.line) {
    g.fillStyle = '#57f47d';
    g.fillRect(0, c.height - 7, c.width, 7);
  }
  g.textAlign = options.align || 'center';
  const x = options.align === 'left' ? 58 : c.width / 2;
  g.fillStyle = options.accent || '#f8fffa';
  g.font = `800 ${options.titleSize || 66}px Figtree, sans-serif`;
  g.fillText(title, x, c.height * 0.48);
  if (subtitle) {
    g.fillStyle = options.subColor || '#57f47d';
    g.font = `700 ${options.subSize || 19}px Figtree, sans-serif`;
    g.fillText(subtitle, x, c.height * 0.7);
  }
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  return texture;
}

function makeMaterial(color, roughness = 0.5, metalness = 0.1) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function addPlant(group, x, z, scale = 1) {
  const plant = new THREE.Group();
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.38, 0.7, 24), makeMaterial(0x111b15, 0.28, 0.35));
  pot.position.y = 0.35;
  plant.add(pot);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 1.35, 10), makeMaterial(0x6c4c2e, 0.9, 0));
  trunk.position.y = 1.2;
  plant.add(trunk);
  const leafMat = makeMaterial(0x157745, 0.72, 0);
  [[0,1.85,0],[-.34,1.55,.05],[.34,1.55,.02],[-.2,2.15,0],[.25,2.06,-.08]].forEach(([lx,ly,lz],i) => {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(i ? 0.42 : 0.5, 16, 12), leafMat);
    leaf.scale.set(0.72, 1.2, 0.68);
    leaf.position.set(lx,ly,lz);
    plant.add(leaf);
  });
  plant.position.set(x, 0.12, z);
  plant.scale.setScalar(scale);
  group.add(plant);
}

function addLounge(group, x, z) {
  const benchMat = makeMaterial(0x13291c, 0.46, 0.15);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.38, 0.85), benchMat);
  seat.position.set(x, 0.48, z);
  group.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.85, 0.22), benchMat);
  back.position.set(x, 0.95, z - 0.38);
  group.add(back);
  [-1,1].forEach(side => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.42, 0.58), makeMaterial(0x8ea197, 0.25, 0.75));
    leg.position.set(x + side * 0.92, 0.22, z);
    group.add(leg);
  });
  const table = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.08, 32), makeMaterial(0x0d1711, 0.18, 0.55));
  table.position.set(x - 2.0, 0.58, z + 0.15);
  group.add(table);
  const tableLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.54, 16), makeMaterial(0x64756b, 0.25, 0.7));
  tableLeg.position.set(x - 2.0, 0.29, z + 0.15);
  group.add(tableLeg);
}

function addChargingPillar(group, x, z) {
  const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.85, 0.48), makeMaterial(0x10261a, 0.3, 0.35));
  pillar.position.set(x, 1.05, z);
  group.add(pillar);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.62), new THREE.MeshBasicMaterial({ map: canvasTexture('87%', 'READY', { width: 320, height: 460, titleSize: 72, subSize: 28, line: true }) }));
  screen.position.set(x, 1.35, z + 0.246);
  group.add(screen);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.08, 0.54), new THREE.MeshBasicMaterial({ color: 0x57f47d }));
  cap.position.set(x, 2.0, z);
  group.add(cap);
}

function makeHall(section) {
  const hall = HALLS[section];
  const group = new THREE.Group();
  group.position.x = hall.center;
  group.userData.section = section;
  scene.add(group);
  hallGroups.set(section, group);

  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(23, 0.22, 15),
    new THREE.MeshPhysicalMaterial({ color: section === 'four' ? 0x091a11 : 0x0b1812, roughness: 0.24, metalness: 0.42, clearcoat: 1, clearcoatRoughness: 0.19 })
  );
  floor.position.set(0, -0.12, 0.4);
  group.add(floor);

  const mat = new THREE.MeshStandardMaterial({ color: 0x12271a, roughness: 0.72, metalness: 0.15, side: THREE.FrontSide });
  const backWall = new THREE.Mesh(new THREE.PlaneGeometry(23, 7.2), mat);
  backWall.position.set(0, 3.6, -6.15);
  group.add(backWall);

  const brandingMaterial = new THREE.MeshBasicMaterial({
    map: brandPatternTexture,
    transparent: true,
    opacity: section === 'four' ? 0.3 : 0.26,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const backBranding = new THREE.Mesh(new THREE.PlaneGeometry(22.8, 7), brandingMaterial);
  backBranding.position.set(0, 3.58, -6.08);
  backBranding.userData.kind = 'brand-wall-pattern';
  group.add(backBranding);

  const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x89d4a2, transparent: true, opacity: 0.18, roughness: 0.12, metalness: 0.05, transmission: 0.42, thickness: 0.18, side: THREE.DoubleSide, depthWrite: false });
  [-11.25, 11.25].forEach(x => {
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(14.5, 6.7), glassMat);
    glass.position.set(x, 3.35, 0.55);
    glass.rotation.y = Math.PI / 2;
    group.add(glass);
    const sideBranding = new THREE.Mesh(new THREE.PlaneGeometry(14.2, 6.45), brandingMaterial);
    sideBranding.position.set(x - Math.sign(x) * 0.035, 3.35, 0.55);
    sideBranding.rotation.y = Math.PI / 2;
    sideBranding.userData.kind = 'brand-wall-pattern';
    group.add(sideBranding);
    for (let y = 1.1; y < 6.5; y += 1.8) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.025, 14), new THREE.MeshBasicMaterial({ color: 0x57f47d, transparent: true, opacity: 0.25 }));
      stripe.position.set(x, y, 0.55);
      group.add(stripe);
    }
  });

  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(23, 15), new THREE.MeshStandardMaterial({ color: 0x07140d, roughness: 0.8, side: THREE.DoubleSide }));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, 6.65, 0.4);
  group.add(ceiling);

  for (let x = -9; x <= 9; x += 3) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 14), makeMaterial(0x294335, 0.35, 0.55));
    beam.position.set(x, 6.58, 0.3);
    group.add(beam);
  }
  for (let z = -4.8; z <= 5.2; z += 3.3) {
    const light = new THREE.Mesh(new THREE.PlaneGeometry(1.35, 0.16), new THREE.MeshBasicMaterial({ color: 0xcffff0 }));
    light.rotation.x = Math.PI / 2;
    light.scale.x = section === 'four' ? 5.4 : 3.5;
    light.position.set(0, 6.53, z);
    group.add(light);
  }

  const signPanel = new THREE.Mesh(new THREE.PlaneGeometry(5.8, 1.3), new THREE.MeshBasicMaterial({
    map: canvasTexture('EasyEV AI', section === 'four' ? 'ELECTRIC CAR GALLERY' : 'ELECTRIC TWO-WHEELER STUDIO', { transparent: true, accent: '#f8fffa', subColor: '#57f47d' }),
    transparent: true,
    depthWrite: false,
  }));
  signPanel.position.set(0.65, 4.7, -6.04);
  group.add(signPanel);
  const logo = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 1.15), new THREE.MeshBasicMaterial({ map: logoTexture, transparent: true, depthWrite: false }));
  logo.position.set(-2.72, 4.72, -6.02);
  group.add(logo);

  const inlay = new THREE.Mesh(new THREE.PlaneGeometry(section === 'four' ? 19 : 9, 0.035), new THREE.MeshBasicMaterial({ color: 0x57f47d, transparent: true, opacity: 0.72 }));
  inlay.rotation.x = -Math.PI / 2;
  inlay.position.set(0, 0.012, 3.7);
  group.add(inlay);

  addPlant(group, -10, -4.7, 0.8);
  addPlant(group, 10, -4.7, 0.8);
  if (section === 'four') {
    addLounge(group, 8.6, 5.25);
    addChargingPillar(group, -9.5, 3.6);
  } else {
    addLounge(group, 8.1, 4.9);
    addChargingPillar(group, -8.4, 3.8);
  }

  const key = new THREE.SpotLight(0xffffff, section === 'four' ? 125 : 95, 19, 0.72, 0.55, 1.3);
  key.position.set(0, 6.2, 3.7);
  key.target.position.set(0, 0, 0);
  group.add(key, key.target);

  const rim = new THREE.PointLight(0x57f47d, 34, 12, 1.5);
  rim.position.set(0, 2.8, -4.7);
  group.add(rim);

  const front = new THREE.PointLight(0xbfffd4, 30, 16, 1.8);
  front.position.set(0, 3.6, 6.3);
  group.add(front);

  return group;
}

makeHall('four');
makeHall('two');
hallGroups.get('two').visible = false;

function makeBay(vehicle) {
  const group = hallGroups.get(vehicle.section);
  const scooter = vehicle.section === 'two';
  const width = scooter ? 3.15 : vehicle.length + 0.45;
  const depth = scooter ? 3.4 : 3.3;

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(Math.max(width, depth) * 0.57, Math.max(width, depth) * 0.61, 0.2, 48),
    new THREE.MeshPhysicalMaterial({ color: 0x111c16, roughness: 0.2, metalness: 0.56, clearcoat: 0.9 })
  );
  base.scale.set(width / Math.max(width, depth), 1, depth / Math.max(width, depth));
  base.position.set(vehicle.position[0], 0.1, vehicle.position[2]);
  base.userData.vehicleId = vehicle.id;
  group.add(base);
  selectable.push(base);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(Math.max(width, depth) * 0.575, 0.018, 8, 80),
    new THREE.MeshBasicMaterial({ color: 0x57f47d, transparent: true, opacity: 0.65 })
  );
  ring.scale.set(width / Math.max(width, depth), depth / Math.max(width, depth), 1);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(vehicle.position[0], 0.215, vehicle.position[2]);
  group.add(ring);

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(scooter ? 0.82 : Math.max(1.55, vehicle.length * 0.37), 48),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.33, depthWrite: false })
  );
  shadow.scale.set(scooter ? 0.72 : 1.45, scooter ? 1.3 : 0.66, 1);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(vehicle.position[0], 0.225, vehicle.position[2]);
  group.add(shadow);

  const plaque = new THREE.Mesh(
    new THREE.PlaneGeometry(Math.min(width * 0.82, 3.5), 0.5),
    new THREE.MeshBasicMaterial({ map: canvasTexture(vehicle.name, vehicle.display.toUpperCase(), { width: 880, height: 150, titleSize: 36, subSize: 14, line: true }) })
  );
  plaque.rotation.x = -Math.PI / 2;
  plaque.position.set(vehicle.position[0], 0.23, vehicle.position[2] + depth * 0.46);
  group.add(plaque);

  const placeholder = new THREE.Group();
  const ghost = new THREE.Mesh(
    new THREE.BoxGeometry(scooter ? 0.72 : vehicle.length * 0.8, scooter ? 1.35 : 1.2, scooter ? 1.7 : 2.0),
    new THREE.MeshBasicMaterial({ color: 0x57f47d, wireframe: true, transparent: true, opacity: 0.22 })
  );
  ghost.position.y = scooter ? 0.95 : 0.85;
  placeholder.add(ghost);
  placeholder.position.set(vehicle.position[0], 0.22, vehicle.position[2]);
  group.add(placeholder);

  bayByVehicle.set(vehicle.id, { base, ring, placeholder, group });
}

VEHICLES.forEach(makeBay);

function flattenStaticModel(source) {
  source.updateMatrixWorld(true);
  const buckets = new Map();
  source.traverse(node => {
    if (!node.isMesh || node.isSkinnedMesh || node.morphTargetInfluences || Array.isArray(node.material)) return;
    const attrs = Object.keys(node.geometry.attributes).sort().join(',');
    const key = node.material.uuid + '|' + attrs + '|' + Boolean(node.geometry.index);
    if (!buckets.has(key)) buckets.set(key, { material: node.material, geometries: [] });
    const geometry = node.geometry.clone();
    geometry.applyMatrix4(node.matrixWorld);
    buckets.get(key).geometries.push(geometry);
  });
  const output = new THREE.Group();
  buckets.forEach(({ material, geometries }) => {
    const merged = geometries.length === 1 ? geometries[0] : mergeGeometries(geometries, false);
    if (merged) output.add(new THREE.Mesh(merged, material));
    else geometries.forEach(geometry => output.add(new THREE.Mesh(geometry, material)));
  });
  return output.children.length ? output : source;
}

function normalizeModel(root, vehicle) {
  let box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  root.scale.setScalar(vehicle.length / Math.max(size.x, size.z));
  root.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(root);
  const center = box.getCenter(new THREE.Vector3());
  root.position.set(-center.x, vehicle.position[1] - box.min.y, -center.z);
  const wrapper = new THREE.Group();
  wrapper.position.set(vehicle.position[0], 0, vehicle.position[2]);
  wrapper.rotation.y = vehicle.yaw;
  wrapper.add(root);
  return wrapper;
}

function prepareMaterials(root, vehicle) {
  root.traverse(node => {
    if (!node.isMesh) return;
    node.castShadow = false;
    node.receiveShadow = false;
    node.frustumCulled = true;
    node.userData.vehicleId = vehicle.id;
    selectable.push(node);
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    materials.forEach(material => {
      if (!material) return;
      if ('envMapIntensity' in material) material.envMapIntensity = 1.3;
      if ('clearcoat' in material) material.clearcoat = Math.max(material.clearcoat || 0, 0.15);
      if (material.map) material.map.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    });
  });
}

let loadedCount = 0;
const loader = new GLTFLoader();
const modelLoadProgress = new Map(VEHICLES.map(vehicle => [vehicle.id, 0]));
let displayedEntryProgress = 0;
let targetEntryProgress = 0;
let entryProgressFrame = 0;
let entryProgressLastTime = 0;
let entryProgressResolver = null;

function renderEntryProgress(percent) {
  const value = Math.max(0, Math.min(100, percent));
  const rounded = Math.round(value);
  $('entry-progress').style.width = value.toFixed(2) + '%';
  $('entry-progress').closest('[role="progressbar"]')?.setAttribute('aria-valuenow', String(rounded));
  $('entry-count').textContent = rounded + '%';
}

function animateEntryProgress(now) {
  const elapsed = entryProgressLastTime ? Math.min(64, now - entryProgressLastTime) : 16;
  entryProgressLastTime = now;
  const delta = targetEntryProgress - displayedEntryProgress;
  if (reducedMotion || Math.abs(delta) < 0.04) {
    displayedEntryProgress = targetEntryProgress;
  } else {
    displayedEntryProgress += delta * (1 - Math.exp(-elapsed / 190));
  }
  renderEntryProgress(displayedEntryProgress);
  if (Math.abs(targetEntryProgress - displayedEntryProgress) >= 0.04) {
    entryProgressFrame = requestAnimationFrame(animateEntryProgress);
    return;
  }
  entryProgressFrame = 0;
  entryProgressLastTime = 0;
  if (targetEntryProgress === 100 && entryProgressResolver) {
    const resolve = entryProgressResolver;
    entryProgressResolver = null;
    resolve();
  }
}

function setEntryProgressTarget(percent, vehicle) {
  targetEntryProgress = Math.max(0, Math.min(100, percent));
  if (vehicle) $('entry-stage').textContent = 'Loading showroom assets';
  if (!entryProgressFrame) entryProgressFrame = requestAnimationFrame(animateEntryProgress);
}

function updateEntryProgress(vehicle) {
  const total = VEHICLES.reduce((sum, item) => sum + (modelLoadProgress.get(item.id) || 0), 0);
  setEntryProgressTarget(Math.min(99, total / VEHICLES.length * 100), vehicle);
}

function finishEntryProgress() {
  setEntryProgressTarget(100);
  if (displayedEntryProgress >= 99.96 || reducedMotion) {
    displayedEntryProgress = 100;
    renderEntryProgress(100);
    return Promise.resolve();
  }
  return new Promise(resolve => { entryProgressResolver = resolve; });
}

function setEntryActionsReady(ready) {
  const actions = $('entry-ready');
  actions.hidden = !ready;
  actions.toggleAttribute('inert', !ready);
  actions.setAttribute('aria-hidden', String(!ready));
  actions.querySelectorAll('button').forEach(button => { button.disabled = !ready; });
  $('entry-loader').setAttribute('aria-busy', String(!ready));
}

function loadVehicle(vehicle) {
  $('load-title').textContent = 'Preparing ' + vehicle.name;
  modelLoadProgress.set(vehicle.id, 0);
  updateEntryProgress(vehicle);
  return new Promise(resolve => {
    loader.load(vehicle.model, gltf => {
      const flattened = flattenStaticModel(gltf.scene);
      const root = normalizeModel(flattened, vehicle);
      prepareMaterials(root, vehicle);
      hallGroups.get(vehicle.section).add(root);
      modelByVehicle.set(vehicle.id, root);
      const bay = bayByVehicle.get(vehicle.id);
      bay.group.remove(bay.placeholder);
      loadedCount++;
      modelLoadProgress.set(vehicle.id, 1);
      updateLoadState(vehicle, true);
      invalidate();
      resolve();
    }, event => {
      if (event.total) {
        const progress = Math.max(0, Math.min(0.985, event.loaded / event.total));
        modelLoadProgress.set(vehicle.id, progress);
        updateEntryProgress(vehicle);
        $('load-detail').textContent = vehicle.name + ' · ' + Math.round(progress * 100) + '%';
      }
    }, error => {
      console.error('Model failed:', vehicle.id, error);
      failedModels.add(vehicle.id);
      loadedCount++;
      modelLoadProgress.set(vehicle.id, 0);
      updateLoadState(vehicle, false);
      resolve();
    });
  });
}

function updateLoadState(vehicle, success) {
  updateEntryProgress(vehicle);
  $('load-count').textContent = loadedCount + ' / ' + VEHICLES.length;
  const card = document.querySelector(`[data-vehicle="${vehicle.id}"]`);
  if (card) {
    card.dataset.loaded = String(success);
    card.querySelector('small').textContent = success ? vehicle.display : 'Model unavailable';
  }
  const activeVehicles = VEHICLES.filter(item => item.section === activeSection);
  const activeReady = activeVehicles.every(item => modelByVehicle.has(item.id) || failedModels.has(item.id));
  if (activeReady) {
    $('load-title').textContent = activeSection === 'four' ? 'The EV car hall is ready' : 'The two-wheeler studio is ready';
    $('load-detail').textContent = failedModels.size ? 'One or more display models need attention' : 'Interactive displays and details are available';
    setTimeout(() => $('loading').classList.add('done'), 900);
  }
}

const sectionLoadPromises = new Map();
function ensureSectionLoaded(section) {
  if (sectionLoadPromises.has(section)) return sectionLoadPromises.get(section);
  const list = VEHICLES.filter(vehicle => vehicle.section === section && !modelByVehicle.has(vehicle.id) && !failedModels.has(vehicle.id));
  const promise = (async () => {
    let cursor = 0;
    async function worker() {
      while (cursor < list.length) await loadVehicle(list[cursor++]);
    }
    await Promise.all([worker(), worker()]);
  })();
  sectionLoadPromises.set(section, promise);
  return promise;
}

async function loadCollection() {
  controls.enabled = false;
  setEntryActionsReady(false);
  $('entry-retry').hidden = true;
  $('entry-title').textContent = 'Virtual showroom loading, please wait';
  $('entry-copy').textContent = 'Preparing the vehicles, lighting and interactive experience.';
  updateEntryProgress();
  await Promise.all([ensureSectionLoaded('four'), ensureSectionLoaded('two')]);
  if (failedModels.size) {
    $('entry-title').textContent = 'A display needs one more moment';
    $('entry-copy').textContent = 'Some vehicle files did not finish loading. Retry before entering so the gallery never opens with blank displays.';
    $('entry-stage').textContent = failedModels.size + ' vehicle' + (failedModels.size === 1 ? '' : 's') + ' unavailable';
    $('entry-retry').hidden = false;
    return false;
  }
  $('entry-stage').textContent = 'Finalising your showroom';
  await finishEntryProgress();
  $('entry-title').textContent = 'Your showroom is ready';
  $('entry-copy').textContent = 'The complete showroom, lighting and interactions are ready.';
  $('entry-stage').textContent = 'Every display is ready';
  setEntryActionsReady(true);
  return true;
}

function enterShowroom(withGuide = false) {
  if (modelByVehicle.size !== VEHICLES.length || failedModels.size) return;
  hasEntered = true;
  controls.enabled = true;
  $('entry-loader').classList.add('is-dismissed');
  $('loading').classList.add('done');
  playNavigateSound();
  if (withGuide) connectVoice();
}

async function retryCollection() {
  loadedCount = modelByVehicle.size;
  VEHICLES.forEach(vehicle => modelLoadProgress.set(vehicle.id, modelByVehicle.has(vehicle.id) ? 1 : 0));
  targetEntryProgress = modelByVehicle.size / VEHICLES.length * 100;
  displayedEntryProgress = targetEntryProgress;
  renderEntryProgress(displayedEntryProgress);
  failedModels.clear();
  sectionLoadPromises.clear();
  $('entry-title').textContent = 'Virtual showroom loading, please wait';
  await loadCollection();
}

let activeSection = 'four';
let selectedId = null;
let moving = null;
let raf = 0;
let dirty = true;
let angleIndex = 0;
let selectionFx = null;
let tourState = 'idle';
let tourIndex = -1;
let tourGeneration = 0;
let audioEnabled = true;
let audioContext = null;
let hasEntered = false;
let voiceAdapter = null;
let voiceUnsubscribe = null;
let voiceConnection = 'off';
let voiceMode = 'commentary';
let voiceMuted = false;
let agentVoiceMode = 'idle';
let tourAdvanceTimer = 0;
let remoteSilenceTimer = 0;
const handledUserTranscripts = new Set();

function invalidate() {
  dirty = true;
  if (!raf && !document.hidden) raf = requestAnimationFrame(render);
}

function enforceCameraBounds() {
  if (moving) return;
  const center = HALLS[activeSection].center;
  camera.position.x = THREE.MathUtils.clamp(camera.position.x, center - 10.7, center + 10.7);
  camera.position.y = THREE.MathUtils.clamp(camera.position.y, 0.65, 6.25);
  camera.position.z = THREE.MathUtils.clamp(camera.position.z, -5.25, 15);
}

function render(time) {
  raf = 0;
  if (moving) {
    const t = reducedMotion ? 1 : Math.min(1, (time - moving.started) / moving.duration);
    const ease = 1 - Math.pow(1 - t, 3);
    camera.position.lerpVectors(moving.from, moving.to, ease);
    controls.target.lerpVectors(moving.targetFrom, moving.targetTo, ease);
    dirty = true;
    if (t >= 1) {
      const done = moving.resolve;
      moving = null;
      enforceCameraBounds();
      done(true);
    }
  }
  if (selectionFx) {
    const elapsed = time - selectionFx.started;
    const pulse = Math.max(0, 1 - elapsed / 800);
    selectionFx.ring.material.opacity = 0.45 + pulse * 0.55;
    selectionFx.ring.scale.z = 1 + Math.sin(elapsed * 0.025) * pulse * 0.05;
    dirty = true;
    if (elapsed >= 800) selectionFx = null;
  }
  const changed = controls.update();
  enforceCameraBounds();
  if (dirty || changed) {
    renderer.render(scene, camera);
    dirty = false;
  }
  if (moving || selectionFx || changed) invalidate();
}

controls.addEventListener('change', invalidate);

function moveCamera(position, target, duration = 1000) {
  if (moving) moving.resolve(false);
  return new Promise(resolve => {
    moving = {
      from: camera.position.clone(), to: new THREE.Vector3(...position),
      targetFrom: controls.target.clone(), targetTo: new THREE.Vector3(...target),
      started: performance.now(), duration, resolve
    };
    invalidate();
  });
}

function worldPosition(vehicle) {
  return [HALLS[vehicle.section].center + vehicle.position[0], vehicle.position[1], vehicle.position[2]];
}

function ensureAudio() {
  if (!audioEnabled) return null;
  if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
  if (audioContext.state === 'suspended') audioContext.resume();
  return audioContext;
}

function playSelectSound() {
  const ctx = ensureAudio();
  if (!ctx) return;
  const now = ctx.currentTime;
  [440, 660].forEach((frequency, index) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = index ? 'sine' : 'triangle';
    osc.frequency.setValueAtTime(frequency, now + index * 0.055);
    osc.frequency.exponentialRampToValueAtTime(frequency * 1.18, now + 0.22 + index * 0.055);
    gain.gain.setValueAtTime(0.0001, now + index * 0.055);
    gain.gain.exponentialRampToValueAtTime(index ? 0.045 : 0.06, now + 0.025 + index * 0.055);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25 + index * 0.055);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + index * 0.055);
    osc.stop(now + 0.3 + index * 0.055);
  });
}

function playNavigateSound() {
  const ctx = ensureAudio();
  if (!ctx) return;
  const now = ctx.currentTime;
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.55), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 1.8);
  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  source.buffer = buffer;
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(420, now);
  filter.frequency.exponentialRampToValueAtTime(1250, now + 0.4);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.075, now + 0.045);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.52);
  source.connect(filter).connect(gain).connect(ctx.destination);
  source.start(now);
}

function renderQuickSpecs(vehicle) {
  $('quick-specs').replaceChildren(...vehicle.specs.slice(0, 4).map(([label, value]) => {
    const div = document.createElement('div');
    const small = document.createElement('small');
    const strong = document.createElement('strong');
    small.textContent = label;
    strong.textContent = value;
    div.append(small, strong);
    return div;
  }));
}

function showSectionOverview(section) {
  const hall = HALLS[section];
  selectedId = null;
  $('vehicle-story').hidden = true;
  $('category').textContent = 'CURATED COLLECTION';
  $('position').textContent = section === 'four' ? '4 VEHICLES' : '2 VEHICLES';
  $('name').textContent = hall.title;
  $('description').textContent = hall.description;
  $('quick-specs').replaceChildren();
  $('closer').textContent = 'Enter the gallery';
  $('details-open').disabled = true;
  $('angle').disabled = true;
  $('commentary').textContent = hall.commentary;
  $('vehicle-select').value = '';
  document.querySelectorAll('.vehicle-card').forEach(card => card.setAttribute('aria-current', 'false'));
  bayByVehicle.forEach(({ ring }) => {
    ring.material.color.setHex(0x57f47d);
    ring.material.opacity = 0.65;
  });
}

function updateHallChrome(section) {
  const hall = HALLS[section];
  $('hall-kicker').textContent = hall.kicker;
  $('hall-name').textContent = hall.name;
  $('hall-count').textContent = hall.count;
  document.querySelectorAll('.hall-tabs button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.section === section)));
  const other = section === 'four' ? 'two' : 'four';
  $('jump-title').textContent = other === 'two' ? 'Go to two-wheelers' : 'Return to EV cars';
  $('jump-subtitle').textContent = other === 'two' ? 'Gallery 02 · follow the illuminated path' : 'Gallery 01 · return to the main hall';
  $('section-jump').setAttribute('aria-label', $('jump-title').textContent);
  $('section-jump').classList.toggle('reverse', section === 'two');
}

function buildDock() {
  const list = VEHICLES.filter(vehicle => vehicle.section === activeSection);
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = activeSection === 'four' ? 'Select an EV car' : 'Select a two-wheeler';
  const options = list.map(vehicle => {
    const option = document.createElement('option');
    option.value = vehicle.id;
    option.textContent = vehicle.name + ' - ' + vehicle.colour.replace(' display', '');
    return option;
  });
  $('vehicle-select').replaceChildren(placeholder, ...options);
  $('vehicle-select').value = selectedId || '';
}

async function showOverview(options = {}) {
  if (!options.keepTour) pauseTour();
  showSectionOverview(activeSection);
  await moveCamera(HALLS[activeSection].camera, HALLS[activeSection].target, options.duration || 1000);
  return true;
}

function vehicleCamera(vehicle) {
  if (vehicle.section === 'four') return vehicle.camera;
  return vehicle.camera;
}

function selectVehicleVisual(vehicle) {
  bayByVehicle.forEach(({ ring }, id) => {
    ring.material.color.setHex(id === vehicle.id ? 0xffffff : 0x57f47d);
    ring.material.opacity = id === vehicle.id ? 1 : 0.58;
  });
  const ring = bayByVehicle.get(vehicle.id).ring;
  selectionFx = { ring, started: performance.now() };
  invalidate();
}

async function selectVehicle(id, options = {}) {
  const vehicle = VEHICLES.find(item => item.id === id);
  if (!vehicle) return false;
  if (vehicle.section !== activeSection) await navigateSection(vehicle.section, { keepTour: options.keepTour, silent: true });
  if (!options.keepTour) pauseTour();
  if (!options.silent) playSelectSound();
  selectedId = id;
  $('vehicle-story').hidden = false;
  angleIndex = 0;
  $('category').textContent = vehicle.category;
  $('position').textContent = String(VEHICLES.filter(item => item.section === vehicle.section).indexOf(vehicle) + 1).padStart(2, '0') + ' / ' + String(VEHICLES.filter(item => item.section === vehicle.section).length).padStart(2, '0');
  $('name').textContent = vehicle.name;
  $('description').textContent = vehicle.description;
  $('selected-price').textContent = vehicle.price;
  renderQuickSpecs(vehicle);
  $('closer').textContent = 'Walk closer';
  $('details-open').disabled = false;
  $('angle').disabled = false;
  $('commentary').textContent = options.commentary || vehicle.greeting;
  $('vehicle-select').value = id;
  selectVehicleVisual(vehicle);
  await moveCamera(vehicleCamera(vehicle), [worldPosition(vehicle)[0], vehicle.section === 'two' ? 0.9 : 0.82, vehicle.position[2]], options.duration || 900);
  if (voiceConnection === 'live' && !options.skipServerSync) {
    sendShowroomAction('focus', { vehicleId: id, section: vehicle.section, mode: voiceMode });
    if (!options.keepTour && !options.silent) {
      voiceMode = 'questions';
      sendShowroomAction('select', { vehicleId: id, section: vehicle.section, mode: voiceMode, autoExplain: true });
    }
  }
  window.dispatchEvent(new CustomEvent('showroom:selection', { detail: { vehicleId: id, section: vehicle.section } }));
  return true;
}

function closerView() {
  if (!selectedId) {
    const first = VEHICLES.find(vehicle => vehicle.section === activeSection);
    selectVehicle(first.id);
    return;
  }
  const vehicle = VEHICLES.find(item => item.id === selectedId);
  const target = new THREE.Vector3(worldPosition(vehicle)[0], vehicle.section === 'two' ? 0.9 : 0.82, vehicle.position[2]);
  const direction = camera.position.clone().sub(target).normalize();
  const destination = target.clone().add(direction.multiplyScalar(vehicle.section === 'two' ? 2.25 : Math.max(2.9, vehicle.length * 0.73)));
  destination.y = vehicle.section === 'two' ? 1.4 : 1.55;
  playSelectSound();
  moveCamera(destination.toArray(), target.toArray(), 720);
}

function changeAngle() {
  if (!selectedId) return;
  const vehicle = VEHICLES.find(item => item.id === selectedId);
  const centerX = worldPosition(vehicle)[0];
  angleIndex = (angleIndex + 1) % 4;
  const scooter = vehicle.section === 'two';
  const radius = scooter ? 2.8 : Math.max(3.5, vehicle.length * 0.86);
  const angles = [0.58, -0.68, -2.12, 2.12];
  const angle = angles[angleIndex];
  const z = Math.max(-4.8, vehicle.position[2] + Math.cos(angle) * radius);
  const destination = [centerX + Math.sin(angle) * radius, scooter ? 1.48 : 1.7, z];
  playSelectSound();
  moveCamera(destination, [centerX, scooter ? 0.9 : 0.82, vehicle.position[2]], 820);
}

async function navigateSection(section, options = {}) {
  if (!HALLS[section] || section === activeSection) return showOverview(options);
  if (!options.keepTour) pauseTour();
  if (!options.silent) playNavigateSound();
  controls.enabled = false;
  $('loading').classList.remove('done');
  $('load-title').textContent = section === 'two' ? 'Preparing the two-wheeler studio' : 'Preparing the EV car hall';
  $('load-detail').textContent = 'Loading this gallery in the background';
  ensureSectionLoaded(section).then(() => {
    if (activeSection !== section) return;
    $('load-title').textContent = section === 'two' ? 'The two-wheeler studio is ready' : 'The EV car hall is ready';
    $('load-detail').textContent = 'Interactive displays and details are available';
    setTimeout(() => $('loading').classList.add('done'), 700);
  });
  $('transition-label').textContent = HALLS[section].name;
  $('transition').classList.add('active');
  await new Promise(resolve => setTimeout(resolve, reducedMotion ? 30 : 360));
  hallGroups.get(activeSection).visible = false;
  activeSection = section;
  hallGroups.get(activeSection).visible = true;
  const sectionReady = VEHICLES.filter(vehicle => vehicle.section === section).every(vehicle => modelByVehicle.has(vehicle.id) || failedModels.has(vehicle.id));
  if (sectionReady) {
    $('load-title').textContent = section === 'two' ? 'The two-wheeler studio is ready' : 'The EV car hall is ready';
    $('load-detail').textContent = 'Interactive displays and details are available';
    setTimeout(() => $('loading').classList.add('done'), 700);
  }
  camera.position.fromArray(HALLS[section].camera);
  controls.target.fromArray(HALLS[section].target);
  updateHallChrome(section);
  buildDock();
  showSectionOverview(section);
  invalidate();
  await new Promise(resolve => setTimeout(resolve, reducedMotion ? 30 : 380));
  $('transition').classList.remove('active');
  await new Promise(resolve => setTimeout(resolve, reducedMotion ? 20 : 360));  controls.enabled = true;
  if (voiceConnection === 'live') sendShowroomAction('focus', { section, vehicleId: selectedId || undefined, mode: voiceMode });
  window.dispatchEvent(new CustomEvent('showroom:section', { detail: { section } }));
  return true;
}

function openVehicleModal(vehicle = VEHICLES.find(item => item.id === selectedId)) {
  if (!vehicle) return;
  playSelectSound();
  $('modal-eyebrow').textContent = vehicle.category;
  $('modal-name').textContent = vehicle.name;
  $('modal-description').textContent = vehicle.description;
  $('modal-price').textContent = vehicle.price;
  $('modal-availability').textContent = vehicle.availability;
  $('modal-brand-story').textContent = vehicle.brand + ' - ' + vehicle.brandStory;
  $('modal-specs').replaceChildren(...vehicle.specs.map(([label, value]) => {
    const div = document.createElement('div');
    const small = document.createElement('small');
    const strong = document.createElement('strong');
    small.textContent = label;
    strong.textContent = value;
    div.append(small, strong);
    return div;
  }));
  $('modal-highlights').replaceChildren(...vehicle.highlights.map(text => {
    const li = document.createElement('li');
    li.textContent = text;
    return li;
  }));
  $('modal-note').textContent = vehicle.note;
  $('modal-source').href = vehicle.source;
  $('vehicle-modal').showModal();
}

function closeModal() {
  if ($('vehicle-modal').open) $('vehicle-modal').close();
}

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let pointerStart = null;
canvas.addEventListener('pointerdown', event => { pointerStart = { x: event.clientX, y: event.clientY }; });
canvas.addEventListener('pointerup', event => {
  if (!pointerStart || Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 7) return;
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(selectable, false).find(item => {
    const vehicle = VEHICLES.find(candidate => candidate.id === item.object.userData.vehicleId);
    return vehicle?.section === activeSection;
  });
  if (hit) selectVehicle(hit.object.userData.vehicleId);
});

function updateVoiceUI() {
  const live = voiceConnection === 'live';
  $('voice-toggle').dataset.live = String(live);
  $('voice-toggle').textContent = live ? 'End voice' : voiceConnection === 'connecting' ? 'Connecting...' : 'Start voice';
  $('voice-toggle').disabled = voiceConnection === 'connecting';
  $('mic-toggle').disabled = !live;
  $('mic-toggle').textContent = voiceMuted ? 'Mic off' : 'Mic on';
  $('mic-toggle').setAttribute('aria-pressed', String(!voiceMuted));
  if (voiceConnection === 'connecting') $('voice-detail').textContent = 'Connecting the live Agora guide...';
  else if (live) $('voice-detail').textContent = 'Ask naturally - Aarav knows the complete showroom.';
  else $('voice-detail').textContent = 'Explore silently or connect Aarav.';
}

function setGuideSpeaking(speaking) {
  const first = $('guide-video-one');
  const second = $('guide-video-two');
  const activeVideo = activeSection === 'two' ? second : first;
  const inactiveVideo = activeVideo === first ? second : first;
  $('guide-idle').hidden = speaking;
  const attentive = agentVoiceMode === 'thinking' || agentVoiceMode === 'listening';
  $('guide-idle').src = speaking ? $('guide-idle').src : (attentive ? '/assets/clay-guide-thinking.webp' : '/assets/clay-guide-presenting.webp');
  $('guide-idle').closest('.guide-avatar').dataset.speaking = String(speaking);
  inactiveVideo.hidden = true;
  inactiveVideo.pause();
  if (speaking) {
    activeVideo.hidden = false;
    if (activeVideo.paused) activeVideo.play().catch(() => {});
  } else {
    activeVideo.hidden = true;
    activeVideo.pause();
    activeVideo.currentTime = 0;
  }
}

function latestTranscript(entries, speaker) {
  return [...(entries || [])].reverse().find((entry) => entry.speaker === speaker && entry.text);
}

function normalizeNavigationText(text) {
  return String(text || '').toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{M}\p{N}\s-]/gu, ' ').replace(/\s+/g, ' ').trim();
}

function resolveLocalNavigation(text) {
  const value = normalizeNavigationText(text);
  if (!value) return null;
  const map = [
    [['punch', 'tata', 'grey car', 'gray car', 'silver car', 'compact suv', '\u091f\u093e\u091f\u093e', '\u0938\u094d\u0932\u0947\u091f\u0940 \u0915\u093e\u0930'], 'tata-punch-ev'],
    [['byd', 'han', 'orange car', 'red car', 'orange sedan', '\u092c\u0940\u0935\u093e\u0908\u0921\u0940', '\u0928\u093e\u0930\u0902\u0917\u0940 \u0915\u093e\u0930'], 'byd-han-ev'],
    [['kia', 'ev6', 'black car', 'black suv', 'dark suv', '\u0915\u093f\u0906', '\u0915\u093f\u092f\u093e \u0935\u093e\u0932\u0940', '\u0915\u093e\u0932\u0940 \u0915\u093e\u0930'], 'kia-electric-range'],
    [['comet', 'mg', 'white car', 'small white car', 'boxy white', '\u090f\u092e\u091c\u0940', '\u0938\u092b\u0947\u0926 \u0915\u093e\u0930'], 'mg-comet-ev'],
    [['ola', 's1', 'black scooter', '\u0913\u0932\u093e'], 'ola-s1-pro-reference'],
    [['vespa', 'yellow scooter', '\u0935\u0947\u0938\u094d\u092a\u093e', '\u092a\u0940\u0932\u093e \u0938\u094d\u0915\u0942\u091f\u0930'], 'vespa-elettrica-reference'],
  ];
  const explicitMatches = [...new Set(map.filter(([aliases]) => aliases.some(alias => value.includes(alias))).map(([, id]) => id))];
  if (explicitMatches.length === 1) {
    const vehicle = VEHICLES.find(item => item.id === explicitMatches[0]);
    return { type: 'vehicle', vehicleId: vehicle.id, section: vehicle.section, matchedBy: 'identity' };
  }
  const scooterContext = /(scooter|two.?wheeler|bike|\u0938\u094d\u0915\u0942\u091f\u0930|\u0926\u0941\u092a\u0939\u093f\u092f\u093e)/.test(value) || (activeSection === 'two' && !/(car|suv|sedan)/.test(value));
  if (/(most efficient|best efficiency|highest efficiency|most economical|least energy|sabse efficient|sabse kifayati|\u0938\u092c\u0938\u0947 \u0915\u0941\u0936\u0932)/.test(value)) {
    const vehicleId = scooterContext ? 'ola-s1-pro-reference' : 'mg-comet-ev';
    const vehicle = VEHICLES.find(item => item.id === vehicleId);
    return { type: 'vehicle', vehicleId, section: vehicle.section, matchedBy: 'efficiency' };
  }
  if (/(panoramic sunroof|panoramic roof)/.test(value)) return { type: 'vehicle', vehicleId: 'byd-han-ev', section: 'four', matchedBy: 'sunroof' };
  if (/(wide electric sunroof|electric sunroof)/.test(value)) return { type: 'vehicle', vehicleId: 'kia-electric-range', section: 'four', matchedBy: 'sunroof' };
  if (/(sunroof|roof wali|\u0938\u0928\u0930\u0942\u092b)/.test(value)) return { type: 'vehicle', vehicleId: 'kia-electric-range', section: 'four', matchedBy: 'sunroof' };
  if (/(another|any other|next car|next vehicle|agli|dusri|doosri)/.test(value)) {
    const list = VEHICLES.filter(vehicle => vehicle.section === activeSection);
    const current = Math.max(-1, list.findIndex(vehicle => vehicle.id === selectedId));
    const vehicle = list[(current + 1) % list.length];
    return { type: 'vehicle', vehicleId: vehicle.id, section: vehicle.section, matchedBy: 'next' };
  }
  if (/(two.?wheeler|scooter section|gallery two)/.test(value)) {
    return { type: 'section', section: 'two', matchedBy: 'section' };
  }
  if (/(car hall|four.?wheeler|gallery one)/.test(value)) {
    return { type: 'section', section: 'four', matchedBy: 'section' };
  }
  return null;
}

async function applyNavigationDirective(directive) {
  if (!directive) return false;
  if (directive.type === 'vehicle' && directive.vehicleId) {
    return selectVehicle(directive.vehicleId, { silent: true, duration: 900, skipServerSync: true });
  }
  if (directive.type === 'section' && directive.section) {
    return navigateSection(directive.section, { silent: true });
  }
  return false;
}

async function navigateFromSpeech(text, preResolved) {
  const localDirective = preResolved || resolveLocalNavigation(text);
  if (!localDirective) return false;
  await applyNavigationDirective(localDirective);
  if (voiceConnection !== 'live' || !voiceAdapter) return true;
  const response = await sendShowroomAction('resolve', {
    text,
    section: activeSection,
    vehicleId: selectedId || undefined,
    mode: voiceMode,
  });
  if (response?.navigation) {
    const sameTarget = response.navigation.type === localDirective.type
      && response.navigation.vehicleId === localDirective.vehicleId
      && response.navigation.section === localDirective.section;
    if (!sameTarget) await applyNavigationDirective(response.navigation);
  }
  return true;
}

function handleVoiceEvent(event) {
  const payload = event.payload || {};
  if (event.type === 'CALL_STATUS') {
    voiceConnection = payload.status === 'live' ? 'live' : payload.status === 'connecting' ? 'connecting' : voiceConnection;
    updateVoiceUI();
    return;
  }
  if (event.type === 'ERROR') {
    $('voice-detail').textContent = payload.message || 'The live guide could not connect.';
    if (payload.recoverable) return;
    voiceConnection = 'error';
    $('status').textContent = 'VOICE ERROR';
    $('commentary').textContent = 'Voice connection needs attention. You can continue exploring and try again.';
    updateVoiceUI();
    return;
  }
  if (event.type === 'AUDIO_PLAYBACK_STARTED') {
    $('audio-enable').hidden = true;
    setGuideSpeaking(true);
    window.clearTimeout(remoteSilenceTimer);
    remoteSilenceTimer = window.setTimeout(() => {
      if (agentVoiceMode !== 'speaking') setGuideSpeaking(false);
    }, 900);
    return;
  }
  if (event.type === 'AUDIO_AUTOPLAY_BLOCKED') {
    $('audio-enable').hidden = false;
    $('voice-detail').textContent = 'Your browser paused Aarav. Tap Enable sound.';
    return;
  }
  if (event.type === 'REMOTE_AUDIO_LEVEL') {
    if (Number(payload.level || 0) > 0.012) {
      setGuideSpeaking(true);
      window.clearTimeout(remoteSilenceTimer);
      remoteSilenceTimer = window.setTimeout(() => {
        if (agentVoiceMode !== 'speaking') setGuideSpeaking(false);
      }, 850);
    }
    return;
  }
  if (event.type === 'AGENT_STATE') {
    const previous = agentVoiceMode;
    agentVoiceMode = payload.mode || 'idle';
    const speaking = agentVoiceMode === 'speaking';
    setGuideSpeaking(speaking);
    if (speaking) voiceAdapter?.resumeRemoteAudio?.();
    $('status').textContent = speaking ? 'SPEAKING' : agentVoiceMode === 'thinking' ? 'THINKING' : agentVoiceMode === 'listening' ? 'LISTENING' : 'READY';
    if (previous === 'speaking' && agentVoiceMode === 'listening' && tourState === 'narrating') {
      window.clearTimeout(tourAdvanceTimer);
      if (tourIndex >= TOUR.length - 1) {
        tourState = 'complete';
        updateTourUI();
      } else {
        tourAdvanceTimer = window.setTimeout(() => runTourStop(tourIndex + 1), 650);
      }
    }
    return;
  }
  if (event.type === 'TRANSCRIPT_SYNC') {
    const ai = latestTranscript(payload.entries, 'ai');
    const you = latestTranscript(payload.entries, 'you');
    if (ai) $('commentary').textContent = ai.text;
    if (you?.text) {
      const transcriptKey = you.text.toLowerCase().trim();
      const directive = resolveLocalNavigation(you.text);
      if (directive && !handledUserTranscripts.has(transcriptKey)) {
        handledUserTranscripts.add(transcriptKey);
        if (handledUserTranscripts.size > 80) handledUserTranscripts.delete(handledUserTranscripts.values().next().value);
        navigateFromSpeech(you.text, directive).catch(error => {
          $('voice-detail').textContent = error.message || 'The showroom could not move to that display.';
        });
      }
    }
  }
}

async function connectVoice() {
  if (voiceConnection === 'live' || voiceConnection === 'connecting') return true;
  const factory = window.EasyEVAgoraBundle?.createWorldShowroomAgoraAdapter;
  if (!factory) {
    $('voice-detail').textContent = 'The voice client is unavailable.';
    return false;
  }
  voiceConnection = 'connecting';
  updateVoiceUI();
  voiceAdapter = factory();
  voiceUnsubscribe = voiceAdapter.onEvent(handleVoiceEvent);
  await voiceAdapter.unlockAudio?.();
  const vehicle = VEHICLES.find((item) => item.id === selectedId) || VEHICLES.find((item) => item.section === activeSection) || VEHICLES[0];
  try {
    await voiceAdapter.joinVehicle({
      vehicleId: vehicle.id,
      section: activeSection,
      language: window.EasyEVLanguage?.get?.() || 'Hinglish',
      voice: 'madhur',
      worldMode: true,
      commentaryMode: voiceMode,
    });
    voiceAdapter.resumeRemoteAudio?.();
    voiceConnection = 'live';
    $('status').textContent = 'LISTENING';
    updateVoiceUI();
    return true;
  } catch (error) {
    voiceConnection = 'error';
    $('voice-detail').textContent = error.message || 'Could not connect the guide.';
    updateVoiceUI();
    return false;
  }
}

async function disconnectVoice() {
  window.clearTimeout(tourAdvanceTimer);
  window.clearTimeout(remoteSilenceTimer);
  pauseTour();
  const adapter = voiceAdapter;
  voiceAdapter = null;
  voiceUnsubscribe?.();
  voiceUnsubscribe = null;
  voiceConnection = 'off';
  agentVoiceMode = 'idle';
  setGuideSpeaking(false);
  updateVoiceUI();
  $('status').textContent = 'OFFLINE';
  if (adapter) await adapter.leave().catch(() => {});
}

async function sendShowroomAction(action, payload = {}) {
  if (voiceConnection !== 'live' || !voiceAdapter) return null;
  try {
    return await voiceAdapter.showroomAction(action, payload);
  } catch (error) {
    $('voice-detail').textContent = error.message || 'The guide missed that scene update.';
    return null;
  }
}

async function startCommentary() {
  voiceMode = 'commentary';
  if (!await connectVoice()) return;
  await sendShowroomAction('commentary', { section: activeSection, vehicleId: selectedId || undefined, mode: voiceMode });
}

async function askGuide(text) {
  const question = String(text || '').trim();
  if (!question || !await connectVoice()) return;
  voiceMode = 'questions';
  pauseTour();
  await navigateFromSpeech(question);
  $('commentary').textContent = 'You: ' + question;
  await voiceAdapter.sendText(question);
}

const TOUR = [
  ...VEHICLES.filter(vehicle => vehicle.section === 'four').map(vehicle => ({ type: 'vehicle', id: vehicle.id, text: vehicle.tour })),
  { type: 'section', id: 'two', text: 'Let us follow the illuminated path into EasyEV Gallery Two, a separate studio built specifically for electric two-wheelers.' },
  ...VEHICLES.filter(vehicle => vehicle.section === 'two').map(vehicle => ({ type: 'vehicle', id: vehicle.id, text: vehicle.tour }))
];

function updateTourUI() {
  const labels = { idle: voiceConnection === 'live' ? 'LISTENING' : 'OFFLINE', moving: 'MOVING', narrating: 'SPEAKING', waiting: 'AT THIS STOP', paused: 'PAUSED', complete: 'TOUR COMPLETE' };
  $('status').textContent = labels[tourState] || 'READY';  $('pause').disabled = !['moving', 'narrating', 'waiting'].includes(tourState);
  $('start').disabled = tourState === 'moving';
  $('start').textContent = tourState === 'paused' ? 'Resume tour' : tourState === 'complete' ? 'Restart tour' : 'Start tour';
}

function pauseTour() {
  tourGeneration++;
  if (['moving', 'narrating', 'waiting'].includes(tourState)) {
    tourState = 'paused';
    window.clearTimeout(tourAdvanceTimer);
    if (voiceConnection === 'live') sendShowroomAction('stop', { section: activeSection, vehicleId: selectedId || undefined, mode: voiceMode });
    updateTourUI();
  }
}

async function runTourStop(index) {
  tourGeneration++;
  const generation = tourGeneration;
  tourIndex = Math.max(0, Math.min(index, TOUR.length - 1));
  const stop = TOUR[tourIndex];
  tourState = 'moving';
  updateTourUI();
  if (stop.type === 'section') {
    await navigateSection(stop.id, { keepTour: true });
    $('commentary').textContent = stop.text;
  } else {
    const vehicle = VEHICLES.find(item => item.id === stop.id);
    if (vehicle.section !== activeSection) await navigateSection(vehicle.section, { keepTour: true });
    await selectVehicle(stop.id, { keepTour: true, silent: true, commentary: stop.text });
  }
  if (generation !== tourGeneration) return;  $('commentary').textContent = stop.text;
  if (voiceConnection === 'live') {
    voiceMode = 'tour';
    tourState = 'narrating';
    updateTourUI();
    let sent = false;
    if (stop.type === 'vehicle') {
      const vehicle = VEHICLES.find(item => item.id === stop.id);
      sent = await sendShowroomAction('tour', { vehicleId: stop.id, section: vehicle.section, mode: voiceMode, stop: tourIndex });
    } else {
      sent = await sendShowroomAction('section', { section: stop.id, vehicleId: selectedId || undefined, mode: voiceMode, stop: tourIndex });
    }
    if (!sent) tourState = tourIndex === TOUR.length - 1 ? 'complete' : 'waiting';
  } else {
    tourState = tourIndex === TOUR.length - 1 ? 'complete' : 'waiting';
  }
  updateTourUI();
}

function nextTourStop() {
  runTourStop(tourState === 'complete' || tourIndex < 0 ? 0 : Math.min(tourIndex + 1, TOUR.length - 1));
}

document.querySelectorAll('.hall-tabs button').forEach(button => button.addEventListener('click', () => navigateSection(button.dataset.section)));
$('section-jump').addEventListener('click', () => navigateSection(activeSection === 'four' ? 'two' : 'four'));
$('vehicle-select').addEventListener('change', event => {
  if (event.target.value) selectVehicle(event.target.value);
});
$('guide-toggle').addEventListener('click', () => {
  const guide = document.querySelector('.guide');
  const collapsed = guide.classList.toggle('is-collapsed');
  $('guide-toggle').setAttribute('aria-expanded', String(!collapsed));
  $('guide-toggle').setAttribute('aria-label', collapsed ? 'Show Aarav controls' : 'Hide Aarav controls');
  $('guide-toggle').textContent = collapsed ? '\u203A' : '\u2039';
});
$('overview').addEventListener('click', () => showOverview());
$('closer').addEventListener('click', closerView);
$('details-open').addEventListener('click', () => openVehicleModal());
$('angle').addEventListener('click', changeAngle);
$('start').addEventListener('click', async () => {
  voiceMode = 'tour';
  await connectVoice();
  runTourStop(tourState === 'paused' ? Math.max(0, tourIndex) : 0);
});
$('next').addEventListener('click', nextTourStop);
$('pause').addEventListener('click', pauseTour);
$('commentary-start').addEventListener('click', startCommentary);
$('voice-toggle').addEventListener('click', () => voiceConnection === 'live' ? disconnectVoice() : connectVoice());
$('audio-enable').addEventListener('click', async () => {
  const resumed = await voiceAdapter?.unlockAudio?.();
  $('audio-enable').hidden = Boolean(resumed);
  $('voice-detail').textContent = resumed ? 'Sound enabled. Aarav is ready.' : 'Sound is still blocked. Check this tab and device volume.';
});
$('mic-toggle').addEventListener('click', async () => {
  if (!voiceAdapter || voiceConnection !== 'live') return;
  voiceMuted = !voiceMuted;
  await voiceAdapter.setMuted(voiceMuted);
  updateVoiceUI();
});
$('ask-form').addEventListener('submit', event => {
  event.preventDefault();
  const value = $('ask-input').value;
  $('ask-input').value = '';
  askGuide(value);
});
$('enter-guided').addEventListener('click', () => enterShowroom(true));
$('enter-silent').addEventListener('click', () => enterShowroom(false));
$('entry-retry').addEventListener('click', retryCollection);
$('sound-toggle').addEventListener('click', () => {
  audioEnabled = !audioEnabled;
  $('sound-toggle').setAttribute('aria-pressed', String(audioEnabled));
  $('sound-toggle').querySelector('span').textContent = audioEnabled ? 'Sound on' : 'Sound off';
  if (audioEnabled) playSelectSound();
});
$('modal-close').addEventListener('click', closeModal);
$('modal-view').addEventListener('click', closeModal);
$('vehicle-modal').addEventListener('click', event => { if (event.target === $('vehicle-modal')) closeModal(); });
$('credits-open').addEventListener('click', () => $('credits').showModal());
$('credits-close').addEventListener('click', () => $('credits').close());
$('credits').addEventListener('click', event => { if (event.target === $('credits')) $('credits').close(); });

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25));
  invalidate();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    cancelAnimationFrame(raf);
    raf = 0;
  } else invalidate();
});

window.EasyEVWorld = {
  focusVehicle: id => selectVehicle(id),
  focusSection: section => navigateSection(section),
  showOverview,
  openVehicleDetails: id => openVehicleModal(VEHICLES.find(vehicle => vehicle.id === (id || selectedId))),
  startTour: () => runTourStop(0),
  pauseTour,
  resumeTour: () => runTourStop(Math.max(0, tourIndex)),
  nextVehicle: nextTourStop,
  setSound: enabled => {
    audioEnabled = Boolean(enabled);
    $('sound-toggle').setAttribute('aria-pressed', String(audioEnabled));
  },  connectGuide: connectVoice,
  disconnectGuide: disconnectVoice,
  askGuide,
  navigateFromSpeech,
  startCommentary,
  getState: () => ({
    vehicleId: selectedId,
    section: activeSection,
    tour: tourState,
    stop: tourIndex,
    loaded: [...modelByVehicle.keys()],
    failed: [...failedModels],    sound: audioEnabled,
    voice: { connection: voiceConnection, mode: voiceMode, agent: agentVoiceMode, muted: voiceMuted, audio: voiceAdapter?.getAudioState?.() || null },
    ready: modelByVehicle.size === VEHICLES.length && failedModels.size === 0,
    entered: hasEntered,
    camera: camera.position.toArray().map(value => Math.round(value * 100) / 100),
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles
  })
};

updateHallChrome('four');
buildDock();
showSectionOverview('four');
updateTourUI();
updateVoiceUI();
loadCollection();
invalidate();







