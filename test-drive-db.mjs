import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';

const ROOT = resolve(import.meta.dirname);
const DATA_DIR = resolve(ROOT, 'data');
const DB_FILE = resolve(DATA_DIR, 'test-drives.json');

if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

export const FSM_STATES = Object.freeze({
  INITIATED: 'INITIATED',
  CALL_CREATED: 'CALL_CREATED',
  CALL_CONNECTED: 'CALL_CONNECTED',
  COLLECTING_DETAILS: 'COLLECTING_DETAILS',
  SLOT_CHECKING: 'SLOT_CHECKING',
  SLOT_CHECKED: 'SLOT_CHECKED',
  AWAITING_CONFIRMATION: 'AWAITING_CONFIRMATION',
  BOOKING: 'BOOKING',
  BOOKED: 'BOOKED',
  NO_ANSWER: 'NO_ANSWER',
  BUSY: 'BUSY',
  CALL_FAILED: 'CALL_FAILED',
  BOOKING_FAILED: 'BOOKING_FAILED',
  CANCELLED: 'CANCELLED',
  MANUAL_FALLBACK: 'MANUAL_FALLBACK',
  // Backward-compatible aliases
  CALLING: 'CALL_CREATED',
  IN_PROGRESS: 'CALL_CONNECTED',
});

const VALID_TRANSITIONS = {
  [FSM_STATES.INITIATED]: [FSM_STATES.CALL_CREATED, FSM_STATES.CALL_FAILED, FSM_STATES.CANCELLED],
  [FSM_STATES.CALL_CREATED]: [
    FSM_STATES.CALL_CONNECTED,
    FSM_STATES.COLLECTING_DETAILS,
    FSM_STATES.SLOT_CHECKED,
    FSM_STATES.AWAITING_CONFIRMATION,
    FSM_STATES.BOOKING,
    FSM_STATES.NO_ANSWER,
    FSM_STATES.BUSY,
    FSM_STATES.CALL_FAILED,
    FSM_STATES.CANCELLED,
  ],
  [FSM_STATES.CALL_CONNECTED]: [
    FSM_STATES.COLLECTING_DETAILS,
    FSM_STATES.SLOT_CHECKING,
    FSM_STATES.SLOT_CHECKED,
    FSM_STATES.AWAITING_CONFIRMATION,
    FSM_STATES.BOOKING,
    FSM_STATES.CANCELLED,
    FSM_STATES.CALL_FAILED,
  ],
  [FSM_STATES.COLLECTING_DETAILS]: [
    FSM_STATES.SLOT_CHECKING,
    FSM_STATES.SLOT_CHECKED,
    FSM_STATES.AWAITING_CONFIRMATION,
    FSM_STATES.BOOKING,
    FSM_STATES.MANUAL_FALLBACK,
    FSM_STATES.CANCELLED,
    FSM_STATES.CALL_FAILED,
  ],
  [FSM_STATES.SLOT_CHECKING]: [
    FSM_STATES.SLOT_CHECKED,
    FSM_STATES.COLLECTING_DETAILS,
    FSM_STATES.MANUAL_FALLBACK,
    FSM_STATES.CANCELLED,
    FSM_STATES.CALL_FAILED,
  ],
  [FSM_STATES.SLOT_CHECKED]: [
    FSM_STATES.AWAITING_CONFIRMATION,
    FSM_STATES.BOOKING,
    FSM_STATES.COLLECTING_DETAILS,
    FSM_STATES.MANUAL_FALLBACK,
    FSM_STATES.CANCELLED,
  ],
  [FSM_STATES.AWAITING_CONFIRMATION]: [
    FSM_STATES.BOOKING,
    FSM_STATES.COLLECTING_DETAILS,
    FSM_STATES.SLOT_CHECKED,
    FSM_STATES.CANCELLED,
    FSM_STATES.CALL_FAILED,
  ],
  [FSM_STATES.BOOKING]: [FSM_STATES.BOOKED, FSM_STATES.BOOKING_FAILED, FSM_STATES.CANCELLED],
  [FSM_STATES.BOOKED]: [FSM_STATES.CANCELLED],
  [FSM_STATES.BOOKING_FAILED]: [
    FSM_STATES.COLLECTING_DETAILS,
    FSM_STATES.SLOT_CHECKED,
    FSM_STATES.AWAITING_CONFIRMATION,
    FSM_STATES.MANUAL_FALLBACK,
    FSM_STATES.CANCELLED,
  ],
  [FSM_STATES.NO_ANSWER]: [],
  [FSM_STATES.BUSY]: [],
  [FSM_STATES.CALL_FAILED]: [],
  [FSM_STATES.CANCELLED]: [],
  [FSM_STATES.MANUAL_FALLBACK]: [],
};

