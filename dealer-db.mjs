import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname);
const DATA_DIR = resolve(ROOT, 'data');
const DB_FILE = resolve(DATA_DIR, 'dealers.json');

// Initial seed dealers to immediately populate the database with realistic EV dealers
const SEED_DEALERS = [
  {
    id: 'EEV-DLR-2026-1001',
    shopName: 'Tata Motors EV Hub - South Extension',
    dealerType: 'Authorized OEM Dealership',
    contactPerson: {
      name: 'Rajesh Sharma',
      role: 'Showroom Manager',
      phone: '+91 98112 34567',
      email: 'sales@tataev-southext.in',
      whatsapp: '+91 98112 34567'
    },
    location: {
      address: 'Plot 42, Ring Road, South Extension Part II',
      landmark: 'Opposite Metro Pillar 114',
      city: 'New Delhi',
      state: 'Delhi',
      pincode: '110049',
      coordinates: { lat: 28.5684, lng: 77.2183 }
    },
    timings: {
      openTime: '09:30 AM',
      closeTime: '08:30 PM',
      workingDays: 'All 7 Days',
      allDaysOpen: true
    },
    categories: ['4W'],
    brands: ['Tata Motors'],
    inventoryScale: '15+ EVs',
    services: {
      emiAvailable: true,
      emiPartners: ['HDFC Bank', 'State Bank of India', 'Tata Capital', 'ICICI Bank', 'Bajaj Finserv'],
      minDownPaymentPercent: 10,
      insuranceAvailable: true,
      insuranceTypes: ['Comprehensive', 'Zero-Depreciation', 'Battery Replacement Cover', '24x7 Roadside Assistance'],
      extendedWarranty: true,
      batteryAssurance: true,
      chargingOnSite: true,
      chargerType: 'Fast DC (60kW)'
    },
    testDrive: {
      showroomTestDrive: true,
      homeTestDrive: true,
      availableSlots: [
        { id: 'morning', label: 'Morning (10:00 AM - 01:00 PM)', active: true },
        { id: 'afternoon', label: 'Afternoon (01:00 PM - 05:00 PM)', active: true },
        { id: 'evening', label: 'Evening (05:00 PM - 08:00 PM)', active: true }
      ]
    },
    verificationStatus: 'verified',
    registeredAt: '2026-09-01T10:00:00.000Z'
  },
  {
    id: 'EEV-DLR-2026-1002',
    shopName: 'MG Select EV Gallery - Golf Course Road',
    dealerType: 'Authorized OEM Dealership',
    contactPerson: {
      name: 'Pooja Verma',
      role: 'EV Specialist Lead',
      phone: '+91 99201 88412',
      email: 'ev@mgselect-gurgaon.com',
      whatsapp: '+91 99201 88412'
    },
    location: {
      address: 'Tower B, One Horizon Center, Sector 43, Golf Course Road',
      landmark: 'Near Sector 42-43 Rapid Metro Station',
      city: 'Gurgaon',
      state: 'Haryana',
      pincode: '122002',
      coordinates: { lat: 28.4744, lng: 77.0984 }
    },
    timings: {
      openTime: '10:00 AM',
      closeTime: '08:00 PM',
      workingDays: 'All 7 Days',
      allDaysOpen: true
    },
    categories: ['4W'],
    brands: ['MG Motor'],
    inventoryScale: '15+ EVs',
    services: {
      emiAvailable: true,
      emiPartners: ['Kotak Mahindra Bank', 'HDFC Bank', 'Axis Bank', 'SBI'],
      minDownPaymentPercent: 15,
      insuranceAvailable: true,
      insuranceTypes: ['Comprehensive', 'Zero-Depreciation', 'Return to Invoice', 'Battery Assurance'],
      extendedWarranty: true,
      batteryAssurance: true,
      chargingOnSite: true,
      chargerType: 'Fast DC (50kW)'
    },
    testDrive: {
      showroomTestDrive: true,
      homeTestDrive: true,
      availableSlots: [
        { id: 'morning', label: 'Morning (10:00 AM - 01:00 PM)', active: true },
        { id: 'afternoon', label: 'Afternoon (01:00 PM - 05:00 PM)', active: true },
        { id: 'evening', label: 'Evening (05:00 PM - 07:30 PM)', active: true }
      ]
    },
    verificationStatus: 'verified',
    registeredAt: '2026-09-02T11:30:00.000Z'
  },
  {
    id: 'EEV-DLR-2026-1003',
    shopName: 'Ather Space & Experience Center - Indiranagar',
    dealerType: 'Authorized OEM Dealership',
    contactPerson: {
      name: 'Karthik Rao',
      role: 'Community & Experience Manager',
      phone: '+91 98450 67123',
      email: 'indiranagar@atherspace.in',
      whatsapp: '+91 98450 67123'
    },
    location: {
      address: '772, 100 Feet Road, HAL 2nd Stage, Indiranagar',
      landmark: 'Near Doopanahalli Junction',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560038',
      coordinates: { lat: 12.9716, lng: 77.6412 }
    },
    timings: {
      openTime: '09:00 AM',
      closeTime: '09:00 PM',
      workingDays: 'All 7 Days',
      allDaysOpen: true
    },
    categories: ['2W'],
    brands: ['Ather Energy'],
    inventoryScale: '15+ EVs',
    services: {
      emiAvailable: true,
      emiPartners: ['Bajaj Finserv', 'IDFC First Bank', 'HDFC Bank', 'Tata Capital'],
      minDownPaymentPercent: 5,
      insuranceAvailable: true,
      insuranceTypes: ['Comprehensive 1+4 Year', 'Zero-Depreciation', 'Ather Battery Protect'],
      extendedWarranty: true,
      batteryAssurance: true,
      chargingOnSite: true,
      chargerType: 'Ather Grid Fast Charger'
    },
    testDrive: {
      showroomTestDrive: true,
      homeTestDrive: true,
      availableSlots: [
        { id: 'morning', label: 'Morning (09:30 AM - 01:00 PM)', active: true },
        { id: 'afternoon', label: 'Afternoon (01:00 PM - 05:00 PM)', active: true },
        { id: 'evening', label: 'Evening (05:00 PM - 08:30 PM)', active: true }
      ]
    },
    verificationStatus: 'verified',
    registeredAt: '2026-09-02T14:15:00.000Z'
  },
  {
    id: 'EEV-DLR-2026-1004',
    shopName: 'GreenWheels Multi-Brand EV Mobility Hub',
    dealerType: 'Multi-Brand EV Showroom',
    contactPerson: {
      name: 'Amit Agarwal',
      role: 'Managing Partner',
      phone: '+91 98200 45678',
      email: 'contact@greenwheelsev.in',
      whatsapp: '+91 98200 45678'
    },
    location: {
      address: 'Shop 10-14, Link Road, Andheri West',
      landmark: 'Near Infiniti Mall',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400053',
      coordinates: { lat: 19.1363, lng: 72.8277 }
    },
    timings: {
      openTime: '10:00 AM',
      closeTime: '08:30 PM',
      workingDays: 'Monday to Saturday',
      allDaysOpen: false
    },
    categories: ['4W', '2W', '3W'],
    brands: ['Tata Motors', 'Mahindra', 'Ola Electric', 'TVS', 'Piaggio'],
    inventoryScale: '15+ EVs',
    services: {
      emiAvailable: true,
      emiPartners: ['SBI', 'HDFC Bank', 'L&T Finance', 'Bajaj Finserv'],
      minDownPaymentPercent: 10,
      insuranceAvailable: true,
      insuranceTypes: ['Comprehensive', 'Zero-Depreciation', 'Battery Warranty Extension'],
      extendedWarranty: true,
      batteryAssurance: true,
      chargingOnSite: true,
      chargerType: 'AC Dual Slow + 30kW DC Fast'
    },
    testDrive: {
      showroomTestDrive: true,
      homeTestDrive: true,
      availableSlots: [
        { id: 'morning', label: 'Morning (10:30 AM - 01:30 PM)', active: true },
        { id: 'afternoon', label: 'Afternoon (02:00 PM - 05:30 PM)', active: true },
        { id: 'evening', label: 'Evening (05:30 PM - 08:00 PM)', active: true }
      ]
    },
    verificationStatus: 'verified',
    registeredAt: '2026-09-03T09:45:00.000Z'
  },
  {
    id: 'EEV-DLR-2026-1005',
    shopName: 'Pragati EV Auto & Commercial Fleet Center',
    dealerType: 'Commercial & Fleet EV Center',
    contactPerson: {
      name: 'Sunil Chaudhary',
      role: 'Commercial EV Sales Head',
      phone: '+91 98188 90123',
      email: 'fleet@pragatiev.com',
      whatsapp: '+91 98188 90123'
    },
    location: {
      address: 'B-18, Sector 63, Commercial Complex',
      landmark: 'Near Electronic City Metro Station',
      city: 'Noida',
      state: 'Uttar Pradesh',
      pincode: '201301',
      coordinates: { lat: 28.6256, lng: 77.3822 }
    },
    timings: {
      openTime: '09:00 AM',
      closeTime: '07:30 PM',
      workingDays: 'Monday to Saturday',
      allDaysOpen: false
    },
    categories: ['3W', 'commercial'],
    brands: ['Piaggio', 'Mahindra', 'Euler Motors', 'Altigreen'],
    inventoryScale: '15+ EVs',
    services: {
      emiAvailable: true,
      emiPartners: ['SBI Commercial', 'Mudra Loan Partner', 'Mahindra Finance', 'Cholamandalam'],
      minDownPaymentPercent: 5,
      insuranceAvailable: true,
      insuranceTypes: ['Commercial Vehicle Comprehensive', 'Battery Cover', 'Third-Party Mandatory'],
      extendedWarranty: true,
      batteryAssurance: true,
      chargingOnSite: true,
      chargerType: 'Dual 15A/30A Industrial AC Hub'
    },
    testDrive: {
      showroomTestDrive: true,
      homeTestDrive: false,
      availableSlots: [
        { id: 'morning', label: 'Morning (09:30 AM - 01:00 PM)', active: true },
        { id: 'afternoon', label: 'Afternoon (02:00 PM - 06:00 PM)', active: true }
      ]
    },
    verificationStatus: 'verified',
    registeredAt: '2026-09-03T16:20:00.000Z'
  }
];

