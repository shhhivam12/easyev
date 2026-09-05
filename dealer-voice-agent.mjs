import { randomUUID } from 'node:crypto';
import { dealerDb } from './dealer-db.mjs';

/**
 * Canonical Schema & Default State for Dealer Onboarding Form
 */
export const CANONICAL_DEALER_FIELDS = {
  // Step 1: Dealership Profile
  shopName: { step: 1, label: 'Dealership / Shop Name', required: true, type: 'string', group: 'profile' },
  managerName: { step: 1, label: 'Owner / Manager Name', required: true, type: 'string', group: 'profile' },
  phone: { step: 1, label: 'Mobile / WhatsApp Number', required: true, type: 'phone', group: 'profile' },
  city: { step: 1, label: 'City', required: true, type: 'string', group: 'profile' },
  dealerType: { step: 1, label: 'Dealership Type', required: false, type: 'enum', default: 'Authorized OEM Dealership', group: 'profile', isDefault: true },
  email: { step: 1, label: 'Business Email Address', required: false, type: 'email', group: 'profile' },

  // Step 2: Location & Timings
  address: { step: 2, label: 'Showroom Street Address', required: true, type: 'string', group: 'location' },
  pincode: { step: 2, label: 'Pincode', required: true, type: 'pincode', group: 'location' },
  workingDays: { step: 2, label: 'Working Days', required: false, type: 'string', default: 'All 7 Days', group: 'timings', isDefault: true },
  openTime: { step: 2, label: 'Opening Time', required: false, type: 'time', default: '09:30 AM', group: 'timings', isDefault: true },
  closeTime: { step: 2, label: 'Closing Time', required: false, type: 'time', default: '08:30 PM', group: 'timings', isDefault: true },
  landmark: { step: 2, label: 'Landmark', required: false, type: 'string', group: 'location' },
  state: { step: 2, label: 'State', required: false, type: 'string', group: 'location' },

  // Step 3: EV Categories & Brands
  categories: { step: 3, label: 'EV Categories', required: false, type: 'array', default: ['4W', '2W', '3W', 'commercial'], group: 'inventory', isDefault: true },
  brands: { step: 3, label: 'EV Brands Sold', required: true, type: 'array', default: [], group: 'inventory' },
  inventoryScale: { step: 3, label: 'Floor Inventory Scale', required: false, type: 'string', default: '5-15 EVs', group: 'inventory', isDefault: true },

  // Step 4: Services & Test Drives
  emiAvailable: { step: 4, label: 'EMI / Loan Available', required: true, type: 'boolean', default: true, group: 'services' },
  insuranceAvailable: { step: 4, label: 'Insurance Packages Available', required: true, type: 'boolean', default: true, group: 'services' },
  chargingOnSite: { step: 4, label: 'On-site EV Charger', required: false, type: 'boolean', default: true, group: 'services' },
  showroomTestDrive: { step: 4, label: 'Showroom Test Drives', required: true, type: 'boolean', default: true, group: 'testDrive' },
  homeTestDrive: { step: 4, label: 'Doorstep / Home Test Drives', required: false, type: 'boolean', default: true, group: 'testDrive' },
  chargerType: { step: 4, label: 'Charger Specification', required: false, type: 'string', default: 'Fast DC (50kW - 60kW)', group: 'services', isDefault: true },
  emiPartners: { step: 4, label: 'EMI Partner Banks', required: false, type: 'array', default: ['HDFC Bank', 'State Bank of India', 'Tata Capital', 'Bajaj Finserv'], group: 'services', isDefault: true },
  insuranceTypes: { step: 4, label: 'Insurance Covers', required: false, type: 'array', default: ['Zero-Depreciation', 'Battery Protection Cover', 'Comprehensive 1+3 Year', '24x7 Roadside Assistance'], group: 'services', isDefault: true },
  testDriveSlots: { step: 4, label: 'Available Test Drive Slots', required: false, type: 'array', default: ['morning', 'afternoon', 'evening'], group: 'testDrive', isDefault: true }
};

/**
 * Deterministic Validators
 */
export const validators = {
  phone(val) {
    if (!val) return { valid: false, reason: 'Phone number is required' };
    const clean = String(val).replace(/[^0-9]/g, '');
    const tenDigits = clean.length === 10 ? clean : clean.length > 10 ? clean.slice(-10) : null;
    if (tenDigits && /^[6-9]\d{9}$/.test(tenDigits)) {
      return { valid: true, value: tenDigits, formatted: `+91 ${tenDigits}` };
    }
    return { valid: false, reason: 'Must be a 10-digit Indian mobile number starting with 6-9' };
  },

  email(val) {
    if (!val) return { valid: true, value: '' };
    const clean = String(val).trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (emailRegex.test(clean)) {
      return { valid: true, value: clean };
    }
    return { valid: false, reason: 'Invalid email address format' };
  },

  pincode(val) {
    if (!val) return { valid: false, reason: 'Pincode is required' };
    const clean = String(val).replace(/[^0-9]/g, '');
    if (clean.length === 6 && /^[1-9]\d{5}$/.test(clean)) {
      return { valid: true, value: clean };
    }
    return { valid: false, reason: 'Must be a valid 6-digit Indian postal pincode' };
  },

  string(val, minLen = 2) {
    const clean = String(val || '').trim();
    if (clean.length >= minLen) {
      return { valid: true, value: clean };
    }
    return { valid: false, reason: `Must have at least ${minLen} characters` };
  },

  time(val) {
    const clean = String(val || '').trim();
    if (/\d{1,2}:\d{2}\s*(AM|PM)/i.test(clean)) {
      return { valid: true, value: clean.toUpperCase() };
    }
    return { valid: false, reason: 'Must be in format HH:MM AM/PM' };
  },

  array(val) {
    if (Array.isArray(val) && val.length > 0) {
      return { valid: true, value: val };
    }
    return { valid: false, reason: 'At least one item must be selected' };
  }
};

/**
 * Intelligent Spoken Number Word Parser
 * Converts "double nine eight eight...", "nau aath saat chhe...", "one one zero zero four nine" to digits
 */
export function parseSpokenNumberWords(text = '') {
  if (!text) return [];
  let normalized = text.toLowerCase()
    .replace(/\bdouble\s+([a-z0-9]+)/gi, '$1 $1')
    .replace(/\btriple\s+([a-z0-9]+)/gi, '$1 $1 $1')
    .replace(/\bdo\s+baar\s+([a-z0-9]+)/gi, '$1 $1')
    .replace(/\bteen\s+baar\s+([a-z0-9]+)/gi, '$1 $1 $1');

  const wordMap = {
    'zero': '0', 'shunya': '0', 'sifar': '0', 'o': '0', 'oh': '0', 'zeroo': '0',
    'one': '1', 'ek': '1', 'ik': '1',
    'two': '2', 'do': '2', 'too': '2', 'to': '2',
    'three': '3', 'teen': '3',
    'four': '4', 'chaar': '4', 'char': '4', 'for': '4',
    'five': '5', 'paanch': '5', 'panch': '5',
    'six': '6', 'chhe': '6', 'che': '6', 'chha': '6', 'sixx': '6',
    'seven': '7', 'saat': '7', 'sat': '7',
    'eight': '8', 'aath': '8', 'ath': '8',
    'nine': '9', 'nau': '9', 'naw': '9', 'no': '9'
  };

  const tokens = normalized.split(/[\s,.-]+/);
  let currentSeq = '';
  const sequences = [];

  for (const t of tokens) {
    if (wordMap[t] !== undefined) {
      if (t === 'no' && currentSeq.length < 2) continue;
      currentSeq += wordMap[t];
    } else if (/^\d+$/.test(t)) {
      currentSeq += t;
    } else {
      if (currentSeq) {
        sequences.push(currentSeq);
        currentSeq = '';
      }
    }
  }
  if (currentSeq) sequences.push(currentSeq);

  return sequences;
}

/**
 * Intelligent Dealer FAQ & Queries Interceptor
 */
export function handleDealerFaq(text = '', language = 'Hinglish') {
  const lower = (text || '').toLowerCase().trim();
  if (!lower) return null;

  // Cost / Charges / Commission FAQ
  if (/(?:charge|fee|fees|cost|paisa|paise|rupaye|commission|free|kitn[ai]\s*lageg[ai]|kitn[ai]\s*kharcha|पैसे|शुल्क|फीस|फ्री)/i.test(lower)) {
    return language === 'Hindi'
      ? 'EasyEV पर डीलरशिप रजिस्ट्रेशन 100% मुफ़्त है! इसके लिए कोई भी रजिस्ट्रेशन शुल्क या कमीशन नहीं लिया जाता।'
      : 'EasyEV par showroom registration 100% free of charge hai! Koi hidden fee ya commission nahi lagta.';
  }

  // Benefits / Why register FAQ
  if (/(?:kya fayda|fayda kya|why register|benefit|kyu judu|kya milega|फायda|लाभ)/i.test(lower)) {
    return language === 'Hindi'
      ? 'EasyEV पार्टनर बनने से आपके इलाके के खरीदारों की टेस्ट ड्राइव बुकिंग और ईवी इंक्वायरी सीधे आपके शोरूम को प्राप्त होती हैं।'
      : 'EasyEV verified partner banne par aapke area ke serious buyers ki test drive bookings aur verified purchase leads direct aapke showroom ko milti hain.';
  }

  // Documents required FAQ
  if (/(?:document|kagaz|paper|upload|kyc|दस्तावेज|कागजात)/i.test(lower)) {
    return language === 'Hindi'
      ? 'आपको कोई दस्तावेज़ अपलोड करने की ज़रूरत नहीं है! बस नाम, पता और ब्रांड्स नोट कराकर तुरंत डिजिटल सर्टिफिकेट जारी हो जाता है।'
      : 'Aapko koi bhi document upload nahi karna hai. Bas basic address, manager contact aur brands confirm karke instant Verified Certificate issue ho jata hai.';
  }

  // Safety / Certificate FAQ
  if (/(?:certificate|verified|authentic|partner id|सर्टिफिकेट|प्रमाण पत्र)/i.test(lower)) {
    return language === 'Hindi'
      ? 'रजिस्ट्रेशन पूरा होते ही आपकी स्क्रीन पर आधिकारिक EasyEV पार्टनर सर्टिफिकेट और पार्टनर आईडी तुरंत जारी हो जाता है।'
      : 'Form submit hote hi screen par aapki official EasyEV Partner ID aur digital verified certificate turant generate ho jata hai.';
  }

  return null;
}

