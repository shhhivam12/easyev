import { VEHICLES as SHOWROOM_VEHICLES } from './showroom/vehicle-catalog.js';
import { TOP_12_EVS } from './explore-evs-catalog.mjs';
import { testDriveDb, FSM_STATES } from './test-drive-db.mjs';

/**
 * Normalizes Indian phone numbers into E.164 (+91XXXXXXXXXX) format.
 */
export function normalizePhone(value) {
  if (!value) return '';
  const digits = String(value).replace(/[^\d]/g, '');
  if (!digits) return '';
  // Handle 0 prefix or existing 91 country code prefix
  const local = digits.replace(/^0+/, '').replace(/^91(?=\d{10}$)/, '');
  if (local.length === 10) {
    return `+91${local}`;
  }
  return `+${digits}`;
}

export function validateEmail(value) {
  if (!value) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value).trim());
}

/**
 * Resolve vehicle from trusted catalog
 */
export function resolveVehicle(vehicleId) {
  if (!vehicleId) return null;
  const canonicalId = String(vehicleId).toLowerCase().trim();

  // Check Showroom catalog
  const showroomMatch = SHOWROOM_VEHICLES.find(v => v.id.toLowerCase() === canonicalId);
  if (showroomMatch) {
    return {
      id: showroomMatch.id,
      name: showroomMatch.name,
      company: showroomMatch.company,
      badge: showroomMatch.badge,
      price: showroomMatch.price,
      thumbnail: showroomMatch.thumbnail,
    };
  }

  // Check Explore Top 12 catalog
  const exploreMatch = TOP_12_EVS.find(v => (v.id || '').toLowerCase() === canonicalId);
  if (exploreMatch) {
    return {
      id: exploreMatch.id,
      name: exploreMatch.name,
      company: exploreMatch.brand || exploreMatch.company || 'EasyEV',
      badge: exploreMatch.category || 'Electric Vehicle',
      price: exploreMatch.priceRange || 'Contact for price',
      thumbnail: exploreMatch.heroImage || '',
    };
  }

  return null;
}

/**
 * Interpret and normalize natural-language dates into YYYY-MM-DD
 */
export function normalizeDate(dateInput, now = new Date()) {
  if (!dateInput) return null;
  const raw = String(dateInput).toLowerCase().trim();

  // Direct ISO/standard format check: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  const target = new Date(now);
  const dayOfWeekNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

  if (raw.includes('today') || raw.includes('aaj')) {
    return target.toISOString().slice(0, 10);
  }

  if (raw.includes('tomorrow') || raw.includes('kal')) {
    target.setDate(target.getDate() + 1);
    return target.toISOString().slice(0, 10);
  }

  if (raw.includes('day after tomorrow') || raw.includes('parso')) {
    target.setDate(target.getDate() + 2);
    return target.toISOString().slice(0, 10);
  }

  // Check day of week matching (e.g. "this saturday", "coming monday", "sunday")
  for (let i = 0; i < 7; i++) {
    const dayName = dayOfWeekNames[i];
    if (raw.includes(dayName)) {
      const currentDay = now.getDay();
      let diff = i - currentDay;
      if (diff <= 0 || raw.includes('next')) {
        diff += (raw.includes('next') && diff > 0 ? 7 : (diff <= 0 ? 7 : 0));
      }
      target.setDate(now.getDate() + diff);
      return target.toISOString().slice(0, 10);
    }
  }

  // Attempt standard Date parsing as fallback
  const parsed = new Date(dateInput);
  if (!isNaN(parsed.getTime()) && parsed.getFullYear() >= now.getFullYear()) {
    return parsed.toISOString().slice(0, 10);
  }

  return null;
}

/**
 * Interpret and normalize natural-language time into HH:MM (24-hour)
 */
