// Real lead and booking destinations for EasyEV.
//
// Two providers, each independently optional:
//   HubSpot  — the buyer becomes a contact plus a deal carrying the Passport.
//   Cal.com  — a real booking with a real confirmation email to the buyer.
//
// Either can be absent. With no credentials both fall back to an in-process
// store so the tool still returns a coherent result and the demo still works;
// the returned `provider` always says which path actually ran, and nothing in
// the UI or the PDF ever claims a write that did not happen.

const HUBSPOT_BASE = 'https://api.hubapi.com';
const CALCOM_BASE = 'https://api.cal.com/v2';
const REQUEST_TIMEOUT_MS = 8000;

// Control characters are stripped by code point rather than by a regex literal:
// embedding raw control bytes in the source made git treat this file as binary.
function stripControl(value, keepNewlines) {
  let out = '';
  for (const ch of value) {
    const code = ch.codePointAt(0);
    if (code > 31 && code !== 127) { out += ch; continue; }
    if (keepNewlines && code === 10) { out += String.fromCharCode(10); continue; }
    out += ' ';
  }
  return out;
}

function cleanTextSafe(value, limit = 300) {
  if (typeof value !== 'string') return '';
  return stripControl(value.trim(), false).slice(0, limit);
}

// The CRM summary is a multi-line brief a salesperson reads, so newlines carry
// meaning here and only the other control characters are replaced.
function cleanMultiline(value, limit = 4000) {
  if (typeof value !== 'string') return '';
  return stripControl(value.trim(), true).slice(0, limit);
}

function splitName(fullName) {
  const parts = cleanTextSafe(fullName, 120).split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: '', lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

export function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || '').trim());
}

// Speech-to-text never returns a clean address. People say "jatin at the rate
// gmail dot com", and Indian speakers commonly use "at the rate" for @. Without
// this the address is silently dropped and a booking can never be confirmed.
export function parseSpokenEmail(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (isEmail(raw)) return raw.toLowerCase();
  let text = raw.toLowerCase();
  text = text.replace(/\s*\(\s*at\s*\)\s*/g, '@');
  text = text.replace(/\s*\bat the rate\b\s*/g, '@');
  text = text.replace(/\s*\batrate\b\s*/g, '@');
  text = text.replace(/\s*\bat sign\b\s*/g, '@');
  text = text.replace(/\s*\bat\b\s*/g, '@');
  text = text.replace(/\s*\(\s*dot\s*\)\s*/g, '.');
  text = text.replace(/\s*\bdot\b\s*/g, '.');
  text = text.replace(/\s*\bunderscore\b\s*/g, '_');
  text = text.replace(/\s*\b(?:dash|hyphen|minus)\b\s*/g, '-');
  text = text.replace(/\s+/g, '');
  text = text.replace(/[.,;:]+$/, '');
  // A repaired address with more than one @ means the guesswork went wrong.
  if ((text.match(/@/g) || []).length !== 1) return '';
  return isEmail(text) ? text : '';
}

// Indian mobile numbers as people say them: "nine eight seven..." already came
// through STT as digits, but with spaces, +91, or a leading 0.
export function normalizePhone(value) {
  const digits = String(value || '').replace(/[^\d]/g, '');
  if (!digits) return '';
  const local = digits.replace(/^0+/, '').replace(/^91(?=\d{10}$)/, '');
  return local.length === 10 ? `+91${local}` : `+${digits}`;
}

async function requestJson(url, options, label) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text.slice(0, 300) }; }
  if (!response.ok) {
    const detail = body?.message || body?.error?.message || body?.raw || `HTTP ${response.status}`;
    throw new Error(`${label}: ${cleanTextSafe(String(detail), 200)}`);
  }
  return body;
}

export class CrmCalendar {
  constructor({
    hubspotToken = '',
    calcomApiKey = '',
    calcomEventTypeId = '',
    calcomUsername = '',
    timezone = 'Asia/Kolkata',
  } = {}) {
    this.hubspotToken = hubspotToken.trim();
    this.calcomApiKey = calcomApiKey.trim();
    this.calcomEventTypeId = String(calcomEventTypeId || '').trim();
    this.calcomUsername = calcomUsername.trim();
    this.timezone = timezone;
    this.localLeads = new Map();
    this.localBookings = new Map();
  }

  get crmLive() { return Boolean(this.hubspotToken); }
  get calendarLive() { return Boolean(this.calcomApiKey && this.calcomEventTypeId); }

  status() {
    return {
      crm: this.crmLive ? 'hubspot' : 'local',
      calendar: this.calendarLive ? 'cal.com' : 'local',
      timezone: this.timezone,
    };
  }