/**
 * Intelligent Entity Normalizer for Indian EV Dealership terms
 */
export function normalizeEntities(text = '', currentForm = {}, currentTargetField = '', currentStep = 1) {
  const extracted = {};
  const lower = text.toLowerCase().trim();
  const cleanUtterance = text
    .replace(/^(?:namaste|hello|hi|haan|mera|humara|hamara|my)?\s*(?:showroom|dealership)?\s*(?:ka)?\s*(?:name|naam)?\s*(?:is|hai|h|here|actually|dekho|bhai|sir)?\s*[:=]?\s*/i, '')
    .replace(/\s+(?:hai|hoon|h|sir|bhai|ji)$/i, '')
    .trim();

  // Spoken digits parsing fallback
  const spokenSequences = parseSpokenNumberWords(text);
  const tenDigitPhone = spokenSequences.find(s => s.length === 10 && /^[6-9]/.test(s));
  const sixDigitPin = spokenSequences.find(s => s.length === 6 && /^[1-9]/.test(s));

  // Explicit Multi-field Compound Extraction Patterns (e.g. "Mera showroom name XYZ, manager ABC, phone 9876543210")
  const shopMatch = text.match(/(?:(?:mera|humara|hamara)\s+)?(?:showroom|dealership|hub|agency|shop|store)(?:\s*ka)?\s*(?:name|naam)\s*(?:hai|is)?\s*[:=]?\s*([A-Za-z0-9\s&]+)/i);
  if (shopMatch && shopMatch[1]) {
    let sName = shopMatch[1].split(/(?:,\s*|\s+(?:manager|owner|contact|phone|mobile|city|address|location|pin|pincode|email))/i)[0].trim();
    sName = sName.replace(/^(?:name|naam|is|hai)\s+/i, '').replace(/\s+(?:hai|hoon|h)$/i, '').trim();
    if (sName.length >= 2 && !/^(?:hai|mera|hamara|naam|step|skip)$/i.test(sName)) {
      extracted.shopName = sName;
    }
  }

  const mgrMatch = text.match(/(?:(?:manager|owner|contact\s*person|mera|apna|hamara|humara)\s*(?:ka\s*)?(?:naam|name)|(?:manager|owner|contact\s*person))\s*(?:badal\s*ke|change\s*karke|is|hai|[:=])?\s*([A-Za-z\s]+)/i);
  if (mgrMatch && mgrMatch[1]) {
    let mName = mgrMatch[1].split(/(?:,\s*|\s+(?:phone|mobile|city|address|location|pin|pincode|email))/i)[0].trim();
    mName = mName.replace(/^(?:naam|name|is|hai|ka|ki|ke)\s+/i, '').replace(/\s+(?:hai|hoon|h|sir|ji|kardo)$/i, '').trim();
    if (mName.length >= 2 && !/^(?:hai|naam|name|is|step|skip|phone|city|address)$/i.test(mName)) {
      extracted.managerName = mName;
    }
  }

  const addrMatch = text.match(/(?:address(?:\s*hai)?|location(?:\s*hai)?|pata(?:\s*hai)?)\s*(?:badal\s*ke|change\s*karke|is|hai|[:=])?\s*([A-Za-z0-9\s,.-]+)/i);
  if (addrMatch && addrMatch[1]) {
    let aVal = addrMatch[1].split(/(?:,\s*|\s+(?:pin|pincode|city|working|timing|timings|open|close|kardo))/i)[0].trim();
    aVal = aVal.replace(/^(?:badal\s*ke|change\s*karke|is|hai)\s+/i, '').replace(/\s+(?:hai|hoon|h)$/i, '').trim();
    if (aVal.length >= 3 && !/^(?:step|skip|repeat|back)$/i.test(aVal)) {
      extracted.address = aVal;
    }
  }

  // Direct Target Field Contextual Fallback Extraction
  if (!extracted.shopName && (currentTargetField === 'shopName' || (!currentForm.shopName && currentStep === 1)) && cleanUtterance.length >= 2) {
    if (!/\b(?:step|skip|repeat|back|cancel|reset|phone|number|email|address|pincode|2\s*wheeler|4\s*wheeler|स्कूटर|गाड़ी|dealership|badal|change|update)\b/i.test(cleanUtterance) && !/^[0-9]{10}$/.test(cleanUtterance)) {
      extracted.shopName = cleanUtterance;
    }
  }

  // If agent asked for managerName
  const nonDigitText = cleanUtterance.replace(/(?:\+?91[\s-]?)?([6-9]\d{9})/g, '').replace(/[0-9]/g, '').replace(/[,.-]/g, ' ').trim();
  if (!extracted.managerName && (currentTargetField === 'managerName' || (currentForm.shopName && !currentForm.managerName && currentStep === 1)) && nonDigitText.length >= 2) {
    let cleanMgr = nonDigitText
      .replace(/^(?:namaste|hello|hi|haan|mera|humara|my)?\s*(?:manager|owner|contact\s*person)?\s*(?:ka)?\s*(?:naam|name)?\s*(?:is|hai)?\s*[:=]?\s*/i, '')
      .replace(/\s+(?:hai|hoon|h|sir|ji)$/i, '')
      .trim();
    if (!/\b(?:step|skip|repeat|back|cancel|reset|phone|number|email|address|pincode|2\s*wheeler|4\s*wheeler|badal|change)\b/i.test(cleanMgr)) {
      extracted.managerName = cleanMgr;
    }
  }

  // If agent asked for address
  if (!extracted.address && (currentTargetField === 'address' || (!currentForm.address && currentStep === 2)) && cleanUtterance.length >= 3) {
    if (!/\b(?:step|skip|repeat|back|cancel|reset|phone|number|email|emi|loan|bima|badal|change)\b/i.test(cleanUtterance)) {
      extracted.address = cleanUtterance.replace(/\b([1-9][0-9]{5})\b/, '').replace(/[,.-]$/, '').trim();
    }
  }

  // Phone number extraction (from raw text or spaces or parsed spoken words)
  const digitsOnly = text.replace(/[^0-9]/g, '');
  const phoneDigitMatch = digitsOnly.match(/(?:91)?([6-9]\d{9})/);
  if (phoneDigitMatch) {
    const valid = validators.phone(phoneDigitMatch[1]);
    if (valid.valid) extracted.phone = valid.value;
  } else if (tenDigitPhone) {
    const valid = validators.phone(tenDigitPhone);
    if (valid.valid) extracted.phone = valid.value;
  }

  // Email extraction
  const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (emailMatch) {
    const valid = validators.email(emailMatch[0]);
    if (valid.valid) extracted.email = valid.value;
  }

  // Pincode extraction (from raw text or parsed spoken words)
  const pinMatch = text.match(/\b([1-9][0-9]{5})\b/);
  if (pinMatch) {
    const valid = validators.pincode(pinMatch[1]);
    if (valid.valid) extracted.pincode = valid.value;
  } else if (sixDigitPin) {
    const valid = validators.pincode(sixDigitPin);
    if (valid.valid) extracted.pincode = valid.value;
  }

  // City extraction
  const majorCities = [
    'new delhi', 'greater noida', 'navi mumbai', 'bengaluru', 'bangalore', 'gurugram', 'gurgaon', 'noida', 'delhi',
    'mumbai', 'pune', 'hyderabad', 'chennai', 'kolkata', 'ahmedabad', 'jaipur', 'lucknow', 'chandigarh',
    'kochi', 'coimbatore', 'indore', 'surat', 'nagpur', 'patna', 'bhopal', 'ghaziabad', 'faridabad',
    'kanpur', 'varanasi', 'prayagraj', 'ludhiana', 'agra', 'nashik', 'vadodara', 'rajkot', 'visakhapatnam'
  ];
  for (const city of majorCities) {
    if (new RegExp(`\\b${city}\\b`, 'i').test(lower)) {
      extracted.city = city
        .split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ')
        .replace(/Bangalore/i, 'Bengaluru')
        .replace(/Gurugram/i, 'Gurgaon');
      break;
    }
  }
  const hindiCities = {
    'पुणे': 'Pune', 'दिल्ली': 'Delhi', 'नई दिल्ली': 'New Delhi', 'मुंबई': 'Mumbai',
    'बैंगलोर': 'Bengaluru', 'बेंगलुरु': 'Bengaluru', 'नोएडा': 'Noida', 'जयपुर': 'Jaipur',
    'लखनऊ': 'Lucknow', 'इंदौर': 'Indore', 'अहमदाबाद': 'Ahmedabad', 'सूरत': 'Surat'
  };
  for (const [hCity, enCity] of Object.entries(hindiCities)) {
    if (text.includes(hCity)) {
      extracted.city = enCity;
      break;
    }
  }

  // If agent asked for city and we haven't found a major city, treat clean single word as city (guarding against long command sentences and step navigation words)
  if (currentTargetField === 'city' && !extracted.city && cleanUtterance.length >= 2 && !/[0-9]/.test(cleanUtterance) && !/\b(?:step|chalo|aage|next|yes|haan|ok|theek|bilkul|manager|owner|phone|pincode|address|naam|badal|change|correct|update|kardo)\b/i.test(cleanUtterance) && cleanUtterance.split(/\s+/).length <= 3) {
    extracted.city = cleanUtterance.charAt(0).toUpperCase() + cleanUtterance.slice(1);
  }

  // EV Categories
  const categories = [];
  if (/(?:\b(?:4[ -]*wheeler|4w|four[ -]*wheeler|car|sedan|suv|gaadi|gaadiya|cars|vehicles)\b|4\s*व्हीलर|कार|गाड़ी|गाड़ियां|चार\s*पहिया)/i.test(lower)) {
    categories.push('4W');
  }
  if (/(?:\b(?:2[ -]*wheeler|2w|two[ -]*wheeler|scooter|bike|motorcycle|scooty|bikes|scooters)\b|2\s*व्हीलर|स्कूटर|बाइक|दो\s*पहिया)/i.test(lower)) {
    categories.push('2W');
  }
  if (/(?:\b(?:3[ -]*wheeler|3w|three[ -]*wheeler|auto|rickshaw|loader|e-rickshaw)\b|3\s*व्हीलर|ऑटो|रिक्शा|तीन\s*पहिया)/i.test(lower)) {
    categories.push('3W');
  }
  if (/(?:\b(?:commercial|delivery[ -]*van|truck|fleet|cargo)\b|कमर्शियल|लोडर|ट्रक)/i.test(lower)) {
    categories.push('commercial');
  }
  if (categories.length > 0) {
    extracted.categories = Array.from(new Set([...(currentForm.categories || []), ...categories]));
  }

  // EV Brands
  const knownBrands = [
    { key: 'Tata Motors', regex: /(?:\b(?:tata|tata motors|nexon|punch|tiago|curvv)\b|टाटा)/i },
    { key: 'Mahindra', regex: /(?:\b(?:mahindra|xuv400|be6|xev)\b|महिंद्रा)/i },
    { key: 'MG Motor', regex: /(?:\b(?:mg|mg motor|zs ev|windsor|comet)\b|एमजी)/i },
    { key: 'Hyundai', regex: /(?:\b(?:hyundai|ioniq|kona|creta ev)\b|हुंडई)/i },
    { key: 'Ather Energy', regex: /(?:\b(?:ather|ather energy|450x|rizta)\b|एथर)/i },
    { key: 'Ola Electric', regex: /(?:\b(?:ola|ola electric|s1|s1 pro|s1 air)\b|ओला)/i },
    { key: 'TVS', regex: /(?:\b(?:tvs|iqube)\b|टीवीएस)/i },
    { key: 'Bajaj Chetak', regex: /(?:\b(?:bajaj|chetak)\b|बजाज|चेतक)/i },
    { key: 'Piaggio', regex: /(?:\b(?:piaggio|ape e-city|ape)\b|पियाजियो)/i },
    { key: 'Euler Motors', regex: /(?:\b(?:euler|hiload)\b|यूलर)/i },
    { key: 'BYD', regex: /(?:\b(?:byd|atto 3|seal|dolphin)\b|बीवाईडी)/i },
  ];
  const matchedBrands = [];
  for (const b of knownBrands) {
    if (b.regex.test(lower)) {
      matchedBrands.push(b.key);
    }
  }
  if (matchedBrands.length > 0) {
    extracted.brands = Array.from(new Set([...(currentForm.brands || []), ...matchedBrands]));
  }

  // Services: EMI & Insurance
  if (/(?:emi|loan|financing|finance|kist|ईएमआई|लोन|किस्त)/i.test(lower) || currentTargetField === 'emiAvailable') {
    if (/(?:nahi|no|dont|do not|without emi|नहीं)/i.test(lower)) {
      extracted.emiAvailable = false;
    } else if (/(?:haan|yes|available|dete|provide|milta|हाँ|ज़रूर|जरूर)/i.test(lower) || /(?:emi|loan|financing|finance|kist)/i.test(lower)) {
      extracted.emiAvailable = true;
      extracted.insuranceAvailable = true;
    }
  }

  if (/(?:insurance|bima|zero dep|policy|बीमा|इंश्योरेंस)/i.test(lower)) {
    if (/(?:nahi|no|dont|do not|without insurance|नहीं)/i.test(lower)) {
      extracted.insuranceAvailable = false;
    } else {
      extracted.insuranceAvailable = true;
    }
  }

  // Services: Charging & Test Drive
  if (/(?:charger|charging|fast charger|on-site charge|चार्जर|चार्जिंग)/i.test(lower)) {
    extracted.chargingOnSite = !/(?:nahi|no|नहीं)/i.test(lower);
  }

  if (/(?:test drive|home test drive|doorstep|ghar pe|टेस्ट\s*ड्राइव)/i.test(lower) || currentTargetField === 'showroomTestDrive') {
    if (/(?:nahi|no|dont|do not|not available|नहीं)/i.test(lower)) {
      extracted.showroomTestDrive = false;
    } else if (/(?:haan|yes|available|dete|provide|milta|हाँ|ज़रूर|जरूर)/i.test(lower) || /(?:test drive|doorstep)/i.test(lower)) {
      if (/(?:home|doorstep|ghar pe|घर)/i.test(lower)) extracted.homeTestDrive = true;
      extracted.showroomTestDrive = true;
    }
  }

  // If user says explicitly that all services / all facilities are provided
  if (currentStep === 4 && /(?:sabhi\s*services|all\s*services|sab\s*kuch|sab\s*uplabdh|sab\s*suvidha)/i.test(lower)) {
    extracted.emiAvailable = true;
    extracted.insuranceAvailable = true;
    extracted.chargingOnSite = true;
    extracted.showroomTestDrive = true;
  }

  // Working days
  if (/(?:all\s*7\s*days|saaton\s*din|daily|everyday|rooz|सातों\s*दिन|रोज)/i.test(lower)) {
    extracted.workingDays = 'All 7 Days';
  } else if (/(?:monday\s*to\s*saturday|somwar\s*se\s*shaniwar|mon-sat|सोमवार\s*से\s*शनिवार)/i.test(lower)) {
    extracted.workingDays = 'Monday to Saturday';
  }

  return extracted;
}

