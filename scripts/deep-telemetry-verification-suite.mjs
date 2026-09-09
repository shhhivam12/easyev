
import {
  TelemetryBus,
  TraceStateMachine,
  TelemetrySanitizer,
  TelemetryStatsAdapter,
  TelemetryStore,
  TRACE_STATES,
  METRIC_PROVENANCE,
  TELEMETRY_LEVELS
} from "../client/telemetry-engine.js";

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log("  ✅ PASS: " + message);
    passed++;
  } else {
    console.error("  ❌ FAIL: " + message);
    failed++;
  }
}

console.log("═══════════════════════════════════════════════════════════════════════");
console.log("🔬 DEEP FORENSIC VERIFICATION SUITE — REAL-TIME TELEMETRY ENGINE & HUD");
console.log("═══════════════════════════════════════════════════════════════════════");

// SECTION 1: TRACE STATE MACHINE FORENSICS
console.log("\n--- 1. Trace State Machine State Transition Matrix ---");
const sm = new TraceStateMachine();

// Tool State Transitions
assert(sm.validateToolTransition("created", "validating") === true, "Tool: CREATED -> VALIDATING is valid");
assert(sm.validateToolTransition("validating", "dispatched") === true, "Tool: VALIDATING -> DISPATCHED is valid");
assert(sm.validateToolTransition("dispatched", "executing") === true, "Tool: DISPATCHED -> EXECUTING is valid");
assert(sm.validateToolTransition("executing", "completed") === true, "Tool: EXECUTING -> COMPLETED is valid");
assert(sm.validateToolTransition("validating", "failed") === true, "Tool: VALIDATING -> FAILED is valid");
assert(sm.validateToolTransition("dispatched", "failed") === true, "Tool: DISPATCHED -> FAILED is valid");
assert(sm.validateToolTransition("executing", "cancelled") === true, "Tool: EXECUTING -> CANCELLED is valid");

// Invalid Tool Transitions (Must Fail)
assert(sm.validateToolTransition("completed", "dispatched") === false, "Reject: COMPLETED -> DISPATCHED");
assert(sm.validateToolTransition("created", "completed") === false, "Reject: CREATED -> COMPLETED (skip)");
assert(sm.validateToolTransition("failed", "executing") === false, "Reject: FAILED -> EXECUTING (after terminal)");
assert(sm.validateToolTransition("cancelled", "completed") === false, "Reject: CANCELLED -> COMPLETED");

// Barge-In State Transitions
assert(sm.validateBargeInTransition("detected", "interrupting") === true, "Barge-In: DETECTED -> INTERRUPTING is valid");
assert(sm.validateBargeInTransition("interrupting", "playback_stop_requested") === true, "Barge-In: INTERRUPTING -> PLAYBACK_STOP_REQUESTED is valid");
assert(sm.validateBargeInTransition("playback_stop_requested", "cancel_request_started") === true, "Barge-In: PLAYBACK_STOP_REQUESTED -> CANCEL_REQUEST_STARTED is valid");
assert(sm.validateBargeInTransition("cancel_request_started", "cancel_ack_received") === true, "Barge-In: CANCEL_REQUEST_STARTED -> CANCEL_ACK_RECEIVED is valid");
assert(sm.validateBargeInTransition("cancel_ack_received", "ready") === true, "Barge-In: CANCEL_ACK_RECEIVED -> READY is valid");

// Invalid Barge-In Transitions (Must Fail)
assert(sm.validateBargeInTransition("ready", "cancel_request_started") === false, "Reject: READY -> CANCEL_REQUEST_STARTED (from terminal)");
assert(sm.validateBargeInTransition("cancel_ack_received", "interrupting") === false, "Reject: CANCEL_ACK -> INTERRUPTING (backwards transition)");
assert(sm.validateBargeInTransition("ready", "interrupting") === false, "Reject: READY -> INTERRUPTING without new detect");

