import AgoraRTC from 'agora-rtc-sdk-ng';
import AgoraRTM from 'agora-rtm';
import {
  AgoraVoiceAI,
  AgoraVoiceAIEvents,
  TranscriptHelperMode,
} from 'agora-agent-client-toolkit';

AgoraRTC.setParameter('ENABLE_AUDIO_PTS_METADATA', true);

const postJson = async (url, payload, options = {}) => {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    cache: 'no-store',
    keepalive: Boolean(options.keepalive),
    signal: options.signal,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
};

const getJson = async (url) => {
  const response = await fetch(url, { cache: 'no-store' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
};

const timestampMs = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return Date.now();
  return numeric > 1e12 ? numeric : numeric * 1000;
};

const agentMode = (value) => {
  const mode = String(value || '').toLowerCase();
  if (mode === 'speaking') return 'speaking';
  if (mode === 'thinking') return 'thinking';
  if (mode === 'listening' || mode === 'idle' || mode === 'silent') return 'listening';
  return 'idle';
};

const normalizeAgentError = (error, fallback) => {
  const raw = String(error?.message || error || '');
  if (/messages with role ['"]?tool|preceding message with ['"]?tool_calls/i.test(raw)) {
    return {
      code: 'TOOL_HISTORY',
      message: 'EasyEV’s decision-tool session became inconsistent. End and rejoin the consultation to reset it; your browser is still connected safely.',
      recoverable: true,
    };
  }
  return { code: 'AGENT_ERROR', message: raw || fallback, recoverable: true };
};

class AgoraAdapter {
  constructor() {
    this.handlers = new Set();
    this.generation = 0;
    this.rtc = null;
    this.rtm = null;
    this.ai = null;
    this.micTrack = null;
    this.remoteAudioTrack = null;
    this.repAudioTrack = null;
    this.sessionKey = '';
    this.channel = '';
    this.uid = '';
    this.repUid = '';
    this.agentUid = '123456';
    this.handoffCode = '';
    this.handoffStatus = 'none';
    this.agentMuted = false;
    this.pendingTranscript = new Map();
    this.transcriptTimer = null;
    this.appId = '';
    this.context = null;
    this.leaving = null;
    this.levelTimer = null;
    this.events = null;
    this.requests = new Set();
    this.reportUrl = '';
    this.toolsMode = 'unavailable';
  }

  onEvent(handler) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  emit(type, payload = {}) {
    const event = { id: crypto.randomUUID(), type, timestamp: Date.now(), payload };
    this.handlers.forEach((handler) => handler(event));
  }

  async join(context) {
    await this.leave({ skipStop: false });
    const generation = ++this.generation;
    this.context = context;
    this.emit('CALL_STATUS', { status: 'connecting', sessionId: context.sessionId });

    try {
      const tokenData = await getJson('/api/session/token');
      if (generation !== this.generation) return;
      this.appId = tokenData.appId;
      this.channel = tokenData.channel;
      this.uid = String(tokenData.uid);

      this.rtc = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
      this.rtc.on('connection-state-change', (current) => {
        if (generation !== this.generation) return;
        this.emit('CONNECTION_STATE', { state: current, sessionId: context.sessionId });
      });
      this.rtc.on('network-quality', (stats) => {
        if (generation !== this.generation) return;
        const uplink = Number(stats?.uplinkNetworkQuality || 0);
        const downlink = Number(stats?.downlinkNetworkQuality || 0);
        this.emit('NETWORK_QUALITY', { uplink, downlink, sessionId: context.sessionId });
      });
      this.rtc.on('user-published', async (user, mediaType) => {
        if (generation !== this.generation || !this.rtc) return;
        try {
          await this.rtc.subscribe(user, mediaType);
          if (mediaType !== 'audio' || !user.audioTrack) return;
          const publisher = String(user.uid);
          if (this.repUid && publisher === String(this.repUid)) {
            this.repAudioTrack = user.audioTrack;
            user.audioTrack.play();
            this.emit('REP_CONNECTED', { connected: true, sessionId: context.sessionId });
            return;
          }
          this.remoteAudioTrack = user.audioTrack;
          // While a specialist holds the call the AI stays subscribed — so it keeps
          // transcribing — but is not played to anyone.
          if (!this.agentMuted) user.audioTrack.play();
          this.emit('AGENT_CONNECTED', { connected: true, sessionId: context.sessionId });
        } catch (error) {
          this.emit('ERROR', { message: `Could not play AI audio: ${error.message || error}`, recoverable: true });
        }
      });
      this.rtc.on('user-left', (user) => {
        if (generation !== this.generation) return;
        if (this.repUid && String(user?.uid) === String(this.repUid)) {
          this.repAudioTrack = null;
          this.emit('REP_CONNECTED', { connected: false, sessionId: context.sessionId });
          return;
        }
        this.emit('AGENT_CONNECTED', { connected: false, sessionId: context.sessionId });
      });
      this.rtc.on('token-privilege-will-expire', () => this.renewToken(generation));

      this.rtm = new AgoraRTM.RTM(this.appId, this.uid);
      await Promise.all([
        this.rtm.login({ token: tokenData.token }).then(() => this.rtm.subscribe(this.channel)),
        this.rtc.join(this.appId, this.channel, tokenData.token, Number(this.uid)),
        AgoraRTC.createMicrophoneAudioTrack({
          encoderConfig: 'speech_standard',
          AEC: true,
          ANS: true,
          AGC: true,
        }).then((track) => { this.micTrack = track; }),
      ]);
      if (generation !== this.generation) return;
      await this.rtc.publish([this.micTrack]);
      this.levelTimer = window.setInterval(() => {
        if (generation !== this.generation || !this.micTrack) return;
        const level = Math.max(0, Math.min(1, Number(this.micTrack.getVolumeLevel?.() || 0)));
        this.emit('LOCAL_AUDIO_LEVEL', { level, sessionId: context.sessionId });
      }, 180);

      try {
        this.ai = await AgoraVoiceAI.init({
          rtcEngine: this.rtc,
          rtmConfig: { rtmEngine: this.rtm },
          renderMode: TranscriptHelperMode.TEXT,
          enableLog: false,
        });
        this.ai.on(AgoraVoiceAIEvents.TRANSCRIPT_UPDATED, (items) => {
          if (generation !== this.generation) return;
          const entries = items
            .filter((item) => typeof item.text === 'string' && item.text.trim())
            .map((item) => ({
              id: `${item.turn_id || ''}-${item.uid || ''}-${item._time || ''}`,
              turnId: String(item.turn_id ?? item.stream_id ?? ''),
              speaker: this.speakerFor(item.uid),
              text: item.text.trim(),
              timestamp: timestampMs(item._time),
              status: String(item.status ?? ''),
              isFinal: item.status !== undefined && item.status !== null && Number(item.status) !== 0,
            }));
          this.emit('TRANSCRIPT_SYNC', { entries, sessionId: context.sessionId });
          this.mirrorTranscript(entries);
        });
        this.ai.on(AgoraVoiceAIEvents.AGENT_STATE_CHANGED, (_agentUid, event) => {
          if (generation !== this.generation) return;
          const mode = agentMode(event?.state);
          this.emit('AGENT_STATE', { mode, sessionId: context.sessionId });
          this.emit('INTERRUPTION_READY', { ready: mode === 'speaking', sessionId: context.sessionId });
        });
        this.ai.on(AgoraVoiceAIEvents.MESSAGE_ERROR, (_agentUid, error) => {
          this.emit('ERROR', normalizeAgentError(error, 'Agora signaling reported an error.'));
        });
        this.ai.on(AgoraVoiceAIEvents.AGENT_ERROR, (_agentUid, error) => {
          this.emit('ERROR', normalizeAgentError(error, 'The AI agent reported an error.'));
        });
        this.ai.subscribeMessage(this.channel);
      } catch (error) {
        this.emit('ERROR', { message: 'Live audio connected, but transcript events could not be initialized.', recoverable: true });
      }

      const session = await postJson('/api/session/start', {
        bootstrapKey: tokenData.bootstrapKey,
        channel: this.channel,
        uid: this.uid,
        category: context.category,
        language: context.language,
        voice: context.voice,
      });
      if (generation !== this.generation) {
        await postJson('/api/session/stop', { sessionKey: session.sessionKey }, { keepalive: true }).catch(() => {});
        return;
      }
      this.sessionKey = session.sessionKey;
      this.reportUrl = session.reportUrl || `/api/sessions/${this.sessionKey}/report`;
      this.toolsMode = session.toolsMode || 'local-bridge';
      this.repUid = String(session.repUid || '');
      this.agentUid = String(session.agentUid || this.agentUid);
      this.handoffCode = String(session.handoffCode || '');
      this.emit('HANDOFF', { status: 'none', handoffCode: this.handoffCode, sessionId: context.sessionId });
      this.openEventStream(session.eventsUrl || `/api/sessions/${this.sessionKey}/events`, generation);
      this.emit('CALL_STATUS', { status: 'live', sessionId: context.sessionId });
      this.emit('TOOLS_STATUS', { mode: this.toolsMode, connected: true, sessionId: context.sessionId });
      this.emit('AGENT_STATE', { mode: 'listening', sessionId: context.sessionId });
    } catch (error) {
      this.emit('ERROR', { message: error.message || 'Could not start the live consultation.', recoverable: false, sessionId: context.sessionId });
      await this.leave({ skipStop: false });
      throw error;
    }
  }

  openEventStream(url, generation) {
    try { this.events?.close(); } catch {}
    this.events = new EventSource(url);
    this.events.addEventListener('ready', (message) => {
      if (generation !== this.generation) return;
      const payload = JSON.parse(message.data || '{}');
      this.emit('PASSPORT_SYNC', { passport: payload.passport || null, sessionId: this.context?.sessionId });
      if (payload.handoff) this.applyHandoff(payload.handoff);
    });
    this.events.addEventListener('handoff', (message) => {
      if (generation !== this.generation) return;
      try { this.applyHandoff(JSON.parse(message.data || '{}')); } catch {}
    });
    this.events.addEventListener('tool-event', (message) => {
      if (generation !== this.generation) return;
      try {
        this.emit('TOOL_EVENT', { ...JSON.parse(message.data || '{}'), sessionId: this.context?.sessionId });
      } catch {
        this.emit('ERROR', { message: 'A decision-tool update could not be read.', recoverable: true });
      }
    });
    this.events.onerror = () => {
      if (generation === this.generation && this.sessionKey) {
        this.emit('TOOLS_STATUS', { mode: this.toolsMode, connected: false, reconnecting: true, sessionId: this.context?.sessionId });
      }
    };
    this.events.onopen = () => {
      if (generation === this.generation) this.emit('TOOLS_STATUS', { mode: this.toolsMode, connected: true, sessionId: this.context?.sessionId });
    };
  }

  speakerFor(uid) {
    const id = String(uid ?? '');
    if (this.repUid && id === String(this.repUid)) return 'rep';
    if (id === '0' || id === this.uid) return 'you';
    return 'ai';
  }

  // Agora delivers transcripts only to participants in the channel, so the buyer's
  // browser is the one that mirrors them to the server for the specialist console.
  // Batched, because TRANSCRIPT_UPDATED fires on every partial.
  mirrorTranscript(entries) {
    if (!this.sessionKey) return;
    for (const entry of entries) {
      if (!entry.id || !entry.text) continue;
      this.pendingTranscript.set(entry.id, {
        id: entry.id,
        speaker: entry.speaker === 'you' ? 'buyer' : entry.speaker,
        text: entry.text,
        timestamp: entry.timestamp,
        final: entry.status !== 'inprogress' && entry.status !== '0',
      });
    }
    if (this.transcriptTimer) return;
    this.transcriptTimer = window.setTimeout(() => {
      this.transcriptTimer = null;
      const batch = [...this.pendingTranscript.values()];
      this.pendingTranscript.clear();
      if (!batch.length || !this.sessionKey) return;
      postJson(`/api/sessions/${this.sessionKey}/transcript`, { entries: batch }).catch(() => {});
    }, 700);
  }

  setAgentMuted(muted) {
    this.agentMuted = Boolean(muted);
    const track = this.remoteAudioTrack;
    if (!track) return;
    try {
      if (this.agentMuted) track.stop();
      else track.play();
    } catch {}
  }

  applyHandoff(handoff) {
    const status = handoff?.status || 'none';
    const changed = status !== this.handoffStatus;
    this.handoffStatus = status;
    this.setAgentMuted(status === 'rep-joined');
    if (changed) this.emit('HANDOFF', { ...handoff, sessionId: this.context?.sessionId });
  }

  async requestHuman(reason = 'explicit-request', summary = '') {
    if (!this.sessionKey) throw new Error('The live AI session is not ready.');
    const data = await postJson(`/api/sessions/${this.sessionKey}/escalate`, { reason, summary });
    if (data.handoff) this.applyHandoff(data.handoff);
    return data;
  }

  getHandoffCode() {
    return this.handoffCode;
  }

  async scopedPost(action, payload, options = {}) {
    if (!this.sessionKey) throw new Error('The live AI session is not ready.');
    const controller = new AbortController();
    this.requests.add(controller);
    try {
      return await postJson(`/api/sessions/${this.sessionKey}/${action}`, payload, { ...options, signal: controller.signal });
    } finally {
      this.requests.delete(controller);
    }
  }

  async setContext(payload) {
    return this.scopedPost('context', payload);
  }

  async runTool(tool, args = {}) {
    return this.scopedPost('tool', { tool, args });
  }

  async uploadSnapshot(image) {
    return this.scopedPost('snapshot', { consent: true, image });
  }

  getReportUrl() {
    return this.reportUrl;
  }

  async cancelTools() {
    if (!this.sessionKey) return;
    for (const controller of this.requests) controller.abort();
    this.requests.clear();
    await postJson(`/api/sessions/${this.sessionKey}/cancel`, {}, { keepalive: true }).catch(() => {});
  }

  async renewToken(generation) {
    if (generation !== this.generation || !this.rtc || !this.rtm) return;
    try {
      const data = await getJson(`/api/session/token?channel=${encodeURIComponent(this.channel)}&uid=${encodeURIComponent(this.uid)}`);
      await Promise.all([this.rtc.renewToken(data.token), this.rtm.renewToken(data.token)]);
    } catch (error) {
      this.emit('ERROR', { message: 'The live session token could not be renewed.', recoverable: true });
    }
  }

  async setMuted(muted) {
    if (!this.micTrack) throw new Error('Microphone is not ready.');
    await this.micTrack.setEnabled(!muted);
  }

  async sendText(text) {
    if (!this.sessionKey) throw new Error('The live AI session is not ready.');
    await postJson('/api/session/think', { sessionKey: this.sessionKey, text });
  }

  async interrupt() {
    if (!this.sessionKey) throw new Error('The live AI session is not ready.');
    const track = this.remoteAudioTrack;
    try { track?.stop(); } catch {}
    this.emit('AGENT_STATE', { mode: 'interrupted', sessionId: this.context?.sessionId });
    this.emit('INTERRUPTION_READY', { ready: false, sessionId: this.context?.sessionId });
    for (const controller of this.requests) controller.abort();
    this.requests.clear();
    await postJson('/api/session/interrupt', { sessionKey: this.sessionKey });
    window.setTimeout(() => {
      if (track === this.remoteAudioTrack) {
        try { track?.play(); } catch {}
      }
    }, 180);
  }

  async leave(options = {}) {
    if (this.leaving) return this.leaving;
    const sessionKey = this.sessionKey;
    this.sessionKey = '';
    ++this.generation;
    this.leaving = (async () => {
      try { this.events?.close(); } catch {}
      this.events = null;
      for (const controller of this.requests) controller.abort();
      this.requests.clear();
      if (this.levelTimer) {
        window.clearInterval(this.levelTimer);
        this.levelTimer = null;
      }
      if (sessionKey && !options.skipStop) {
        await postJson('/api/session/stop', { sessionKey }, { keepalive: true }).catch(() => {});
      }
      try { this.ai?.unsubscribe(); } catch {}
      try { this.ai?.destroy(); } catch {}
      this.ai = null;
      if (this.transcriptTimer) {
        window.clearTimeout(this.transcriptTimer);
        this.transcriptTimer = null;
      }
      this.pendingTranscript.clear();
      try { this.remoteAudioTrack?.stop(); } catch {}
      this.remoteAudioTrack = null;
      try { this.repAudioTrack?.stop(); } catch {}
      this.repAudioTrack = null;
      this.repUid = '';
      this.handoffCode = '';
      this.handoffStatus = 'none';
      this.agentMuted = false;
      try { this.micTrack?.stop(); } catch {}
      try { this.micTrack?.close(); } catch {}
      this.micTrack = null;
      try { if (this.rtc) await this.rtc.leave(); } catch {}
      this.rtc = null;
      try { if (this.rtm && this.channel) await this.rtm.unsubscribe(this.channel); } catch {}
      try { if (this.rtm) await this.rtm.logout(); } catch {}
      this.rtm = null;
      this.channel = '';
      this.uid = '';
      this.appId = '';
      this.context = null;
      this.reportUrl = '';
      this.toolsMode = 'unavailable';
      this.emit('LOCAL_AUDIO_LEVEL', { level: 0 });
      this.emit('AGENT_CONNECTED', { connected: false });
    })().finally(() => { this.leaving = null; });
    return this.leaving;
  }

  stopWithBeacon() {
    if (!this.sessionKey) return;
    try { this.events?.close(); } catch {}
    this.events = null;
    for (const controller of this.requests) controller.abort();
    this.requests.clear();
    const body = new Blob([JSON.stringify({ sessionKey: this.sessionKey })], { type: 'application/json' });
    navigator.sendBeacon('/api/session/stop', body);
    this.sessionKey = '';
  }
}

class VehicleAgoraAdapter extends AgoraAdapter {
  async joinVehicle(context) {
    await this.leave({ skipStop: false });
    const generation = ++this.generation;
    this.context = context;
    this.emit('CALL_STATUS', { status: 'connecting', vehicleId: context.vehicleId });

    try {
      const tokenData = await getJson(`/api/vehicle-session/token?vehicleId=${encodeURIComponent(context.vehicleId || 'tata-punch-ev')}`);
      if (generation !== this.generation) return;
      this.appId = tokenData.appId;
      this.channel = tokenData.channel;
      this.uid = String(tokenData.uid);

      this.rtc = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
      this.rtc.on('connection-state-change', (current) => {
        if (generation !== this.generation) return;
        this.emit('CONNECTION_STATE', { state: current, vehicleId: context.vehicleId });
      });
      this.rtc.on('network-quality', (stats) => {
        if (generation !== this.generation) return;
        const uplink = Number(stats?.uplinkNetworkQuality || 0);
        const downlink = Number(stats?.downlinkNetworkQuality || 0);
        this.emit('NETWORK_QUALITY', { uplink, downlink, vehicleId: context.vehicleId });
      });
      this.rtc.on('user-published', async (user, mediaType) => {
        if (generation !== this.generation || !this.rtc) return;
        try {
          await this.rtc.subscribe(user, mediaType);
          if (mediaType === 'audio' && user.audioTrack) {
            this.remoteAudioTrack = user.audioTrack;
            user.audioTrack.play();
            this.emit('AGENT_CONNECTED', { connected: true, vehicleId: context.vehicleId });
          }
        } catch (error) {
          this.emit('ERROR', { message: `Could not play AI audio: ${error.message || error}`, recoverable: true });
        }
      });
      this.rtc.on('user-left', () => {
        if (generation === this.generation) this.emit('AGENT_CONNECTED', { connected: false, vehicleId: context.vehicleId });
      });
      this.rtc.on('token-privilege-will-expire', () => this.renewToken(generation));

      this.rtm = new AgoraRTM.RTM(this.appId, this.uid);
      await Promise.all([
        this.rtm.login({ token: tokenData.token }).then(() => this.rtm.subscribe(this.channel)),
        this.rtc.join(this.appId, this.channel, tokenData.token, Number(this.uid)),
        AgoraRTC.createMicrophoneAudioTrack({
          encoderConfig: 'speech_standard',
          AEC: true,
          ANS: true,
          AGC: true,
        }).then((track) => { this.micTrack = track; }),
      ]);
      if (generation !== this.generation) return;
      await this.rtc.publish([this.micTrack]);
      this.levelTimer = window.setInterval(() => {
        if (generation !== this.generation || !this.micTrack) return;
        const level = Math.max(0, Math.min(1, Number(this.micTrack.getVolumeLevel?.() || 0)));
        this.emit('LOCAL_AUDIO_LEVEL', { level, vehicleId: context.vehicleId });
      }, 180);

      try {
        this.ai = await AgoraVoiceAI.init({
          rtcEngine: this.rtc,
          rtmConfig: { rtmEngine: this.rtm },
          renderMode: TranscriptHelperMode.TEXT,
          enableLog: false,
        });
        this.ai.on(AgoraVoiceAIEvents.TRANSCRIPT_UPDATED, (items) => {
          if (generation !== this.generation) return;
          const entries = items
            .filter((item) => typeof item.text === 'string' && item.text.trim())
            .map((item) => ({
              id: `${item.turn_id || ''}-${item.uid || ''}-${item._time || ''}`,
              turnId: String(item.turn_id ?? item.stream_id ?? ''),
              speaker: String(item.uid) === '0' || String(item.uid) === this.uid ? 'you' : 'ai',
              text: item.text.trim(),
              timestamp: timestampMs(item._time),
              status: String(item.status ?? ''),
              isFinal: item.status !== undefined && item.status !== null && Number(item.status) !== 0,
            }));
          this.emit('TRANSCRIPT_SYNC', { entries, vehicleId: context.vehicleId });
        });
        this.ai.on(AgoraVoiceAIEvents.AGENT_STATE_CHANGED, (_agentUid, event) => {
          if (generation !== this.generation) return;
          const mode = agentMode(event?.state);
          this.emit('AGENT_STATE', { mode, vehicleId: context.vehicleId });
          this.emit('INTERRUPTION_READY', { ready: mode === 'speaking', vehicleId: context.vehicleId });
        });
        this.ai.on(AgoraVoiceAIEvents.MESSAGE_ERROR, (_agentUid, error) => {
          this.emit('ERROR', normalizeAgentError(error, 'Signaling error in vehicle consultation.'));
        });
        this.ai.on(AgoraVoiceAIEvents.AGENT_ERROR, (_agentUid, error) => {
          this.emit('ERROR', normalizeAgentError(error, 'The Vehicle AI expert reported an error.'));
        });
        this.ai.subscribeMessage(this.channel);
      } catch {
        this.emit('ERROR', { message: 'Vehicle audio connected.', recoverable: true });
      }

      const session = await postJson('/api/vehicle-session/start', {
        bootstrapKey: tokenData.bootstrapKey,
        channel: this.channel,
        uid: this.uid,
        vehicleId: context.vehicleId,
        language: context.language || 'Hinglish',
        voice: context.voice || 'madhur',
      });
      if (generation !== this.generation) {
        await postJson('/api/session/stop', { sessionKey: session.sessionKey }, { keepalive: true }).catch(() => {});
        return;
      }
      this.sessionKey = session.sessionKey;
      this.emit('CALL_STATUS', { status: 'live', vehicleId: context.vehicleId, vehicle: session.vehicle });
      this.emit('AGENT_STATE', { mode: 'listening', vehicleId: context.vehicleId });
    } catch (error) {
      this.emit('ERROR', { message: error.message || 'Could not connect to Vehicle AI expert.', recoverable: false, vehicleId: context.vehicleId });
      await this.leave({ skipStop: false });
      throw error;
    }
  }
}

class CompareDebateAdapter extends AgoraAdapter {
  async joinDebate(context) {
    await this.leave({ skipStop: false });
    const generation = ++this.generation;
    this.context = context;
    this.emit('CALL_STATUS', { status: 'connecting', vehicleIdA: context.vehicleIdA, vehicleIdB: context.vehicleIdB });

    try {
      const tokenData = await getJson(`/api/debate-session/token?vehicleIdA=${encodeURIComponent(context.vehicleIdA || 'tata-punch-ev')}&vehicleIdB=${encodeURIComponent(context.vehicleIdB || 'tata-nexon-ev')}`);
      if (generation !== this.generation) return;
      this.appId = tokenData.appId;
      this.channel = tokenData.channel;
      this.uid = String(tokenData.uid);

      this.rtc = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
      this.rtc.on('connection-state-change', (current) => {
        if (generation !== this.generation) return;
        this.emit('CONNECTION_STATE', { state: current });
      });
      this.rtc.on('network-quality', (stats) => {
        if (generation !== this.generation) return;
        const uplink = Number(stats?.uplinkNetworkQuality || 0);
        const downlink = Number(stats?.downlinkNetworkQuality || 0);
        this.emit('NETWORK_QUALITY', { uplink, downlink });
      });
      this.rtc.on('user-published', async (user, mediaType) => {
        if (generation !== this.generation || !this.rtc) return;
        try {
          await this.rtc.subscribe(user, mediaType);
          if (mediaType === 'audio' && user.audioTrack) {
            this.remoteAudioTrack = user.audioTrack;
            user.audioTrack.play();
            this.emit('AUDIO_PLAYBACK_STARTED', { timestamp: Date.now() });
            this.emit('AGENT_CONNECTED', { connected: true });
          }
        } catch (error) {
          this.emit('ERROR', { message: `Could not play debate audio: ${error.message || error}`, recoverable: true });
        }
      });
      this.rtc.on('stream-message', (uid, stream) => {
        if (generation !== this.generation) return;
        try {
          const raw = new TextDecoder('utf-8').decode(stream).toLowerCase();
          if (raw.includes('option 2') || raw.includes('option-2')) {
            this.emit('SPEAKER_SWITCH', { speaker: 'option 2' });
          } else if (raw.includes('option 1') || raw.includes('option-1')) {
            this.emit('SPEAKER_SWITCH', { speaker: 'option 1' });
          }
        } catch {}
      });
      this.rtc.on('user-left', () => {
        if (generation === this.generation) this.emit('AGENT_CONNECTED', { connected: false });
      });
      this.rtc.on('token-privilege-will-expire', () => this.renewToken(generation));

      this.rtm = new AgoraRTM.RTM(this.appId, this.uid);
      await Promise.all([
        this.rtm.login({ token: tokenData.token }).then(() => this.rtm.subscribe(this.channel)),
        this.rtc.join(this.appId, this.channel, tokenData.token, Number(this.uid)),
        AgoraRTC.createMicrophoneAudioTrack({
          encoderConfig: 'speech_standard',
          AEC: true,
          ANS: true,
          AGC: true,
        }).then((track) => { this.micTrack = track; }),
      ]);
      if (generation !== this.generation) return;
      if (this.micTrack) {
        await this.rtc.publish([this.micTrack]);
      }
      this.levelTimer = window.setInterval(() => {
        if (generation !== this.generation) return;
        if (this.micTrack) {
          const level = Math.max(0, Math.min(1, Number(this.micTrack.getVolumeLevel?.() || 0)));
          this.emit('LOCAL_AUDIO_LEVEL', { level });
        }
        if (this.remoteAudioTrack) {
          const remoteLevel = Math.max(0, Math.min(1, Number(this.remoteAudioTrack.getVolumeLevel?.() || 0)));
          this.emit('REMOTE_AUDIO_LEVEL', { level: remoteLevel });
        }
      }, 50);

      try {
        this.ai = await AgoraVoiceAI.init({
          rtcEngine: this.rtc,
          rtmConfig: { rtmEngine: this.rtm },
          renderMode: TranscriptHelperMode.TEXT,
          enableLog: false,
        });
        this.ai.on(AgoraVoiceAIEvents.TRANSCRIPT_UPDATED, (items) => {
          if (generation !== this.generation) return;
          const entries = items
            .filter((item) => typeof item.text === 'string' && item.text.trim())
            .map((item) => {
              const text = item.text.trim();
              const isUser = String(item.uid) === '0' || String(item.uid) === this.uid;
              let speaker = isUser ? 'you' : 'ai-debate';
              return {
                id: `${item.turn_id || ''}-${item.uid || ''}-${item._time || ''}`,
                speaker,
                text,
                timestamp: timestampMs(item._time),
                status: String(item.status ?? ''),
              };
            });
          this.emit('TRANSCRIPT_SYNC', { entries });
        });
        this.ai.on(AgoraVoiceAIEvents.AGENT_STATE_CHANGED, (_agentUid, event) => {
          if (generation !== this.generation) return;
          const mode = agentMode(event?.state);
          this.emit('AGENT_STATE', { mode });
          this.emit('INTERRUPTION_READY', { ready: mode === 'speaking' });
        });
        this.ai.on(AgoraVoiceAIEvents.MESSAGE_ERROR, (_agentUid, error) => {
          this.emit('ERROR', normalizeAgentError(error, 'Signaling error in debate.'));
        });
        this.ai.on(AgoraVoiceAIEvents.AGENT_ERROR, (_agentUid, error) => {
          this.emit('ERROR', normalizeAgentError(error, 'Debate arena agent encountered an issue.'));
        });
        this.ai.subscribeMessage(this.channel);
      } catch {
        this.emit('ERROR', { message: 'Debate audio connected.', recoverable: true });
      }

      const session = await postJson('/api/debate-session/start', {
        bootstrapKey: tokenData.bootstrapKey,
        channel: this.channel,
        uid: this.uid,
        vehicleIdA: context.vehicleIdA,
        vehicleIdB: context.vehicleIdB,
        language: context.language || 'Hinglish',
        voice: context.voice || 'madhur',
      });
      if (generation !== this.generation) {
        await postJson('/api/session/stop', { sessionKey: session.sessionKey }, { keepalive: true }).catch(() => {});
        return;
      }
      this.sessionKey = session.sessionKey;
      this.emit('CALL_STATUS', { status: 'live', vehicleA: session.vehicleA, vehicleB: session.vehicleB });
      this.emit('AGENT_STATE', { mode: 'listening' });
    } catch (error) {
      this.emit('ERROR', { message: error.message || 'Could not start EV debate arena.', recoverable: false });
      await this.leave({ skipStop: false });
      throw error;
    }
  }

  async sendUserDebateIntervention(text) {
    if (!this.sessionKey) return;
    await this.sendText(text);
  }
}

/**
 * The specialist console's side of a handover. It joins the buyer's existing
 * channel with the UID the agent was already told to subscribe to, so the agent
 * transcribes the human as well. Transcript and Passport reach this page over
 * SSE rather than RTM — the buyer's browser is the one mirroring them.
 */
class RepAdapter {
  constructor() {
    this.handlers = new Set();
    this.rtc = null;
    this.micTrack = null;
    this.tracks = new Map();
    this.agentUid = '';
    this.joined = false;
    this.levelTimer = null;
  }

  onEvent(handler) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  emit(type, payload = {}) {
    this.handlers.forEach((handler) => handler({ id: crypto.randomUUID(), type, timestamp: Date.now(), payload }));
  }

  async join({ appId, token, channel, uid, agentUid }) {
    if (this.joined) return;
    this.agentUid = String(agentUid || '');
    this.rtc = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
    this.rtc.on('connection-state-change', (state) => this.emit('CONNECTION_STATE', { state }));
    this.rtc.on('user-published', async (user, mediaType) => {
      if (!this.rtc) return;
      try {
        await this.rtc.subscribe(user, mediaType);
        if (mediaType !== 'audio' || !user.audioTrack) return;
        const publisher = String(user.uid);
        this.tracks.set(publisher, user.audioTrack);
        // Never play the AI to the specialist: it is muted for the buyer during a
        // handover, and hearing it here would only cause them to talk over it.
        if (publisher !== this.agentUid) user.audioTrack.play();
        this.emit('PARTICIPANT', { uid: publisher, present: true });
      } catch (error) {
        this.emit('ERROR', { message: `Could not play buyer audio: ${error.message || error}` });
      }
    });
    this.rtc.on('user-left', (user) => {
      this.tracks.delete(String(user?.uid));
      this.emit('PARTICIPANT', { uid: String(user?.uid), present: false });
    });

    await this.rtc.join(appId, channel, token, Number(uid));
    this.micTrack = await AgoraRTC.createMicrophoneAudioTrack({
      encoderConfig: 'speech_standard',
      AEC: true,
      ANS: true,
      AGC: true,
    });
    await this.rtc.publish([this.micTrack]);
    this.joined = true;
    this.levelTimer = window.setInterval(() => {
      if (!this.micTrack) return;
      this.emit('LOCAL_AUDIO_LEVEL', { level: Math.max(0, Math.min(1, Number(this.micTrack.getVolumeLevel?.() || 0))) });
    }, 180);
    this.emit('CALL_STATUS', { status: 'live' });
  }

  async setMuted(muted) {
    if (!this.micTrack) throw new Error('Microphone is not ready.');
    await this.micTrack.setEnabled(!muted);
  }

  async leave() {
    if (this.levelTimer) {
      window.clearInterval(this.levelTimer);
      this.levelTimer = null;
    }
    for (const track of this.tracks.values()) {
      try { track.stop(); } catch {}
    }
    this.tracks.clear();
    try { this.micTrack?.stop(); } catch {}
    try { this.micTrack?.close(); } catch {}
    this.micTrack = null;
    try { if (this.rtc) await this.rtc.leave(); } catch {}
    this.rtc = null;
    this.joined = false;
    this.emit('CALL_STATUS', { status: 'ended' });
  }
}

class DealerAgoraAdapter extends AgoraAdapter {
  constructor() {
    super();
    this.dealerSessionId = '';
    this.audioSynthesizer = null;
  }

  async startDealerSession(context = {}) {
    await this.leave({ skipStop: false });
    const generation = ++this.generation;
    this.context = context;
    this.emit('CALL_STATUS', { status: 'connecting' });

    try {
      const startData = await postJson('/api/dealer-session/start', {
        language: context.language || 'Hinglish',
        voice: context.voice || 'madhur',
        initialValues: context.initialValues || {},
        currentStep: context.currentStep || null,
      });
      if (generation !== this.generation) return;

      this.dealerSessionId = startData.sessionId;
      this.sessionId = startData.sessionId;
      this.emit('CALL_STATUS', { status: 'live', sessionId: this.dealerSessionId });
      this.emit('AGENT_STATE', { mode: 'speaking' });

      if (startData.initialTurn) {
        this.emit('AGENT_TURN', startData.initialTurn);
        this.emit('SPEECH_TEXT', { text: startData.initialTurn.speechText, action: startData.initialTurn.action });
        this.emit('FORM_STATE_SYNC', {
          currentForm: startData.initialTurn.currentForm,
          completionStats: startData.initialTurn.completionStats,
          step: startData.initialTurn.step,
          extractedFields: startData.initialTurn.extractedFields,
        });
      }

      // Try connecting Agora mic level streaming if available
      try {
        const tokenData = await getJson('/api/dealer-session/token').catch(() => null);
        if (tokenData && tokenData.appId && tokenData.token) {
          this.appId = tokenData.appId;
          this.channel = tokenData.channel;
          this.uid = String(tokenData.uid);
          this.rtc = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
          await this.rtc.join(this.appId, this.channel, tokenData.token, Number(this.uid));
          this.micTrack = await AgoraRTC.createMicrophoneAudioTrack({
            encoderConfig: 'speech_standard',
            AEC: true,
            ANS: true,
            AGC: true,
          });
          await this.rtc.publish([this.micTrack]);
          this.levelTimer = window.setInterval(() => {
            if (generation !== this.generation || !this.micTrack) return;
            const level = Math.max(0, Math.min(1, Number(this.micTrack.getVolumeLevel?.() || 0)));
            this.emit('LOCAL_AUDIO_LEVEL', { level });
          }, 100);
        }
      } catch (micErr) {
        console.warn('Dealer WebRTC mic level fallback active:', micErr?.message || micErr);
      }

      return startData;
    } catch (error) {
      this.emit('ERROR', { message: error.message || 'Could not start dealer voice session', recoverable: false });
      throw error;
    }
  }

  async sendUserTurn(text, patch = null) {
    if (!this.dealerSessionId) return null;
    this.emit('AGENT_STATE', { mode: 'thinking' });
    try {
      const turnData = await postJson('/api/dealer-session/process-turn', {
        sessionId: this.dealerSessionId,
        text: String(text || ''),
        patch: patch || null,
      });
      this.emit('AGENT_STATE', { mode: 'speaking' });
      this.emit('AGENT_TURN', turnData);
      this.emit('SPEECH_TEXT', { text: turnData.speechText, action: turnData.action });
      this.emit('FORM_STATE_SYNC', {
        currentForm: turnData.currentForm,
        completionStats: turnData.completionStats,
        step: turnData.step,
        extractedFields: turnData.extractedFields,
        isSubmitted: turnData.isSubmitted,
        registeredDealer: turnData.registeredDealer,
      });
      return turnData;
    } catch (error) {
      this.emit('ERROR', { message: error.message || 'Error processing speech turn', recoverable: true });
      this.emit('AGENT_STATE', { mode: 'listening' });
      throw error;
    }
  }

  async syncManualPatch(patch) {
    if (!this.dealerSessionId || !patch) return null;
    try {
      const res = await postJson('/api/dealer-session/sync-state', {
        sessionId: this.dealerSessionId,
        patch,
      });
      this.emit('FORM_STATE_SYNC', {
        currentForm: res.currentForm,
        completionStats: res.completionStats,
      });
      return res;
    } catch (err) {
      console.warn('Failed to sync manual patch to dealer session:', err);
    }
  }

  async submitRegistration() {
    if (!this.dealerSessionId) return null;
    this.emit('AGENT_STATE', { mode: 'thinking' });
    try {
      const res = await postJson('/api/dealer-session/submit', {
        sessionId: this.dealerSessionId,
      });
      this.emit('AGENT_STATE', { mode: 'speaking' });
      this.emit('AGENT_TURN', res);
      this.emit('SPEECH_TEXT', { text: res.speechText, action: res.action });
      this.emit('FORM_STATE_SYNC', {
        currentForm: res.currentForm,
        completionStats: res.completionStats,
        step: res.step,
        isSubmitted: true,
        registeredDealer: res.registeredDealer,
      });
      return res;
    } catch (error) {
      this.emit('ERROR', { message: error.message || 'Could not submit dealer registration', recoverable: true });
      throw error;
    }
  }

  async leave() {
    if (this.dealerSessionId) {
      postJson('/api/dealer-session/stop', { sessionId: this.dealerSessionId }).catch(() => {});
      this.dealerSessionId = '';
    }
    return super.leave();
  }
}

class TestDriveAgoraAdapter extends AgoraAdapter {
  constructor() {
    super();
    this.tdSessionId = '';
  }

  async startTestDriveSession(context = {}) {
    await this.leave({ skipStop: false });
    const generation = ++this.generation;
    this.context = context;
    this.emit('CALL_STATUS', { status: 'connecting' });

    try {
      const startData = await postJson('/api/test-drive-session/start', {
        vehicleId: context.vehicleId || 'tata-nexon-ev',
        vehicleName: context.vehicleName || 'Tata Nexon.ev',
        language: context.language || 'Hinglish',
        voice: context.voice || 'aarav',
        initialValues: context.initialValues || {},
      });
      if (generation !== this.generation) return;

      this.tdSessionId = startData.sessionId;
      this.emit('CALL_STATUS', { status: 'live', sessionId: this.tdSessionId });
      this.emit('AGENT_STATE', { mode: 'speaking' });

      if (startData.initialTurn) {
        this.emit('AGENT_TURN', startData.initialTurn);
        this.emit('SPEECH_TEXT', { text: startData.initialTurn.spoken });
      }

      // Try connecting Agora mic level streaming if available
      try {
        const tokenData = await getJson('/api/test-drive-session/token').catch(() => null);
        if (tokenData && tokenData.appId && tokenData.token && typeof AgoraRTC !== 'undefined') {
          this.appId = tokenData.appId;
          this.channel = tokenData.channel;
          this.uid = String(tokenData.uid);
          this.rtc = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
          await this.rtc.join(this.appId, this.channel, tokenData.token, Number(this.uid));
          this.micTrack = await AgoraRTC.createMicrophoneAudioTrack({
            encoderConfig: 'speech_standard',
            AEC: true,
            ANS: true,
            AGC: true,
          });
          await this.rtc.publish([this.micTrack]);
          this.levelTimer = window.setInterval(() => {
            if (generation !== this.generation || !this.micTrack) return;
            const level = Math.max(0, Math.min(1, Number(this.micTrack.getVolumeLevel?.() || 0)));
            this.emit('LOCAL_AUDIO_LEVEL', { level });
          }, 100);
        }
      } catch (micErr) {
        console.warn('TestDrive WebRTC mic fallback active:', micErr?.message || micErr);
      }

      return startData;
    } catch (error) {
      this.emit('ERROR', { message: error.message || 'Could not start test drive voice session', recoverable: false });
      throw error;
    }
  }

  async sendUserTurn(text, patch = null) {
    if (!this.tdSessionId) return null;
    this.emit('AGENT_STATE', { mode: 'thinking' });
    try {
      const turnData = await postJson('/api/test-drive-session/process-turn', {
        sessionId: this.tdSessionId,
        text: String(text || ''),
        patch: patch || null,
      });
      this.emit('AGENT_STATE', { mode: 'speaking' });
      this.emit('AGENT_TURN', turnData);
      this.emit('SPEECH_TEXT', { text: turnData.spoken });
      return turnData;
    } catch (error) {
      this.emit('ERROR', { message: error.message || 'Error processing speech turn', recoverable: true });
      this.emit('AGENT_STATE', { mode: 'listening' });
      throw error;
    }
  }

  async completeBooking() {
    if (!this.tdSessionId) return null;
    this.emit('AGENT_STATE', { mode: 'thinking' });
    try {
      const res = await postJson('/api/test-drive-session/submit', {
        sessionId: this.tdSessionId,
      });
      this.emit('AGENT_STATE', { mode: 'speaking' });
      this.emit('AGENT_TURN', res);
      this.emit('SPEECH_TEXT', { text: res.spoken });
      return res;
    } catch (error) {
      this.emit('ERROR', { message: error.message || 'Could not complete test drive booking', recoverable: true });
      throw error;
    }
  }

  async leave() {
    if (this.tdSessionId) {
      postJson('/api/test-drive-session/stop', { sessionId: this.tdSessionId }).catch(() => {});
      this.tdSessionId = '';
    }
    return super.leave();
  }
}

export const createAgoraAdapter = () => new AgoraAdapter();
export const createVehicleAgoraAdapter = () => new VehicleAgoraAdapter();
export const createRepAdapter = () => new RepAdapter();
export const createCompareDebateAdapter = () => new CompareDebateAdapter();
export const createDealerAgoraAdapter = () => new DealerAgoraAdapter();
export const createTestDriveAgoraAdapter = () => new TestDriveAgoraAdapter();