/**
 * Field States
 */
export const FIELD_STATE = {
  MISSING: 'MISSING',
  FILLED: 'FILLED',
  INVALID: 'INVALID',
  UNCLEAR: 'UNCLEAR',
  CONFIRMING: 'CONFIRMED',
  SKIPPED: 'SKIPPED',
  FAILED: 'FAILED'
};

/**
 * Form State Enum
 */
export const FORM_STATE = {
  NOT_STARTED: 'NOT_STARTED',
  IN_PROGRESS: 'IN_PROGRESS',
  REVIEW: 'REVIEW',
  COMPLETED: 'COMPLETED',
  ABANDONED: 'ABANDONED'
};

/**
 * Intent Types
 */
export const INTENT = {
  ANSWER_FIELD: 'ANSWER_FIELD',
  CORRECT_FIELD: 'CORRECT_FIELD',
  SKIP_FIELD: 'SKIP_FIELD',
  REPEAT_QUESTION: 'REPEAT_QUESTION',
  GO_BACK: 'GO_BACK',
  GO_FORWARD: 'GO_FORWARD',
  NAVIGATE_STEP: 'NAVIGATE_STEP',
  RESET: 'RESET',
  SUBMIT: 'SUBMIT',
  HELP: 'HELP',
  NO_SPEECH: 'NO_SPEECH',
  IRRELEVANT: 'IRRELEVANT',
  UNKNOWN: 'UNKNOWN'
};

/**
 * Progressive Field Prompts across all 4 steps
 */