class TestDriveRepository {
  constructor() {
    this.sessions = new Map();
    this.availabilityChecks = new Map();
    this.bookings = new Map();
    this.auditLogs = [];
    this.lockPromise = Promise.resolve();
    this.loadFromDisk();
  }

  loadFromDisk() {
    try {
      if (existsSync(DB_FILE)) {
        const raw = readFileSync(DB_FILE, 'utf-8');
        const data = JSON.parse(raw);
        if (Array.isArray(data.sessions)) {
          for (const s of data.sessions) this.sessions.set(s.id, s);
        }
        if (Array.isArray(data.availabilityChecks)) {
          for (const ac of data.availabilityChecks) this.availabilityChecks.set(ac.id, ac);
        }
        if (Array.isArray(data.bookings)) {
          for (const b of data.bookings) this.bookings.set(b.id, b);
        }
        if (Array.isArray(data.auditLogs)) {
          this.auditLogs = data.auditLogs;
        }
      }
    } catch (err) {
      console.error('[TestDriveDB] Error loading database:', err.message);
    }
  }

  saveToDisk() {
    try {
      const payload = {
        sessions: Array.from(this.sessions.values()),
        availabilityChecks: Array.from(this.availabilityChecks.values()),
        bookings: Array.from(this.bookings.values()),
        auditLogs: this.auditLogs.slice(-1000),
        lastUpdated: new Date().toISOString(),
      };
      writeFileSync(DB_FILE, JSON.stringify(payload, null, 2), 'utf-8');
    } catch (err) {
      console.error('[TestDriveDB] Error persisting database:', err.message);
    }
  }

  async runWithLock(fn) {
    const nextLock = this.lockPromise.then(async () => {
      return await fn();
    }).catch(err => {
      console.error('[TestDriveDB] Lock execution error:', err);
      throw err;
    });
    this.lockPromise = nextLock.then(() => {}, () => {});
    return nextLock;
  }

  generateCapabilityToken() {
    return `cap_${Math.random().toString(36).substring(2, 10)}`;
  }

  hashToken(token) {
    return `hash_${token}`;
  }

  createSession({ vehicleId, vehicleName, customerPhone, customerEmail, idempotencyKey }) {
    return this.runWithLock(() => {
      if (idempotencyKey) {
        for (const existing of this.sessions.values()) {
          if (existing.idempotency_key === idempotencyKey) {
            return { session: existing, isExisting: true };
          }
        }
      }

      const id = `EEV-SES-${randomUUID().slice(0, 8).toUpperCase()}`;
      const capabilityToken = this.generateCapabilityToken();
      const tokenHash = this.hashToken(capabilityToken);
      const now = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(); // 2 hours TTL

      const session = {
        id,
        vehicle_id: vehicleId,
        vehicle_name: vehicleName,
        customer_phone: customerPhone,
        customer_email: customerEmail,
        location: null,
        preferred_date: null,
        preferred_time: null,
        timezone: 'Asia/Kolkata',
        status: FSM_STATES.INITIATED,
        retell_call_id: null,
        bland_call_id: null,
        capability_token: capabilityToken,
        capability_token_hash: tokenHash,
        token_expires_at: expiresAt,
        token_revoked: false,
        idempotency_key: idempotencyKey || null,
        created_at: now,
        updated_at: now,
      };

      this.sessions.set(id, session);
      this.recordAudit(id, 'SESSION_CREATED', { vehicleId, customerPhone, customerEmail });
      this.saveToDisk();
      return { session, isExisting: false };
    });
  }

