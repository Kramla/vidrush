/**
 * VidRush Studio - AI Director Engine
 * Gemini-Directed Narration, Visual Contracts, and Verified Media Sourcing
 * 
 * 1. Preflight Evaluation: Direct Gemini topic analysis and hook angle formulation.
 * 2. Gemini Narration Segmentation: Preserves exact words while defining coherent visual units.
 * 3. Gemini Visual Contracts: Defines visible requirements before verified media sourcing.
 */

const AIDirector = (() => {
  function getParser() {
    if (typeof Parser !== 'undefined' && Parser.splitScript) return Parser;
    if (typeof ScriptParser !== 'undefined' && ScriptParser.splitScript) return ScriptParser;
    if (typeof window !== 'undefined' && window.Parser) return window.Parser;
    if (typeof globalThis !== 'undefined' && globalThis.Parser) return globalThis.Parser;

    return {
      splitScript: (text) => {
        return String(text || '')
          .split(/(?<=[.!?])\s+|\n\n+/)
          .map((s) => s.trim())
          .filter((s) => s.length > 5)
          .map((s, idx) => ({
            id: `beat_${idx + 1}`,
            index: idx + 1,
            text: s,
            duration: Math.max(0.5, Math.round((s.split(/\s+/).length / 2.4) * 10) / 10)
          }));
      }
    };
  }

  function getApiOrigin() {
    if (typeof window !== 'undefined' && window.location && window.location.origin) {
      return window.location.origin;
    }
    return 'http://127.0.0.1:8080';
  }

  function estimateNarrationDuration(text) {
    const words = String(text || '').trim().split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.round((words / 2.4) * 10) / 10);
  }

  function estimateVisualUnitCount(text, durationSec) {
    const words = String(text || '').trim().split(/\s+/).filter(Boolean).length;
    if (words > 0) return Math.max(1, Math.round(words / 8));
    return Math.max(1, Math.round((Number(durationSec) || 60) / 4));
  }

  function splitNarrationTransportBatches(scriptText, maximumCharacters = 3600) {
    const text = String(scriptText || '').trim();
    if (!text || text.length <= maximumCharacters) return text ? [text] : [];

    const batches = [];
    let start = 0;
    while (start < text.length) {
      let end = Math.min(text.length, start + maximumCharacters);
      if (end < text.length) {
        const windowText = text.slice(start, end);
        const minimumBoundary = Math.floor(windowText.length * 0.55);
        const boundaryPatterns = [/\n\s*\n/g, /[.!?]["'”’)]*\s+/g, /[;:]\s+/g, /,\s+/g, /\s+/g];
        for (const pattern of boundaryPatterns) {
          let match;
          let lastBoundary = -1;
          while ((match = pattern.exec(windowText)) !== null) lastBoundary = match.index + match[0].length;
          if (lastBoundary >= minimumBoundary) {
            end = start + lastBoundary;
            break;
          }
        }
      }

      const batch = text.slice(start, end).trim();
      if (batch) batches.push(batch);
      start = end;
      while (start < text.length && /\s/.test(text[start])) start += 1;
    }
    return batches;
  }

  /**
   * Preflight Analysis & Parameter Evaluation via Google Gemini
   */
  async function computePreflight(promptOrScript, options = {}) {
    const text = String(promptOrScript || '').trim();
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    const isScript = wordCount > 25;

    // Prefer the traced backend Gemini preflight; use local estimation only when it genuinely fails.
    try {
      const res = await fetch(`${getApiOrigin()}/api/gemini/preflight`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: text,
          format: options.format || 'documentary',
          theme: options.theme || 'cinematic-documentary',
          apiKey: typeof AIAssistant !== 'undefined' ? AIAssistant.getGeminiKey() : ''
        }),
        signal: AbortSignal.timeout(30_000)
      });
      if (res.ok) {
        const data = await res.json();
        if (data.preflight) {
          return {
            title: data.preflight.title || text.slice(0, 40) + '...',
            summary: data.preflight.summary || '',
            hookAngle: data.preflight.hookAngle || '',
            format: options.format || 'documentary',
            theme: data.preflight.theme || options.theme || 'cinematic-documentary',
            aspectRatio: options.aspectRatio === '9:16' ? '9:16' : '16:9',
            targetDurationSec: data.preflight.targetDurationSec || (isScript ? estimateNarrationDuration(text) : 60),
            estimatedScenes: data.preflight.estimatedScenes || estimateVisualUnitCount(isScript ? text : '', data.preflight.targetDurationSec || 60),
            wordCount,
            visualModel: 'Gemini Director + Pixel Verification',
            voice: options.voiceProvider === 'elevenlabs' ? 'ElevenLabs Neural' : 'Windows SAPI / Neural TTS',
            costLabel: data.preflight.costLabel || 'Local orchestration; provider usage may cost credits',
            productionVerdict: data.preflight.productionVerdict || 'pass',
            warnings: Array.isArray(data.preflight.warnings) ? data.preflight.warnings : [],
            sourcingPlan: data.preflight.sourcingPlan || null
          };
        }
      }
    } catch (err) {
      console.warn('[AIDirector] Gemini preflight backend error:', err);
    }

    const targetDurationSec = isScript ? estimateNarrationDuration(text) : 60;
    const estimatedScenes = estimateVisualUnitCount(isScript ? text : '', targetDurationSec);
    const title = isScript ? (text.slice(0, 40) + '...') : text;

    return {
      title: title || 'VidRush Documentary Project',
      format: options.format || 'documentary',
      theme: options.theme || 'cinematic-documentary',
      aspectRatio: options.aspectRatio === '9:16' ? '9:16' : '16:9',
      targetDurationSec,
      estimatedScenes,
      wordCount,
      visualModel: 'Gemini Director + Pixel Verification',
      voice: options.voiceProvider === 'elevenlabs' ? 'ElevenLabs Neural' : 'Windows SAPI / Neural TTS',
      costLabel: 'Local orchestration; provider usage may cost credits',
      productionVerdict: wordCount < 10 ? 'warning' : 'pass',
      warnings: wordCount < 10 ? [{
        code: 'SHORT_INPUT',
        severity: 'warning',
        message: 'The input is a topic rather than a complete narration script.',
        fix: 'Gemini will draft narration before decomposing it into visual beats.'
      }] : [],
      sourcingPlan: {
        mode: 'hybrid-stock-generation',
        likelyVideoCoverage: 'unknown-until-search',
        likelyImageCoverage: 'unknown-until-search',
        generationRisk: 'medium',
        recommendedFallbacks: ['stock video', 'open archives', 'Gemini image or Veo after verified rejection']
      }
    };
  }

  async function generateScriptVisualPlans(sceneBeats, options = {}) {
    if (!Array.isArray(sceneBeats) || sceneBeats.length === 0) return new Map();

    const plansById = new Map();
    const requestedBatchSize = Number(options.visualPlanBatchSize) || 16;
    const batchSize = Math.max(1, Math.min(20, Math.round(requestedBatchSize)));
    try {
      const knownIds = new Set(sceneBeats.map((scene) => scene.id));
      for (let offset = 0; offset < sceneBeats.length; offset += batchSize) {
        const batch = sceneBeats.slice(offset, offset + batchSize);
        notifyWorkflowProgress(options, 'visual-direction-batch', {
          current: Math.floor(offset / batchSize) + 1,
          total: Math.ceil(sceneBeats.length / batchSize),
          completedScenes: offset,
          totalScenes: sceneBeats.length
        });
        const response = await fetch(getApiOrigin() + '/api/gemini/plan-visuals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            format: options.format || 'documentary',
            theme: options.theme || 'cinematic-documentary',
            apiKey: typeof AIAssistant !== 'undefined' ? AIAssistant.getGeminiKey() : '',
            scenes: batch.map((scene) => ({
              id: scene.id,
              index: scene.index,
              text: scene.text,
              meaningAnchor: scene.meaningAnchor || '',
              segmentationReason: scene.segmentationReason || ''
            }))
          }),
          signal: AbortSignal.timeout(90_000)
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || `Gemini visual planning returned HTTP ${response.status}.`);

        const plans = Array.isArray(payload.plans) ? payload.plans : [];
        plans
          .filter((plan) => knownIds.has(plan.id) && Array.isArray(plan.searchQueries) && plan.searchQueries.length > 0)
          .forEach((plan) => plansById.set(plan.id, {
            visualType: plan.visualType || 'documentary-footage',
            visualRole: plan.visualRole || '',
            coreClaim: plan.coreClaim || '',
            timeReference: plan.timeReference || '',
            mustShow: Array.isArray(plan.mustShow) ? plan.mustShow : [],
            mustNotShow: Array.isArray(plan.mustNotShow) ? plan.mustNotShow : [],
            visualIntent: plan.visualIntent || '',
            shotType: plan.shotType || 'Cinematic Shot',
            directorReasoning: plan.directorReasoning || 'Visual direction follows the narration beat.',
            searchQueries: plan.searchQueries.map((query) => String(query || '').trim()).filter(Boolean).slice(0, 5),
            candidateAcceptanceTest: plan.candidateAcceptanceTest || '',
            aiVisualPrompt: plan.aiVisualPrompt || ''
          }));
      }
      return plansById;
    } catch (error) {
      console.warn('[AIDirector] Gemini scene visual planning error:', error.message);
      if (options.requireGemini === true) throw error;
      return plansById;
    }
  }

  async function segmentScriptIntoVisualUnits(scriptText, options = {}) {
    try {
      const transportBatches = splitNarrationTransportBatches(scriptText);
      const segments = [];
      for (let batchIndex = 0; batchIndex < transportBatches.length; batchIndex += 1) {
        const response = await fetch(getApiOrigin() + '/api/gemini/segment-script', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            script: transportBatches[batchIndex],
            contextBefore: transportBatches[batchIndex - 1]?.slice(-600) || '',
            contextAfter: transportBatches[batchIndex + 1]?.slice(0, 600) || '',
            batchIndex: batchIndex + 1,
            totalBatches: transportBatches.length,
            format: options.format || 'documentary',
            theme: options.theme || 'cinematic-documentary',
            requireGemini: options.requireGemini === true,
            apiKey: typeof AIAssistant !== 'undefined' ? AIAssistant.getGeminiKey() : ''
          }),
          signal: AbortSignal.timeout(90_000)
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Gemini could not identify usable visualizable narration units.');

        const batchSegments = (Array.isArray(payload.segments) ? payload.segments : []).map((segment, segmentIndex) => ({
          id: `visual_unit_${segments.length + segmentIndex + 1}`,
          index: segments.length + segmentIndex + 1,
          text: String(segment.text || '').trim(),
          duration: Number.isFinite(Number(segment.durationSec))
            ? Number(segment.durationSec)
            : estimateNarrationDuration(segment.text),
          meaningAnchor: String(segment.meaningAnchor || '').trim(),
          segmentationReason: String(segment.segmentationReason || '').trim()
        })).filter((segment) => segment.text);
        if (batchSegments.length === 0) throw new Error(`Gemini returned no usable narration segments for batch ${batchIndex + 1}.`);
        segments.push(...batchSegments);
        notifyWorkflowProgress(options, 'segmentation-batch', {
          current: batchIndex + 1,
          total: transportBatches.length,
          beatCount: segments.length
        });
      }
      if (options.requireGemini === true && segments.length === 0) throw new Error('Gemini returned no usable narration segments.');
      return segments;
    } catch (error) {
      console.warn('[AIDirector] Gemini narration segmentation error:', error.message);
      if (options.requireGemini === true) throw error;
      return [];
    }
  }

  async function decomposeScriptIntoVisualBeats(scriptText, options = {}) {
    return segmentScriptIntoVisualUnits(scriptText, options);
  }

  function notifyWorkflowProgress(options, stage, details = {}) {
    if (typeof options.onProgress !== 'function') return;
    try {
      options.onProgress(stage, details);
    } catch (error) {
      console.warn('[AIDirector] Workflow progress callback error:', error.message);
    }
  }

  function storyboardNarration(storyboard) {
    return (storyboard?.scenes || [])
      .map((scene) => String(scene?.text || '').trim())
      .filter(Boolean)
      .join(' ');
  }

  /**
   * Generates a full Project Manifest from a topic or custom script using Gemini
   */
  async function generateManifest(topicOrScript, options = {}) {
    const cleanInput = String(topicOrScript || '').trim();
    const isFullScript = options.inputMode === 'script' || cleanInput.split(/\s+/).filter(Boolean).length > 25;

    let storyboardData = null;
    let storyboardError = null;
    const geminiKey = typeof AIAssistant !== 'undefined' ? AIAssistant.getGeminiKey() : '';

    // 1. Call Backend /api/gemini/generate-storyboard for pure Gemini production
    if (!isFullScript) {
      try {
        const res = await fetch(`${getApiOrigin()}/api/gemini/generate-storyboard`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topic: cleanInput,
            format: options.format || 'documentary',
            theme: options.theme || 'cinematic-documentary',
            targetDurationSec: options.targetDurationSec,
            estimatedScenes: options.estimatedScenes,
            requireGemini: options.requireGemini === true,
            apiKey: geminiKey
          })
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Gemini narrative service returned HTTP ${res.status}.`);
        if (options.requireGemini === true && data.source !== 'gemini') {
          throw new Error('The narrative service did not return a Gemini-authored result.');
        }
        if (data.storyboard && data.storyboard.scenes && data.storyboard.scenes.length > 0) {
          storyboardData = { ...data.storyboard, source: data.source || 'unknown' };
          notifyWorkflowProgress(options, 'narrative', {
            source: storyboardData.source,
            sceneCount: storyboardData.scenes.length
          });
        }
      } catch (err) {
        storyboardError = err;
        console.warn('[AIDirector] Backend storyboard generation error:', err.message);
      }
    }

    if (!storyboardData && !isFullScript && options.requireGemini === true) {
      throw new Error(`Gemini narrative generation did not complete: ${storyboardError?.message || 'no usable narration was returned.'}`);
    }

    // Legacy opt-out mode can use the configured assistant; required-Gemini runs never bypass the traced backend.
    if (!storyboardData && !isFullScript && options.requireGemini !== true && typeof AIAssistant !== 'undefined' && AIAssistant.hasLiveApiKey && AIAssistant.hasLiveApiKey()) {
      try {
        const targetInstruction = Number(options.targetDurationSec) > 0
          ? `Write enough narration for approximately ${Math.round(Number(options.targetDurationSec))} seconds at a natural speaking pace.`
          : 'Choose the narration length required to explain the topic properly.';
        const geminiPrompt = `You are the evidence-led narration writer for a scripted-video workflow.
Topic: "${cleanInput}". Format: ${options.format || 'documentary'}. Theme: ${options.theme || 'cinematic-documentary'}.
${targetInstruction} Choose as many complete narration sections as the explanation requires; there is no fixed section count, and these sections are not final visual-scene limits. Do not plan visuals, searches, shots, or image prompts. Do not invent quotations, exact statistics, dates, studies, or named authorities.
Output ONLY a JSON object with this exact schema:
{
  "title": "Clear Specific Video Title",
  "theme": "cinematic-documentary",
  "scenes": [
    {
      "index": 1,
      "text": "Complete factual narration thought with a named subject or process.",
      "durationSec": 5.5
    }
  ]
}`;

        const rawJson = await AIAssistant.callLLM(geminiPrompt, 'Return strictly valid JSON and do not add facts not supported by the supplied topic.');
        const cleaned = rawJson.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleaned);
        if (parsed.scenes && parsed.scenes.length > 0) {
          storyboardData = { ...parsed, source: 'gemini-client' };
          notifyWorkflowProgress(options, 'narrative', {
            source: storyboardData.source,
            sceneCount: storyboardData.scenes.length
          });
        }
      } catch (err) {
        console.warn('[AIDirector] Client Gemini storyboard error:', err.message);
      }
    }

    const manifest = ProjectManifest.createDefault({
      title: (storyboardData && storyboardData.title) || options.title || cleanInput.slice(0, 50) || 'VidRush Documentary Project',
      format: options.format || 'documentary',
      aspectRatio: options.aspectRatio || '16:9',
      theme: (storyboardData && storyboardData.theme) || options.theme || 'cinematic-documentary',
      sourcePolicy: 'license-evidence-required',
      voiceProvider: options.voiceProvider,
      voiceId: options.voiceId,
      voiceName: options.voiceName
    });

    const scenes = [];

    // Kept for backwards-compatible callers that explicitly opt out of micro-beat decomposition.
    if (storyboardData && storyboardData.scenes && options.forceGeminiDecomposition === false) {
      for (let i = 0; i < storyboardData.scenes.length; i++) {
        const beat = storyboardData.scenes[i];
        const searchQueries = beat.searchQueries && beat.searchQueries.length > 0 ? beat.searchQueries : [beat.text.slice(0, 30)];
        const topQuery = searchQueries[0];

        const mediaResults = await StockAPI.searchMedia(topQuery, 'all', {
          sceneIndex: i,
          sceneText: beat.text,
          searchQueries,
          visualType: beat.visualType || 'documentary-footage',
          visualIntent: beat.visualIntent || '',
          aiVisualPrompt: beat.aiVisualPrompt || '',
          autoGenerateFallback: options.autoGenerateFallback === true
        });

        const selectedMedia = StockAPI.selectBestMatch(mediaResults, topQuery);

        const shotPlan = {
          visualType: beat.visualType || 'documentary-footage',
          visualIntent: beat.visualIntent || '',
          shotType: beat.shotType || 'Cinematic Shot',
          directorReasoning: beat.directorReasoning || 'Visual matches narrative beat.',
          searchQueries,
          aiVisualPrompt: beat.aiVisualPrompt || `Cinematic 8k shot of ${topQuery} --ar 16:9`
        };

        scenes.push(ProjectManifest.createScene({
          id: `scene_${i + 1}_${Date.now()}`,
          index: i + 1,
          text: beat.text,
          captionText: beat.text,
          durationSec: beat.durationSec || 4.5,
          shotDirection: shotPlan,
          visual: selectedMedia,
          visualCandidates: mediaResults
        }));

        manifest.provenance[selectedMedia.assetId] = {
          assetId: selectedMedia.assetId,
          source: selectedMedia.source || 'pexels',
          sourceId: selectedMedia.sourceId || '',
          creator: selectedMedia.photographer || 'Verified Stock Contributor',
          license: selectedMedia.license || 'License not recorded',
          licenseUrl: selectedMedia.licenseUrl || '',
          sourcePageUrl: selectedMedia.sourcePageUrl || '',
          rights: selectedMedia.rights || null,
          url: selectedMedia.url,
          downloadedAt: new Date().toISOString(),
          usageSceneIds: [`scene_${i + 1}_${Date.now()}`]
        };
      }
      manifest.metadata.decomposition = {
        provider: storyboardData.source || 'unknown',
        beatCount: scenes.length,
        completedAt: new Date().toISOString()
      };
    } else {
      // Gemini must decide the exact script chunks, visual format, and search wording before media is sourced.
      const generatedNarration = !isFullScript ? storyboardNarration(storyboardData) : '';
      let scriptText = isFullScript ? cleanInput : (generatedNarration || await generateHighRetentionScript(cleanInput, options));
      notifyWorkflowProgress(options, 'segmentation-start', {
        narrationWords: scriptText.split(/\s+/).filter(Boolean).length
      });
      const parser = getParser();
      const geminiSegments = await segmentScriptIntoVisualUnits(scriptText, options);
      if (options.requireGemini === true && geminiSegments.length === 0) {
        throw new Error('Gemini did not produce acceptable visualizable narration units.');
      }
      const fallbackBeats = parser.splitScript(scriptText, isFullScript ? 'clause' : 'sentence')
        .map((sentence, index) => ({
          id: `fallback_beat_${index + 1}`,
          index: index + 1,
          text: sentence.text,
          duration: sentence.duration
        }));
      const visualBeats = geminiSegments.length > 0 ? geminiSegments : fallbackBeats;
      notifyWorkflowProgress(options, 'segmentation-complete', {
        provider: geminiSegments.length > 0 ? 'gemini' : 'parser-fallback',
        beatCount: visualBeats.length
      });
      notifyWorkflowProgress(options, 'visual-direction', { beatCount: visualBeats.length });
      const planningScenes = visualBeats.map((beat, index) => ({
        id: beat.id || `visual_plan_${index + 1}`,
        index: index + 1,
        text: beat.text,
        meaningAnchor: beat.meaningAnchor || '',
        segmentationReason: beat.segmentationReason || ''
      }));
      const visualPlans = await generateScriptVisualPlans(planningScenes, options);
      if (options.requireGemini === true && visualPlans.size !== planningScenes.length) {
        throw new Error('Gemini did not create a complete visual contract for every narration unit.');
      }

      for (let i = 0; i < visualBeats.length; i++) {
        const beat = visualBeats[i];
        const visualPlan = visualPlans.get(planningScenes[i].id) || await generateShotDirection(beat.text, scriptText);
        const topQuery = visualPlan.searchQueries[0] || beat.text;
        notifyWorkflowProgress(options, 'media-sourcing', {
          current: i + 1,
          total: visualBeats.length,
          query: topQuery
        });

        const mediaResults = await StockAPI.searchMedia(topQuery, 'all', {
          sceneIndex: i,
          sceneText: beat.text,
          searchQueries: visualPlan.searchQueries,
          visualType: visualPlan.visualType,
          visualIntent: visualPlan.visualIntent,
          candidateAcceptanceTest: visualPlan.candidateAcceptanceTest,
          aiVisualPrompt: visualPlan.aiVisualPrompt,
          autoGenerateFallback: options.autoGenerateFallback === true
        });

        const selectedMedia = StockAPI.selectBestMatch(mediaResults, topQuery);

        scenes.push(ProjectManifest.createScene({
          id: `scene_${i + 1}_${Date.now()}`,
          index: i + 1,
          text: beat.text,
          captionText: beat.text,
          durationSec: beat.duration || 4.0,
          shotDirection: visualPlan,
          visual: selectedMedia,
          visualCandidates: mediaResults
        }));

        manifest.provenance[selectedMedia.assetId] = {
          assetId: selectedMedia.assetId,
          source: selectedMedia.source || 'pexels',
          sourceId: selectedMedia.sourceId || '',
          creator: selectedMedia.photographer || 'Verified Stock Contributor',
          license: selectedMedia.license || 'License not recorded',
          licenseUrl: selectedMedia.licenseUrl || '',
          sourcePageUrl: selectedMedia.sourcePageUrl || '',
          rights: selectedMedia.rights || null,
          url: selectedMedia.url,
          downloadedAt: new Date().toISOString(),
          usageSceneIds: [`scene_${i + 1}_${Date.now()}`]
        };
      }
      manifest.metadata.decomposition = {
        provider: geminiSegments.length > 0 ? 'gemini-segmentation-and-contracts' : 'parser-fallback',
        beatCount: visualBeats.length,
        completedAt: new Date().toISOString()
      };
    }

    manifest.scenes = scenes;
    return ProjectManifest.recalculateTimings(manifest);
  }

  /**
   * Generates cinematic visual shot plan for a single scene beat
   */
  async function generateShotDirection(sceneSentence, fullScriptContext = '') {
    const plannedVisuals = await generateScriptVisualPlans([{
      id: 'single_scene',
      index: 1,
      text: sceneSentence
    }]);
    const plannedVisual = plannedVisuals.get('single_scene');
    if (plannedVisual) return plannedVisual;

    if (typeof AIAssistant !== 'undefined' && AIAssistant.generateSemanticVisualPlan) {
      return AIAssistant.generateSemanticVisualPlan(sceneSentence, fullScriptContext);
    }

    const cleanSubject = sceneSentence.replace(/[^\w\s]/gi, ' ').trim().split(/\s+/).slice(0, 4).join(' ');
    return {
      visualType: 'documentary-footage',
      visualRole: 'evidence',
      coreClaim: cleanSubject || sceneSentence,
      mustShow: [cleanSubject || sceneSentence],
      mustNotShow: ['an unrelated subject used only for mood'],
      visualIntent: cleanSubject || 'The literal subject named in this narration beat.',
      shotType: 'Literal establishing view',
      directorReasoning: 'The subject must be visibly identifiable rather than inferred from atmosphere.',
      searchQueries: [cleanSubject || 'literal scene subject'],
      candidateAcceptanceTest: `Is this media an exact visible match for "${cleanSubject || sceneSentence}" with no unrelated substitute?`,
      aiVisualPrompt: `Create a 16:9 visual that literally shows ${cleanSubject || sceneSentence}; exclude unrelated atmospheric substitutes.`
    };
  }

  /**
   * Script Generator for Director AI
   */
  async function generateHighRetentionScript(topic, options = {}) {
    const targetInstruction = Number(options.targetDurationSec) > 0
      ? `Target approximately ${Math.round(Number(options.targetDurationSec))} seconds of spoken narration at a natural pace.`
      : 'Choose the length needed to explain the topic properly.';
    const systemPrompt = `You are an evidence-led documentary narration writer.
${targetInstruction} Use as many sentences and paragraphs as the subject requires; there is no fixed sentence or scene count.
Rules:
1. Open with one specific question, contradiction, or consequence grounded in the topic; never use empty suspense.
2. Every sentence must contain a complete claim with an explicit subject and enough context to stand alone.
3. Do not invent quotations, exact numbers, dates, studies, or named authorities.
4. Avoid metaphors that hide the literal meaning and avoid generic phrases such as "everything changed" or "the truth is shocking".
5. Output ONLY spoken narration separated by double line breaks. No speaker tags, headings, or bullet numbers.`;

    const userPrompt = `Topic: "${topic}". Format: ${options.format || 'documentary'}. Theme: ${options.theme || 'cinematic-documentary'}. Write the narration script.`;

    if (typeof AIAssistant !== 'undefined' && AIAssistant.hasLiveApiKey && AIAssistant.hasLiveApiKey()) {
      try {
        const text = await AIAssistant.callLLM(userPrompt, systemPrompt);
        if (text && text.length > 50) return text;
      } catch (e) {
        console.warn('[AIDirector] Live script generator error, using procedural fallback:', e);
      }
    }

    if (typeof AIAssistant !== 'undefined' && AIAssistant.generateDirectorScript) {
      return AIAssistant.generateDirectorScript(topic, options.format, options.theme, options.targetDurationSec);
    }

    return `Deep inside historical archives lies a secret that historians rarely discuss.\n\nFor centuries, ancient gladiators in Rome trained not as mindless fighters, but as revered sporting titans.\n\nIn the roaring sands of the Colosseum, armored combatants risked everything for legendary glory.\n\nEvery clashing blade echoed across thousands of roaring spectators.\n\nToday, modern excavations reveal the astonishing truth behind these warriors of the arena.`;
  }

  const api = {
    computePreflight,
    generateManifest,
    segmentScriptIntoVisualUnits,
    decomposeScriptIntoVisualBeats,
    generateScriptVisualPlans,
    generateShotDirection,
    generateHighRetentionScript
  };

  if (typeof window !== 'undefined') window.AIDirector = api;
  if (typeof globalThis !== 'undefined') globalThis.AIDirector = api;
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
