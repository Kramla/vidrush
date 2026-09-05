/**
 * VidRush Studio - Canonical Project Manifest Schema & Helpers
 * Version: 2.0.0
 * 
 * The Project Manifest is the single source of truth for the entire application.
 * All subsystems (Player, Timeline, Inspector, AI Agents, FFmpeg Renderer, Exporters)
 * read from and derive their state from this data structure.
 */

const ProjectManifest = (() => {
  const SCHEMA_VERSION = '2.0.0';

  /**
   * Create a fresh, fully valid Project Manifest
   */
  function createDefault(options = {}) {
    const id = options.id || `proj_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const now = new Date().toISOString();

    const manifest = {
      schemaVersion: SCHEMA_VERSION,
      id,
      metadata: {
        title: options.title || 'VidRush Documentary Project',
        description: options.description || 'AI-generated long-form video documentary.',
        format: options.format || 'documentary',
        aspectRatio: options.aspectRatio === '9:16' ? '9:16' : '16:9',
        theme: options.theme || 'cinematic-documentary',
        sourcePolicy: options.sourcePolicy || {
          rightsMode: 'known-rights',
          tiers: ['stock', 'open-archive'],
          blacklist: [],
          whitelist: []
        },
        createdAt: now,
        updatedAt: now,
        revision: 1
      },
      settings: {
        fps: 30,
        width: options.aspectRatio === '9:16' ? 1080 : 1920,
        height: options.aspectRatio === '9:16' ? 1920 : 1080,
        wpmTarget: 145
      },
      audio: {
        voice: {
          provider: options.voiceProvider || 'windows-sapi',
          voiceId: options.voiceId || 'pNInz6obpgDQGcFmaJgB', // Adam
          voiceName: options.voiceName || 'Adam (Documentary)',
          modelId: 'eleven_multilingual_v2',
          stability: 0.5,
          similarityBoost: 0.75
        },
        backgroundMusic: {
          enabled: true,
          trackId: options.bgmTrackId || 'ambient-cinematic',
          trackName: options.bgmTrackName || 'Cinematic Ambient Bed',
          volume: 0.15, // 15% ducked volume during speech
          ducking: true
        }
      },
      captions: {
        enabled: true,
        style: options.captionStyle || 'hormozi', // 'hormozi' | 'beast' | 'neon' | 'minimal'
        position: 'bottom', // 'bottom' | 'center' | 'top'
        fontSize: 44,
        highlightActiveWord: true
      },
      scenes: [],
      provenance: {}
    };

    return manifest;
  }

  /**
   * Recalculates and enforces continuous start/end timing across all scenes.
   * Returns a cloned, re-timed manifest.
   */
  function recalculateTimings(manifest) {
    if (!manifest || !Array.isArray(manifest.scenes)) return manifest;

    const cloned = JSON.parse(JSON.stringify(manifest));
    let currentOffsetSec = 0;

    cloned.scenes = cloned.scenes.map((scene, idx) => {
      const durationSec = Math.max(0.5, Math.min(120, Number(scene.durationSec || scene.duration || 4.0)));
      const startSec = Number(currentOffsetSec.toFixed(3));
      const endSec = Number((currentOffsetSec + durationSec).toFixed(3));
      currentOffsetSec = endSec;

      // Word-level timestamp distribution for kinetic captions
      const text = scene.text || '';
      const words = text.split(/\s+/).filter(Boolean);
      const wordCount = Math.max(1, words.length);
      const wordDuration = durationSec / wordCount;

      const wordTimings = words.map((w, wIdx) => ({
        word: w,
        startSec: Number((startSec + (wIdx * wordDuration)).toFixed(3)),
        endSec: Number((startSec + ((wIdx + 1) * wordDuration)).toFixed(3))
      }));

      return {
        ...scene,
        index: idx + 1,
        durationSec,
        startSec,
        endSec,
        wordTimings
      };
    });

    cloned.metadata.updatedAt = new Date().toISOString();
    return cloned;
  }

  /**
   * Calculates total project duration in seconds
   */
  function getTotalDuration(manifest) {
    if (!manifest || !Array.isArray(manifest.scenes)) return 0;
    return manifest.scenes.reduce((acc, s) => acc + (s.durationSec || 4), 0);
  }

  /**
   * Validates manifest structure and returns list of issues
   */
  function validate(manifest) {
    const issues = [];
    if (!manifest || typeof manifest !== 'object') {
      return [{ code: 'INVALID_OBJECT', message: 'Project manifest must be an object.' }];
    }
    if (!manifest.metadata || !manifest.metadata.title) {
      issues.push({ code: 'MISSING_TITLE', message: 'Project manifest must have a metadata.title.' });
    }
    if (!Array.isArray(manifest.scenes)) {
      issues.push({ code: 'INVALID_SCENES', message: 'Project manifest must contain a scenes array.' });
    } else {
      manifest.scenes.forEach((scene, idx) => {
        if (!scene.id) issues.push({ code: 'MISSING_SCENE_ID', message: `Scene at index ${idx} is missing an id.` });
        if (!scene.text) issues.push({ code: 'MISSING_SCENE_TEXT', message: `Scene at index ${idx} is missing narration text.` });
      });
    }
    return issues;
  }

  /**
   * Create a Scene object
   */
  function createScene(data = {}) {
    const id = data.id || `scene_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const text = data.text || 'New narrative scene beat.';
    const durationSec = Math.max(0.5, Math.min(120, Number(data.durationSec || data.duration || 4.0)));

    return {
      id,
      index: data.index || 1,
      text,
      captionText: data.captionText || text,
      durationSec,
      startSec: 0,
      endSec: durationSec,
      shotDirection: {
        visualType: data.visualType || data.shotDirection?.visualType || 'documentary-footage',
        visualIntent: data.visualIntent || data.shotDirection?.visualIntent || '',
        shotType: data.shotType || data.shotDirection?.shotType || 'Cinematic Medium Establishing Shot',
        directorReasoning: data.directorReasoning || data.shotDirection?.directorReasoning || 'Balanced focal framing maintains viewer focus on narrative beats.',
        searchQueries: data.searchQueries || data.shotDirection?.searchQueries || ['cinematic background'],
        aiVisualPrompt: data.aiVisualPrompt || data.shotDirection?.aiVisualPrompt || 'Cinematic 8k photorealistic shot --ar 16:9',
        needsReplan: Boolean(data.shotDirection?.needsReplan)
      },
      visual: data.visual || data.selectedMedia || {
        assetId: `asset_${Date.now()}`,
        type: 'placeholder',
        url: '',
        thumbnail: '',
        title: 'No media selected',
        source: 'unresolved',
        selectionStatus: 'UNRESOLVED'
      },
      visualCandidates: data.visualCandidates || data.mediaCandidates || [],
      wordTimings: []
    };
  }

  const api = {
    SCHEMA_VERSION,
    createDefault,
    createScene,
    recalculateTimings,
    getTotalDuration,
    validate
  };

  if (typeof window !== 'undefined') window.ProjectManifest = api;
  if (typeof globalThis !== 'undefined') globalThis.ProjectManifest = api;
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