// SECTION 2: TELEMETRY SANITIZER DEEP RECURSION & ZERO LEAK
console.log("\n--- 2. Telemetry Sanitizer & Privacy Boundary Tests ---");
const complexDirtyObject = {
  sessionId: "sess_prod_9921",
  token: "mock_dummy_token_123",
  authorization: "Bearer mock_dummy_auth_header",
  accessToken: "mock_dummy_access_token",
  refreshToken: "mock_dummy_refresh_token",
  user: {
    name: "Satvik Kesarwani",
    email: "satvik.kesarwani@easyev.ai",
    phone: "+91 98765 43210",
    billing: {
      cardNumber: "4532 8921 7732 1109",
      cvv: "892",
      password: "SuperSecretRootPassword!"
    }
  },
  nestedArray: [
    { secretKey: "apiKey_xyz", value: 100 },
    { email: "judge.rishi@agora.io", phone: "9811223344" }
  ]
};

const clean = TelemetrySanitizer.sanitize(complexDirtyObject);
assert(clean.token === "[REDACTED]", "Redact token");
assert(clean.authorization === "[REDACTED]", "Redact authorization header");
assert(clean.accessToken === "[REDACTED]", "Redact accessToken");
assert(clean.refreshToken === "[REDACTED]", "Redact refreshToken");
assert(clean.user.billing.cardNumber === "[REDACTED]", "Redact cardNumber");
assert(clean.user.billing.cvv === "[REDACTED]", "Redact cvv");
assert(clean.user.billing.password === "[REDACTED]", "Redact password");
assert(clean.user.email === "sa***@easyev.ai", "Mask email (sa***@easyev.ai)");
assert(clean.user.phone === "•••••••3210", "Mask phone (•••••••3210)");
assert(clean.nestedArray[1].email === "ju***@agora.io", "Mask nested array email");
assert(clean.nestedArray[1].phone === "•••••••3344", "Mask nested array phone");
assert(clean.sessionId === "sess_prod_9921", "Preserve non-sensitive sessionId");
assert(clean.user.name === "Satvik Kesarwani", "Preserve non-sensitive name");

// SECTION 3: NORMALIZED RTC STATS ADAPTER (NO HALLUCINATIONS)
console.log("\n--- 3. Normalized RTC Stats Adapter (Zero Synthetic Fallbacks) ---");
const disconnectedStats = TelemetryStatsAdapter.normalize(undefined, undefined);
assert(disconnectedStats.rttMs === null, "Disconnected RTT is strictly null");
assert(disconnectedStats.jitterMs === null, "Disconnected Jitter is strictly null");
assert(disconnectedStats.packetLossPercent === null, "Disconnected Packet Loss is strictly null");
assert(disconnectedStats.uplinkBitrateKbps === null, "Disconnected Uplink is strictly null");
assert(disconnectedStats.downlinkBitrateKbps === null, "Disconnected Downlink is strictly null");

const liveAgoraStats = TelemetryStatsAdapter.normalize(
  { RTT: 34.8, PacketLossRate: 0.12, SendBitrate: 48, RecvBitrate: 64, connectionState: "CONNECTED" },
  { jitter: 4.2 }
);
assert(liveAgoraStats.rttMs === 35, "Live RTT rounded correctly to 35ms");
assert(liveAgoraStats.jitterMs === 4, "Live Jitter rounded correctly to 4ms");
assert(liveAgoraStats.packetLossPercent === 0.1, "Live Packet Loss formatted to 0.1%");
assert(liveAgoraStats.uplinkBitrateKbps === 48, "Uplink Bitrate 48 kbps");
assert(liveAgoraStats.downlinkBitrateKbps === 64, "Downlink Bitrate 64 kbps");

// SECTION 4: 100-EVENT FIFO RING BUFFER & CORRELATION ISOLATION
console.log("\n--- 4. TelemetryStore Ring Buffer & Concurrent Trace Isolation ---");
const store = new TelemetryStore(100);

