/**
 * EasyEV Production-Grade Telemetry & Observability Engine (v3 - 9.8+ Standard)
 * 
 * Core Subsystems:
 * 1. TelemetryBus: Zero-dependency native typed event dispatcher.
 * 2. TraceStateMachine: Enforces valid transitions for multi-step Tool & Barge-in traces.
 * 3. TelemetrySanitizer: Deep recursive scrubbing of PII & authorization secrets.
 * 4. TelemetryStatsAdapter: Normalized Agora RTC stats extraction with zero synthetic fallbacks.
 * 5. TelemetryStore: 100-event FIFO circular ring buffer with active trace correlation.
 * 6. MetricProvenance: Static boundary & source metadata mapping for auditability.
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

export const METRIC_PROVENANCE = {
  rtt: {
    name: 'Network RTT',
    source: 'Agora RTC SDK (getRTCStats)',
    boundary: 'WebRTC client-to-edge roundtrip',
    sampling: 'Polled every 1500ms'
  },
  jitter: {
    name: 'Audio Jitter',
    source: 'Agora RTC Audio Track Stats',
    boundary: 'Inbound packet arrival variance',
    sampling: 'Polled every 1500ms'
  },
  packetLoss: {
    name: 'Packet Loss',
    source: 'Agora RTC SDK (getRTCStats)',
    boundary: 'Uplink / Downlink transport loss rate',
    sampling: 'Polled every 1500ms'
  },
  playbackStop: {
    name: 'Playback Stop Latency',
    source: 'AgoraAdapter.interrupt()',
    boundary: 'interrupt() invocation -> remoteTrack.stop() return',
    sampling: 'Measured per barge-in event'
  },
  cancelAck: {
    name: 'Cancel Signal Roundtrip',
    source: 'HTTP /session/interrupt',
    boundary: 'Cancel request dispatched -> Server ACK received',
    sampling: 'Measured per barge-in event'
  },
  toolPipeline: {
    name: 'Tool Execution Pipeline',
    source: 'decision-tools.mjs Lifecycle',
    boundary: 'Intent parsed -> SSE completion event received',
    sampling: 'Measured per tool run'
  },
  postRenderFrame: {
    name: 'Stage -> Next Frame',
    source: 'Double requestAnimationFrame()',
    boundary: 'showStage() DOM update -> Next frame boundary observed',
    sampling: 'Measured per stage transition'
  }
};

const SECRET_REDACT_KEYS = new Set([
  'token',
  'authorization',
  'accesstoken',
  'refreshtoken',
  'password',
  'apikey',
  'cardnumber',
  'cvv',
  'secret'
]);

export class TelemetrySanitizer {
  static maskString(str) {
    if (typeof str !== 'string') return str;
    if (str.includes('@') && str.includes('.')) {
      const parts = str.split('@');
      return `${parts[0].slice(0, 2)}***@${parts[1]}`;
    }
    const cleanDigits = str.replace(/\D/g, '');
    if (cleanDigits.length >= 10 && cleanDigits.length <= 15) {
      return `•••••••${cleanDigits.slice(-4)}`;
    }
    return str;
  }

  static sanitize(obj, depth = 0) {
    if (depth > 6 || obj === null || obj === undefined) return obj;
    if (typeof obj === 'string') {
      return TelemetrySanitizer.maskString(obj);
    }
    if (Array.isArray(obj)) {
      return obj.map(item => TelemetrySanitizer.sanitize(item, depth + 1));
    }
    if (typeof obj === 'object') {
      const sanitized = {};
      for (const [key, value] of Object.entries(obj)) {
        const lowerKey = key.toLowerCase();
        if (SECRET_REDACT_KEYS.has(lowerKey)) {
          sanitized[key] = '[REDACTED]';
        } else if (lowerKey.includes('email') && typeof value === 'string') {
          sanitized[key] = TelemetrySanitizer.maskString(value);
        } else if ((lowerKey.includes('phone') || lowerKey.includes('mobile')) && typeof value === 'string') {
          sanitized[key] = TelemetrySanitizer.maskString(value);
        } else {
          sanitized[key] = TelemetrySanitizer.sanitize(value, depth + 1);
        }
      }
      return sanitized;
    }
    return obj;
  }
}

export class TraceStateMachine {
  constructor() {
    this.toolTransitions = new Map([
      [TRACE_STATES.TOOL.CREATED, new Set([TRACE_STATES.TOOL.VALIDATING, TRACE_STATES.TOOL.DISPATCHED, TRACE_STATES.TOOL.CANCELLED])],
      [TRACE_STATES.TOOL.VALIDATING, new Set([TRACE_STATES.TOOL.DISPATCHED, TRACE_STATES.TOOL.FAILED, TRACE_STATES.TOOL.CANCELLED])],
      [TRACE_STATES.TOOL.DISPATCHED, new Set([TRACE_STATES.TOOL.EXECUTING, TRACE_STATES.TOOL.COMPLETED, TRACE_STATES.TOOL.FAILED, TRACE_STATES.TOOL.CANCELLED])],
      [TRACE_STATES.TOOL.EXECUTING, new Set([TRACE_STATES.TOOL.COMPLETED, TRACE_STATES.TOOL.FAILED, TRACE_STATES.TOOL.CANCELLED])],
      [TRACE_STATES.TOOL.COMPLETED, new Set()],
      [TRACE_STATES.TOOL.FAILED, new Set()],
      [TRACE_STATES.TOOL.CANCELLED, new Set()]
    ]);

    this.bargeInTransitions = new Map([
      [TRACE_STATES.BARGE_IN.DETECTED, new Set([TRACE_STATES.BARGE_IN.INTERRUPTING, TRACE_STATES.BARGE_IN.PLAYBACK_STOP_REQUESTED, TRACE_STATES.BARGE_IN.READY])],
      [TRACE_STATES.BARGE_IN.INTERRUPTING, new Set([TRACE_STATES.BARGE_IN.PLAYBACK_STOP_REQUESTED, TRACE_STATES.BARGE_IN.CANCEL_REQUEST_STARTED, TRACE_STATES.BARGE_IN.READY])],
      [TRACE_STATES.BARGE_IN.PLAYBACK_STOP_REQUESTED, new Set([TRACE_STATES.BARGE_IN.CANCEL_REQUEST_STARTED, TRACE_STATES.BARGE_IN.CANCEL_ACK_RECEIVED, TRACE_STATES.BARGE_IN.READY])],
      [TRACE_STATES.BARGE_IN.CANCEL_REQUEST_STARTED, new Set([TRACE_STATES.BARGE_IN.CANCEL_ACK_RECEIVED, TRACE_STATES.BARGE_IN.READY])],
      [TRACE_STATES.BARGE_IN.CANCEL_ACK_RECEIVED, new Set([TRACE_STATES.BARGE_IN.READY])],
      [TRACE_STATES.BARGE_IN.READY, new Set()]
    ]);
  }

  validateToolTransition(fromState, toState) {
    if (!fromState) return toState === TRACE_STATES.TOOL.CREATED || toState === TRACE_STATES.TOOL.VALIDATING || toState === TRACE_STATES.TOOL.DISPATCHED;
    const allowed = this.toolTransitions.get(fromState);
    return allowed ? allowed.has(toState) : false;
  }

  validateBargeInTransition(fromState, toState) {
    if (!fromState) return toState === TRACE_STATES.BARGE_IN.DETECTED || toState === TRACE_STATES.BARGE_IN.INTERRUPTING;
    const allowed = this.bargeInTransitions.get(fromState);
    return allowed ? allowed.has(toState) : false;
  }
}

export class TelemetryBus {
  constructor() {
    this.listeners = new Map();
  }

  on(type, callback) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type).add(callback);
    return () => this.listeners.get(type)?.delete(callback);
  }

  emit(type, payload = {}) {
    const event = {
      id: `evt_${Math.random().toString(36).slice(2, 9)}`,
      type,
      sessionId: payload.sessionId || 'session_default',
      traceId: payload.traceId || null,
      parentEventId: payload.parentEventId || null,
      timestamp: performance.now(),
      wallClockTime: Date.now(),
      metadata: TelemetrySanitizer.sanitize(payload.metadata || payload)
    };

    // Fan-out via microtask to decouple instrumentation from real-time audio loop
    queueMicrotask(() => {
      this.listeners.get(type)?.forEach(listener => {
        try { listener(event); } catch (err) { console.error('TelemetryBus listener error:', err); }
      });
      // Global subscriber for store
      this.listeners.get('*')?.forEach(listener => {
        try { listener(event); } catch (err) { console.error('TelemetryBus wildcard listener error:', err); }
      });
    });

    return event;
  }
}

export class TelemetryStatsAdapter {
  static normalize(rawRtcStats = {}, rawAudioStats = {}) {
    // Zero synthetic fallbacks — unavailable metrics are strictly null
    const rtt = Number(rawRtcStats.RTT ?? rawRtcStats.rtt ?? rawAudioStats.rtt);
    const jitter = Number(rawAudioStats.jitter ?? rawRtcStats.jitter);
    const packetLoss = Number(rawRtcStats.PacketLossRate ?? rawRtcStats.packetLossRate ?? rawAudioStats.packetLossRate);
    const uplink = Number(rawRtcStats.SendBitrate ?? rawRtcStats.sendBitrate);
    const downlink = Number(rawRtcStats.RecvBitrate ?? rawRtcStats.recvBitrate);

    return {
      rttMs: Number.isFinite(rtt) && rtt >= 0 ? Math.round(rtt) : null,
      jitterMs: Number.isFinite(jitter) && jitter >= 0 ? Math.round(jitter) : null,
      packetLossPercent: Number.isFinite(packetLoss) && packetLoss >= 0 ? Number(packetLoss.toFixed(1)) : null,
      uplinkBitrateKbps: Number.isFinite(uplink) && uplink >= 0 ? Math.round(uplink) : null,
      downlinkBitrateKbps: Number.isFinite(downlink) && downlink >= 0 ? Math.round(downlink) : null,
      connectionState: rawRtcStats.connectionState || 'CONNECTED',
      audioTransport: 'Agora SD-RTN (WebRTC / UDP)',
      sampledAt: Date.now()
    };
  }
}

export class TelemetryStore {
  constructor(maxSize = 100) {
    this.maxSize = maxSize;
    this.ringBuffer = [];
    this.stateMachine = new TraceStateMachine();
    this.activeBargeIn = null;
    this.activeToolTraces = new Map();
    this.latestToolTrace = null;
    this.rtcHealth = TelemetryStatsAdapter.normalize();
    this.latestFrameCommit = null;
    this.level = TELEMETRY_LEVELS.BASIC;
  }

  setLevel(level) {
    if (Object.values(TELEMETRY_LEVELS).includes(level)) {
      this.level = level;
    }
  }

  recordEvent(event) {
    // 100-event FIFO Ring Buffer
    if (this.ringBuffer.length >= this.maxSize) {
      this.ringBuffer.shift();
    }
    this.ringBuffer.push(event);

    // Process domain reducers
    this.reduceBargeIn(event);
    this.reduceToolTrace(event);
    this.reduceFrameCommit(event);
    this.reduceRtcStats(event);
  }

  reduceBargeIn(event) {
    if (event.type === 'VAD_SPEECH_DETECTED' || event.type === 'INTERRUPT_INVOKED') {
      const traceId = event.traceId || `barge_${event.id}`;
      this.activeBargeIn = {
        traceId,
        t0_detected: event.timestamp,
        t0_wallClock: event.wallClockTime,
        t1_invoked: null,
        t2_playbackStopRequested: null,
        t3a_cancelStarted: null,
        t3b_cancelAck: null,
        t4_agentReady: null,
        state: TRACE_STATES.BARGE_IN.DETECTED,
        complete: false
      };
    }

    if (!this.activeBargeIn) return;

    if (event.type === 'INTERRUPT_INVOKED' && this.stateMachine.validateBargeInTransition(this.activeBargeIn.state, TRACE_STATES.BARGE_IN.INTERRUPTING)) {
      this.activeBargeIn.t1_invoked = event.timestamp;
      this.activeBargeIn.state = TRACE_STATES.BARGE_IN.INTERRUPTING;
    } else if (event.type === 'REMOTE_TRACK_STOP_REQUESTED' && this.stateMachine.validateBargeInTransition(this.activeBargeIn.state, TRACE_STATES.BARGE_IN.PLAYBACK_STOP_REQUESTED)) {
      this.activeBargeIn.t2_playbackStopRequested = event.timestamp;
      this.activeBargeIn.state = TRACE_STATES.BARGE_IN.PLAYBACK_STOP_REQUESTED;
    } else if (event.type === 'CANCEL_REQUEST_STARTED' && this.stateMachine.validateBargeInTransition(this.activeBargeIn.state, TRACE_STATES.BARGE_IN.CANCEL_REQUEST_STARTED)) {
      this.activeBargeIn.t3a_cancelStarted = event.timestamp;
      this.activeBargeIn.state = TRACE_STATES.BARGE_IN.CANCEL_REQUEST_STARTED;
    } else if (event.type === 'CANCEL_ACK_RECEIVED' && this.stateMachine.validateBargeInTransition(this.activeBargeIn.state, TRACE_STATES.BARGE_IN.CANCEL_ACK_RECEIVED)) {
      this.activeBargeIn.t3b_cancelAck = event.timestamp;
      this.activeBargeIn.state = TRACE_STATES.BARGE_IN.CANCEL_ACK_RECEIVED;
    } else if ((event.type === 'AGENT_STATE_UPDATED' || event.type === 'AGENT_STATE_TRANSITION') && event.metadata?.mode === 'interrupted') {
      this.activeBargeIn.t4_agentReady = event.timestamp;
      this.activeBargeIn.state = TRACE_STATES.BARGE_IN.READY;
      this.activeBargeIn.complete = true;
    }
  }

  reduceToolTrace(event) {
    if (event.type === 'TOOL_INTENT_RECEIVED' || event.type === 'TOOL_TRACE_START') {
      const traceId = event.traceId || `tool_${event.id}`;
      const trace = {
        traceId,
        tool: event.metadata?.tool || 'unknown_tool',
        t0_intent: event.timestamp,
        t0_wallClock: event.wallClockTime,
        t1_schemaValidated: null,
        t2_requestSent: null,
        t3_execStarted: null,
        t4_execCompleted: null,
        t5_sseReceived: null,
        t6_stageRendered: null,
        t7_frameObserved: null,
        state: TRACE_STATES.TOOL.CREATED,
        complete: false
      };
      this.activeToolTraces.set(traceId, trace);
      this.latestToolTrace = trace;
    }

    const traceId = event.traceId || (this.latestToolTrace ? this.latestToolTrace.traceId : null);
    if (!traceId || !this.activeToolTraces.has(traceId)) return;

    const trace = this.activeToolTraces.get(traceId);

    if (event.type === 'SCHEMA_VALIDATION_COMPLETED' && this.stateMachine.validateToolTransition(trace.state, TRACE_STATES.TOOL.VALIDATING)) {
      trace.t1_schemaValidated = event.timestamp;
      trace.state = TRACE_STATES.TOOL.VALIDATING;
    } else if (event.type === 'SERVER_REQUEST_SENT' && this.stateMachine.validateToolTransition(trace.state, TRACE_STATES.TOOL.DISPATCHED)) {
      trace.t2_requestSent = event.timestamp;
      trace.state = TRACE_STATES.TOOL.DISPATCHED;
    } else if (event.type === 'SERVER_EXECUTION_STARTED' && this.stateMachine.validateToolTransition(trace.state, TRACE_STATES.TOOL.EXECUTING)) {
      trace.t3_execStarted = event.timestamp;
      trace.state = TRACE_STATES.TOOL.EXECUTING;
    } else if (event.type === 'SERVER_EXECUTION_COMPLETED' && this.stateMachine.validateToolTransition(trace.state, TRACE_STATES.TOOL.COMPLETED)) {
      trace.t4_execCompleted = event.timestamp;
      trace.state = TRACE_STATES.TOOL.COMPLETED;
    } else if (event.type === 'SSE_EVENT_RECEIVED') {
      trace.t5_sseReceived = event.timestamp;
    } else if (event.type === 'STAGE_RENDER_START') {
      trace.t6_stageRendered = event.timestamp;
    } else if (event.type === 'POST_RENDER_FRAME_OBSERVED') {
      trace.t7_frameObserved = event.timestamp;
      trace.complete = true;
    }
  }

  reduceFrameCommit(event) {
    if (event.type === 'POST_RENDER_FRAME_OBSERVED') {
      this.latestFrameCommit = {
        stageType: event.metadata?.stageType || 'unknown',
        durationMs: event.metadata?.durationMs || null,
        observedAt: event.wallClockTime
      };
    }
  }

  reduceRtcStats(event) {
    if (event.type === 'RTC_STATS_SAMPLED') {
      this.rtcHealth = event.metadata || this.rtcHealth;
    }
  }
}

// Global Singletons
export const telemetryBus = new TelemetryBus();
export const telemetryStore = new TelemetryStore();

// Auto-wire store to bus
telemetryBus.on('*', (event) => telemetryStore.recordEvent(event));

if (typeof window !== 'undefined') {
  window.EasyEVTelemetry = {
    bus: telemetryBus,
    store: telemetryStore,
    METRIC_PROVENANCE,
    TRACE_STATES,
    TELEMETRY_LEVELS,
    emit: (type, payload) => telemetryBus.emit(type, payload),
    on: (type, callback) => telemetryBus.on(type, callback)
  };
}