export const FIELD_PROMPTS = {
  // STEP 1 FIELDS
  shopName: {
    Hindi: [
      'नमस्ते! आपके ईवी शोरूम या डीलरशिप का क्या नाम है?',
      'माफ़ कीजियेगा, शोरूम का नाम समझ नहीं आया। आपके शोरूम का क्या नाम है?',
      'कृपया शोरूम का नाम बताएं, उदाहरण के लिए: "शक्ति मोटर्स" या "टाटा ईवी हब"।',
      'शोरूम का नाम स्क्रीन पर टाइप कर सकते हैं, चलिए आगे बढ़ते हैं।'
    ],
    Hinglish: [
      'Namaste! Welcome to EasyEV. Aapke EV showroom ka kya naam hai?',
      'Sorry, showroom ka naam samajh nahi aaya. Aapke showroom ka kya naam hai?',
      'Kripya showroom ka naam batayein, for example: "Shakti Motors" ya "Tata EV Hub".',
      'Aap showroom ka naam screen par manually type kar sakte hain, aaiye aage badhte hain.'
    ],
    English: [
      'Welcome to EasyEV! What is the official name of your EV showroom or dealership?',
      'Sorry, I didn\'t catch that. What is your showroom\'s name?',
      'Please state your showroom name, for example: "Green Wheels EV Hub" or "Shakti Motors".',
      'You can type it directly on the screen, let\'s move forward.'
    ]
  },
  managerName: {
    Hindi: [
      'शोरूम के ओनर या प्राथमिक संपर्क मैनेजर का शुभ नाम क्या है?',
      'माफ़ कीजिये, नाम स्पष्ट नहीं हुआ। संपर्क व्यक्ति या ओनर का क्या नाम है?',
      'कृपया नाम बताएं, जैसे: "राहुल शर्मा" या "अमित कुमार"।',
      'कोई बात नहीं, आप नाम स्क्रीन पर भर सकते हैं। चलिए मोबाइल नंबर नोट करते हैं।'
    ],
    Hinglish: [
      'Showroom ke owner ya primary contact manager ka kya naam hai?',
      'Sorry, naam clear nahi hua. Contact person ya owner ka naam kya hai?',
      'Kripya contact person ka naam batayein, jaise: "Rajesh Sharma" ya "Pooja Patel".',
      'Koi baat nahi, aap naam screen par type kar sakte hain. Aaiye mobile number note karte hain.'
    ],
    English: [
      'What is the full name of the owner or primary showroom manager?',
      'Sorry, I didn\'t quite catch that. Who is the primary manager or owner?',
      'Please state the name, for example: "Rajesh Sharma" or "Pooja Patel".',
      'You can type your name on the screen. Let\'s proceed to the contact number.'
    ]
  },
  phone: {
    Hindi: [
      'ग्राहक टेस्ट ड्राइव और बुकिंग्स के लिए आपका 10 अंकों का मोबाइल या व्हाट्सएप नंबर क्या है?',
      'नंबर सही से नहीं मिला। कृपया अपना 10 अंकों का मोबाइल नंबर बताएं।',
      'कृपया 10 अंकों का नंबर बताएं, जैसे: "98765 43210"।',
      'नंबर रिकॉर्ड नहीं हो सका। कृपया इसे स्क्रीन पर दर्ज करें।'
    ],
    Hinglish: [
      'Customer test drives aur bookings ke liye aapka 10-digit mobile ya WhatsApp number kya hai?',
      'Number samajh nahi aaya. Kripya apna 10-digit mobile number dobara batayein.',
      'Kripya 10-digit mobile number batayein, jaise: "9811234567".',
      'Mobile number record nahi ho saka. Aap ise screen par type kar sakte hain.'
    ],
    English: [
      'What is your 10-digit business mobile or WhatsApp number for customer bookings?',
      'I couldn\'t register that number. Please repeat your 10-digit mobile number.',
      'Please speak your 10-digit phone number, for example: "9811234567".',
      'Unable to capture the phone number. Please enter it manually in the field.'
    ]
  },
  city: {
    Hindi: [
      'आपका शोरूम किस शहर (City) में स्थित है?',
      'शहर का नाम समझ नहीं आया। आपका शोरूम किस शहर में है?',
      'कृपया शहर बताएं, जैसे: "पुणे", "दिल्ली", "बेंगलुरु", या "मुंबई"।',
      'आप शहर का नाम स्क्रीन पर चुन सकते हैं।'
    ],
    Hinglish: [
      'Aapka showroom kis city mein situated hai?',
      'City ka naam clear nahi hua. Aapka showroom kis city mein hai?',
      'Kripya city ka naam batayein, jaise: "Pune", "Delhi", "Bengaluru", ya "Mumbai".',
      'Aap city screen par select kar sakte hain.'
    ],
    English: [
      'Which city is your showroom located in?',
      'I missed the city name. Which city is the dealership in?',
      'Please specify the city, for example: "Pune", "Delhi", "Bengaluru", or "Mumbai".',
      'You can select your city on screen.'
    ]
  },

  // STEP 2 FIELDS
  address: {
    Hindi: [
      'स्टेप 2: आपका शोरूम किस इलाके, मार्ग या स्ट्रीट पर स्थित है?',
      'शोरूम का पता समझ नहीं आया। कृपया इलाका या स्ट्रीट एड्रेस बताएं।',
      'कृपया पता बताएं, उदाहरण के लिए: "रिंग रोड, साउथ एक्सटेंशन", "बानेर रोड", या "सेक्टर 62"।',
      'आप पता स्क्रीन पर टाइप कर सकते हैं। चलिए पिनकोड नोट करते हैं।'
    ],
    Hinglish: [
      'Step 2: Aapka showroom kis locality, road ya street address par situated hai?',
      'Showroom ka address samajh nahi aaya. Kripya locality ya street address batayein.',
      'Kripya address batayein, for example: "Ring Road, South Extension", "Baner Road", ya "MG Road".',
      'Aap address screen par type kar sakte hain. Aaiye pincode note karte hain.'
    ],
    English: [
      'Step 2: What is the street address or locality of your showroom?',
      'I didn\'t catch the address. What street or locality is the showroom located at?',
      'Please state the locality, for example: "Plot 42, Ring Road, South Extension".',
      'You can enter the address directly on screen. Let\'s get your pincode.'
    ]
  },
  pincode: {
    Hindi: [
      'शोरूम का 6 अंकों का पोस्टल पिनकोड क्या है?',
      'पिनकोड समझ नहीं आया। कृपया 6 अंकों का पिनकोड बताएं।',
      'कृपया पिनकोड बताएं, उदाहरण के लिए: "110049" या "411045"।',
      'आप पिनकोड स्क्रीन पर दर्ज कर सकते हैं।'
    ],
    Hinglish: [
      'Showroom ka 6-digit postal pincode kya hai?',
      'Pincode samajh nahi aaya. Kripya 6-digit postal pincode dobara batayein.',
      'Kripya pincode batayein, for example: "110049" ya "560038".',
      'Aap pincode screen par type kar sakte hain.'
    ],
    English: [
      'What is your showroom\'s 6-digit postal pincode?',
      'I didn\'t catch that pincode. Please repeat the 6-digit postal code.',
      'Please state the 6-digit pincode, for example: "110049" or "560038".',
      'You can type the pincode on screen.'
    ]
  },
  workingDays: {
    Hindi: [
      'शोरूम हफ्ते में किन दिनों खुला रहता है? (जैसे: सातों दिन, या सोमवार से शनिवार)?',
      'कार्य दिवस बताएं, क्या शोरूम सातों दिन खुला रहता है?',
      'कृपया बताएं: "सातों दिन" या "सोमवार से शनिवार"।',
      'आप वर्किंग डेज स्क्रीन पर चुन सकते हैं।'
    ],
    Hinglish: [
      'Showroom week me kin dino open rehta hai? (Jaise: All 7 Days, ya Monday to Saturday)?',
      'Working days batayein, kya showroom daily open rehta hai?',
      'Kripya batayein: "All 7 Days" ya "Monday to Saturday".',
      'Aap working days screen par select kar sakte hain.'
    ],
    English: [
      'What are your showroom working days? (For example: All 7 Days open, or Monday to Saturday)?',
      'Please mention your operating days.',
      'You can state "All 7 Days" or "Monday to Saturday".',
      'You can pick working days from the pills on screen.'
    ]
  },

  // STEP 3 FIELDS
  categories: {
    Hindi: [
      'स्टेप 3: आप कौनसे प्रकार के ईवी बेचते हैं? (4-व्हीलर कार, 2-व्हीलर स्कूटर, 3-व्हीलर ऑटो, या कमर्शियल)?',
      'कृपया व्हीकल कैटेगरीज बताएं: 4-व्हीलर, 2-व्हीलर या 3-व्हीलर?',
      'उदाहरण के लिए: "4-व्हीलर कार और 2-व्हीलर स्कूटर"।',
      'आप कैटेगरीज स्क्रीन पर कार्ड्स पर क्लिक करके चुन सकते हैं।'
    ],
    Hinglish: [
      'Step 3: Aap kaunse vehicle types deal karte hain? (4W Cars, 2W Scooters, 3W Autos, ya Commercial)?',
      'Vehicle categories batayein: 4-Wheeler, 2-Wheeler ya 3-Wheeler?',
      'For example: "4-Wheeler Cars aur 2-Wheeler Scooters".',
      'Aap categories screen par cards select karke choose kar sakte hain.'
    ],
    English: [
      'Step 3: Which vehicle categories do you sell? (4-Wheeler Cars, 2-Wheeler Scooters, 3-Wheeler, or Commercial)?',
      'Please mention the vehicle types you deal in.',
      'For example: "4-Wheeler Cars and 2-Wheeler Scooters".',
      'You can select vehicle categories from the screen.'
    ]
  },
  brands: {
    Hindi: [
      'आप कौनसे ईवी ब्रांड्स बेचते हैं? (जैसे Tata Motors, Mahindra, MG, Ather, Ola, TVS, BYD)?',
      'ब्रांड्स समझ नहीं आए। आप कौनसे ब्रांड्स में डील करते हैं?',
      'कृपया ब्रांड्स बताएं, जैसे: "टाटा मोटर्स और महिंद्रा" या "एथर और ओला"।',
      'आप ब्रांड्स स्क्रीन पर चिप्स से चुन सकते हैं।'
    ],
    Hinglish: [
      'Aap kaunse EV brands sell karte hain? (Jaise Tata Motors, Mahindra, MG, Ather, Ola, TVS, BYD)?',
      'Brands samajh nahi aaye. Aap kaunse EV brands represent karte hain?',
      'Kripya brands batayein, jaise: "Tata Motors aur Mahindra" ya "Ather aur Ola".',
      'Aap brands screen par chips par click karke select kar sakte hain.'
    ],
    English: [
      'Which EV brands do you sell or represent? (E.g. Tata Motors, Mahindra, MG, Ather, Ola, TVS, BYD)?',
      'Which EV brands are available in your dealership?',
      'Please state the brands, for example: "Tata Motors and Mahindra" or "Ather Energy".',
      'You can pick the brands from the screen chips.'
    ]
  },

  // STEP 4 FIELDS
  emiAvailable: {
    Hindi: [
      'स्टेप 4: क्या आप ग्राहकों को ईएमआई लोन फाइनेंसिंग और व्हीकल इंश्योरेंस की सुविधा देते हैं?',
      'क्या आपके शोरूम में ईएमआई और बीमा उपलब्ध है?',
      'कृपया "हाँ" या "नहीं" में बताएं।',
      'आप इसे स्क्रीन पर टॉगल कर सकते हैं।'
    ],
    Hinglish: [
      'Step 4: Kya aap buyers ko on-the-spot EMI loan financing aur vehicle insurance provide karte hain?',
      'Kya aapke showroom me EMI aur Insurance available hai?',
      'Kripya "Haan" ya "Nahi" me batayein.',
      'Aap ise screen par toggle switch se select kar sakte hain.'
    ],
    English: [
      'Step 4: Do you offer on-the-spot EMI vehicle financing and insurance services for buyers?',
      'Do you provide EMI and Insurance packages?',
      'Please answer with "Yes" or "No".',
      'You can toggle these services on screen.'
    ]
  },
  showroomTestDrive: {
    Hindi: [
      'क्या आप शोरूम और होम डोरस्टेप टेस्ट ड्राइव की सुविधा देते हैं?',
      'टेस्ट ड्राइव सुविधा के बारे में बताएं, क्या आप टेस्ट ड्राइव देते हैं?',
      'कृपया बताएं क्या टेस्ट ड्राइव उपलब्ध है।',
      'आप टेस्ट ड्राइव ऑप्शन्स स्क्रीन पर चुन सकते हैं।'
    ],
    Hinglish: [
      'Kya aap showroom aur doorstep test drives offer karte hain?',
      'Test drive facilities ke baare me batayein, kya test drives available hain?',
      'Kripya "Haan" ya "Nahi" me batayein.',
      'Aap test drive options screen par select kar sakte hain.'
    ],
    English: [
      'Do you offer showroom and doorstep test drive facilities for customers?',
      'Are test drives available at your dealership?',
      'Please answer with "Yes" or "No".',
      'You can configure test drives on screen.'
    ]
  }
};

