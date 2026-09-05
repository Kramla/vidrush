const VoiceProvider = (() => {
  const storageKey = 'scriptflow_elevenlabs_voice_v1';
  const defaults = {
    apiKey: '',
    voiceId: '',
    modelId: 'eleven_multilingual_v2',
    stability: 0.5,
    similarityBoost: 0.75,
    style: 0,
    useSpeakerBoost: true
  };
  let config = loadConfig();
  const audioCache = new Map();

  function clamp(value, minimum, maximum, fallback) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.min(maximum, Math.max(minimum, numeric)) : fallback;
  }

  function normalizeConfig(value = {}) {
    return {
      apiKey: typeof value.apiKey === 'string' ? value.apiKey.trim().slice(0, 512) : '',
      voiceId: typeof value.voiceId === 'string' ? value.voiceId.trim().slice(0, 160) : '',
      modelId: typeof value.modelId === 'string' && value.modelId.trim() ? value.modelId.trim().slice(0, 120) : defaults.modelId,
      stability: clamp(value.stability, 0, 1, defaults.stability),
      similarityBoost: clamp(value.similarityBoost, 0, 1, defaults.similarityBoost),
      style: clamp(value.style, 0, 1, defaults.style),
      useSpeakerBoost: value.useSpeakerBoost !== false
    };
  }

  function loadConfig() {
    try {
      return normalizeConfig({ ...defaults, ...JSON.parse(localStorage.getItem(storageKey) || '{}') });
    } catch {
      return { ...defaults };
    }
  }

  function clearAudioCache() {
    audioCache.forEach((audioUrl) => URL.revokeObjectURL(audioUrl));
    audioCache.clear();
  }

  function saveConfig() {
    localStorage.setItem(storageKey, JSON.stringify(config));
  }

  function getConfig() {
    return { ...config };
  }

  function setConfig(nextConfig) {
    const previousKey = JSON.stringify(config);
    config = normalizeConfig({ ...config, ...nextConfig });
    if (JSON.stringify(config) !== previousKey) clearAudioCache();
    saveConfig();
  }

  function isReady() {
    return Boolean(config.apiKey && config.voiceId);
  }

  function getRenderConfig() {
    if (!isReady()) return { provider: 'windows-sapi' };
    return {
      provider: 'elevenlabs',
      apiKey: config.apiKey,
      voiceId: config.voiceId,
      modelId: config.modelId,
      voiceSettings: {
        stability: config.stability,
        similarity_boost: config.similarityBoost,
        style: config.style,
        use_speaker_boost: config.useSpeakerBoost
      }
    };
  }

  async function readError(response, fallback) {
    try {
      const body = await response.json();
      return body.error || body.detail?.message || fallback;
    } catch {
      return fallback;
    }
  }

  async function fetchVoices() {
    if (!config.apiKey) throw new Error('Add your ElevenLabs API key in Settings first.');
    const response = await fetch('/api/elevenlabs/voices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: config.apiKey })
    });
    if (!response.ok) throw new Error(await readError(response, 'Unable to load ElevenLabs voices.'));
    const payload = await response.json();
    return Array.isArray(payload.voices) ? payload.voices : [];
  }

  async function getSceneAudio(scene) {
    if (!isReady()) throw new Error('Choose an ElevenLabs voice in the player first.');
    const text = String(scene?.text || '').trim();
    if (!text) throw new Error('This scene has no narration text.');
    const cacheKey = JSON.stringify([scene.id || text, text, config.voiceId, config.modelId, config.stability, config.similarityBoost, config.style, config.useSpeakerBoost]);
    if (audioCache.has(cacheKey)) return audioCache.get(cacheKey);

    const response = await fetch('/api/elevenlabs/speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiKey: config.apiKey,
        voiceId: config.voiceId,
        modelId: config.modelId,
        text,
        voiceSettings: {
          stability: config.stability,
          similarity_boost: config.similarityBoost,
          style: config.style,
          use_speaker_boost: config.useSpeakerBoost
        }
      })
    });
    if (!response.ok) throw new Error(await readError(response, 'Unable to generate ElevenLabs speech.'));
    const audioUrl = URL.createObjectURL(await response.blob());
    audioCache.set(cacheKey, audioUrl);
    return audioUrl;
  }

  return {
    getConfig,
    setConfig,
    isReady,
    getRenderConfig,
    fetchVoices,
    getSceneAudio,
    clearAudioCache
  };
})();