  getSession(id) {
    return this.sessions.get(id) || null;
  }

  verifyCapabilityToken(sessionId, token) {
    const session = this.getSession(sessionId);
    if (!session || session.token_revoked) return false;
    if (new Date(session.token_expires_at) < new Date()) return false;
    const providedHash = this.hashToken(token);
    return session.capability_token_hash === providedHash || session.capability_token === token;
  }

  transitionStatus(sessionId, nextStatus, metadata = {}) {
    return this.runWithLock(() => {
      const session = this.sessions.get(sessionId);
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      const currentStatus = session.status;
      const allowed = VALID_TRANSITIONS[currentStatus] || [];

      if (currentStatus !== nextStatus && !allowed.includes(nextStatus)) {
        throw new Error(`Invalid FSM transition from ${currentStatus} to ${nextStatus}`);
      }

      session.status = nextStatus;
      session.updated_at = new Date().toISOString();
      if (metadata.retell_call_id) session.retell_call_id = metadata.retell_call_id;
      if (metadata.bland_call_id) session.bland_call_id = metadata.bland_call_id;
      if (metadata.location) session.location = metadata.location;
      if (metadata.preferred_date) session.preferred_date = metadata.preferred_date;
      if (metadata.preferred_time) session.preferred_time = metadata.preferred_time;

      this.sessions.set(sessionId, session);
      this.recordAudit(sessionId, 'STATUS_TRANSITION', { from: currentStatus, to: nextStatus, ...metadata });
      this.saveToDisk();
      return session;
    });
  }

  saveAvailabilityCheck({ sessionId, vehicleId, location, date, time, available, formattedSlot }) {
    return this.runWithLock(() => {
      const id = `av_${Math.floor(10000 + Math.random() * 90000)}`;
      const now = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 min TTL

      const check = {
        id,
        session_id: sessionId,
        vehicle_id: vehicleId,
        location,
        date,
        time,
        available: Boolean(available),
        formatted_slot: formattedSlot,
        expires_at: expiresAt,
        created_at: now,
      };

      this.availabilityChecks.set(id, check);
      this.saveToDisk();
      return check;
    });
  }

  getAvailabilityCheck(checkId) {
    const check = this.availabilityChecks.get(checkId);
    if (!check) return null;
    if (new Date(check.expires_at) < new Date()) return null; // expired
    return check;
  }

  findActiveBooking(vehicleId, location, date, time) {
    for (const booking of this.bookings.values()) {
      if (
        booking.status === 'CONFIRMED' &&
        booking.vehicle_id === vehicleId &&
        booking.date === date &&
        booking.start_time === time &&
        booking.location?.toLowerCase() === location?.toLowerCase()
      ) {
        return booking;
      }
    }
    return null;
  }