export const VOICE_INTERVIEW_FIELDS = [
  'shopName',
  'managerName',
  'phone',
  'city',
  'address',
  'pincode',
  'workingDays',
  'brands',
  'emiAvailable',
  'showroomTestDrive'
];

/**
 * Production-Grade Dealer Form State Machine
 */
export class DealerFormStateMachine {
  constructor(initialValues = {}) {
    this.fields = {};
    this.auditTrail = [];
    this.currentStep = 1;
    this.currentTargetField = 'shopName';
    this.formStatus = FORM_STATE.NOT_STARTED;

    for (const [key, meta] of Object.entries(CANONICAL_DEALER_FIELDS)) {
      const isTextProvided = typeof initialValues[key] === 'string' && initialValues[key].trim().length > 0;
      const isCustomArrayProvided = Array.isArray(initialValues[key]) && initialValues[key].length > 0 && key === 'brands';
      const isUserFilled = isTextProvided || isCustomArrayProvided;

      const initial = isUserFilled ? initialValues[key] : (meta.default !== undefined ? meta.default : '');

      this.fields[key] = {
        value: initial,
        status: isUserFilled ? FIELD_STATE.FILLED : FIELD_STATE.MISSING,
        attempts: 0,
        confidence: isUserFilled ? 1.0 : 0.0,
        source: isUserFilled ? 'manual_ui' : (meta.isDefault ? 'default' : 'none'),
        history: isUserFilled ? [{ value: initial, source: 'manual_ui', timestamp: Date.now(), confidence: 1.0, validated: true }] : [],
        updatedAt: Date.now()
      };
    }

    if (Object.values(this.fields).some(f => f.status === FIELD_STATE.FILLED && f.source === 'manual_ui')) {
      this.formStatus = FORM_STATE.IN_PROGRESS;
    }
  }

  updateFields(patch, source = 'voice', confidence = 0.95) {
    const changes = {};
    for (const [key, value] of Object.entries(patch)) {
      if (CANONICAL_DEALER_FIELDS[key]) {
        const prev = this.fields[key].value;
        this.fields[key].value = value;
        this.fields[key].status = FIELD_STATE.FILLED;
        this.fields[key].confidence = confidence;
        this.fields[key].source = source;
        this.fields[key].attempts = 0;
        this.fields[key].updatedAt = Date.now();
        this.fields[key].history.push({
          value,
          source,
          confidence,
          validated: true,
          timestamp: Date.now()
        });
        changes[key] = { from: prev, to: value };
      }
    }

    if (Object.keys(changes).length > 0) {
      this.formStatus = FORM_STATE.IN_PROGRESS;
      this.auditTrail.push({
        timestamp: Date.now(),
        source,
        changes
      });
    }

    this.recalculateCurrentStep();
    return changes;
  }

  recordFailedAttempt(fieldKey) {
    if (this.fields[fieldKey]) {
      this.fields[fieldKey].attempts = (this.fields[fieldKey].attempts || 0) + 1;
      if (this.fields[fieldKey].attempts >= 3) {
        this.fields[fieldKey].status = FIELD_STATE.SKIPPED;
      } else {
        this.fields[fieldKey].status = FIELD_STATE.UNCLEAR;
      }
    }
  }

  getValues() {
    const res = {};
    for (const [k, v] of Object.entries(this.fields)) {
      res[k] = v.value;
    }
    return res;
  }

  getCompletionStats() {
    // 10 active voice interview questions across all 4 steps:
    // Step 1: shopName, managerName, phone, city (4)
    // Step 2: address, pincode, workingDays (3)
    // Step 3: brands (1) (Categories are pre-selected by default)
    // Step 4: emiAvailable, showroomTestDrive (2)
    const coreKeys = VOICE_INTERVIEW_FIELDS;

    const userFilledSources = new Set(['voice', 'voice_extracted', 'manual_ui']);
    const filledCount = coreKeys.filter(k => {
      const f = this.fields[k];
      if (!f) return false;
      const isFilled = f.value !== undefined && f.value !== null && f.value !== '' && (!Array.isArray(f.value) || f.value.length > 0);
      return isFilled && f.status === FIELD_STATE.FILLED && userFilledSources.has(f.source);
    }).length;

    const totalRequired = coreKeys.length;
    const percentage = Math.min(100, Math.round((filledCount / totalRequired) * 100));
    const isComplete = this.isStepComplete(1) && this.isStepComplete(2) && this.isStepComplete(3) && this.isStepComplete(4);

    if (isComplete && this.formStatus !== FORM_STATE.COMPLETED) {
      this.formStatus = FORM_STATE.REVIEW;
    }

    return {
      totalRequired,
      filledCount,
      percentage,
      isComplete,
      formStatus: this.formStatus
    };
  }

  isFieldInCompletedStep(fieldKey) {
    const meta = CANONICAL_DEALER_FIELDS[fieldKey];
    if (!meta) return false;
    return this.currentStep > meta.step;
  }

  isStepComplete(stepNum) {
    const stepFields = {
      1: ['shopName', 'managerName', 'phone', 'city'],
      2: ['address', 'pincode', 'workingDays'],
      3: ['brands'],
      4: ['emiAvailable', 'showroomTestDrive']
    }[stepNum] || [];

    const userFilledSources = new Set(['voice', 'voice_extracted', 'manual_ui']);
    return stepFields.every(key => {
      const f = this.fields[key];
      if (!f) return false;
      if (f.status === FIELD_STATE.SKIPPED) return true;
      const val = f.value;
      const isFilled = val !== undefined && val !== null && val !== '' && (!Array.isArray(val) || val.length > 0);
      return isFilled && f.status === FIELD_STATE.FILLED && userFilledSources.has(f.source);
    });
  }

  recalculateCurrentStep() {
    for (let s = 1; s <= 4; s++) {
      if (!this.isStepComplete(s)) {
        this.currentStep = s;
        return;
      }
    }
    this.currentStep = 4;
  }

