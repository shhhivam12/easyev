/**
 * EasyEV Telemetry & Observability Engine (Clean Zero-Overhead Mode)
 * Telemetry completely disabled to ensure maximum page responsiveness.
 */

export const TELEMETRY_LEVELS = {
  BASIC: 'BASIC',
  DETAILED: 'DETAILED',
  DEBUG: 'DEBUG'
};

export const TRACE_STATES = {
  TOOL: {
    CREATED: 'created',
    VALIDATING: 'validating',
    DISPATCHED: 'dispatched',
    EXECUTING: 'executing',
    COMPLETED: 'completed',
    FAILED: 'failed',
    CANCELLED: 'cancelled'
  },
  BARGE_IN: {
    DETECTED: 'detected',
    INTERRUPTING: 'interrupting',
    PLAYBACK_STOP_REQUESTED: 'playback_stop_requested',
    CANCEL_REQUEST_STARTED: 'cancel_request_started',
    CANCEL_ACK_RECEIVED: 'cancel_ack_received',
    READY: 'ready'
  }
};

export const METRIC_PROVENANCE = {};

export class TelemetrySanitizer {
  static maskString(str) { return str; }
  static sanitize(obj) { return obj; }
}

export class TraceStateMachine {
  validateToolTransition() { return true; }
  validateBargeInTransition() { return true; }
}

export class TelemetryBus {
  constructor() {
    this.listeners = new Map();
  }
  on(type, callback) {
    return () => {};
  }
  emit(type, payload = {}) {
    return { id: 'evt_noop', type, timestamp: performance.now() };
  }
}

export class TelemetryStatsAdapter {
  static normalize() {
    return { rttMs: null, jitterMs: null, packetLossPercent: null };
  }
}

export class TelemetryStore {
  constructor() {
    this.ringBuffer = [];
    this.activeBargeIn = null;
    this.latestToolTrace = null;
    this.latestFrameCommit = null;
    this.rtcHealth = {};
    this.level = TELEMETRY_LEVELS.BASIC;
  }
  setLevel() {}
  recordEvent() {}
}

export const telemetryBus = new TelemetryBus();
export const telemetryStore = new TelemetryStore();

if (typeof window !== 'undefined') {
  window.EasyEVTelemetry = {
    bus: telemetryBus,
    store: telemetryStore,
    METRIC_PROVENANCE,
    TELEMETRY_LEVELS,
    emit: (type, payload) => telemetryBus.emit(type, payload),
    on: (type, callback) => telemetryBus.on(type, callback)
  };
}