  /* ------------------------------ HubSpot ------------------------------ */

  hubspotHeaders() {
    return { Authorization: `Bearer ${this.hubspotToken}`, 'Content-Type': 'application/json' };
  }

  async findContactByEmail(email) {
    const body = await requestJson(`${HUBSPOT_BASE}/crm/v3/objects/contacts/search`, {
      method: 'POST',
      headers: this.hubspotHeaders(),
      body: JSON.stringify({
        filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: email }] }],
        properties: ['email', 'firstname', 'lastname', 'phone'],
        limit: 1,
      }),
    }, 'HubSpot contact search');
    return body?.results?.[0] || null;
  }

  async upsertContact({ name, email, phone }) {
    const { firstName, lastName } = splitName(name);
    const properties = {
      ...(email ? { email } : {}),
      ...(firstName ? { firstname: firstName } : {}),
      ...(lastName ? { lastname: lastName } : {}),
      ...(phone ? { phone } : {}),
      lifecyclestage: 'salesqualifiedlead',
    };
    const existing = email ? await this.findContactByEmail(email) : null;
    if (existing) {
      await requestJson(`${HUBSPOT_BASE}/crm/v3/objects/contacts/${existing.id}`, {
        method: 'PATCH',
        headers: this.hubspotHeaders(),
        body: JSON.stringify({ properties }),
      }, 'HubSpot contact update');
      return { id: existing.id, created: false };
    }
    const created = await requestJson(`${HUBSPOT_BASE}/crm/v3/objects/contacts`, {
      method: 'POST',
      headers: this.hubspotHeaders(),
      body: JSON.stringify({ properties }),
    }, 'HubSpot contact create');
    return { id: created.id, created: true };
  }

  async createDeal({ contactId, dealName, description, amount }) {
    const deal = await requestJson(`${HUBSPOT_BASE}/crm/v3/objects/deals`, {
      method: 'POST',
      headers: this.hubspotHeaders(),
      body: JSON.stringify({
        properties: {
          dealname: dealName,
          dealstage: 'appointmentscheduled',
          pipeline: 'default',
          description,
          ...(amount ? { amount: String(Math.round(amount)) } : {}),
        },
      }),
    }, 'HubSpot deal create');
    if (contactId) {
      // Association failure must not lose the deal that was already created.
      try {
        await requestJson(`${HUBSPOT_BASE}/crm/v4/objects/deals/${deal.id}/associations/default/contacts/${contactId}`, {
          method: 'PUT',
          headers: this.hubspotHeaders(),
        }, 'HubSpot deal association');
      } catch (error) {
        return { id: deal.id, associated: false, associationError: error.message };
      }
    }
    return { id: deal.id, associated: Boolean(contactId) };
  }

  /**
   * Writes the buyer and their qualification into the CRM.
   * Returns a result describing what actually happened, never throwing for a
   * provider outage — a failed CRM write must not end the buyer's call.
   */
  async saveLead({ name, email, phone, summary, dealName, amountLakh, sessionKey }) {
    const record = {
      name: cleanTextSafe(name, 120),
      email: cleanTextSafe(email, 160).toLowerCase(),
      phone: normalizePhone(phone),
      summary: cleanMultiline(summary, 4000),
      dealName: cleanTextSafe(dealName, 160) || 'EasyEV enquiry',
      savedAt: new Date().toISOString(),
      sessionKey,
    };

    if (!this.crmLive) {
      this.localLeads.set(sessionKey, record);
      return { ...record, provider: 'local', crmUrl: null, note: 'Stored locally; HubSpot is not configured.' };
    }

    try {
      const contact = await this.upsertContact(record);
      const deal = await this.createDeal({
        contactId: contact.id,
        dealName: record.dealName,
        description: record.summary,
        amount: amountLakh ? amountLakh * 100000 : 0,
      });
      this.localLeads.set(sessionKey, { ...record, contactId: contact.id, dealId: deal.id });
      return {
        ...record,
        provider: 'hubspot',
        contactId: contact.id,
        dealId: deal.id,
        contactCreated: contact.created,
        crmUrl: `https://app.hubspot.com/contacts/objects/0-3/${deal.id}`,
      };
    } catch (error) {
      this.localLeads.set(sessionKey, record);
      return { ...record, provider: 'local', crmUrl: null, failed: true, error: error.message };
    }
  }

  /* ------------------------------- Cal.com ------------------------------ */

  calcomHeaders(version) {
    return {
      Authorization: `Bearer ${this.calcomApiKey}`,
      'Content-Type': 'application/json',
      'cal-api-version': version,
    };
  }

  // Deterministic fallback slots so the agent can still offer real times when
  // Cal.com is unreachable: next three working days at 11:00 and 16:30 IST.
  fallbackSlots(count = 4) {
    const slots = [];
    const cursor = new Date();
    cursor.setMinutes(0, 0, 0);
    for (let day = 1; slots.length < count && day <= 7; day += 1) {
      const date = new Date(cursor);
      date.setDate(date.getDate() + day);
      if (date.getDay() === 0) continue;
      for (const [hour, minute] of [[11, 0], [16, 30]]) {
        if (slots.length >= count) break;
        const slot = new Date(date);
        slot.setHours(hour, minute, 0, 0);
        slots.push({ start: slot.toISOString(), label: this.describeSlot(slot.toISOString()) });
      }
    }
    return slots;
  }

  describeSlot(iso) {
    try {
      return new Intl.DateTimeFormat('en-IN', {
        weekday: 'short', day: 'numeric', month: 'short',
        hour: 'numeric', minute: '2-digit', hour12: true,
        timeZone: this.timezone,
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  }

  async findSlots({ days = 5, limit = 4 } = {}) {
    if (!this.calendarLive) {
      return { provider: 'local', slots: this.fallbackSlots(limit), note: 'Indicative times; Cal.com is not configured.' };
    }
    try {
      const start = new Date();
      const end = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
      const params = new URLSearchParams({
        eventTypeId: this.calcomEventTypeId,
        start: start.toISOString().slice(0, 10),
        end: end.toISOString().slice(0, 10),
        timeZone: this.timezone,
      });
      const body = await requestJson(`${CALCOM_BASE}/slots?${params}`, {
        method: 'GET',
        headers: this.calcomHeaders('2024-09-04'),
      }, 'Cal.com availability');
      // The slots payload is keyed by date, each holding a list of start times.
      const buckets = body?.data && typeof body.data === 'object' ? body.data : {};
      const slots = [];
      for (const value of Object.values(buckets)) {
        for (const entry of Array.isArray(value) ? value : []) {
          const iso = entry?.start || entry?.time || entry;
          if (typeof iso !== 'string') continue;
          slots.push({ start: iso, label: this.describeSlot(iso) });
          if (slots.length >= limit) break;
        }
        if (slots.length >= limit) break;
      }
      if (!slots.length) return { provider: 'local', slots: this.fallbackSlots(limit), note: 'Cal.com returned no open slots in this window.' };
      return { provider: 'cal.com', slots };
    } catch (error) {
      return { provider: 'local', slots: this.fallbackSlots(limit), failed: true, error: error.message };
    }
  }

  async book({ name, email, phone, startISO, notes, demoType, sessionKey }) {
    const record = {
      name: cleanTextSafe(name, 120) || 'EasyEV buyer',
      email: cleanTextSafe(email, 160).toLowerCase(),
      phone: normalizePhone(phone),
      startISO,
      when: this.describeSlot(startISO),
      demoType: cleanTextSafe(demoType, 60) || 'Test drive',
      notes: cleanMultiline(notes, 1000),
      bookedAt: new Date().toISOString(),
      sessionKey,
    };

    if (!this.calendarLive) {
      this.localBookings.set(sessionKey, record);
      return { ...record, provider: 'local', confirmed: false, note: 'Held locally; Cal.com is not configured, so no invite was emailed.' };
    }

    try {
      const body = await requestJson(`${CALCOM_BASE}/bookings`, {
        method: 'POST',
        headers: this.calcomHeaders('2024-08-13'),
        body: JSON.stringify({
          start: startISO,
          eventTypeId: Number(this.calcomEventTypeId),
          attendee: {
            name: record.name,
            email: record.email,
            timeZone: this.timezone,
            language: 'en',
            ...(record.phone ? { phoneNumber: record.phone } : {}),
          },
          metadata: { source: 'EasyEV voice agent', demoType: record.demoType },
          ...(record.notes ? { bookingFieldsResponses: { notes: record.notes } } : {}),
        }),
      }, 'Cal.com booking');
      const data = body?.data || {};
      const result = {
        ...record,
        provider: 'cal.com',
        confirmed: true,
        bookingId: data.id || data.uid || null,
        bookingUid: data.uid || null,
        meetingUrl: data.meetingUrl || data.location || null,
        startISO: data.start || startISO,
        when: this.describeSlot(data.start || startISO),
      };
      this.localBookings.set(sessionKey, result);
      return result;
    } catch (error) {
      this.localBookings.set(sessionKey, record);
      return { ...record, provider: 'local', confirmed: false, failed: true, error: error.message };
    }
  }
}
