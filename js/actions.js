/**
 * VidRush Studio - Action Dispatcher & Reducer
 * 
 * Defines the structured action vocabulary for all project mutations.
 * Pure reducer function that takes (currentManifest, action) -> newManifest.
 * Guarantees that every edit is validated, atomic, and leaves timings synchronized.
 */

const ProjectActions = (() => {
  /**
   * Master Reducer: transforms manifest based on structured action
   */
  function reduce(manifest, action) {
    if (!manifest || !action) return manifest;

    let next = JSON.parse(JSON.stringify(manifest));

    switch (action.type) {
      case 'LOAD_PROJECT': {
        next = ProjectManifest.recalculateTimings(action.manifest);
        break;
      }

      case 'REPLACE_VISUAL': {
        const scene = next.scenes.find((s) => s.id === action.sceneId);
        if (scene && action.asset) {
          const asset = action.asset;
          scene.visual = {
            assetId: asset.assetId || `asset_${Date.now()}`,
            type: asset.type === 'video' ? 'video' : asset.type === 'placeholder' ? 'placeholder' : 'photo',
            url: asset.url,
            thumbnail: asset.thumbnail || asset.url,
            title: asset.title || 'Selected Visual',
            source: asset.source || 'pexels',
            sourceId: asset.sourceId || '',
            sourcePageUrl: asset.sourcePageUrl || '',
            description: asset.description || '',
            photographer: asset.photographer || asset.creator || '',
            license: asset.license || '',
            licenseUrl: asset.licenseUrl || '',
            rights: asset.rights || null,
            visualVerification: asset.visualVerification || null,
            requiresVisionVerification: asset.requiresVisionVerification === true,
            generatedBy: asset.generatedBy || '',
            generationPrompt: asset.generationPrompt || '',
            selectionStatus: action.selectionStatus || asset.selectionStatus || (asset.generatedBy === 'gemini' ? 'GENERATED' : asset.type === 'placeholder' ? 'UNRESOLVED' : 'MANUAL')
          };

          // Maintain candidate list
          if (Array.isArray(action.visualCandidates)) {
            scene.visualCandidates = action.visualCandidates;
          } else if (!scene.visualCandidates) {
            scene.visualCandidates = [];
          }
          if (scene.visual.url && !scene.visualCandidates.some((c) => c.url === asset.url)) {
            scene.visualCandidates.unshift(scene.visual);
          }

          // Register in project provenance
          if (!next.provenance) next.provenance = {};
          const provKey = scene.visual.assetId;
          next.provenance[provKey] = {
            assetId: provKey,
            source: scene.visual.source,
            sourceId: asset.sourceId || '',
            creator: asset.creator || (asset.generatedBy === 'gemini' ? 'Gemini' : 'Verified Contributor'),
            license: asset.license || (asset.generatedBy === 'gemini' ? 'AI-generated original asset' : 'License not recorded'),
            licenseUrl: asset.licenseUrl || '',
            sourcePageUrl: asset.sourcePageUrl || '',
            rights: asset.rights || null,
            selectionStatus: scene.visual.selectionStatus,
            url: scene.visual.url,
            downloadedAt: new Date().toISOString(),
            usageSceneIds: Array.from(new Set([...(next.provenance[provKey]?.usageSceneIds || []), scene.id]))
          };

          if (action.shotDirection) {
            scene.shotDirection = { ...scene.shotDirection, ...action.shotDirection };
          }
        }
        break;
      }

      case 'SET_SCENE_DURATION': {
        const scene = next.scenes.find((s) => s.id === action.sceneId);
        if (scene) {
          scene.durationSec = Math.max(0.5, Math.min(120, Number(action.durationSec)));
        }
        break;
      }

      case 'SET_SCENE_MOTION': {
        const scene = next.scenes.find((s) => s.id === action.sceneId);
        const allowedMotions = new Set(['auto', 'static', 'slow-zoom-in', 'pan-left', 'pan-right']);
        if (scene && allowedMotions.has(action.motion)) {
          scene.editing = {
            ...(scene.editing || {}),
            motion: action.motion
          };
        }
        break;
      }

      case 'REWRITE_SCENE_TEXT': {
        const scene = next.scenes.find((s) => s.id === action.sceneId);
        if (scene) {
          scene.text = String(action.text || '').trim();
          scene.captionText = String(action.captionText || scene.text).trim();
          scene.shotDirection = { needsReplan: true };
          scene.visualCandidates = [];
          scene.visual = {
            assetId: `unresolved_rewrite_${Date.now()}`,
            type: 'placeholder',
            url: '',
            thumbnail: '',
            title: 'Narration changed — Gemini re-planning required',
            source: 'unresolved',
            description: 'The previous visual approval was invalidated because the narration changed.',
            selectionStatus: 'UNRESOLVED',
            requiresVisionVerification: true,
            visualVerification: null
          };
        }
        break;
      }

      case 'ADD_SCENE': {
        const newScene = ProjectManifest.createScene(action.sceneData || {});
        if (action.insertAfterSceneId) {
          const idx = next.scenes.findIndex((s) => s.id === action.insertAfterSceneId);
          if (idx !== -1) {
            next.scenes.splice(idx + 1, 0, newScene);
          } else {
            next.scenes.push(newScene);
          }
        } else {
          next.scenes.push(newScene);
        }
        break;
      }

      case 'REMOVE_SCENE': {
        if (next.scenes.length > 1) {
          next.scenes = next.scenes.filter((s) => s.id !== action.sceneId);
        }
        break;
      }

      case 'REORDER_SCENES': {
        if (Array.isArray(action.orderedSceneIds)) {
          const sceneMap = new Map(next.scenes.map((s) => [s.id, s]));
          const reordered = action.orderedSceneIds.map((id) => sceneMap.get(id)).filter(Boolean);
          if (reordered.length === next.scenes.length) {
            next.scenes = reordered;
          }
        }
        break;
      }

      case 'MOVE_SCENE': {
        const fromIndex = next.scenes.findIndex((scene) => scene.id === action.sceneId);
        if (fromIndex !== -1) {
          const [scene] = next.scenes.splice(fromIndex, 1);
          const toIndex = Math.max(0, Math.min(next.scenes.length, Math.round(Number(action.toIndex) || 1) - 1));
          next.scenes.splice(toIndex, 0, scene);
        }
        break;
      }

      case 'SET_CAPTION_STYLE': {
        next.captions = {
          ...next.captions,
          style: action.style || next.captions.style,
          position: action.position || next.captions.position,
          fontSize: action.fontSize || next.captions.fontSize,
          enabled: action.enabled !== undefined ? action.enabled : next.captions.enabled
        };
        break;
      }

      case 'SET_THEME': {
        next.metadata.theme = action.theme || next.metadata.theme;
        break;
      }

      case 'SET_SOURCE_POLICY': {
        const existingPolicy = typeof next.metadata.sourcePolicy === 'object'
          ? next.metadata.sourcePolicy
          : { rightsMode: 'known-rights', tiers: ['stock', 'open-archive'], blacklist: [], whitelist: [] };
        next.metadata.sourcePolicy = {
          ...existingPolicy,
          ...(action.sourcePolicy || {})
        };
        if (action.brandProfileId !== undefined) next.metadata.brandProfileId = action.brandProfileId;
        break;
      }

      case 'SET_ASPECT_RATIO': {
        const ratio = action.aspectRatio === '9:16' ? '9:16' : '16:9';
        next.metadata.aspectRatio = ratio;
        next.settings.width = ratio === '9:16' ? 1080 : 1920;
        next.settings.height = ratio === '9:16' ? 1920 : 1080;
        break;
      }

      case 'SET_VOICE_CONFIG': {
        next.audio.voice = {
          ...next.audio.voice,
          ...action.voice
        };
        break;
      }

      case 'SET_BGM_CONFIG': {
        next.audio.backgroundMusic = {
          ...next.audio.backgroundMusic,
          ...action.bgm
        };
        break;
      }

      case 'BATCH_ACTION': {
        if (Array.isArray(action.actions)) {
          action.actions.forEach((subAction) => {
            next = reduce(next, subAction);
          });
        }
        break;
      }

      default:
        console.warn(`[ProjectActions] Unknown action type: ${action.type}`);
        return manifest;
    }

    next.metadata.revision = (next.metadata.revision || 1) + 1;
    return ProjectManifest.recalculateTimings(next);
  }

  const api = {
    reduce
  };

  if (typeof window !== 'undefined') window.ProjectActions = api;
  if (typeof globalThis !== 'undefined') globalThis.ProjectActions = api;
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
