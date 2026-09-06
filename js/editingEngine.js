/**
 * ScriptFlow deterministic editing engine.
 * Browser controls and Gemini proposals both compile through this module.
 */

const EditingEngine = (() => {
  const manifestApi = typeof ProjectManifest !== 'undefined'
    ? ProjectManifest
    : (typeof require !== 'undefined' ? require('./manifest.js') : null);
  const OPERATION_SCHEMA_VERSION = '1.0.0';
  const MAX_OPERATIONS = 500;
  const allowedOperationTypes = new Set([
    'LOAD_PROJECT',
    'REPLACE_VISUAL',
    'SET_SCENE_DURATION',
    'SET_SCENE_MOTION',
    'REWRITE_SCENE_TEXT',
    'ADD_SCENE',
    'REMOVE_SCENE',
    'REORDER_SCENES',
    'MOVE_SCENE',
    'SET_CAPTION_STYLE',
    'SET_THEME',
    'SET_SOURCE_POLICY',
    'SET_ASPECT_RATIO',
    'SET_VOICE_CONFIG',
    'SET_BGM_CONFIG'
  ]);
  const allowedMotions = new Set(['auto', 'static', 'slow-zoom-in', 'pan-left', 'pan-right']);
  const allowedCaptionStyles = new Set(['hormozi', 'beast', 'neon', 'minimal', 'clean']);
  const allowedCaptionPositions = new Set(['top', 'center', 'bottom']);
  const assetFields = new Set([
    'assetId', 'type', 'url', 'thumbnail', 'title', 'source', 'sourceId', 'sourcePageUrl',
    'description', 'photographer', 'creator', 'license', 'licenseUrl', 'rights',
    'visualVerification', 'requiresVisionVerification', 'generatedBy', 'generationPrompt',
    'selectionStatus', 'previewUrls', 'duration', 'query', 'queryRank', 'searchRank',
    'metadataScore', 'semanticScore', 'embeddingScore', 'relevanceScore', 'geminiRank',
    'width', 'height', 'mimeType', 'downloadUrl', 'originalUrl', 'orientation', 'tags',
    'alt', 'verifiedAt', 'createdAt'
  ]);
  const operationFields = {
    LOAD_PROJECT: new Set(['type', 'manifest', 'meta']),
    REPLACE_VISUAL: new Set(['type', 'sceneId', 'asset', 'selectionStatus', 'visualCandidates', 'shotDirection', 'meta']),
    SET_SCENE_DURATION: new Set(['type', 'sceneId', 'durationSec', 'meta']),
    SET_SCENE_MOTION: new Set(['type', 'sceneId', 'motion', 'meta']),
    REWRITE_SCENE_TEXT: new Set(['type', 'sceneId', 'text', 'captionText', 'meta']),
    ADD_SCENE: new Set(['type', 'insertAfterSceneId', 'sceneData', 'text', 'durationSec', 'meta']),
    REMOVE_SCENE: new Set(['type', 'sceneId', 'meta']),
    REORDER_SCENES: new Set(['type', 'orderedSceneIds', 'meta']),
    MOVE_SCENE: new Set(['type', 'sceneId', 'toIndex', 'meta']),
    SET_CAPTION_STYLE: new Set(['type', 'style', 'position', 'fontSize', 'enabled', 'meta']),
    SET_THEME: new Set(['type', 'theme', 'meta']),
    SET_SOURCE_POLICY: new Set(['type', 'sourcePolicy', 'brandProfileId', 'meta']),
    SET_ASPECT_RATIO: new Set(['type', 'aspectRatio', 'meta']),
    SET_VOICE_CONFIG: new Set(['type', 'voice', 'meta']),
    SET_BGM_CONFIG: new Set(['type', 'bgm', 'meta'])
  };

  class EditingEngineError extends Error {
    constructor(message, code = 'INVALID_OPERATION') {
      super(message);
      this.name = 'EditingEngineError';
      this.code = code;
    }
  }

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function plainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function assertOnlyKeys(value, allowed, label) {
    if (!plainObject(value)) throw new EditingEngineError(`${label} must be an object.`);
    const unknown = Object.keys(value).find((key) => !allowed.has(key));
    if (unknown) throw new EditingEngineError(`${label} contains undeclared property: ${unknown}.`, 'UNKNOWN_PROPERTY');
  }

  function text(value, maximum = 4000) {
    return String(value ?? '').trim().slice(0, maximum);
  }

  function numberInRange(value, minimum, maximum, fallback) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(minimum, Math.min(maximum, parsed));
  }

  function stableValue(value) {
    if (Array.isArray(value)) return value.map(stableValue);
    if (!value || typeof value !== 'object') return value;
    return Object.keys(value).sort().reduce((result, key) => {
      result[key] = stableValue(value[key]);
      return result;
    }, {});
  }

  function stableStringify(value) {
    return JSON.stringify(stableValue(value));
  }

  function hashString(value) {
    let hash = 0x811c9dc5;
    const input = String(value || '');
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  function manifestFingerprint(manifest) {
    const snapshot = clone(manifest || {});
    if (snapshot.metadata) delete snapshot.metadata.updatedAt;
    return `manifest-fnv1a-${hashString(stableStringify(snapshot))}`;
  }

  function safeToken(value, fallback) {
    const cleaned = String(value || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80);
    return cleaned || fallback;
  }

  function transactionMetadata(manifest, action, options = {}) {
    const baseRevision = Math.max(1, Number(manifest?.metadata?.revision) || 1);
    const timestamp = text(action?.meta?.timestamp || options.timestamp || manifest?.metadata?.updatedAt || '1970-01-01T00:00:00.000Z', 40);
    const source = text(action?.meta?.source || options.source || 'editor', 40) || 'editor';
    const seed = stableStringify({ baseRevision, source, action });
    const transactionId = safeToken(action?.meta?.transactionId || options.transactionId, `tx_${baseRevision}_${hashString(seed)}`);
    return {
      transactionId,
      timestamp,
      source,
      baseRevision,
      baseFingerprint: manifestFingerprint(manifest),
      operationSchemaVersion: OPERATION_SCHEMA_VERSION
    };
  }

  function findScene(manifest, sceneId) {
    return (manifest.scenes || []).find((scene) => scene.id === sceneId);
  }

  function requireScene(manifest, sceneId) {
    const normalizedId = text(sceneId, 160);
    const scene = findScene(manifest, normalizedId);
    if (!scene) throw new EditingEngineError(`Unknown sceneId: ${normalizedId || '(empty)'}`, 'UNKNOWN_SCENE');
    return { scene, sceneId: normalizedId };
  }

  function stringArray(value, maximumItems, maximumLength) {
    return Array.isArray(value)
      ? value.slice(0, maximumItems).map((item) => text(item, maximumLength)).filter(Boolean)
      : [];
  }

  function sanitizeShotDirection(value) {
    if (!plainObject(value)) return undefined;
    const allowed = new Set(['visualType', 'visualRole', 'coreClaim', 'mustShow', 'mustNotShow', 'visualIntent', 'shotType', 'directorReasoning', 'searchQueries', 'candidateAcceptanceTest', 'aiVisualPrompt', 'needsReplan']);
    assertOnlyKeys(value, allowed, 'shotDirection');
    const shotDirection = {};
    ['visualType', 'visualRole', 'coreClaim', 'visualIntent', 'shotType', 'directorReasoning', 'candidateAcceptanceTest', 'aiVisualPrompt'].forEach((key) => {
      if (value[key] !== undefined) shotDirection[key] = text(value[key], key === 'aiVisualPrompt' ? 4000 : 1200);
    });
    ['mustShow', 'mustNotShow'].forEach((key) => {
      if (value[key] !== undefined) shotDirection[key] = stringArray(value[key], 20, 500);
    });
    if (value.searchQueries !== undefined) shotDirection.searchQueries = stringArray(value.searchQueries, 10, 300);
    if (value.needsReplan !== undefined) shotDirection.needsReplan = value.needsReplan === true;
    return shotDirection;
  }

  function sanitizeAsset(asset, sceneId, transactionId) {
    if (!plainObject(asset)) {
      throw new EditingEngineError(`REPLACE_VISUAL for ${sceneId} requires a resolved asset.`, 'MISSING_ASSET');
    }
    assertOnlyKeys(asset, assetFields, `asset for ${sceneId}`);
    const url = text(asset.url, 5000);
    const type = asset.type === 'video' ? 'video' : asset.type === 'placeholder' ? 'placeholder' : 'photo';
    if (type !== 'placeholder' && !url) {
      throw new EditingEngineError(`REPLACE_VISUAL for ${sceneId} has no asset URL.`, 'MISSING_ASSET_URL');
    }
    return {
      assetId: text(asset.assetId, 180) || `asset_${hashString(`${transactionId}:${sceneId}:${url}`)}`,
      type,
      url,
      thumbnail: text(asset.thumbnail || url, 5000),
      title: text(asset.title || 'Selected Visual', 300),
      source: text(asset.source || 'manual', 100),
      sourceId: text(asset.sourceId, 200),
      sourcePageUrl: text(asset.sourcePageUrl, 5000),
      description: text(asset.description, 1000),
      photographer: text(asset.photographer || asset.creator, 300),
      creator: text(asset.creator || asset.photographer, 300),
      license: text(asset.license, 300),
      licenseUrl: text(asset.licenseUrl, 5000),
      rights: clone(asset.rights || null),
      visualVerification: clone(asset.visualVerification || null),
      requiresVisionVerification: asset.requiresVisionVerification === true,
      generatedBy: text(asset.generatedBy, 100),
      generationPrompt: text(asset.generationPrompt, 3000),
      selectionStatus: text(asset.selectionStatus, 80),
      previewUrls: stringArray(asset.previewUrls, 20, 5000),
      duration: Number.isFinite(Number(asset.duration)) ? numberInRange(asset.duration, 0, 86_400, 0) : undefined,
      query: text(asset.query, 300),
      queryRank: Number.isFinite(Number(asset.queryRank)) ? Math.max(0, Math.round(Number(asset.queryRank))) : undefined,
      metadataScore: Number.isFinite(Number(asset.metadataScore)) ? numberInRange(asset.metadataScore, 0, 1, 0) : undefined,
      semanticScore: Number.isFinite(Number(asset.semanticScore)) ? numberInRange(asset.semanticScore, 0, 1, 0) : undefined,
      embeddingScore: Number.isFinite(Number(asset.embeddingScore)) ? numberInRange(asset.embeddingScore, -1, 1, 0) : undefined,
      relevanceScore: Number.isFinite(Number(asset.relevanceScore)) ? Number(asset.relevanceScore) : undefined,
      geminiRank: Number.isFinite(Number(asset.geminiRank)) ? Math.max(0, Math.round(Number(asset.geminiRank))) : undefined,
      width: Number.isFinite(Number(asset.width)) ? Math.max(0, Math.round(Number(asset.width))) : undefined,
      height: Number.isFinite(Number(asset.height)) ? Math.max(0, Math.round(Number(asset.height))) : undefined,
      mimeType: text(asset.mimeType, 120),
      downloadUrl: text(asset.downloadUrl, 5000),
      originalUrl: text(asset.originalUrl, 5000),
      orientation: text(asset.orientation, 80),
      tags: Array.isArray(asset.tags) ? stringArray(asset.tags, 50, 120) : text(asset.tags, 1000),
      alt: text(asset.alt, 500),
      verifiedAt: text(asset.verifiedAt, 80),
      createdAt: text(asset.createdAt, 80)
    };
  }

  function sanitizeCandidates(value, sceneId, transactionId) {
    if (value === undefined) return undefined;
    if (!Array.isArray(value)) throw new EditingEngineError('visualCandidates must be an array.', 'INVALID_CANDIDATES');
    return value.slice(0, 200).map((asset) => sanitizeAsset(asset, sceneId, transactionId));
  }

  function sanitizeSceneData(value, fallbackText, fallbackDuration, generatedId) {
    const sceneData = plainObject(value) ? value : {};
    const allowed = new Set(['id', 'text', 'captionText', 'durationSec', 'visualType', 'visualRole', 'coreClaim', 'mustShow', 'mustNotShow', 'visualIntent', 'shotType', 'directorReasoning', 'searchQueries', 'candidateAcceptanceTest', 'aiVisualPrompt', 'shotDirection']);
    assertOnlyKeys(sceneData, allowed, 'ADD_SCENE.sceneData');
    const narration = text(sceneData.text || fallbackText, 12000);
    if (!narration) throw new EditingEngineError('ADD_SCENE requires narration text.');
    const nestedShot = sanitizeShotDirection(sceneData.shotDirection) || {};
    const shotDirection = sanitizeShotDirection({
      ...nestedShot,
      ...Object.fromEntries(['visualType', 'visualRole', 'coreClaim', 'mustShow', 'mustNotShow', 'visualIntent', 'shotType', 'directorReasoning', 'searchQueries', 'candidateAcceptanceTest', 'aiVisualPrompt']
        .filter((key) => sceneData[key] !== undefined)
        .map((key) => [key, sceneData[key]]))
    }) || {};
    return {
      id: text(sceneData.id, 160) || generatedId,
      text: narration,
      captionText: text(sceneData.captionText || narration, 12000),
      durationSec: numberInRange(sceneData.durationSec ?? fallbackDuration, 0.5, 120, 4),
      shotDirection
    };
  }

  function normalizeOperation(manifest, rawOperation, context = {}) {
    if (!rawOperation || typeof rawOperation !== 'object') {
      throw new EditingEngineError('Every editing operation must be an object.');
    }
    const type = text(rawOperation.type, 80).toUpperCase();
    if (!allowedOperationTypes.has(type)) {
      throw new EditingEngineError(`Unsupported editing operation: ${type || '(empty)'}`, 'UNSUPPORTED_OPERATION');
    }
    assertOnlyKeys(rawOperation, operationFields[type], type);

    if (type === 'LOAD_PROJECT') {
      if (context.allowLoadProject !== true) throw new EditingEngineError('LOAD_PROJECT is restricted to trusted initialization and server-owned restore paths.', 'LOAD_PROJECT_FORBIDDEN');
      const loadedManifest = clone(rawOperation.manifest);
      const issues = manifestApi?.validate ? manifestApi.validate(loadedManifest) : [];
      if (!loadedManifest || issues.length > 0) throw new EditingEngineError(issues[0]?.message || 'LOAD_PROJECT requires a valid manifest.');
      return { type, manifest: loadedManifest };
    }

    if (type === 'REPLACE_VISUAL') {
      const { sceneId } = requireScene(manifest, rawOperation.sceneId);
      return {
        type,
        sceneId,
        asset: sanitizeAsset(rawOperation.asset, sceneId, context.transactionId),
        selectionStatus: text(rawOperation.selectionStatus, 80),
        visualCandidates: sanitizeCandidates(rawOperation.visualCandidates, sceneId, context.transactionId),
        shotDirection: sanitizeShotDirection(rawOperation.shotDirection)
      };
    }

    if (type === 'SET_SCENE_DURATION') {
      const { sceneId } = requireScene(manifest, rawOperation.sceneId);
      return { type, sceneId, durationSec: numberInRange(rawOperation.durationSec, 0.5, 120, 4) };
    }

    if (type === 'SET_SCENE_MOTION') {
      const { sceneId } = requireScene(manifest, rawOperation.sceneId);
      if (!allowedMotions.has(rawOperation.motion)) throw new EditingEngineError(`Unsupported scene motion: ${rawOperation.motion}`);
      return { type, sceneId, motion: rawOperation.motion };
    }

    if (type === 'REWRITE_SCENE_TEXT') {
      const { sceneId } = requireScene(manifest, rawOperation.sceneId);
      const narration = text(rawOperation.text, 12000);
      if (!narration) throw new EditingEngineError('REWRITE_SCENE_TEXT requires non-empty narration.');
      return { type, sceneId, text: narration, captionText: text(rawOperation.captionText || narration, 12000) };
    }

    if (type === 'ADD_SCENE') {
      const generatedId = `scene_${safeToken(context.transactionId, 'transaction')}_${String(context.operationIndex + 1).padStart(3, '0')}`;
      return {
        type,
        insertAfterSceneId: rawOperation.insertAfterSceneId ? requireScene(manifest, rawOperation.insertAfterSceneId).sceneId : '',
        sceneData: sanitizeSceneData(rawOperation.sceneData, rawOperation.text, rawOperation.durationSec, generatedId)
      };
    }

    if (type === 'REMOVE_SCENE') return { type, sceneId: requireScene(manifest, rawOperation.sceneId).sceneId };

    if (type === 'MOVE_SCENE') {
      const { sceneId } = requireScene(manifest, rawOperation.sceneId);
      return { type, sceneId, toIndex: Math.round(numberInRange(rawOperation.toIndex, 1, Math.max(1, manifest.scenes.length), 1)) };
    }

    if (type === 'REORDER_SCENES') {
      const ids = Array.isArray(rawOperation.orderedSceneIds) ? rawOperation.orderedSceneIds.map((id) => text(id, 160)) : [];
      const currentIds = (manifest.scenes || []).map((scene) => scene.id);
      if (ids.length !== currentIds.length || new Set(ids).size !== currentIds.length || ids.some((id) => !currentIds.includes(id))) {
        throw new EditingEngineError('REORDER_SCENES must contain every current sceneId exactly once.');
      }
      return { type, orderedSceneIds: ids };
    }

    if (type === 'SET_CAPTION_STYLE') {
      const operation = { type };
      if (rawOperation.style !== undefined) {
        if (!allowedCaptionStyles.has(rawOperation.style)) throw new EditingEngineError(`Unsupported caption style: ${rawOperation.style}`);
        operation.style = rawOperation.style === 'clean' ? 'minimal' : rawOperation.style;
      }
      if (rawOperation.position !== undefined) {
        if (!allowedCaptionPositions.has(rawOperation.position)) throw new EditingEngineError(`Unsupported caption position: ${rawOperation.position}`);
        operation.position = rawOperation.position;
      }
      if (rawOperation.fontSize !== undefined) operation.fontSize = Math.round(numberInRange(rawOperation.fontSize, 16, 96, 44));
      if (rawOperation.enabled !== undefined) operation.enabled = rawOperation.enabled === true;
      if (Object.keys(operation).length === 1) throw new EditingEngineError('SET_CAPTION_STYLE requires at least one setting.');
      return operation;
    }

    if (type === 'SET_THEME') {
      const theme = text(rawOperation.theme, 80);
      if (!theme) throw new EditingEngineError('SET_THEME requires a theme.');
      return { type, theme };
    }

    if (type === 'SET_ASPECT_RATIO') return { type, aspectRatio: rawOperation.aspectRatio === '9:16' ? '9:16' : '16:9' };

    if (type === 'SET_SOURCE_POLICY') {
      const policy = rawOperation.sourcePolicy && typeof rawOperation.sourcePolicy === 'object' ? rawOperation.sourcePolicy : {};
      assertOnlyKeys(policy, new Set(['rightsMode', 'tiers', 'blacklist', 'whitelist']), 'SET_SOURCE_POLICY.sourcePolicy');
      return {
        type,
        sourcePolicy: {
          ...(policy.rightsMode !== undefined ? { rightsMode: text(policy.rightsMode, 40) } : {}),
          ...(Array.isArray(policy.tiers) ? { tiers: policy.tiers.slice(0, 20).map((item) => text(item, 80)).filter(Boolean) } : {}),
          ...(Array.isArray(policy.blacklist) ? { blacklist: policy.blacklist.slice(0, 100).map((item) => text(item, 200)).filter(Boolean) } : {}),
          ...(Array.isArray(policy.whitelist) ? { whitelist: policy.whitelist.slice(0, 100).map((item) => text(item, 200)).filter(Boolean) } : {})
        },
        ...(rawOperation.brandProfileId !== undefined ? { brandProfileId: text(rawOperation.brandProfileId, 160) } : {})
      };
    }

    if (type === 'SET_VOICE_CONFIG') {
      const voice = rawOperation.voice && typeof rawOperation.voice === 'object' ? rawOperation.voice : {};
      assertOnlyKeys(voice, new Set(['provider', 'voiceId', 'voiceName', 'modelId', 'stability', 'similarityBoost', 'style', 'useSpeakerBoost']), 'SET_VOICE_CONFIG.voice');
      const normalized = {};
      if (voice.provider !== undefined) normalized.provider = ['elevenlabs', 'windows-sapi'].includes(voice.provider) ? voice.provider : 'windows-sapi';
      if (voice.voiceId !== undefined) normalized.voiceId = text(voice.voiceId, 180);
      if (voice.voiceName !== undefined) normalized.voiceName = text(voice.voiceName, 300);
      if (voice.modelId !== undefined) normalized.modelId = text(voice.modelId, 180);
      if (voice.stability !== undefined) normalized.stability = numberInRange(voice.stability, 0, 1, 0.5);
      if (voice.similarityBoost !== undefined) normalized.similarityBoost = numberInRange(voice.similarityBoost, 0, 1, 0.75);
      if (voice.style !== undefined) normalized.style = numberInRange(voice.style, 0, 1, 0);
      if (voice.useSpeakerBoost !== undefined) normalized.useSpeakerBoost = voice.useSpeakerBoost === true;
      if (Object.keys(normalized).length === 0) throw new EditingEngineError('SET_VOICE_CONFIG requires at least one setting.');
      return { type, voice: normalized };
    }

    if (type === 'SET_BGM_CONFIG') {
      const bgm = rawOperation.bgm && typeof rawOperation.bgm === 'object' ? rawOperation.bgm : {};
      assertOnlyKeys(bgm, new Set(['enabled', 'volume', 'ducking', 'trackId', 'trackName', 'url']), 'SET_BGM_CONFIG.bgm');
      const normalized = {};
      if (bgm.enabled !== undefined) normalized.enabled = bgm.enabled === true;
      if (bgm.volume !== undefined) normalized.volume = numberInRange(bgm.volume, 0, 1, 0.15);
      if (bgm.ducking !== undefined) normalized.ducking = bgm.ducking === true;
      if (bgm.trackId !== undefined) normalized.trackId = text(bgm.trackId, 180);
      if (bgm.trackName !== undefined) normalized.trackName = text(bgm.trackName, 300);
      if (bgm.url !== undefined) normalized.url = text(bgm.url, 5000);
      if (Object.keys(normalized).length === 0) throw new EditingEngineError('SET_BGM_CONFIG requires at least one setting.');
      return { type, bgm: normalized };
    }

    throw new EditingEngineError(`Operation ${type} is not implemented.`);
  }

  function applyNormalizedOperation(manifest, operation, context) {
    if (operation.type === 'LOAD_PROJECT') return manifestApi.recalculateTimings(operation.manifest, { updatedAt: context.timestamp });

    const next = manifest;
    if (operation.type === 'REPLACE_VISUAL') {
      const scene = findScene(next, operation.sceneId);
      const asset = operation.asset;
      scene.visual = {
        ...asset,
        selectionStatus: operation.selectionStatus || asset.selectionStatus || (asset.generatedBy === 'gemini' ? 'GENERATED' : asset.type === 'placeholder' ? 'UNRESOLVED' : 'MANUAL')
      };
      if (Array.isArray(operation.visualCandidates)) scene.visualCandidates = operation.visualCandidates;
      else if (!Array.isArray(scene.visualCandidates)) scene.visualCandidates = [];
      if (scene.visual.url && !scene.visualCandidates.some((candidate) => candidate.url === scene.visual.url)) scene.visualCandidates.unshift(clone(scene.visual));
      next.provenance = next.provenance || {};
      next.provenance[scene.visual.assetId] = {
        ...(next.provenance[scene.visual.assetId] || {}),
        assetId: scene.visual.assetId,
        source: scene.visual.source,
        sourceId: scene.visual.sourceId || '',
        creator: scene.visual.creator || scene.visual.photographer || (scene.visual.generatedBy === 'gemini' ? 'Gemini' : 'Verified Contributor'),
        license: scene.visual.license || (scene.visual.generatedBy === 'gemini' ? 'AI-generated original asset' : 'License not recorded'),
        licenseUrl: scene.visual.licenseUrl || '',
        sourcePageUrl: scene.visual.sourcePageUrl || '',
        rights: clone(scene.visual.rights || null),
        selectionStatus: scene.visual.selectionStatus,
        url: scene.visual.url,
        downloadedAt: context.timestamp,
        usageSceneIds: Array.from(new Set([...(next.provenance[scene.visual.assetId]?.usageSceneIds || []), scene.id]))
      };
      if (operation.shotDirection) scene.shotDirection = { ...(scene.shotDirection || {}), ...operation.shotDirection };
    } else if (operation.type === 'SET_SCENE_DURATION') {
      findScene(next, operation.sceneId).durationSec = operation.durationSec;
    } else if (operation.type === 'SET_SCENE_MOTION') {
      const scene = findScene(next, operation.sceneId);
      scene.editing = { ...(scene.editing || {}), motion: operation.motion };
    } else if (operation.type === 'REWRITE_SCENE_TEXT') {
      const scene = findScene(next, operation.sceneId);
      scene.text = operation.text;
      scene.captionText = operation.captionText;
      scene.shotDirection = { needsReplan: true };
      scene.visualCandidates = [];
      scene.visual = {
        assetId: `unresolved_${hashString(`${context.transactionId}:${scene.id}:rewrite`)}`,
        type: 'placeholder',
        url: '',
        thumbnail: '',
        title: 'Narration changed - Gemini re-planning required',
        source: 'unresolved',
        description: 'The previous visual approval was invalidated because the narration changed.',
        selectionStatus: 'UNRESOLVED',
        requiresVisionVerification: true,
        visualVerification: null
      };
    } else if (operation.type === 'ADD_SCENE') {
      const scene = manifestApi.createScene(operation.sceneData);
      const afterIndex = operation.insertAfterSceneId ? next.scenes.findIndex((item) => item.id === operation.insertAfterSceneId) : -1;
      if (afterIndex >= 0) next.scenes.splice(afterIndex + 1, 0, scene);
      else next.scenes.push(scene);
    } else if (operation.type === 'REMOVE_SCENE') {
      next.scenes = next.scenes.filter((scene) => scene.id !== operation.sceneId);
    } else if (operation.type === 'MOVE_SCENE') {
      const fromIndex = next.scenes.findIndex((scene) => scene.id === operation.sceneId);
      const [scene] = next.scenes.splice(fromIndex, 1);
      next.scenes.splice(Math.max(0, Math.min(next.scenes.length, operation.toIndex - 1)), 0, scene);
    } else if (operation.type === 'REORDER_SCENES') {
      const sceneMap = new Map(next.scenes.map((scene) => [scene.id, scene]));
      next.scenes = operation.orderedSceneIds.map((id) => sceneMap.get(id));
    } else if (operation.type === 'SET_CAPTION_STYLE') {
      next.captions = { ...(next.captions || {}), ...Object.fromEntries(Object.entries(operation).filter(([key]) => key !== 'type')) };
    } else if (operation.type === 'SET_THEME') {
      next.metadata = next.metadata || {};
      next.metadata.theme = operation.theme;
    } else if (operation.type === 'SET_SOURCE_POLICY') {
      next.metadata = next.metadata || {};
      next.metadata.sourcePolicy = { ...(next.metadata.sourcePolicy || {}), ...operation.sourcePolicy };
      if (operation.brandProfileId !== undefined) next.metadata.brandProfileId = operation.brandProfileId;
    } else if (operation.type === 'SET_ASPECT_RATIO') {
      next.metadata.aspectRatio = operation.aspectRatio;
      next.settings = next.settings || {};
      next.settings.width = operation.aspectRatio === '9:16' ? 1080 : 1920;
      next.settings.height = operation.aspectRatio === '9:16' ? 1920 : 1080;
    } else if (operation.type === 'SET_VOICE_CONFIG') {
      next.audio = next.audio || {};
      next.audio.voice = { ...(next.audio.voice || {}), ...operation.voice };
    } else if (operation.type === 'SET_BGM_CONFIG') {
      next.audio = next.audio || {};
      next.audio.backgroundMusic = { ...(next.audio.backgroundMusic || {}), ...operation.bgm };
    }
    return next;
  }

  function prepareTransaction(manifest, action, options = {}) {
    if (!manifest || typeof manifest !== 'object') throw new EditingEngineError('A project manifest is required.', 'INVALID_MANIFEST');
    if (!action || typeof action !== 'object') throw new EditingEngineError('An editing action is required.');
    const manifestIssues = manifestApi?.validate ? manifestApi.validate(manifest) : [];
    if (manifestIssues.length > 0) throw new EditingEngineError(manifestIssues[0].message, 'INVALID_MANIFEST');
    if (action.type === 'BATCH_ACTION') assertOnlyKeys(action, new Set(['type', 'actions', 'meta', 'operationSchemaVersion']), 'BATCH_ACTION');
    const metadata = transactionMetadata(manifest, action, options);
    const expectedRevision = Number(action.meta?.baseRevision ?? options.expectedRevision);
    if (Number.isFinite(expectedRevision) && expectedRevision !== metadata.baseRevision && action.type !== 'LOAD_PROJECT') {
      throw new EditingEngineError(`Stale transaction: expected revision ${expectedRevision}, current revision is ${metadata.baseRevision}.`, 'STALE_TRANSACTION');
    }
    const rawOperations = action.type === 'BATCH_ACTION' ? action.actions : [action];
    if (!Array.isArray(rawOperations) || rawOperations.length === 0) {
      return {
        manifest,
        changed: false,
        operations: [],
        transaction: { type: 'BATCH_ACTION', actions: [], meta: metadata },
        baseRevision: metadata.baseRevision,
        baseFingerprint: metadata.baseFingerprint,
        stagedFingerprint: metadata.baseFingerprint
      };
    }
    if (rawOperations.length > MAX_OPERATIONS) throw new EditingEngineError(`A transaction cannot exceed ${MAX_OPERATIONS} operations.`, 'OPERATION_LIMIT');
    const rewrittenSceneIds = new Set();
    const replacedSceneIds = new Set();
    rawOperations.forEach((operation) => {
      const type = text(operation?.type, 80).toUpperCase();
      const sceneId = text(operation?.sceneId, 160);
      if (type === 'REWRITE_SCENE_TEXT') rewrittenSceneIds.add(sceneId);
      if (type === 'REPLACE_VISUAL') replacedSceneIds.add(sceneId);
    });
    const conflictingSceneId = [...rewrittenSceneIds].find((sceneId) => replacedSceneIds.has(sceneId));
    if (conflictingSceneId) {
      throw new EditingEngineError(`Scene ${conflictingSceneId} cannot reuse or replace media in the same transaction as a narration rewrite. Verify media against the revised narration first.`, 'STALE_MEDIA_VERIFICATION');
    }

    let next = clone(manifest);
    const normalizedOperations = [];
    rawOperations.forEach((rawOperation, operationIndex) => {
      const normalized = normalizeOperation(next, rawOperation, { ...metadata, operationIndex, allowLoadProject: options.allowLoadProject === true });
      next = applyNormalizedOperation(next, normalized, metadata);
      normalizedOperations.push(normalized);
    });

    if (normalizedOperations.length === 1 && normalizedOperations[0].type === 'LOAD_PROJECT') {
      const loaded = next;
      loaded.operationSchemaVersion = OPERATION_SCHEMA_VERSION;
      return {
        manifest: loaded,
        changed: stableStringify(manifest) !== stableStringify(loaded),
        operations: normalizedOperations,
        transaction: { type: 'BATCH_ACTION', actions: normalizedOperations, meta: metadata },
        baseRevision: metadata.baseRevision,
        baseFingerprint: metadata.baseFingerprint,
        stagedFingerprint: manifestFingerprint(loaded)
      };
    }

    const changed = stableStringify(manifest) !== stableStringify(next);
    if (!changed) {
      return {
        manifest,
        changed: false,
        operations: normalizedOperations,
        transaction: { type: 'BATCH_ACTION', actions: normalizedOperations, meta: metadata },
        baseRevision: metadata.baseRevision,
        baseFingerprint: metadata.baseFingerprint,
        stagedFingerprint: metadata.baseFingerprint
      };
    }

    next.metadata = next.metadata || {};
    next.metadata.revision = metadata.baseRevision + 1;
    next.operationSchemaVersion = OPERATION_SCHEMA_VERSION;
    next = manifestApi.recalculateTimings(next, { updatedAt: metadata.timestamp });
    const outputIssues = manifestApi?.validate ? manifestApi.validate(next) : [];
    if (outputIssues.length > 0) throw new EditingEngineError(outputIssues[0].message, 'INVALID_RESULT_MANIFEST');
    const transaction = {
      type: 'BATCH_ACTION',
      actions: normalizedOperations,
      operationSchemaVersion: OPERATION_SCHEMA_VERSION,
      meta: metadata
    };
    return {
      manifest: next,
      changed: true,
      operations: normalizedOperations,
      transaction,
      baseRevision: metadata.baseRevision,
      baseFingerprint: metadata.baseFingerprint,
      stagedFingerprint: manifestFingerprint(next)
    };
  }

  function applyTransaction(manifest, action, options = {}) {
    return prepareTransaction(manifest, action, options).manifest;
  }

  function compileManifestDiff(baseManifest, desiredManifest) {
    const baseIssues = manifestApi.validate(baseManifest);
    const desiredIssues = manifestApi.validate(desiredManifest);
    if (baseIssues.length > 0) throw new EditingEngineError(baseIssues[0].message, 'INVALID_MANIFEST');
    if (desiredIssues.length > 0) throw new EditingEngineError(desiredIssues[0].message, 'INVALID_MANIFEST');
    if (baseManifest.id !== desiredManifest.id) throw new EditingEngineError('Project ids must match when compiling a manifest diff.', 'PROJECT_ID_MISMATCH');
    const actions = [];
    if (baseManifest.metadata?.theme !== desiredManifest.metadata?.theme) actions.push({ type: 'SET_THEME', theme: desiredManifest.metadata.theme });
    if (baseManifest.metadata?.aspectRatio !== desiredManifest.metadata?.aspectRatio) actions.push({ type: 'SET_ASPECT_RATIO', aspectRatio: desiredManifest.metadata.aspectRatio });
    if (stableStringify(baseManifest.metadata?.sourcePolicy || {}) !== stableStringify(desiredManifest.metadata?.sourcePolicy || {})
      || (baseManifest.metadata?.brandProfileId || '') !== (desiredManifest.metadata?.brandProfileId || '')) {
      actions.push({ type: 'SET_SOURCE_POLICY', sourcePolicy: clone(desiredManifest.metadata.sourcePolicy), brandProfileId: desiredManifest.metadata?.brandProfileId || '' });
    }
    if (stableStringify(baseManifest.audio?.voice || {}) !== stableStringify(desiredManifest.audio?.voice || {})) actions.push({ type: 'SET_VOICE_CONFIG', voice: clone(desiredManifest.audio.voice) });
    if (stableStringify(baseManifest.audio?.backgroundMusic || {}) !== stableStringify(desiredManifest.audio?.backgroundMusic || {})) actions.push({ type: 'SET_BGM_CONFIG', bgm: clone(desiredManifest.audio.backgroundMusic) });
    if (stableStringify(baseManifest.captions || {}) !== stableStringify(desiredManifest.captions || {})) {
      actions.push({
        type: 'SET_CAPTION_STYLE',
        style: desiredManifest.captions.style,
        position: desiredManifest.captions.position,
        fontSize: desiredManifest.captions.fontSize,
        enabled: desiredManifest.captions.enabled
      });
    }

    const baseById = new Map((baseManifest.scenes || []).map((scene) => [scene.id, scene]));
    const desiredById = new Map((desiredManifest.scenes || []).map((scene) => [scene.id, scene]));
    (baseManifest.scenes || []).forEach((scene) => {
      if (!desiredById.has(scene.id)) actions.push({ type: 'REMOVE_SCENE', sceneId: scene.id });
    });
    (desiredManifest.scenes || []).forEach((scene) => {
      if (baseById.has(scene.id)) return;
      actions.push({
        type: 'ADD_SCENE',
        sceneData: {
          id: scene.id,
          text: scene.text,
          captionText: scene.captionText,
          durationSec: scene.durationSec,
          shotDirection: clone(scene.shotDirection || {})
        }
      });
      if (scene.visual) {
        actions.push({
          type: 'REPLACE_VISUAL',
          sceneId: scene.id,
          asset: clone(scene.visual),
          selectionStatus: scene.visual.selectionStatus,
          visualCandidates: clone(scene.visualCandidates || []),
          shotDirection: clone(scene.shotDirection || {})
        });
      }
    });
    (desiredManifest.scenes || []).forEach((scene) => {
      const previous = baseById.get(scene.id);
      if (!previous) return;
      const narrationChanged = previous.text !== scene.text || previous.captionText !== scene.captionText;
      if (narrationChanged) actions.push({ type: 'REWRITE_SCENE_TEXT', sceneId: scene.id, text: scene.text, captionText: scene.captionText });
      if (Number(previous.durationSec) !== Number(scene.durationSec)) actions.push({ type: 'SET_SCENE_DURATION', sceneId: scene.id, durationSec: scene.durationSec });
      if ((previous.editing?.motion || 'auto') !== (scene.editing?.motion || 'auto')) actions.push({ type: 'SET_SCENE_MOTION', sceneId: scene.id, motion: scene.editing?.motion || 'auto' });
      const visualChanged = stableStringify(previous.visual || null) !== stableStringify(scene.visual || null)
        || stableStringify(previous.visualCandidates || []) !== stableStringify(scene.visualCandidates || [])
        || stableStringify(previous.shotDirection || {}) !== stableStringify(scene.shotDirection || {});
      if (visualChanged && !narrationChanged && scene.visual) {
        actions.push({
          type: 'REPLACE_VISUAL',
          sceneId: scene.id,
          asset: clone(scene.visual),
          selectionStatus: scene.visual.selectionStatus,
          visualCandidates: clone(scene.visualCandidates || []),
          shotDirection: clone(scene.shotDirection || {})
        });
      }
    });
    const desiredOrder = (desiredManifest.scenes || []).map((scene) => scene.id);
    const resultingIds = desiredOrder.filter((id) => desiredById.has(id));
    if (resultingIds.length > 1) actions.push({ type: 'REORDER_SCENES', orderedSceneIds: resultingIds });
    return { type: 'BATCH_ACTION', actions };
  }

  const api = {
    OPERATION_SCHEMA_VERSION,
    MAX_OPERATIONS,
    EditingEngineError,
    allowedOperationTypes: Array.from(allowedOperationTypes),
    applyTransaction,
    compileManifestDiff,
    manifestFingerprint,
    normalizeOperation,
    prepareTransaction,
    stableStringify
  };

  if (typeof window !== 'undefined') window.EditingEngine = api;
  if (typeof globalThis !== 'undefined') globalThis.EditingEngine = api;
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