export function normalizeTime(timeInput) {
  if (!timeInput) return null;
  const raw = String(timeInput).toLowerCase().trim();

  // Match standard 24h or 12h formats: e.g. "17:00", "5:30 pm", "5pm", "5 pm", "11:00 am"
  const match12 = raw.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (match12) {
    let hours = parseInt(match12[1], 10);
    const minutes = match12[2] ? parseInt(match12[2], 10) : 0;
    const meridian = match12[3];

    if (meridian === 'pm' && hours < 12) hours += 12;
    if (meridian === 'am' && hours === 12) hours = 0;

    // Handle context when no am/pm specified: single digit like "5" in conversational test-drive context implies 17:00 (5 PM)
    if (!meridian) {
      const isExplicitLeadingZero = raw.startsWith('0');
      if (!isExplicitLeadingZero && hours >= 1 && hours <= 7) {
        hours += 12; // 1 to 7 -> 13:00 to 19:00
      }
      if (raw.includes('evening') || raw.includes('shaam') || raw.includes('afternoon') || raw.includes('dophar')) {
        if (hours < 12) hours += 12;
      }
    }

    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }
  }

  // Natural words mapping
  if (raw.includes('morning') || raw.includes('subah')) return '10:30';
  if (raw.includes('noon') || raw.includes('afternoon') || raw.includes('dophar')) return '14:00';
  if (raw.includes('evening') || raw.includes('shaam')) return '17:00';

  return null;
}

/**
 * Format date & time nicely for speech and email
 */
export function formatSlotSpoken(dateStr, timeStr) {
  try {
    const paddedTime = timeStr.length === 5 ? timeStr : `${timeStr.padStart(5, '0')}`;
    const dateObj = new Date(`${dateStr}T${paddedTime}:00+05:30`);

    const formattedDate = new Intl.DateTimeFormat('en-IN', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'Asia/Kolkata',
    }).format(dateObj);

    const formattedTime = new Intl.DateTimeFormat('en-IN', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Kolkata',
    }).format(dateObj);

    return {
      formattedDate,
      formattedTime,
      spoken: `${formattedDate} at ${formattedTime}`,
    };
  } catch {
    return {
      formattedDate: dateStr,
      formattedTime: timeStr,
      spoken: `${dateStr} at ${timeStr}`,
    };
  }
}

/**
 * Check slot availability against operating hours and existing bookings
 */
export function checkAvailability({ vehicleId, location, date, time }) {
  const normDate = normalizeDate(date);
  const normTime = normalizeTime(time);

  if (!normDate || !normTime) {
    return {
      available: false,
      reason: 'INVALID_DATETIME',
      message: 'Could not normalize date or time.',
      alternatives: generateAlternativeSlots(normDate || new Date().toISOString().slice(0, 10)),
    };
  }

  const [hours, mins] = normTime.split(':').map(Number);

  // Operating hours: 09:30 to 20:00 (8:00 PM)
  const isWithinHours = (hours > 9 || (hours === 9 && mins >= 30)) && (hours < 20 || (hours === 20 && mins === 0));
  if (!isWithinHours) {
    return {
      available: false,
      reason: 'OUTSIDE_HOURS',
      message: 'Test drives are available between 9:30 AM and 8:00 PM.',
      alternatives: generateAlternativeSlots(normDate),
    };
  }

  // Check collision in database
  const collision = testDriveDb.findActiveBooking(vehicleId, location, normDate, normTime);
  if (collision) {
    return {
      available: false,
      reason: 'SLOT_OCCUPIED',
      message: `The requested time ${normTime} on ${normDate} is already booked.`,
      alternatives: generateAlternativeSlots(normDate, normTime),
    };
  }

  const slotDetails = formatSlotSpoken(normDate, normTime);
  return {
    available: true,
    date: normDate,
    time: normTime,
    location: location || 'Authorized EasyEV Hub',
    formatted_slot: slotDetails.spoken,
    formatted_date: slotDetails.formattedDate,
    formatted_time: slotDetails.formattedTime,
  };
}

/**
 * Generates nearest alternative available slots
 */
export function generateAlternativeSlots(baseDateStr, occupiedTimeStr = null) {
  const alternatives = [];
  const baseDate = new Date(baseDateStr || Date.now());
  const candidateTimes = ['11:00', '14:30', '16:30', '18:00'];

  for (const t of candidateTimes) {
    if (t !== occupiedTimeStr && alternatives.length < 2) {
      const slotInfo = formatSlotSpoken(baseDateStr, t);
      alternatives.push({
        date: baseDateStr,
        time: t,
        label: slotInfo.spoken,
      });
    }
  }

  // Add next day slot if needed
  if (alternatives.length < 2) {
    const nextDate = new Date(baseDate);
    nextDate.setDate(nextDate.getDate() + 1);
    const nextDateStr = nextDate.toISOString().slice(0, 10);
    const slotInfo = formatSlotSpoken(nextDateStr, '11:00');
    alternatives.push({
      date: nextDateStr,
      time: '11:00',
      label: slotInfo.spoken,
    });
  }

  return alternatives;
}