class DealerDatabase {
  constructor() {
    this.dealers = [];
    this.init();
  }

  init() {
    try {
      if (!existsSync(DATA_DIR)) {
        mkdirSync(DATA_DIR, { recursive: true });
      }

      if (existsSync(DB_FILE)) {
        const raw = readFileSync(DB_FILE, 'utf8');
        this.dealers = JSON.parse(raw);
      } else {
        this.dealers = [...SEED_DEALERS];
        this.saveToDisk();
      }
    } catch (err) {
      console.warn('DealerDatabase init error, falling back to seed dealers:', err.message);
      this.dealers = [...SEED_DEALERS];
    }
  }

  saveToDisk() {
    try {
      if (!existsSync(DATA_DIR)) {
        mkdirSync(DATA_DIR, { recursive: true });
      }
      writeFileSync(DB_FILE, JSON.stringify(this.dealers, null, 2), 'utf8');
      return true;
    } catch (err) {
      console.error('Failed to save dealers.json to disk:', err.message);
      return false;
    }
  }

  generateId() {
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    return `EEV-DLR-2026-${randomSuffix}`;
  }

  registerDealer(input) {
    if (!input || typeof input !== 'object') {
      throw new Error('Invalid dealer payload');
    }

    const shopName = String(input.shopName || input.name || '').trim();
    if (!shopName) {
      throw new Error('Shop Name is required');
    }

    const contactName = String(input.contactPerson?.name || input.contactName || '').trim();
    const phone = String(input.contactPerson?.phone || input.phone || '').trim();
    if (!phone) {
      throw new Error('Contact phone number is required');
    }
    const email = String(input.contactPerson?.email || input.email || '').trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('Valid official email address is required');
    }

