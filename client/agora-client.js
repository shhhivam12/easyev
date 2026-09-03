import AgoraRTC from 'agora-rtc-sdk-ng';
import AgoraRTM from 'agora-rtm';
import {
  AgoraVoiceAI,
  AgoraVoiceAIEvents,
  TranscriptHelperMode,
} from 'agora-agent-client-toolkit';

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
    this.sessionKey = '';
    this.channel = '';
    this.uid = '';
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
          if (mediaType === 'audio' && user.audioTrack) {
            this.remoteAudioTrack = user.audioTrack;
            user.audioTrack.play();
            this.emit('AGENT_CONNECTED', { connected: true, sessionId: context.sessionId });
          }
        } catch (error) {
          this.emit('ERROR', { message: `Could not play AI audio: ${error.message || error}`, recoverable: true });
        }
      });
      this.rtc.on('user-left', () => {
        if (generation === this.generation) this.emit('AGENT_CONNECTED', { connected: false, sessionId: context.sessionId });
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
              speaker: String(item.uid) === '0' || String(item.uid) === this.uid ? 'you' : 'ai',
              text: item.text.trim(),
              timestamp: timestampMs(item._time),
              status: String(item.status || ''),
            }));
          this.emit('TRANSCRIPT_SYNC', { entries, sessionId: context.sessionId });
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
      try { this.remoteAudioTrack?.stop(); } catch {}
      this.remoteAudioTrack = null;
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

export const createAgoraAdapter = () => new AgoraAdapter();
