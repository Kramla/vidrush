/**
 * ScriptFlow Studio - ElevenLabs & Web Speech Narration Engine
 * Supports ElevenLabs Neural Voices via REST API and Web Speech API as fallback.
 */

const TTSEngine = (() => {
  const STORAGE_KEY_ELEVENLABS = 'scriptflow_elevenlabs_key';
  const STORAGE_KEY_VOICE_ID = 'scriptflow_elevenlabs_voice_id';

  // Popular curated ElevenLabs Voice IDs
  const ELEVENLABS_VOICES = [
    { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel (Calm & Natural Storytelling)', category: 'Narrative' },
    { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam (Deep YouTube Documentary)', category: 'Documentary' },
    { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni (Dynamic & Energetic)', category: 'Commercial' },
    { id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh (Warm & Engaging)', category: 'Conversational' },
    { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold (Crisp & Authoritative)', category: 'Educational' },
    { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella (Expressive & Vibrant)', category: 'Vlog' },
    { id: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli (Young & Friendly)', category: 'Social' }
  ];

  let synth = window.speechSynthesis;
  let currentUtterance = null;
  let activeAudioElement = null;
  let isMuted = false;
  let currentVolume = 0.9;
  let currentRate = 1.0;
  let selectedWebVoice = null;
  let selectedElevenVoiceId = 'pNInz6obpgDQGcFmaJgB'; // Default Adam
  let audioCache = new Map(); // Cache audio blobs per scene text

  function getElevenLabsKey() {
    return localStorage.getItem(STORAGE_KEY_ELEVENLABS) || '';
  }

  function setElevenLabsKey(key) {
    localStorage.setItem(STORAGE_KEY_ELEVENLABS, key.trim());
  }

  function getElevenLabsVoiceId() {
    return localStorage.getItem(STORAGE_KEY_VOICE_ID) || selectedElevenVoiceId;
  }

  function setElevenLabsVoiceId(id) {
    selectedElevenVoiceId = id;
    localStorage.setItem(STORAGE_KEY_VOICE_ID, id);
  }

  function hasElevenLabsKey() {
    return !!getElevenLabsKey();
  }

  function getElevenLabsVoices() {
    return ELEVENLABS_VOICES;
  }

  /**
   * Synthesize speech for a scene text.
   * If ElevenLabs API key is present, calls ElevenLabs REST API and plays audio.
   * Otherwise, uses Web Speech API.
   */
  async function speak(text, options = {}) {
    stop();
    if (isMuted || !text) return;

    const apiKey = getElevenLabsKey();
    const voiceId = options.voiceId || getElevenLabsVoiceId();

    // 1. Try ElevenLabs API
    if (apiKey) {
      try {
        const cacheKey = `${voiceId}_${text}_${currentRate}`;
        let audioUrl = audioCache.get(cacheKey);

        if (!audioUrl) {
          const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
            method: 'POST',
            headers: {
              'Accept': 'audio/mpeg',
              'Content-Type': 'application/json',
              'xi-api-key': apiKey
            },
            body: JSON.stringify({
              text: text,
              model_id: 'eleven_multilingual_v2',
              voice_settings: {
                stability: 0.5,
                similarity_boost: 0.75,
                style: 0.0,
                use_speaker_boost: true
              }
            })
          });

          if (!res.ok) {
            throw new Error(`ElevenLabs API error: ${res.statusText}`);
          }

          const blob = await res.blob();
          audioUrl = URL.createObjectURL(blob);
          audioCache.set(cacheKey, audioUrl);
        }

        activeAudioElement = new Audio(audioUrl);
        activeAudioElement.volume = currentVolume;
        activeAudioElement.playbackRate = currentRate;

        if (options.onStart) options.onStart();
        if (options.onEnd) {
          activeAudioElement.onended = options.onEnd;
        }

        await activeAudioElement.play();
        return;
      } catch (err) {
        console.warn('ElevenLabs playback failed, falling back to Web Speech API', err);
      }
    }

    // 2. Web Speech API Fallback
    if (!synth) return;

    currentUtterance = new SpeechSynthesisUtterance(text);
    currentUtterance.rate = currentRate;
    currentUtterance.volume = currentVolume;

    if (selectedWebVoice) {
      currentUtterance.voice = selectedWebVoice;
    }

    if (options.onStart) currentUtterance.onstart = options.onStart;
    if (options.onEnd) currentUtterance.onend = options.onEnd;

    synth.speak(currentUtterance);
  }

  function stop() {
    if (activeAudioElement) {
      activeAudioElement.pause();
      activeAudioElement.currentTime = 0;
      activeAudioElement = null;
    }
    if (synth && synth.speaking) {
      synth.cancel();
    }
  }

  function pause() {
    if (activeAudioElement) activeAudioElement.pause();
    if (synth && synth.speaking) synth.pause();
  }

  function resume() {
    if (activeAudioElement) activeAudioElement.play().catch(() => {});
    if (synth && synth.paused) synth.resume();
  }

  function setRate(rate) {
    currentRate = parseFloat(rate) || 1.0;
    if (activeAudioElement) activeAudioElement.playbackRate = currentRate;
  }

  function setVolume(vol) {
    currentVolume = parseFloat(vol) || 0.9;
    if (activeAudioElement) activeAudioElement.volume = currentVolume;
  }

  function setMuted(muted) {
    isMuted = !!muted;
    if (isMuted) stop();
  }

  function initVoices(callback) {
    if (!synth) return;
    function populate() {
      const voices = synth.getVoices();
      if (callback) callback(voices);
    }
    populate();
    if (synth.onvoiceschanged !== undefined) {
      synth.onvoiceschanged = populate;
    }
  }

  function setVoice(voiceURI) {
    if (!synth) return;
    const voices = synth.getVoices();
    selectedWebVoice = voices.find(v => v.voiceURI === voiceURI) || null;
  }

  return {
    speak,
    stop,
    pause,
    resume,
    setRate,
    setVolume,
    setMuted,
    initVoices,
    setVoice,
    getElevenLabsKey,
    setElevenLabsKey,
    hasElevenLabsKey,
    getElevenLabsVoiceId,
    setElevenLabsVoiceId,
    getElevenLabsVoices
  };
})();
