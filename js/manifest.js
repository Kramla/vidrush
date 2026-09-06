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
  const OPERATION_SCHEMA_VERSION = '1.0.0';
  const TOP_LEVEL_FIELDS = new Set(['schemaVersion', 'operationSchemaVersion', 'id', 'metadata', 'settings', 'audio', 'captions', 'scenes', 'provenance']);
  const METADATA_FIELDS = new Set(['title', 'description', 'format', 'aspectRatio', 'theme', 'sourcePolicy', 'brandProfileId', 'decomposition', 'createdAt', 'updatedAt', 'revision']);
  const SETTINGS_FIELDS = new Set(['fps', 'width', 'height', 'wpmTarget']);
  const AUDIO_FIELDS = new Set(['voice', 'backgroundMusic']);
  const VOICE_FIELDS = new Set(['provider', 'voiceId', 'voiceName', 'modelId', 'stability', 'similarityBoost', 'style', 'useSpeakerBoost']);
  const BGM_FIELDS = new Set(['enabled', 'trackId', 'trackName', 'volume', 'ducking', 'url']);
  const CAPTION_FIELDS = new Set(['enabled', 'style', 'position', 'fontSize', 'highlightActiveWord']);
  const SOURCE_POLICY_FIELDS = new Set(['rightsMode', 'tiers', 'blacklist', 'whitelist']);
  const SCENE_FIELDS = new Set(['id', 'index', 'text', 'captionText', 'durationSec', 'startSec', 'endSec', 'shotDirection', 'visual', 'visualCandidates', 'wordTimings', 'editing']);
  const SHOT_FIELDS = new Set(['visualType', 'visualRole', 'coreClaim', 'mustShow', 'mustNotShow', 'visualIntent', 'shotType', 'directorReasoning', 'searchQueries', 'candidateAcceptanceTest', 'aiVisualPrompt', 'needsReplan']);
  const EDITING_FIELDS = new Set(['motion', 'sourceStartSec']);
  const WORD_TIMING_FIELDS = new Set(['word', 'startSec', 'endSec']);
  const ASSET_FIELDS = new Set([
    'assetId', 'type', 'url', 'thumbnail', 'title', 'source', 'sourceId', 'sourcePageUrl',
    'description', 'photographer', 'creator', 'license', 'licenseUrl', 'rights',
    'visualVerification', 'requiresVisionVerification', 'generatedBy', 'generationPrompt',
    'selectionStatus', 'previewUrls', 'duration', 'query', 'queryRank', 'searchRank',
    'metadataScore', 'semanticScore', 'embeddingScore', 'relevanceScore', 'geminiRank',
    'width', 'height', 'mimeType', 'downloadUrl', 'originalUrl', 'orientation', 'tags',
    'alt', 'verifiedAt', 'createdAt'
  ]);

  function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function normalizedSourcePolicy(value) {
    if (!isPlainObject(value)) {
      return { rightsMode: 'known-rights', tiers: ['stock', 'open-archive'], blacklist: [], whitelist: [] };
    }
    return {
      rightsMode: value.rightsMode === 'allow-unknown' ? 'allow-unknown' : 'known-rights',
      tiers: Array.isArray(value.tiers) ? value.tiers.slice(0, 20) : ['stock', 'open-archive'],
      blacklist: Array.isArray(value.blacklist) ? value.blacklist.slice(0, 100) : [],
      whitelist: Array.isArray(value.whitelist) ? value.whitelist.slice(0, 100) : []
    };
  }

  /**
   * Create a fresh, fully valid Project Manifest
   */
  function createDefault(options = {}) {
    const id = options.id || `proj_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const now = new Date().toISOString();

    const manifest = {
      schemaVersion: SCHEMA_VERSION,
      operationSchemaVersion: OPERATION_SCHEMA_VERSION,
      id,
      metadata: {
        title: options.title || 'VidRush Documentary Project',
        description: options.description || 'AI-generated long-form video documentary.',
        format: options.format || 'documentary',
        aspectRatio: options.aspectRatio === '9:16' ? '9:16' : '16:9',
        theme: options.theme || 'cinematic-documentary',
        sourcePolicy: normalizedSourcePolicy(options.sourcePolicy),
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
  function recalculateTimings(manifest, options = {}) {
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

    cloned.metadata = cloned.metadata || {};
    cloned.metadata.updatedAt = options.updatedAt || cloned.metadata.updatedAt || new Date().toISOString();
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
    const addIssue = (code, message, path = '') => {
      if (issues.length < 100) issues.push({ code, message, ...(path ? { path } : {}) });
    };
    const rejectUnknown = (value, allowed, path) => {
      if (!isPlainObject(value)) return;
      Object.keys(value).forEach((key) => {
        if (!allowed.has(key)) addIssue('UNKNOWN_FIELD', `Unknown field ${path}.${key}.`, `${path}.${key}`);
      });
    };
    const requireObject = (value, path) => {
      if (isPlainObject(value)) return true;
      addIssue('INVALID_OBJECT', `${path} must be an object.`, path);
      return false;
    };
    const validateStringArray = (value, path, maximum) => {
      if (!Array.isArray(value) || value.length > maximum || value.some((item) => typeof item !== 'string')) {
        addIssue('INVALID_ARRAY', `${path} must be an array of at most ${maximum} strings.`, path);
      }
    };
    const validateAsset = (asset, path) => {
      if (!requireObject(asset, path)) return;
      rejectUnknown(asset, ASSET_FIELDS, path);
      if (typeof asset.assetId !== 'string' || !asset.assetId.trim()) addIssue('MISSING_ASSET_ID', `${path}.assetId is required.`, `${path}.assetId`);
      if (!['photo', 'video', 'placeholder'].includes(asset.type)) addIssue('INVALID_ASSET_TYPE', `${path}.type must be photo, video, or placeholder.`, `${path}.type`);
      if (asset.type !== 'placeholder' && (typeof asset.url !== 'string' || !asset.url.trim())) addIssue('MISSING_ASSET_URL', `${path}.url is required for resolved media.`, `${path}.url`);
      if (asset.previewUrls !== undefined) validateStringArray(asset.previewUrls, `${path}.previewUrls`, 20);
    };

    if (!isPlainObject(manifest)) {
      return [{ code: 'INVALID_OBJECT', message: 'Project manifest must be an object.' }];
    }
    rejectUnknown(manifest, TOP_LEVEL_FIELDS, 'manifest');
    if (manifest.schemaVersion !== SCHEMA_VERSION) {
      addIssue('INVALID_SCHEMA_VERSION', `schemaVersion must be ${SCHEMA_VERSION}.`, 'manifest.schemaVersion');
    }
    if (manifest.operationSchemaVersion !== OPERATION_SCHEMA_VERSION) {
      addIssue('INVALID_OPERATION_SCHEMA_VERSION', `operationSchemaVersion must be ${OPERATION_SCHEMA_VERSION}.`, 'manifest.operationSchemaVersion');
    }
    if (typeof manifest.id !== 'string' || !/^[A-Za-z0-9._-]{4,160}$/.test(manifest.id)) {
      addIssue('INVALID_PROJECT_ID', 'Project manifest id is invalid.', 'manifest.id');
    }
    if (requireObject(manifest.metadata, 'manifest.metadata')) {
      rejectUnknown(manifest.metadata, METADATA_FIELDS, 'manifest.metadata');
      if (typeof manifest.metadata.title !== 'string' || !manifest.metadata.title.trim()) addIssue('MISSING_TITLE', 'Project manifest must have a metadata.title.', 'manifest.metadata.title');
      if (!Number.isInteger(manifest.metadata.revision) || manifest.metadata.revision < 1) addIssue('INVALID_REVISION', 'metadata.revision must be a positive integer.', 'manifest.metadata.revision');
      if (!['16:9', '9:16'].includes(manifest.metadata.aspectRatio)) addIssue('INVALID_ASPECT_RATIO', 'metadata.aspectRatio must be 16:9 or 9:16.', 'manifest.metadata.aspectRatio');
      if (requireObject(manifest.metadata.sourcePolicy, 'manifest.metadata.sourcePolicy')) {
        rejectUnknown(manifest.metadata.sourcePolicy, SOURCE_POLICY_FIELDS, 'manifest.metadata.sourcePolicy');
        if (!['known-rights', 'allow-unknown'].includes(manifest.metadata.sourcePolicy.rightsMode)) addIssue('INVALID_RIGHTS_MODE', 'sourcePolicy.rightsMode is invalid.', 'manifest.metadata.sourcePolicy.rightsMode');
        ['tiers', 'blacklist', 'whitelist'].forEach((key) => validateStringArray(manifest.metadata.sourcePolicy[key], `manifest.metadata.sourcePolicy.${key}`, key === 'tiers' ? 20 : 100));
      }
    }
    if (requireObject(manifest.settings, 'manifest.settings')) rejectUnknown(manifest.settings, SETTINGS_FIELDS, 'manifest.settings');
    if (requireObject(manifest.audio, 'manifest.audio')) {
      rejectUnknown(manifest.audio, AUDIO_FIELDS, 'manifest.audio');
      if (requireObject(manifest.audio.voice, 'manifest.audio.voice')) rejectUnknown(manifest.audio.voice, VOICE_FIELDS, 'manifest.audio.voice');
      if (requireObject(manifest.audio.backgroundMusic, 'manifest.audio.backgroundMusic')) rejectUnknown(manifest.audio.backgroundMusic, BGM_FIELDS, 'manifest.audio.backgroundMusic');
    }
    if (requireObject(manifest.captions, 'manifest.captions')) rejectUnknown(manifest.captions, CAPTION_FIELDS, 'manifest.captions');
    if (!isPlainObject(manifest.provenance)) addIssue('INVALID_PROVENANCE', 'manifest.provenance must be an object.', 'manifest.provenance');
    if (!Array.isArray(manifest.scenes)) {
      addIssue('INVALID_SCENES', 'Project manifest must contain a scenes array.', 'manifest.scenes');
    } else if (manifest.scenes.length > 5000) {
      addIssue('SCENE_LIMIT', 'Project manifest cannot exceed 5000 scenes.', 'manifest.scenes');
    } else {
      manifest.scenes.forEach((scene, idx) => {
        const scenePath = `manifest.scenes[${idx}]`;
        if (!requireObject(scene, scenePath)) return;
        rejectUnknown(scene, SCENE_FIELDS, scenePath);
        if (typeof scene.id !== 'string' || !scene.id.trim()) addIssue('MISSING_SCENE_ID', `Scene at index ${idx} is missing an id.`, `${scenePath}.id`);
        if (typeof scene.text !== 'string' || !scene.text.trim()) addIssue('MISSING_SCENE_TEXT', `Scene at index ${idx} is missing narration text.`, `${scenePath}.text`);
        if (typeof scene.durationSec !== 'number' || !Number.isFinite(scene.durationSec) || scene.durationSec < 0.5 || scene.durationSec > 120) {
          addIssue('INVALID_SCENE_DURATION', `Scene at index ${idx} must have a numeric durationSec from 0.5 to 120.`, `${scenePath}.durationSec`);
        }
        if (requireObject(scene.shotDirection, `${scenePath}.shotDirection`)) {
          rejectUnknown(scene.shotDirection, SHOT_FIELDS, `${scenePath}.shotDirection`);
          ['mustShow', 'mustNotShow', 'searchQueries'].forEach((key) => {
            if (scene.shotDirection[key] !== undefined) validateStringArray(scene.shotDirection[key], `${scenePath}.shotDirection.${key}`, key === 'searchQueries' ? 10 : 20);
          });
        }
        if (scene.editing !== undefined && requireObject(scene.editing, `${scenePath}.editing`)) rejectUnknown(scene.editing, EDITING_FIELDS, `${scenePath}.editing`);
        if (scene.visual !== undefined) validateAsset(scene.visual, `${scenePath}.visual`);
        if (!Array.isArray(scene.visualCandidates)) addIssue('INVALID_VISUAL_CANDIDATES', `${scenePath}.visualCandidates must be an array.`, `${scenePath}.visualCandidates`);
        else scene.visualCandidates.slice(0, 201).forEach((asset, assetIndex) => validateAsset(asset, `${scenePath}.visualCandidates[${assetIndex}]`));
        if (!Array.isArray(scene.wordTimings)) addIssue('INVALID_WORD_TIMINGS', `${scenePath}.wordTimings must be an array.`, `${scenePath}.wordTimings`);
        else scene.wordTimings.forEach((timing, timingIndex) => {
          const timingPath = `${scenePath}.wordTimings[${timingIndex}]`;
          if (requireObject(timing, timingPath)) rejectUnknown(timing, WORD_TIMING_FIELDS, timingPath);
        });
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
    OPERATION_SCHEMA_VERSION,
    clone,
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
