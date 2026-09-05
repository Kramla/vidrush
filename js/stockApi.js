/**
 * VidRush Studio - Scene-Specific Media Client
 * Gemini plans the visual intent; the local server collects matching stock media.
 */

const StockAPI = (() => {
  const STORAGE_KEY_PEXELS = 'scriptflow_pexels_key';
  const STORAGE_KEY_PIXABAY = 'scriptflow_pixabay_key';

  function getApiOrigin() {
    return typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'http://127.0.0.1:8080';
  }

  function getPexelsKey() {
    return typeof localStorage !== 'undefined' ? (localStorage.getItem(STORAGE_KEY_PEXELS) || '') : '';
  }

  function setPexelsKey(key) {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY_PEXELS, String(key || '').trim());
  }

  function getPixabayKey() {
    return typeof localStorage !== 'undefined' ? (localStorage.getItem(STORAGE_KEY_PIXABAY) || '') : '';
  }

  function setPixabayKey(key) {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY_PIXABAY, String(key || '').trim());
  }

  function buildSearchQueries(query, context = {}) {
    const candidates = [query, ...(Array.isArray(context.searchQueries) ? context.searchQueries : [])]
      .map((value) => String(value || '').trim())
      .filter((value) => value.length >= 3)
      .map((value) => value.split(/\s+/).slice(0, 8).join(' '));
    const uniqueQueries = candidates.filter((value, index, values) => values
      .findIndex((candidate) => candidate.toLowerCase() === value.toLowerCase()) === index);
    if (uniqueQueries.length > 0) return uniqueQueries.slice(0, 6);

    const sceneFallback = String(context.sceneText || '').trim().split(/\s+/).slice(0, 6).join(' ');
    return sceneFallback.length >= 3 ? [sceneFallback] : [];
  }

  function createPendingMedia(query) {
    return {
      assetId: `unresolved_${Date.now()}`,
      type: 'placeholder',
      url: '',
      thumbnail: '',
      title: `No matching media found for: ${String(query || 'this scene').slice(0, 90)}`,
      source: 'unresolved',
      selectionStatus: 'UNRESOLVED'
    };
  }

  function selectBestMatch(items, query) {
    const candidates = Array.isArray(items) ? items : [];
    const manifestPolicy = typeof ProjectStore !== 'undefined' ? ProjectStore.getManifest()?.metadata?.sourcePolicy : null;
    const rightsMode = typeof manifestPolicy === 'object' && manifestPolicy?.rightsMode === 'allow-unknown'
      ? 'allow-unknown'
      : 'known-rights';
    const hasApprovedRights = (item) => item?.rights?.approvedForUse === true;
    const isGeminiVerified = (item) => item?.visualVerification?.previewAnalyzed === true
      && item?.visualVerification?.answer === 'yes'
      && item?.visualVerification?.eligible === true
      && item?.visualVerification?.verdict === 'strong-match'
      && (rightsMode === 'allow-unknown' || hasApprovedRights(item));
    const generatedAsset = candidates.find((item) => item?.generatedBy === 'gemini' && isGeminiVerified(item));
    if (generatedAsset) return { ...generatedAsset, selectionStatus: 'VERIFIED' };

    const visionRequired = candidates.some((item) => item?.requiresVisionVerification);
    const previewReviewed = candidates.some((item) => item?.visualVerification?.previewAnalyzed);
    if (visionRequired || previewReviewed) {
      const verifiedAsset = candidates.find(isGeminiVerified);
      return verifiedAsset ? { ...verifiedAsset, selectionStatus: 'VERIFIED' } : createPendingMedia(query);
    }

    return createPendingMedia(query);
  }

  async function searchMedia(query, filter = 'all', context = {}) {
    const searchQueries = buildSearchQueries(query, context);
    if (searchQueries.length === 0) return [];
    const manifestPolicy = typeof ProjectStore !== 'undefined' ? ProjectStore.getManifest()?.metadata?.sourcePolicy : null;
    const rightsMode = context.rightsMode === 'allow-unknown'
      || (typeof manifestPolicy === 'object' && manifestPolicy?.rightsMode === 'allow-unknown')
      ? 'allow-unknown'
      : 'known-rights';

    try {
      const response = await fetch(`${getApiOrigin()}/api/media/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: searchQueries[0],
          filter,
          sceneText: String(context.sceneText || ''),
          searchQueries,
          visualType: String(context.visualType || ''),
          visualIntent: String(context.visualIntent || ''),
          candidateAcceptanceTest: String(context.candidateAcceptanceTest || ''),
          aiVisualPrompt: String(context.aiVisualPrompt || ''),
          rightsMode,
          autoGenerateFallback: context.autoGenerateFallback === true,
          geminiTraceSessionId: String(context.geminiTraceSessionId || ''),
          geminiApiKey: typeof AIAssistant !== 'undefined' ? AIAssistant.getGeminiKey() : '',
          apiKey: getPexelsKey(),
          pixabayApiKey: getPixabayKey()
        })
      });
      if (!response.ok) throw new Error(`Media service returned HTTP ${response.status}`);
      const payload = await response.json();
      return Array.isArray(payload.items) ? payload.items : [];
    } catch (error) {
      console.warn('[StockAPI] Scene media collection failed:', error.message);
      return [];
    }
  }

  const api = { getPexelsKey, setPexelsKey, getPixabayKey, setPixabayKey, searchMedia, selectBestMatch, createPendingMedia };
  if (typeof window !== 'undefined') window.StockAPI = api;
  if (typeof globalThis !== 'undefined') globalThis.StockAPI = api;
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