  decideNextAction(language = 'Hinglish') {
    const stats = this.getCompletionStats();
    const validSources = new Set(['voice', 'voice_extracted', 'manual_ui']);

    // Step 1 Check
    if (this.currentStep === 1) {
      const step1Order = ['shopName', 'managerName', 'phone', 'city'];
      for (const key of step1Order) {
        const f = this.fields[key];
        const isFilled = f?.value && (!Array.isArray(f.value) || f.value.length > 0) && f.status === FIELD_STATE.FILLED && validSources.has(f.source);
        if (!isFilled && f?.status !== FIELD_STATE.SKIPPED) {
          this.currentTargetField = key;
          const attempt = Math.min(3, f?.attempts || 0);
          const promptList = FIELD_PROMPTS[key]?.[language] || FIELD_PROMPTS[key]?.['Hinglish'] || [];
          const hindiList = FIELD_PROMPTS[key]?.['Hindi'] || [];
          const promptText = promptList[attempt] || promptList[0] || 'Namaste! Aapke EV showroom ka kya naam hai?';
          const ttsText = language === 'English' ? promptText : (hindiList[attempt] || hindiList[0] || promptText);
          return { action: 'ASK_FIELD', targetField: key, step: 1, attempt, promptText, ttsText, stats };
        }
      }

      const promptText = language === 'Hindi'
        ? `डीलरशिप प्रोफाइल पूरी हो गई है! क्या हम स्टेप 2 (शोरूम लोकेशन और टाइमिंग्स) पर आगे बढ़ें?`
        : language === 'English'
          ? `Dealership profile is saved! Shall we move to Step 2: Showroom Location & Timings?`
          : `Dealership profile note ho gayi hai! Kya hum Step 2 (Location aur Timings) par aage badhein?`;
      const ttsText = language === 'English' ? promptText : `डीलरशिप प्रोफाइल पूरी हो गई है! क्या हम स्टेप 2 लोकेशन और टाइमिंग्स पर आगे बढ़ें?`;
      return { action: 'STEP_CONFIRMATION', nextStep: 2, step: 1, promptText, ttsText, stats };
    }

    // Step 2 Check
    if (this.currentStep === 2) {
      const step2Order = ['address', 'pincode', 'workingDays'];
      for (const key of step2Order) {
        const f = this.fields[key];
        const isFilled = f?.value && (!Array.isArray(f.value) || f.value.length > 0) && f.status === FIELD_STATE.FILLED && validSources.has(f.source);
        if (!isFilled && f?.status !== FIELD_STATE.SKIPPED) {
          this.currentTargetField = key;
          const attempt = Math.min(3, f?.attempts || 0);
          const promptList = FIELD_PROMPTS[key]?.[language] || FIELD_PROMPTS[key]?.['Hinglish'] || [];
          const hindiList = FIELD_PROMPTS[key]?.['Hindi'] || [];
          const promptText = promptList[attempt] || promptList[0] || 'Step 2: Aapka showroom kis address par hai?';
          const ttsText = language === 'English' ? promptText : (hindiList[attempt] || hindiList[0] || promptText);
          return { action: 'ASK_FIELD', targetField: key, step: 2, attempt, promptText, ttsText, stats };
        }
      }

      const promptText = language === 'Hindi'
        ? `शोरूम का पता और समय नोट हो चुका है! क्या स्टेप 3 (ईवी ब्रांड्स) पर चलें?`
        : language === 'English'
          ? `Location and timings saved! Shall we move to Step 3: EV Brands?`
          : `Showroom location aur timings save ho gayi hain! Kya Step 3 (EV Brands) par chalein?`;
      const ttsText = language === 'English' ? promptText : `शोरूम का पता और समय नोट हो चुका है! क्या स्टेप 3 ईवी ब्रांड्स पर चलें?`;
      return { action: 'STEP_CONFIRMATION', nextStep: 3, step: 2, promptText, ttsText, stats };
    }

    // Step 3 Check
    if (this.currentStep === 3) {
      const step3Order = ['brands'];
      for (const key of step3Order) {
        const f = this.fields[key];
        const isFilled = f?.value && (!Array.isArray(f.value) || f.value.length > 0) && f.status === FIELD_STATE.FILLED && validSources.has(f.source);
        if (!isFilled && f?.status !== FIELD_STATE.SKIPPED) {
          this.currentTargetField = key;
          const attempt = Math.min(3, f?.attempts || 0);
          const promptList = FIELD_PROMPTS[key]?.[language] || FIELD_PROMPTS[key]?.['Hinglish'] || [];
          const hindiList = FIELD_PROMPTS[key]?.['Hindi'] || [];
          const promptText = promptList[attempt] || promptList[0] || 'Step 3: Aap kaunse EV brands deal karte hain?';
          const ttsText = language === 'English' ? promptText : (hindiList[attempt] || hindiList[0] || promptText);
          return { action: 'ASK_FIELD', targetField: key, step: 3, attempt, promptText, ttsText, stats };
        }
      }

      // Step 3 complete -> Confirm transition to Step 4
      const promptText = language === 'Hindi'
        ? `ईवी ब्रांड्स सेव हो गए! क्या आखिरी स्टेप (ईएमआई लोन, बीमा और टेस्ट ड्राइव) देखें?`
        : language === 'English'
          ? `Brands recorded! Shall we proceed to Step 4: Services & Test Drives?`
          : `Brands select ho gaye! Kya last step (Step 4: EMI, Insurance aur Test Drives) dekhein?`;
      const ttsText = language === 'English' ? promptText : `ईवी ब्रांड्स सेव हो गए! क्या आखिरी स्टेप ईएमआई लोन, बीमा और टेस्ट ड्राइव देखें?`;
      return { action: 'STEP_CONFIRMATION', nextStep: 4, step: 3, promptText, ttsText, stats };
    }

    // Step 4 Check
    if (this.currentStep === 4) {
      const step4Order = ['emiAvailable', 'showroomTestDrive'];
      for (const key of step4Order) {
        const f = this.fields[key];
        const isFilled = f?.value !== undefined && f.status === FIELD_STATE.FILLED && validSources.has(f.source);
        if (!isFilled && f?.status !== FIELD_STATE.SKIPPED) {
          this.currentTargetField = key;
          const attempt = Math.min(3, f?.attempts || 0);
          const promptList = FIELD_PROMPTS[key]?.[language] || FIELD_PROMPTS[key]?.['Hinglish'] || [];
          const hindiList = FIELD_PROMPTS[key]?.['Hindi'] || [];
          const promptText = promptList[attempt] || promptList[0] || 'Step 4: Kya aap EMI aur Test Drive provide karte hain?';
          const ttsText = language === 'English' ? promptText : (hindiList[attempt] || hindiList[0] || promptText);
          return { action: 'ASK_FIELD', targetField: key, step: 4, attempt, promptText, ttsText, stats };
        }
      }

      // Final Completion
      const vals = this.getValues();
      const promptText = language === 'Hindi'
        ? `बहुत बढ़िया! आपकी डीलरशिप "${vals.shopName || 'ईवी शोरूम'}" की सभी जानकारियाँ पूरी हो गई हैं। क्या मैं अधिकृत पार्टनरशिप सबमिट कर दूँ?`
        : language === 'English'
          ? `All 4 steps are complete for "${vals.shopName || 'your showroom'}"! Shall I go ahead and submit your verified registration?`
          : `Awesome! Aapke showroom "${vals.shopName || 'EV Hub'}" ke sabhi 4 steps complete ho chuke hain. Kya main verified registration submit kar doon?`;
      const ttsText = language === 'English' ? promptText : `बहुत बढ़िया! आपकी डीलरशिप ${vals.shopName || 'ईवी शोरूम'} की सभी जानकारियाँ पूरी हो गई हैं। क्या मैं अधिकृत पार्टनरशिप सबमिट कर दूँ?`;
      return { action: 'COMPLETE', step: 4, promptText, ttsText, stats };
    }

    return { action: 'ASK_FIELD', targetField: 'shopName', step: 1, attempt: 0, promptText: 'Namaste! Aapke EV showroom ka kya naam hai?', stats };
  }
}

/**
 * Classify User Intent from Utterance
 */
export function classifyIntent(text = '') {
  const trimmed = text.trim();
  if (!trimmed) return INTENT.NO_SPEECH;

  if (/(?:reset form|restart form|shuru se shuru karo|clear all|dobara shuru|cancel all|रीसेट|शुरू से)/i.test(trimmed)) {
    return INTENT.RESET;
  }
  if (/(?:skip|chhod do|leave this|baad me|later|agli field|next field|छोड़ दो|स्किप)/i.test(trimmed)) {
    return INTENT.SKIP_FIELD;
  }
  if (/(?:repeat|dobara bolo|kya bola|phir se bolo|repeat please|दोबारा बोलो|फिर से बोलो)/i.test(trimmed)) {
    return INTENT.REPEAT_QUESTION;
  }
  if (/(?:(?:go to|open|jump to|chalo|dikhao|par\s*jao|jao)\s*(?:step\s*1|first\s*step|pehla\s*step|pehle\s*step|profile\s*page)|(?:step\s*1|first\s*step|pehla\s*step|pehle\s*step|profile\s*page)\s*(?:par\s*chalo|par\s*jao|kholo|dikhao|me\s*jao|jao)|पहला\s*स्टेप\s*खोलो|स्टेप\s*1)/i.test(trimmed)) {
    return INTENT.NAVIGATE_STEP;
  }
  if (/(?:(?:go to|open|jump to|chalo|dikhao|par\s*jao|jao)\s*(?:step\s*2|second\s*step|location\s*step|dusra\s*step|dusre\s*step)|(?:step\s*2|second\s*step|dusra\s*step|dusre\s*step|location\s*step)\s*(?:par\s*chalo|par\s*jao|kholo|dikhao|me\s*jao|jao)|दूसरा\s*स्टेप\s*खोलो|स्टेप\s*2)/i.test(trimmed)) {
    return INTENT.NAVIGATE_STEP;
  }
  if (/(?:(?:go to|open|jump to|chalo|dikhao|par\s*jao|jao)\s*(?:step\s*3|third\s*step|teesra\s*step|teesre\s*step|brands\s*step)|(?:step\s*3|third\s*step|teesra\s*step|teesre\s*step|brands\s*step)\s*(?:par\s*chalo|par\s*jao|kholo|dikhao|me\s*jao|jao)|तीसरा\s*स्टेप\s*खोलो|स्टेप\s*3)/i.test(trimmed)) {
    return INTENT.NAVIGATE_STEP;
  }
  if (/(?:(?:go to|open|jump to|chalo|dikhao|par\s*jao|jao)\s*(?:step\s*4|fourth\s*step|chautha\s*step|chauthe\s*step|services\s*step)|(?:step\s*4|fourth\s*step|chautha\s*step|chauthe\s*step|services\s*step)\s*(?:par\s*chalo|par\s*jao|kholo|dikhao|me\s*jao|jao)|चौथा\s*स्टेप\s*खोलो|स्टेप\s*4)/i.test(trimmed)) {
    return INTENT.NAVIGATE_STEP;
  }
  if (/(?:pichla\s*(?:step|page)|go back|peeche chalo|previous\s*(?:step|page)|पिछला\s*स्टेप|back\s*jao)/i.test(trimmed)) {
    return INTENT.GO_BACK;
  }
  if (/(?:submit|sabmit|register|registration\s*submit|verified\s*registration|final\s*submit|kar\s*do\s*register|सबमिट|जमा)/i.test(trimmed) && !/(?:fee|fees|charge|cost|document|paper|upload|kyc|kya|why|kaise|kitna|help|फायदा|शुल्क)/i.test(trimmed)) {
    return INTENT.SUBMIT;
  }
  if (/(?:help|madad|kaise karein|kya karna hai|मदद|सहायता)/i.test(trimmed)) {
    return INTENT.HELP;
  }
  if (/(?:badlo|change|correct|galat ho gaya|update karo|बदलो|सुधारो)/i.test(trimmed)) {
    return INTENT.CORRECT_FIELD;
  }

  return INTENT.ANSWER_FIELD;
}