// Stress test: 1000 events
for (let i = 0; i < 1000; i++) {
  store.recordEvent({
    id: "evt_" + i,
    type: "TEST_EVENT",
    timestamp: performance.now(),
    wallClockTime: Date.now(),
    metadata: { seq: i }
  });
}
assert(store.ringBuffer.length === 100, "Ring buffer never exceeds 100 events");
assert(store.ringBuffer[0].metadata.seq === 900, "Oldest event in buffer is seq 900");
assert(store.ringBuffer[99].metadata.seq === 999, "Newest event in buffer is seq 999");

// Concurrent Tool Tracing
const bus = new TelemetryBus();
const activeStore = new TelemetryStore(100);
bus.on("*", (e) => activeStore.recordEvent(e));

const trace1 = "tool_quote_101";
const trace2 = "tool_compare_202";

bus.emit("TOOL_INTENT_RECEIVED", { traceId: trace1, metadata: { tool: "generate_insurance_quote" } });
bus.emit("TOOL_INTENT_RECEIVED", { traceId: trace2, metadata: { tool: "compare_ev_models" } });

bus.emit("SCHEMA_VALIDATION_COMPLETED", { traceId: trace1 });
bus.emit("SERVER_REQUEST_SENT", { traceId: trace1 });

bus.emit("SCHEMA_VALIDATION_COMPLETED", { traceId: trace2 });
bus.emit("SERVER_REQUEST_SENT", { traceId: trace2 });
bus.emit("SERVER_EXECUTION_STARTED", { traceId: trace2 });
bus.emit("SERVER_EXECUTION_COMPLETED", { traceId: trace2 });

// Microtask flush
await new Promise(resolve => setTimeout(resolve, 50));

const t1 = activeStore.activeToolTraces.get(trace1);
const t2 = activeStore.activeToolTraces.get(trace2);

assert(t1.state === TRACE_STATES.TOOL.DISPATCHED, "Trace 1 isolated at DISPATCHED state");
assert(t2.state === TRACE_STATES.TOOL.COMPLETED, "Trace 2 isolated at COMPLETED state");
assert(t1.tool === "generate_insurance_quote", "Trace 1 tool preserved");
assert(t2.tool === "compare_ev_models", "Trace 2 tool preserved");

// SECTION 5: METRIC PROVENANCE DEFINITIONS AUDIT
console.log("\n--- 5. Metric Provenance Layer Scientific Audit ---");
assert(METRIC_PROVENANCE.rtt !== undefined, "Provenance exists for RTT");
assert(METRIC_PROVENANCE.rtt.boundary.includes("roundtrip"), "RTT boundary describes WebRTC edge roundtrip");
assert(METRIC_PROVENANCE.playbackStop.boundary.includes("remoteTrack.stop()"), "Playback stop boundary is exact");
assert(METRIC_PROVENANCE.cancelAck.source.includes("/session/interrupt"), "Cancel ACK source is exact");
assert(METRIC_PROVENANCE.postRenderFrame.name === "Stage -> Next Frame", "Post-render frame avoids misleading GPU claims");

// SECTION 6: DUAL TIMESTAMP VERIFICATION
console.log("\n--- 6. Dual Timestamp System Integrity ---");
const sampleEvent = bus.emit("SAMPLE_TEST_EVENT", { test: true });
assert(typeof sampleEvent.timestamp === "number" && sampleEvent.timestamp > 0, "Event includes high-res performance.now() timestamp");
assert(typeof sampleEvent.wallClockTime === "number" && sampleEvent.wallClockTime > 1700000000000, "Event includes UTC Date.now() wall clock");

console.log(`\n═══════════════════════════════════════════════════════════════════════`);
console.log(`🎯 VERIFICATION COMPLETE: ${passed} PASSED, ${failed} FAILED`);
console.log(`═══════════════════════════════════════════════════════════════════════`);

if (failed > 0) process.exit(1);