    const city = String(input.location?.city || input.city || '').trim();
    const address = String(input.location?.address || input.address || '').trim();
    const pincode = String(input.location?.pincode || input.pincode || '').trim();

    const categories = Array.isArray(input.categories) && input.categories.length > 0
      ? input.categories
      : ['4W'];

    const brands = Array.isArray(input.brands) && input.brands.length > 0
      ? input.brands
      : ['Tata Motors'];

    const newDealer = {
      id: input.id || this.generateId(),
      shopName,
      dealerType: input.dealerType || 'Authorized OEM Dealership',
      contactPerson: {
        name: contactName || 'Store Manager',
        role: input.contactPerson?.role || input.role || 'Showroom Lead',
        phone,
        email,
        whatsapp: String(input.contactPerson?.whatsapp || input.whatsapp || phone).trim()
      },
      location: {
        address: address || 'Main Road',
        landmark: String(input.location?.landmark || input.landmark || '').trim(),
        city: city || 'New Delhi',
        state: String(input.location?.state || input.state || 'Delhi').trim(),
        pincode: pincode || '110001',
        coordinates: input.location?.coordinates || { lat: 28.6139, lng: 77.2090 }
      },
      timings: {
        openTime: input.timings?.openTime || input.openTime || '09:30 AM',
        closeTime: input.timings?.closeTime || input.closeTime || '08:30 PM',
        workingDays: input.timings?.workingDays || input.workingDays || 'All 7 Days',
        allDaysOpen: input.timings?.allDaysOpen !== false
      },
      categories,
      brands,
      inventoryScale: input.inventoryScale || '5-15 EVs',
      services: {
        emiAvailable: Boolean(input.services?.emiAvailable ?? input.emiAvailable ?? true),
        emiPartners: Array.isArray(input.services?.emiPartners) ? input.services.emiPartners : (input.emiPartners || ['HDFC Bank', 'SBI', 'Tata Capital', 'Bajaj Finserv']),
        minDownPaymentPercent: Number(input.services?.minDownPaymentPercent || input.minDownPaymentPercent || 10),
        insuranceAvailable: Boolean(input.services?.insuranceAvailable ?? input.insuranceAvailable ?? true),
        insuranceTypes: Array.isArray(input.services?.insuranceTypes) ? input.services.insuranceTypes : ['Comprehensive', 'Zero-Depreciation', 'Battery Cover'],
        extendedWarranty: Boolean(input.services?.extendedWarranty ?? true),
        batteryAssurance: Boolean(input.services?.batteryAssurance ?? true),
        chargingOnSite: Boolean(input.services?.chargingOnSite ?? input.chargingOnSite ?? true),
        chargerType: input.services?.chargerType || input.chargerType || 'Fast DC (50kW)'
      },
      testDrive: {
        showroomTestDrive: Boolean(input.testDrive?.showroomTestDrive ?? input.showroomTestDrive ?? true),
        homeTestDrive: Boolean(input.testDrive?.homeTestDrive ?? input.homeTestDrive ?? true),
        availableSlots: Array.isArray(input.testDrive?.availableSlots) && input.testDrive.availableSlots.length > 0
          ? input.testDrive.availableSlots
          : [
              { id: 'morning', label: 'Morning (10:00 AM - 01:00 PM)', active: true },
              { id: 'afternoon', label: 'Afternoon (01:00 PM - 05:00 PM)', active: true },
              { id: 'evening', label: 'Evening (05:00 PM - 08:00 PM)', active: true }
            ]
      },
      verificationStatus: 'verified',
      registeredAt: new Date().toISOString()
    };