/**
 * Dealer Voice Agent Session Instance
 */
export class DealerAgentSession {
  constructor({ sessionId, language = 'Hinglish', voice = 'madhur', initialValues = {}, currentStep = null }) {
    this.sessionId = sessionId || `dealer-agent-${randomUUID()}`;
    this.language = language;
    this.voice = voice;
    this.stateMachine = new DealerFormStateMachine(initialValues);
    if (currentStep && currentStep >= 1 && currentStep <= 4) {
      this.stateMachine.currentStep = currentStep;
    } else {
      this.stateMachine.recalculateCurrentStep();
    }
    this.conversation = [];
    this.createdAt = Date.now();
    this.updatedAt = Date.now();
    this.isSubmitted = false;
    this.registeredDealer = null;
  }

  getInitialGreeting() {
    const isStep1Complete = this.stateMachine.isStepComplete(1);
    const text = this.language === 'Hindi'
      ? (isStep1Complete ? 'नमस्ते! आपकी डीलरशिप प्रोफाइल पहले से सेट है, क्या हम अगले स्टेप पर आगे बढ़ें?' : 'नमस्ते! मैं EasyEV वॉइस कोपायलट हूँ। आपके ईवी शोरूम का क्या नाम है?')
      : (isStep1Complete ? 'Namaste! Showroom profile ready hai. Shall we move to Location & Timings?' : 'Namaste! Welcome to EasyEV. Aapke EV showroom ka kya naam hai?');
    
    const ttsText = this.language === 'English' ? text : (isStep1Complete ? 'नमस्ते! शोरूम प्रोफाइल तैयार है, क्या हम लोकेशन पर आगे बढ़ें?' : 'नमस्ते! मैं EasyEV वॉइस कोपायलट हूँ। आपके ईवी शोरूम का क्या नाम है?');

    return {
      sessionId: this.sessionId,
      speechText: text,
      ttsText,
      action: 'ASK_FIELD',
      targetField: isStep1Complete ? 'address' : 'shopName',
      step: isStep1Complete ? 2 : 1,
      extractedFields: {},
      currentForm: this.stateMachine.getValues(),
      completionStats: this.stateMachine.getCompletionStats(),
      isSubmitted: this.isSubmitted,
      registeredDealer: this.registeredDealer
    };
  }

  async processTurn({ text = '', patch = null } = {}) {
    if (patch && typeof patch === 'object') {
      this.stateMachine.updateFields(patch, 'manual_ui');
    }
    return this.processUserUtterance(typeof text === 'string' ? text : '');
  }

  async processUserUtterance(userText = '') {
    this.updatedAt = Date.now();
    let extracted = {};

    if (userText && userText.trim()) {
      this.conversation.push({
        role: 'user',
        text: userText.trim(),
        timestamp: Date.now()
      });

      const intent = classifyIntent(userText);

      // High-Priority Direct Submission Check (guarding against informational questions)
      const isSubmitCommand = (intent === INTENT.SUBMIT ||
        /(?:submit|verified\s*registration|registration\s*submit|kar\s*do|kardo|confirm\s*submit|सबमिट|जमा\s*कर)/i.test(userText))
        && !/(?:fee|fees|charge|cost|document|paper|upload|kyc|kya|why|kaise|kitna|help|फायदा|शुल्क|कागजात)/i.test(userText);

      if (isSubmitCommand) {
        return await this.submitRegistration();
      }

      // If at step 4 and already complete, affirmative responses trigger submission
      if (this.stateMachine.currentStep === 4 && this.stateMachine.isStepComplete(4)) {
        if (/(?:yes|haan|ha|chalo|next|aage|proceed|sure|ok|theek hai|bilkul|agla|confirm|सबमिट|हाँ|हा|चलो|आगे|बढ़ो|बढो|ठीक है|बिलकुल|ज़रूर|जरूर)/i.test(userText)) {
          return await this.submitRegistration();
        }
      }

      // Handle Reset Intent
      if (intent === INTENT.RESET) {
        this.stateMachine = new DealerFormStateMachine({});
        const resetMsg = this.language === 'Hindi'
          ? 'फॉर्म रीसेट कर दिया गया है। चलिए शुरू से शुरू करते हैं। आपके ईवी शोरूम का क्या नाम है?'
          : 'Form reset ho gaya hai. Aaiye shuru se shuru karte hain. Aapke EV showroom ka kya naam hai?';
        const ttsText = this.language === 'English' ? resetMsg : 'फॉर्म रीसेट कर दिया गया है। आपके शोरूम का क्या नाम है?';
        return {
          sessionId: this.sessionId,
          speechText: resetMsg,
          ttsText,
          action: 'ASK_FIELD',
          targetField: 'shopName',
          step: 1,
          extractedFields: {},
          currentForm: this.stateMachine.getValues(),
          completionStats: this.stateMachine.getCompletionStats(),
          isSubmitted: false
        };
      }

      // Handle Step Navigation Intent
      if (intent === INTENT.NAVIGATE_STEP || intent === INTENT.GO_BACK) {
        let targetStep = 1;
        if (/step\s*2|dusra|location/i.test(userText)) targetStep = 2;
        else if (/step\s*3|teesra|brand/i.test(userText)) targetStep = 3;
        else if (/step\s*4|chautha|service|test\s*drive/i.test(userText)) targetStep = 4;
        else if (intent === INTENT.GO_BACK) targetStep = Math.max(1, this.stateMachine.currentStep - 1);

        this.stateMachine.currentStep = targetStep;
        const next = this.stateMachine.decideNextAction(this.language);
        const navMsg = this.language === 'Hindi'
          ? `स्टेप ${targetStep} पर ले जाया गया है।`
          : `Step ${targetStep} par switch kar diya gaya hai.`;
        return {
          sessionId: this.sessionId,
          speechText: `${navMsg} ${next.promptText}`,
          ttsText: next.ttsText || next.promptText,
          action: next.action,
          targetField: next.targetField,
          step: targetStep,
          extractedFields: {},
          currentForm: this.stateMachine.getValues(),
          completionStats: next.stats,
          isSubmitted: this.isSubmitted
        };
      }

      // Handle Skip Intent
      if (intent === INTENT.SKIP_FIELD) {
        const target = this.stateMachine.currentTargetField;
        if (target && this.stateMachine.fields[target]) {
          this.stateMachine.fields[target].status = FIELD_STATE.SKIPPED;
          this.stateMachine.recalculateCurrentStep();
        }
        const skipMsg = this.language === 'Hindi'
          ? 'ठीक है, इस सवाल को छोड़ दिया गया है। चलिए आगे बढ़ते हैं।'
          : 'Theek hai, is field ko skip kar diya gaya hai. Aaiye next question par chalte hain.';
        const next = this.stateMachine.decideNextAction(this.language);
        return {
          sessionId: this.sessionId,
          speechText: `${skipMsg} ${next.promptText}`,
          ttsText: next.ttsText || next.promptText,
          action: next.action,
          targetField: next.targetField,
          step: next.step,
          extractedFields: {},
          currentForm: this.stateMachine.getValues(),
          completionStats: next.stats,
          isSubmitted: this.isSubmitted
        };
      }

      // Handle Repeat Intent
      if (intent === INTENT.REPEAT_QUESTION) {
        const next = this.stateMachine.decideNextAction(this.language);
        const repeatPrefix = this.language === 'Hindi' ? 'हाँ ज़रूर, मैं दोहराता हूँ: ' : 'Haan zaroor, main repeat karta hoon: ';
        return {
          sessionId: this.sessionId,
          speechText: `${repeatPrefix}${next.promptText}`,
          ttsText: next.ttsText || next.promptText,
          action: next.action,
          targetField: next.targetField,
          step: next.step,
          extractedFields: {},
          currentForm: this.stateMachine.getValues(),
          completionStats: next.stats,
          isSubmitted: this.isSubmitted
        };
      }

      // Handle FAQ Questions
      const faqAnswer = handleDealerFaq(userText, this.language);
      if (faqAnswer) {
        const next = this.stateMachine.decideNextAction(this.language);
        return {
          sessionId: this.sessionId,
          speechText: `${faqAnswer} ${next.promptText}`,
          ttsText: next.ttsText || next.promptText,
          action: next.action,
          targetField: next.targetField,
          step: next.step,
          extractedFields: {},
          currentForm: this.stateMachine.getValues(),
          completionStats: next.stats,
          isSubmitted: this.isSubmitted
        };
      }

      // Handle Hesitations
      if (/(?:ek\s*minute|ek\s*second|ruko|wait|hold\s*on|sunno|suno|arre\s*suno|let\s*me\s*think|dekhta\s*hoon|ek\s*min|रुकिए|रुको|एक\s*मिनट)/i.test(userText) && userText.split(/\s+/).length <= 5) {
        const next = this.stateMachine.decideNextAction(this.language);
        const waitMsg = this.language === 'Hindi'
          ? 'जी बिल्कुल, आप आराम से बताइए, मैं सुन रहा हूँ। '
          : 'Ji bilkul, aap aaram se batayein, main sun raha hoon. ';
        return {
          sessionId: this.sessionId,
          speechText: `${waitMsg}${next.promptText}`,
          ttsText: next.ttsText || next.promptText,
          action: next.action,
          targetField: next.targetField,
          step: next.step,
          extractedFields: {},
          currentForm: this.stateMachine.getValues(),
          completionStats: next.stats,
          isSubmitted: this.isSubmitted
        };
      }

      // Handle Field Correction Intent
      if (intent === INTENT.CORRECT_FIELD) {
        const corrExtract = normalizeEntities(userText, this.stateMachine.getValues(), this.stateMachine.currentTargetField, this.stateMachine.currentStep);
        if (Object.keys(corrExtract).length > 0) {
          this.stateMachine.updateFields(corrExtract, 'voice_extracted');
          const next = this.stateMachine.decideNextAction(this.language);
          const corrMsg = this.language === 'Hindi'
            ? 'जानकारी सही कर दी गई है! '
            : 'Detail update kar di gayi hai! ';
          return {
            sessionId: this.sessionId,
            speechText: `${corrMsg}${next.promptText}`,
            action: next.action,
            targetField: next.targetField,
            step: next.step,
            extractedFields: corrExtract,
            currentForm: this.stateMachine.getValues(),
            completionStats: next.stats,
            isSubmitted: this.isSubmitted
          };
        }
      }

      // Handle Help Intent
      if (intent === INTENT.HELP) {
        const helpMsg = this.language === 'Hindi'
          ? 'मैं आपकी डीलरशिप ऑनबोर्डिंग में मदद कर रहा हूँ। आप अपने शोरूम का नाम, पता, ब्रांड्स और फोन नंबर बोलकर या स्क्रीन पर देखकर भर सकते हैं।'
          : 'Main aapki dealership onboarding me assist kar raha hoon. Aap showroom details bol kar auto-fill karwa sakte hain ya screen par type kar sakte hain.';
        return {
          sessionId: this.sessionId,
          speechText: helpMsg,
          action: 'HELP',
          step: this.stateMachine.currentStep,
          extractedFields: {},
          currentForm: this.stateMachine.getValues(),
          completionStats: this.stateMachine.getCompletionStats(),
          isSubmitted: this.isSubmitted
        };
      }

      // Progression / Confirmation handling
      if (/(?:yes|haan|chalo|next|aage|proceed|sure|ok|theek hai|bilkul|agla|confirm|हाँ|हा|चलो|आगे|बढ़ो|बढो|ठीक है|बिलकुल|ज़रूर|जरूर)/i.test(userText)) {
        if (this.stateMachine.currentStep === 1 && this.stateMachine.isStepComplete(1)) {
          this.stateMachine.currentStep = 2;
        } else if (this.stateMachine.currentStep === 2 && this.stateMachine.isStepComplete(2)) {
          this.stateMachine.currentStep = 3;
        } else if (this.stateMachine.currentStep === 3 && this.stateMachine.isStepComplete(3)) {
          this.stateMachine.currentStep = 4;
        } else if (this.stateMachine.currentStep === 4 && this.stateMachine.isStepComplete(4)) {
          return await this.submitRegistration();
        }
      } else if (this.stateMachine.currentStep === 4 && /(?:submit|register|kar do|confirm|proceed|done|सबमिट|जमा|पार्टनरशिप|कर दो)/i.test(userText)) {
        return await this.submitRegistration();
      }

      // Normalize and extract entities
      extracted = normalizeEntities(userText, this.stateMachine.getValues(), this.stateMachine.currentTargetField, this.stateMachine.currentStep);
      if (Object.keys(extracted).length > 0) {
        this.stateMachine.updateFields(extracted, 'voice_extracted');
      } else {
        const currTarget = this.stateMachine.currentTargetField;
        if (currTarget && !/(?:yes|haan|chalo|next|aage|proceed|sure|ok|theek hai|bilkul|agla|confirm|हाँ|हा|चलो|आगे|बढ़ो|बढो|ठीक है|बिलकुल|ज़रूर|जरूर)/i.test(userText)) {
          this.stateMachine.recordFailedAttempt(currTarget);
        }
      }
    } else {
      const currTarget = this.stateMachine.currentTargetField;
      if (currTarget) {
        this.stateMachine.recordFailedAttempt(currTarget);
      }
    }

    const nextAction = this.stateMachine.decideNextAction(this.language);

    this.conversation.push({
      role: 'agent',
      text: nextAction.promptText,
      action: nextAction.action,
      targetField: nextAction.targetField,
      nextStep: nextAction.nextStep,
      timestamp: Date.now()
    });

    return {
      sessionId: this.sessionId,
      speechText: nextAction.promptText,
      ttsText: nextAction.ttsText || nextAction.promptText,
      action: nextAction.action,
      targetField: nextAction.targetField,
      step: nextAction.step,
      extractedFields: extracted,
      currentForm: this.stateMachine.getValues(),
      completionStats: nextAction.stats,
      isSubmitted: this.isSubmitted,
      registeredDealer: this.registeredDealer
    };
  }

