/**
 * VidRush Studio - Rush In-Editor Copilot Agent
 * Powered directly by Google Gemini AI & ProjectStore Actions
 * 
 * Takes natural language editor instructions, sends context to Gemini,
 * and translates them into strictly validated ProjectAction payloads.
 */

const AIRushAgent = (() => {
  function isGeminiVerifiedAsset(asset) {
    const review = asset?.visualVerification;
    const sourcePolicy = typeof ProjectStore !== 'undefined' ? ProjectStore.getManifest()?.metadata?.sourcePolicy : null;
    const rightsAccepted = sourcePolicy?.rightsMode === 'allow-unknown' || asset?.rights?.approvedForUse === true;
    return review?.previewAnalyzed === true
      && review?.answer === 'yes'
      && review?.eligible === true
      && review?.verdict === 'strong-match'
      && rightsAccepted;
  }

  /**
   * Parse user instruction and produce a structured ProjectAction
   */
  async function parseCommand(userMessage, manifest, currentSceneIndex = 0) {
    const cleanMsg = String(userMessage || '').trim();
    const scenes = manifest.scenes || [];
    const activeScene = scenes[currentSceneIndex] || scenes[0];
    const geminiKey = typeof AIAssistant !== 'undefined' ? AIAssistant.getGeminiKey() : '';

    // 1. Try Backend Gemini Copilot Gateway
    if (typeof fetch !== 'undefined') {
      try {
        const origin = (typeof window !== 'undefined' && window.location && window.location.origin) ? window.location.origin : 'http://127.0.0.1:8080';
        const res = await fetch(`${origin}/api/gemini/copilot`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            command: cleanMsg,
            manifest,
            activeSceneIndex: currentSceneIndex,
            apiKey: geminiKey
          })
        });

        if (res.ok) {
          const data = await res.json();
          if (data.replyText) {
            const proposedActions = Array.isArray(data.actions)
              ? data.actions
              : (data.action ? [data.action] : []);
            const resolvedActions = [];
            const rejectedVisualScenes = [];

            for (const proposedAction of proposedActions.slice(0, 100)) {
              if (!proposedAction || proposedAction.type !== 'REPLACE_VISUAL') {
                if (proposedAction) resolvedActions.push(proposedAction);
                continue;
              }

              const query = proposedAction.query || cleanMsg;
              const targetScene = scenes.find((scene) => scene.id === proposedAction.sceneId) || activeScene;
              if (!targetScene) continue;
              const results = await StockAPI.searchMedia(query, 'all', {
                sceneIndex: targetScene.index - 1,
                sceneText: targetScene.text,
                searchQueries: targetScene.shotDirection?.searchQueries,
                visualType: targetScene.shotDirection?.visualType,
                visualIntent: targetScene.shotDirection?.visualIntent,
                candidateAcceptanceTest: targetScene.shotDirection?.candidateAcceptanceTest
              });
              const asset = StockAPI.selectBestMatch(results, query);
              if (!isGeminiVerifiedAsset(asset)) {
                rejectedVisualScenes.push(targetScene.index);
                continue;
              }
              resolvedActions.push({ ...proposedAction, asset });
            }

            const parsedAction = resolvedActions.length > 1
              ? { type: 'BATCH_ACTION', actions: resolvedActions }
              : (resolvedActions[0] || null);
            const rejectionNote = rejectedVisualScenes.length > 0
              ? ` Gemini rejected every candidate for scene${rejectedVisualScenes.length > 1 ? 's' : ''} ${rejectedVisualScenes.join(', ')}, so those visuals were left unchanged.`
              : '';

            return {
              replyText: `${data.replyText}${rejectionNote}`.trim(),
              description: data.description || 'Rush Agent edit',
              action: parsedAction,
              actions: resolvedActions,
              baseRevision: Number(data.baseRevision || manifest.metadata?.revision || 1),
              requiresConfirmation: resolvedActions.length > 0
            };
          }
        }
      } catch (err) {
        console.warn('[AIRushAgent] Backend copilot fallback:', err.message);
      }
    }

    // 2. Client Rule-Based Interpreter Fallback
    const lower = cleanMsg.toLowerCase();
    const sceneNumMatch = lower.match(/(?:scene)\s*#?(\d+)/i);
    const targetSceneIndex = sceneNumMatch ? (parseInt(sceneNumMatch[1], 10) - 1) : currentSceneIndex;
    const targetScene = scenes[targetSceneIndex] || activeScene;

    // Visual Replacement
    if (lower.includes('change') || lower.includes('replace') || lower.includes('swap') || lower.includes('search visual') || lower.includes('set visual')) {
      if (lower.includes('visual') || lower.includes('media') || lower.includes('photo') || lower.includes('video') || lower.includes('footage') || lower.includes('image') || sceneNumMatch) {
        const queryPart = cleanMsg.replace(/(?:change|replace|swap|search|set)\s+(?:the\s+)?(?:visual|video|photo|media|image)?\s*(?:in|for|of)?\s*(?:scene\s*#?\d+)?\s*(?:to|with|about)?/i, '').trim() || 'cinematic footage';

        const shotPlan = await AIDirector.generateShotDirection(queryPart, targetScene ? targetScene.text : '');
        const topQuery = shotPlan.searchQueries[0] || queryPart;

        const results = await StockAPI.searchMedia(topQuery, 'all', {
          sceneIndex: targetSceneIndex,
          sceneText: targetScene ? targetScene.text : queryPart,
          searchQueries: shotPlan.searchQueries,
          visualType: shotPlan.visualType,
          visualIntent: shotPlan.visualIntent,
          candidateAcceptanceTest: shotPlan.candidateAcceptanceTest
        });

        const selectedAsset = StockAPI.selectBestMatch(results, topQuery);
        if (!isGeminiVerifiedAsset(selectedAsset)) {
          return {
            replyText: `Gemini did not approve any replacement for Scene #${targetSceneIndex + 1}, so I left its current visual unchanged.`,
            description: '',
            action: null
          };
        }

        return {
          replyText: `🎬 **Rush Agent Action:** Updated visual for **Scene #${targetSceneIndex + 1}**.\n\n` +
                     `• **Shot Type:** *${shotPlan.shotType}*\n` +
                     `• **Search Term:** \`${topQuery}\`\n` +
                     `• **Reasoning:** ${shotPlan.directorReasoning}`,
          description: `Replace visual for Scene #${targetSceneIndex + 1}`,
          action: {
            type: 'REPLACE_VISUAL',
            sceneId: targetScene.id,
            asset: selectedAsset,
            shotDirection: shotPlan
          }
        };
      }
    }

    // Rewrite Script
    if (lower.includes('rewrite') || lower.includes('edit script') || lower.includes('change text') || lower.includes('more dramatic') || lower.includes('punchy')) {
      const prompt = `Rewrite this documentary narration sentence for clarity and momentum without changing its factual meaning, named entities, quantities, time references, certainty, or causal claim: "${targetScene ? targetScene.text : cleanMsg}"`;
      const rewritten = await AIAssistant.callLLM(prompt, 'You are a precise documentary script editor. Preserve every factual claim. Do not add suspense, facts, quotations, or unsupported certainty. Output only the rewritten sentence.');

      return {
        replyText: `✍️ **Rush Agent Action:** Rewrote narration for **Scene #${targetSceneIndex + 1}**:\n\n*"${rewritten}"*`,
        description: `Rewrite script for Scene #${targetSceneIndex + 1}`,
        action: {
          type: 'REWRITE_SCENE_TEXT',
          sceneId: targetScene ? targetScene.id : `scene_${targetSceneIndex + 1}`,
          text: rewritten
        }
      };
    }

    // Change Captions
    if (lower.includes('caption') || lower.includes('subtitle')) {
      let style = 'hormozi';
      if (lower.includes('beast') || lower.includes('mrbeast')) style = 'beast';
      else if (lower.includes('neon') || lower.includes('cyberpunk')) style = 'neon';
      else if (lower.includes('minimal') || lower.includes('clean')) style = 'minimal';

      return {
        replyText: `🎨 **Rush Agent Action:** Switched subtitle preset to **${style.toUpperCase()}** kinetic typography.`,
        description: `Set caption style to ${style}`,
        action: {
          type: 'SET_CAPTION_STYLE',
          style
        }
      };
    }

    // General Creative Direction
    const advice = await AIAssistant.callLLM(
      `Creator asks: "${cleanMsg}". Current script: "${(manifest.scenes?.[0]?.text || '').slice(0, 200)}". Give concise YouTube documentary editing direction.`,
      'You are a YouTube Creative Director.'
    );

    return {
      replyText: advice,
      description: '',
      action: null
    };
  }

  const api = {
    parseCommand
  };

  if (typeof window !== 'undefined') window.AIRushAgent = api;
  if (typeof globalThis !== 'undefined') globalThis.AIRushAgent = api;
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