    this.dealers.unshift(newDealer);
    this.saveToDisk();
    return newDealer;
  }

  addDealer(input) {
    return this.registerDealer(input);
  }

  findDealers(filters = {}) {
    let result = [...this.dealers];

    if (filters.city) {
      const cityQuery = String(filters.city).trim().toLowerCase();
      result = result.filter(d => d.location.city.toLowerCase().includes(cityQuery));
    }

    if (filters.pincode) {
      const pinQuery = String(filters.pincode).trim();
      result = result.filter(d => d.location.pincode.startsWith(pinQuery));
    }

    if (filters.category) {
      const catQuery = String(filters.category).trim().toUpperCase();
      result = result.filter(d => d.categories.some(c => c.toUpperCase() === catQuery));
    }

    if (filters.brand) {
      const brandQuery = String(filters.brand).trim().toLowerCase();
      result = result.filter(d => d.brands.some(b => b.toLowerCase().includes(brandQuery)));
    }

    if (filters.hasEmi === true || filters.hasEmi === 'true') {
      result = result.filter(d => d.services.emiAvailable);
    }

    if (filters.hasInsurance === true || filters.hasInsurance === 'true') {
      result = result.filter(d => d.services.insuranceAvailable);
    }

    if (filters.hasTestDrive === true || filters.hasTestDrive === 'true') {
      result = result.filter(d => d.testDrive.showroomTestDrive || d.testDrive.homeTestDrive);
    }

    return result;
  }

  getDealerById(id) {
    if (!id) return null;
    const target = String(id).trim().toLowerCase();
    return this.dealers.find(d => 
      (d.id && d.id.toLowerCase() === target) ||
      (d.partnerId && d.partnerId.toLowerCase() === target) ||
      (d.contactPerson?.phone && d.contactPerson.phone.replace(/\D/g, '') === target.replace(/\D/g, ''))
    ) || null;
  }

  getDealerStats() {
    const total = this.dealers.length;
    const cities = new Set(this.dealers.map(d => d.location.city));
    const fourWheelers = this.dealers.filter(d => d.categories.includes('4W')).length;
    const twoWheelers = this.dealers.filter(d => d.categories.includes('2W')).length;
    const threeWheelers = this.dealers.filter(d => d.categories.includes('3W')).length;
    const commercial = this.dealers.filter(d => d.categories.includes('commercial')).length;
    const withEmi = this.dealers.filter(d => d.services.emiAvailable).length;
    const withInsurance = this.dealers.filter(d => d.services.insuranceAvailable).length;
    const withTestDrive = this.dealers.filter(d => d.testDrive.showroomTestDrive || d.testDrive.homeTestDrive).length;

    return {
      totalDealers: total,
      verifiedDealers: this.dealers.filter(d => d.verificationStatus === 'verified').length,
      citiesCovered: cities.size,
      cityList: Array.from(cities),
      categoryBreakdown: {
        '4W': fourWheelers,
        '2W': twoWheelers,
        '3W': threeWheelers,
        'commercial': commercial
      },
      servicesStats: {
        withEmi,
        withInsurance,
        withTestDrive
      }
    };
  }
}

export const dealerDb = new DealerDatabase();
export default dealerDb;