  async submitRegistration() {
    this.updatedAt = Date.now();
    const vals = this.stateMachine.getValues();

    if (this.isSubmitted && this.registeredDealer) {
      const alreadyMsg = this.language === 'Hindi'
        ? `आपका शोरूम पहले ही पार्टनर आईडी ${this.registeredDealer.partnerId} के साथ रजिस्टर हो चुका है!`
        : `Aapka showroom pehle hi register ho chuka hai! Partner ID: ${this.registeredDealer.partnerId}`;
      return {
        sessionId: this.sessionId,
        speechText: alreadyMsg,
        action: 'SUBMIT_SUCCESS',
        step: 5,
        extractedFields: {},
        currentForm: vals,
        completionStats: this.stateMachine.getCompletionStats(),
        isSubmitted: true,
        partnerId: this.registeredDealer.partnerId,
        registeredDealer: this.registeredDealer
      };
    }

    const partnerId = `EEV-DLR-2026-${Math.floor(1000 + Math.random() * 9000)}`;
    const newRecord = {
      id: partnerId,
      partnerId,
      name: vals.shopName || 'EasyEV Mobility Hub',
      shopName: vals.shopName || 'EasyEV Mobility Hub',
      dealerType: vals.dealerType || 'Authorized OEM Dealership',
      managerName: vals.managerName || 'Showroom Manager',
      phone: vals.phone || '9811234567',
      email: vals.email || 'dealer@easyev.in',
      address: vals.address || 'Showroom Address',
      city: vals.city || 'New Delhi',
      state: vals.state || 'Delhi',
      pincode: vals.pincode || '110049',
      location: {
        address: vals.address || 'Showroom Address',
        city: vals.city || 'New Delhi',
        pincode: vals.pincode || '110049'
      },
      openTime: vals.openTime || '09:30 AM',
      closeTime: vals.closeTime || '08:30 PM',
      workingDays: vals.workingDays || 'All 7 Days',
      categories: (vals.categories && vals.categories.length > 0) ? vals.categories : ['4W', '2W', '3W', 'commercial'],
      brands: (vals.brands && vals.brands.length > 0) ? vals.brands : ['Tata Motors', 'Mahindra'],
      inventoryScale: vals.inventoryScale || '5-15 EVs',
      services: {
        emiAvailable: vals.emiAvailable ?? true,
        insuranceAvailable: vals.insuranceAvailable ?? true
      },
      testDrive: {
        showroomTestDrive: vals.showroomTestDrive ?? true,
        homeTestDrive: vals.homeTestDrive ?? true
      },
      emiAvailable: vals.emiAvailable ?? true,
      insuranceAvailable: vals.insuranceAvailable ?? true,
      chargingOnSite: vals.chargingOnSite ?? true,
      showroomTestDrive: vals.showroomTestDrive ?? true,
      homeTestDrive: vals.homeTestDrive ?? true,
      registeredAt: new Date().toISOString(),
      onboardingSource: 'voice_copilot_aarav'
    };

    dealerDb.addDealer(newRecord);
    this.isSubmitted = true;
    this.registeredDealer = newRecord;
    this.stateMachine.formStatus = FORM_STATE.COMPLETED;

    const congratsMsg = this.language === 'Hindi'
      ? `बधाई हो! आपका शोरूम "${newRecord.shopName}" आधिकारिक तौर पर EasyEV नेटवर्क में पार्टनर आईडी ${partnerId} के साथ रजिस्टर हो गया है! डिजिटल सर्टिफिकेट जारी हो चुका है।`
      : `Badhai ho! Aapka showroom "${newRecord.shopName}" successfully EasyEV network me Partner ID ${partnerId} ke saath register ho gaya hai! Screen par official certificate generate ho chuka hai.`;

    const ttsText = this.language === 'English' ? congratsMsg : `बधाई हो! आपका शोरूम ${newRecord.shopName} सफलतापूर्वक रजिस्टर हो गया है। पार्टनर आईडी ${partnerId} का डिजिटल सर्टिफिकेट जारी हो चुका है।`;

    return {
      sessionId: this.sessionId,
      speechText: congratsMsg,
      ttsText,
      action: 'SUBMIT_SUCCESS',
      step: 5,
      extractedFields: {},
      currentForm: this.stateMachine.getValues(),
      completionStats: this.stateMachine.getCompletionStats(),
      isSubmitted: true,
      partnerId,
      registeredDealer: newRecord
    };
  }
}

/**
 * Global Session Manager for Dealer Voice Agents
 */
class DealerVoiceAgentManager {
  constructor() {
    this.sessions = new Map();
  }

  createSession({ language = 'Hinglish', voice = 'madhur', initialValues = {}, currentStep = null } = {}) {
    const sessionId = `dlr-sess-${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`;
    const session = new DealerAgentSession({ sessionId, language, voice, initialValues, currentStep });
    this.sessions.set(sessionId, session);
    return session;
  }

  getSession(sessionId) {
    return this.sessions.get(sessionId) || null;
  }

  destroySession(sessionId) {
    return this.sessions.delete(sessionId);
  }
}

export const dealerVoiceAgentManager = new DealerVoiceAgentManager();