  createBookingAtomic({
    sessionId,
    capabilityToken,
    availabilityCheckId = null,
    location,
    date,
    time,
    timezone = 'Asia/Kolkata',
  }) {
    return this.runWithLock(() => {
      const session = this.sessions.get(sessionId);
      if (!session) {
        throw new Error('Invalid or non-existent test-drive session');
      }

      if (!this.verifyCapabilityToken(sessionId, capabilityToken)) {
        throw new Error('Unauthorized: capability token mismatch or expired');
      }

      // Check if session is already booked (Idempotency)
      for (const b of this.bookings.values()) {
        if (b.session_id === sessionId && b.status === 'CONFIRMED') {
          return { success: true, booking: b, isDuplicate: true };
        }
      }

      const validBookingStates = [
        FSM_STATES.INITIATED,
        FSM_STATES.CALL_CREATED,
        FSM_STATES.CALL_CONNECTED,
        FSM_STATES.COLLECTING_DETAILS,
        FSM_STATES.SLOT_CHECKED,
        FSM_STATES.AWAITING_CONFIRMATION,
      ];
      if (!validBookingStates.includes(session.status)) {
        throw new Error(`Cannot execute booking when session is in state ${session.status}`);
      }

      // If availabilityCheckId provided, verify it
      let finalLocation = location || session.location;
      let finalDate = date || session.preferred_date;
      let finalTime = time || session.preferred_time;

      if (availabilityCheckId) {
        const check = this.getAvailabilityCheck(availabilityCheckId);
        if (check && check.session_id === sessionId) {
          finalLocation = check.location;
          finalDate = check.date;
          finalTime = check.time;
        }
      }

      // Check slot collision atomically
      const existing = this.findActiveBooking(session.vehicle_id, finalLocation, finalDate, finalTime);
      if (existing) {
        return {
          success: false,
          reason: 'SLOT_OCCUPIED',
          message: `The slot at ${finalTime} on ${finalDate} for ${finalLocation} is no longer available.`,
        };
      }

      session.status = FSM_STATES.BOOKING;
      session.updated_at = new Date().toISOString();

      const bookingId = `EEV-TD-${Math.floor(10000 + Math.random() * 90000)}`;
      const now = new Date().toISOString();

      const booking = {
        id: bookingId,
        idempotency_key: `${sessionId}_${availabilityCheckId || finalDate + '_' + finalTime}`,
        session_id: sessionId,
        vehicle_id: session.vehicle_id, // Authoritative from session
        vehicle_name: session.vehicle_name, // Authoritative from session
        customer_phone: session.customer_phone, // Authoritative from session
        customer_email: session.customer_email, // Authoritative from session
        location: finalLocation,
        date: finalDate,
        start_time: finalTime,
        end_time: calculateEndTime(finalTime),
        timezone,
        status: 'CONFIRMED',
        confirmation_email_status: 'PENDING',
        created_at: now,
        updated_at: now,
      };

      this.bookings.set(bookingId, booking);

      session.status = FSM_STATES.BOOKED;
      session.location = finalLocation;
      session.preferred_date = finalDate;
      session.preferred_time = finalTime;
      this.sessions.set(sessionId, session);

      this.recordAudit(sessionId, 'BOOKING_CREATED', { bookingId, date: finalDate, time: finalTime, location: finalLocation });
      this.saveToDisk();

      return { success: true, booking, isDuplicate: false };
    });
  }

  updateBookingEmailStatus(bookingId, emailStatus, emailDetail = null) {
    return this.runWithLock(() => {
      const booking = this.bookings.get(bookingId);
      if (!booking) return null;
      booking.confirmation_email_status = emailStatus;
      booking.email_detail = emailDetail;
      booking.updated_at = new Date().toISOString();
      this.bookings.set(bookingId, booking);
      this.saveToDisk();
      return booking;
    });
  }

  recordAudit(sessionId, event, payload = {}) {
    const log = {
      sessionId,
      event,
      payload,
      timestamp: new Date().toISOString(),
    };
    this.auditLogs.push(log);
    this.saveToDisk();
  }

  getAuditLogs(sessionId) {
    return this.auditLogs.filter(l => l.sessionId === sessionId);
  }
}

function calculateEndTime(startTime) {
  try {
    const [h, m] = startTime.split(':').map(Number);
    const date = new Date();
    date.setHours(h, m + 45, 0, 0);
    const endH = String(date.getHours()).padStart(2, '0');
    const endM = String(date.getMinutes()).padStart(2, '0');
    return `${endH}:${endM}`;
  } catch {
    return startTime;
  }
}

export const testDriveDb = new TestDriveRepository();
