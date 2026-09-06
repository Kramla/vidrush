/**
 * VidRush Studio - Master Application Controller v6.0
 * 5-Stage Connected Production Studio Controller
 * 
 * Manages the unified workflow:
 * Stage 1: Script & Narrative Director
 * Stage 2: Scene Visuals & AI Sourcing
 * Stage 3: Neural Voiceover & Audio Mixing
 * Stage 4: Studio Editor, Multi-Track Timeline & Rush Copilot
 * Stage 5: 1080p Render & Export Hub
 */

document.addEventListener('DOMContentLoaded', () => {
  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Local UI State
  const uiState = {
    currentStage: 1, // 1 to 5
    activeSceneIndex: 0,
    activeScriptMode: 'prompt', // 'prompt' | 'manual'
    modalActiveTab: 'all',
    activeModalSceneId: null,
    generatedModalAsset: null,
    generatedVideoModalAsset: null,
    generatedVideoJobToken: null,
    flowQueueItems: [],
    flowBulkImportBusy: false,
    preflightData: null,
    isProcessing: false,
    serverCapabilities: { hasGemini: false, hasPollinations: false, hasPexels: false, geminiGeneration: null },
    geminiTraceSessionId: '',
    timelineProposalSerial: 0,
    activeDirectorJobId: ''
  };

  const nativeFetch = window.fetch.bind(window);
  window.fetch = (resource, options = {}) => {
    const requestUrl = resource instanceof Request ? resource.url : String(resource || '');
    const isGeminiOperation = /\/api\/(gemini\/|media\/search|pollinations\/|generated-media\/)/.test(requestUrl);
    if (!uiState.geminiTraceSessionId || !isGeminiOperation) return nativeFetch(resource, options);
    const headers = new Headers(options.headers || (resource instanceof Request ? resource.headers : undefined));
    headers.set('X-Gemini-Trace-Session', uiState.geminiTraceSessionId);
    return nativeFetch(resource, { ...options, headers });
  };

  // DOM Elements - Stepper Navigation
  const stepNavBtns = [
    document.getElementById('stepNav1'),
    document.getElementById('stepNav2'),
    document.getElementById('stepNav3'),
    document.getElementById('stepNav4'),
    document.getElementById('stepNav5')
  ];

  // Stage Views
  const stageViews = [
    document.getElementById('stageView1'),
    document.getElementById('stageView2'),
    document.getElementById('stageView3'),
    document.getElementById('stageView4'),
    document.getElementById('stageView5')
  ];

  // DOM Elements - Header
  const undoBtn = document.getElementById('undoBtn');
  const redoBtn = document.getElementById('redoBtn');
  const totalDurationEl = document.getElementById('totalDuration');
  const totalScenesCountEl = document.getElementById('totalScenesCount');
  const newProjectBtn = document.getElementById('newProjectBtn');
  const geminiChatBtn = document.getElementById('geminiChatBtn');
  const flowQueueBtn = document.getElementById('flowQueueBtn');
  const settingsBtn = document.getElementById('settingsBtn');
  const geminiTraceModal = document.getElementById('geminiTraceModal');
  const closeGeminiTraceBtn = document.getElementById('closeGeminiTraceBtn');
  const closeGeminiTraceFooterBtn = document.getElementById('closeGeminiTraceFooterBtn');
  const refreshGeminiTraceBtn = document.getElementById('refreshGeminiTraceBtn');
  const geminiTraceRunLabel = document.getElementById('geminiTraceRunLabel');
  const geminiTraceEmpty = document.getElementById('geminiTraceEmpty');
  const geminiTraceFeed = document.getElementById('geminiTraceFeed');
  const flowQueueModal = document.getElementById('flowQueueModal');
  const closeFlowQueueBtn = document.getElementById('closeFlowQueueBtn');
  const flowQueueMediaType = document.getElementById('flowQueueMediaType');
  const flowQueueOnlyUnresolved = document.getElementById('flowQueueOnlyUnresolved');
  const flowQueueSummary = document.getElementById('flowQueueSummary');
  const flowQueueEmpty = document.getElementById('flowQueueEmpty');
  const flowQueueList = document.getElementById('flowQueueList');
  const copyFlowQueueBtn = document.getElementById('copyFlowQueueBtn');
  const downloadFlowQueueCsvBtn = document.getElementById('downloadFlowQueueCsvBtn');
  const downloadFlowQueueTxtBtn = document.getElementById('downloadFlowQueueTxtBtn');
  const downloadFlowQueueJsonBtn = document.getElementById('downloadFlowQueueJsonBtn');
  const openGoogleFlowQueueBtn = document.getElementById('openGoogleFlowQueueBtn');
  const bulkImportFlowMediaBtn = document.getElementById('bulkImportFlowMediaBtn');
  const bulkImportFlowMediaInput = document.getElementById('bulkImportFlowMediaInput');
  const flowBulkImportPanel = document.getElementById('flowBulkImportPanel');
  const flowBulkImportSummary = document.getElementById('flowBulkImportSummary');
  const flowBulkImportProgressText = document.getElementById('flowBulkImportProgressText');
  const flowBulkImportProgress = document.getElementById('flowBulkImportProgress');
  const flowBulkImportResults = document.getElementById('flowBulkImportResults');

  // DOM Elements - Stage 1 (Script & Beats)
  const modePromptBtn = document.getElementById('modePromptBtn');
  const modeManualBtn = document.getElementById('modeManualBtn');
  const directorPromptBox = document.getElementById('directorPromptBox');
  const manualScriptBox = document.getElementById('manualScriptBox');
  const directorPromptInput = document.getElementById('directorPromptInput');
  const manualScriptText = document.getElementById('manualScriptText');
  const projectThemeSelect = document.getElementById('projectThemeSelect');
  const projectAspectSelect = document.getElementById('projectAspectSelect');
  const brandProfileSelect = document.getElementById('brandProfileSelect');
  const saveBrandProfileBtn = document.getElementById('saveBrandProfileBtn');
  const rightsModeSelect = document.getElementById('rightsModeSelect');
  const generateScriptBtn = document.getElementById('generateScriptBtn');
  const stage1BeatsList = document.getElementById('stage1BeatsList');
  const stage1BeatCount = document.getElementById('stage1BeatCount');
  const stage1DecompositionBadge = document.getElementById('stage1DecompositionBadge');
  const stage1AddBeatBtn = document.getElementById('stage1AddBeatBtn');
  const toStage2Btn = document.getElementById('toStage2Btn');
  const stage1ProviderBadge = document.getElementById('stage1ProviderBadge');

  // DOM Elements - Stage 2 (Visuals)
  const stage2VisualsGrid = document.getElementById('stage2VisualsGrid');
  const stage2RefreshAllBtn = document.getElementById('stage2RefreshAllBtn');
  const stage2AutoGeminiFallback = document.getElementById('stage2AutoGeminiFallback');
  const backToStage1Btn = document.getElementById('backToStage1Btn');
  const toStage3Btn = document.getElementById('toStage3Btn');

  // DOM Elements - Stage 3 (Voice & Audio)
  const stage3VoiceSelect = document.getElementById('stage3VoiceSelect');
  const stage3VoiceProvider = document.getElementById('stage3VoiceProvider');
  const stage3PreviewVoiceBtn = document.getElementById('stage3PreviewVoiceBtn');
  const stage3BgmTrackSelect = document.getElementById('stage3BgmTrackSelect');
  const stage3BgmVolume = document.getElementById('stage3BgmVolume');
  const stage3BgmVolDisplay = document.getElementById('stage3BgmVolDisplay');
  const stage3AudioSceneList = document.getElementById('stage3AudioSceneList');
  const backToStage2Btn = document.getElementById('backToStage2Btn');
  const toStage4Btn = document.getElementById('toStage4Btn');

  // DOM Elements - Stage 4 (Studio Timeline & Rush Copilot)
  const chatFeed = document.getElementById('chatFeed');
  const chatInputArea = document.getElementById('chatInputArea');
  const sendChatBtn = document.getElementById('sendChatBtn');
  const cancelDirectorBtn = document.getElementById('cancelDirectorBtn');
  const activeProjectTitle = document.getElementById('activeProjectTitle');
  const playerCurrentSceneBadge = document.getElementById('playerCurrentSceneBadge');
  const activeThemeBadge = document.getElementById('activeThemeBadge');
  const playerVideoEl = document.getElementById('playerVideoEl');
  const playerImageEl = document.getElementById('playerImageEl');
  const captionText = document.getElementById('captionText');
  const hudTimer = document.getElementById('hudTimer');
  const emptyStageOverlay = document.getElementById('emptyStageOverlay');
  const playPauseBtn = document.getElementById('playPauseBtn');
  const prevSceneBtn = document.getElementById('prevSceneBtn');
  const nextSceneBtn = document.getElementById('nextSceneBtn');
  const timelineBar = document.getElementById('timelineBar');
  const timelineProgress = document.getElementById('timelineProgress');
  const volumeSlider = document.getElementById('volumeSlider');
  const muteToggleBtn = document.getElementById('muteToggleBtn');
  const captionPresetSelect = document.getElementById('captionPresetSelect');
  const toggleCaptionsBtn = document.getElementById('toggleCaptionsBtn');
  const fullscreenBtn = document.getElementById('fullscreenBtn');
  const inspectorSceneNumberBadge = document.getElementById('inspectorSceneNumberBadge');
  const inspectorEmptyState = document.getElementById('inspectorEmptyState');
  const inspectorActiveScene = document.getElementById('inspectorActiveScene');
  const inspectorShotTypeBadge = document.getElementById('inspectorShotTypeBadge');
  const inspectorDirectorReasoning = document.getElementById('inspectorDirectorReasoning');
  const inspectorSceneText = document.getElementById('inspectorSceneText');
  const inspectorWordCount = document.getElementById('inspectorWordCount');
  const inspectorMediaThumb = document.getElementById('inspectorMediaThumb');
  const inspectorMediaTypePill = document.getElementById('inspectorMediaTypePill');
  const inspectorMediaSourceTitle = document.getElementById('inspectorMediaSourceTitle');
  const inspectorCandidatesGrid = document.getElementById('inspectorCandidatesGrid');
  const inspectorDurationInput = document.getElementById('inspectorDurationInput');
  const inspectorPrevSceneBtn = document.getElementById('inspectorPrevSceneBtn');
  const inspectorNextSceneBtn = document.getElementById('inspectorNextSceneBtn');
  const inspectorSearchStockBtn = document.getElementById('inspectorSearchStockBtn');
  const inspectorAiGenBtn = document.getElementById('inspectorAiGenBtn');
  const inspectorUploadBtn = document.getElementById('inspectorUploadBtn');
  const inspectorCopyPromptBtn = document.getElementById('inspectorCopyPromptBtn');
  const tlDurationLabel = document.getElementById('tlDurationLabel');
  const timeRuler = document.getElementById('timeRuler');
  const timelineTracks = document.getElementById('timelineTracks');
  const addCustomSceneBtn = document.getElementById('addCustomSceneBtn');
  const backToStage3Btn = document.getElementById('backToStage3Btn');
  const toStage5Btn = document.getElementById('toStage5Btn');

  // DOM Elements - Stage 5 (Render & Export Hub)
  const renderMp4MainBtn = document.getElementById('renderMp4MainBtn');
  const renderHubInitialBox = document.getElementById('renderHubInitialBox');
  const renderHubProgressBox = document.getElementById('renderHubProgressBox');
  const renderHubSuccessBox = document.getElementById('renderHubSuccessBox');
  const renderHubStatusText = document.getElementById('renderHubStatusText');
  const renderedVideoPreviewEl = document.getElementById('renderedVideoPreviewEl');
  const renderedDurationLabel = document.getElementById('renderedDurationLabel');
  const downloadRenderedMp4Link = document.getElementById('downloadRenderedMp4Link');
  const copyVideoLinkBtn = document.getElementById('copyVideoLinkBtn');
  const n8nAutomationPanel = document.getElementById('n8nAutomationPanel');
  const n8nAutomationStatusBadge = document.getElementById('n8nAutomationStatusBadge');
  const n8nAutomationStatusText = document.getElementById('n8nAutomationStatusText');
  const approveN8nPublishingBtn = document.getElementById('approveN8nPublishingBtn');
  const refreshN8nStatusBtn = document.getElementById('refreshN8nStatusBtn');
  const n8nPublishedVideoLink = document.getElementById('n8nPublishedVideoLink');
  const exportSrtBtn = document.getElementById('exportSrtBtn');
  const exportVttBtn = document.getElementById('exportVttBtn');
  const exportJsonBtn = document.getElementById('exportJsonBtn');
  const exportScriptTxtBtn = document.getElementById('exportScriptTxtBtn');
  const exportMediaListBtn = document.getElementById('exportMediaListBtn');
  const openN8nAutomationBtn = document.getElementById('openN8nAutomationBtn');
  const backToStage4Btn = document.getElementById('backToStage4Btn');
  const startNewProjectFooterBtn = document.getElementById('startNewProjectFooterBtn');

  // DOM Elements - Modals
  const preflightModal = document.getElementById('preflightModal');
  const closePreflightBtn = document.getElementById('closePreflightBtn');
  const cancelPreflightBtn = document.getElementById('cancelPreflightBtn');
  const confirmGenerateBtn = document.getElementById('confirmGenerateBtn');
  const quoteTitle = document.getElementById('quoteTitle');
  const quoteDuration = document.getElementById('quoteDuration');
  const quoteScenes = document.getElementById('quoteScenes');
  const quoteModel = document.getElementById('quoteModel');
  const quoteVoice = document.getElementById('quoteVoice');
  const quoteCost = document.getElementById('quoteCost');
  const quoteWarnings = document.getElementById('quoteWarnings');
  const generationProgressModal = document.getElementById('generationProgressModal');
  const generationProgressTitle = document.getElementById('generationProgressTitle');
  const generationProgressSubtitle = document.getElementById('generationProgressSubtitle');
  const stageStep1 = document.getElementById('stageStep1');
  const stageStep2 = document.getElementById('stageStep2');
  const stageStep3 = document.getElementById('stageStep3');
  const stageStep4 = document.getElementById('stageStep4');
  const stageStep5 = document.getElementById('stageStep5');

  // Asset Modal
  const assetSearchModal = document.getElementById('assetSearchModal');
  const closeAssetModalBtn = document.getElementById('closeAssetModalBtn');
  const modalSceneNumBadge = document.getElementById('modalSceneNumBadge');
  const modalSearchInput = document.getElementById('modalSearchInput');
  const modalSearchBtn = document.getElementById('modalSearchBtn');
  const modalMediaResultsGrid = document.getElementById('modalMediaResultsGrid');
  const modalGoogleFlowAiSection = document.getElementById('modalGoogleFlowAiSection');
  const googleFlowPromptInput = document.getElementById('googleFlowPromptInput');
  const imageGenerationProvider = document.getElementById('imageGenerationProvider');
  const triggerGoogleFlowGenBtn = document.getElementById('triggerGoogleFlowGenBtn');
  const googleFlowAiResultBox = document.getElementById('googleFlowAiResultBox');
  const googleFlowGeneratedImg = document.getElementById('googleFlowGeneratedImg');
  const geminiImageVerificationText = document.getElementById('geminiImageVerificationText');
  const geminiImageAccessStatus = document.getElementById('geminiImageAccessStatus');
  const applyGoogleFlowAssetBtn = document.getElementById('applyGoogleFlowAssetBtn');
  const importGoogleFlowImageBtn = document.getElementById('importGoogleFlowImageBtn');
  const googleFlowImageImportInput = document.getElementById('googleFlowImageImportInput');
  const modalGeminiVeoSection = document.getElementById('modalGeminiVeoSection');
  const geminiVeoPromptInput = document.getElementById('geminiVeoPromptInput');
  const videoGenerationProvider = document.getElementById('videoGenerationProvider');
  const triggerGeminiVeoGenBtn = document.getElementById('triggerGeminiVeoGenBtn');
  const geminiVideoAccessStatus = document.getElementById('geminiVideoAccessStatus');
  const geminiVeoJobStatus = document.getElementById('geminiVeoJobStatus');
  const geminiVeoResultBox = document.getElementById('geminiVeoResultBox');
  const geminiVeoGeneratedVideo = document.getElementById('geminiVeoGeneratedVideo');
  const geminiVeoVerificationText = document.getElementById('geminiVeoVerificationText');
  const applyGeminiVeoAssetBtn = document.getElementById('applyGeminiVeoAssetBtn');
  const importGoogleFlowVideoBtn = document.getElementById('importGoogleFlowVideoBtn');
  const googleFlowVideoImportInput = document.getElementById('googleFlowVideoImportInput');
  const modalUploadSection = document.getElementById('modalUploadSection');
  const modalAiPromptSection = document.getElementById('modalAiPromptSection');
  const generatedAiPromptText = document.getElementById('generatedAiPromptText');
  const copyAiPromptBtn = document.getElementById('copyAiPromptBtn');
  const customFileInput = document.getElementById('customFileInput');

  // Settings Modal
  const settingsModal = document.getElementById('settingsModal');
  const closeSettingsModalBtn = document.getElementById('closeSettingsModalBtn');
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');
  const elevenLabsApiKeyInput = document.getElementById('elevenLabsApiKey');
  const aiProviderSelect = document.getElementById('aiProviderSelect');
  const openaiApiKeyInput = document.getElementById('openaiApiKey');
  const ollamaUrlInput = document.getElementById('ollamaUrl');
  const pexelsApiKeyInput = document.getElementById('pexelsApiKey');
  const pixabayApiKeyInput = document.getElementById('pixabayApiKey');
  const pollinationsApiKeyInput = document.getElementById('pollinationsApiKey');

  // n8n Publishing Modal
  const n8nAutomationModal = document.getElementById('n8nAutomationModal');
  const closeN8nAutomationBtn = document.getElementById('closeN8nAutomationBtn');
  const n8nAutomationConfigMessage = document.getElementById('n8nAutomationConfigMessage');
  const refreshN8nConfigurationBtn = document.getElementById('refreshN8nConfigurationBtn');

  const AUTO_GEMINI_FALLBACK_STORAGE_KEY = 'scriptflow_auto_gemini_image_fallback';
  const POLLINATIONS_API_KEY_STORAGE_KEY = 'scriptflow_pollinations_api_key';
  const IMAGE_GENERATION_PROVIDER_STORAGE_KEY = 'scriptflow_image_generation_provider';
  const VIDEO_GENERATION_PROVIDER_STORAGE_KEY = 'scriptflow_video_generation_provider';

  function isAutoGeminiFallbackEnabled() {
    return typeof localStorage === 'undefined' || localStorage.getItem(AUTO_GEMINI_FALLBACK_STORAGE_KEY) !== 'false';
  }

  function saveAutoGeminiFallback(enabled) {
    if (typeof localStorage !== 'undefined') localStorage.setItem(AUTO_GEMINI_FALLBACK_STORAGE_KEY, String(enabled));
  }

  function getPollinationsKey() {
    return typeof localStorage === 'undefined' ? '' : String(localStorage.getItem(POLLINATIONS_API_KEY_STORAGE_KEY) || '').trim();
  }

  function savePollinationsKey(value) {
    if (typeof localStorage === 'undefined') return;
    const key = String(value || '').trim();
    if (key) localStorage.setItem(POLLINATIONS_API_KEY_STORAGE_KEY, key);
    else localStorage.removeItem(POLLINATIONS_API_KEY_STORAGE_KEY);
  }

  function initializeGenerationProviderSelections() {
    const pollinationsReady = uiState.serverCapabilities.hasPollinations || !!getPollinationsKey();
    const defaultProvider = pollinationsReady ? 'pollinations' : 'google-flow';
    const savedImageProvider = localStorage.getItem(IMAGE_GENERATION_PROVIDER_STORAGE_KEY) || defaultProvider;
    const savedVideoProvider = localStorage.getItem(VIDEO_GENERATION_PROVIDER_STORAGE_KEY) || defaultProvider;
    if ([...imageGenerationProvider.options].some((option) => option.value === savedImageProvider)) imageGenerationProvider.value = savedImageProvider;
    if ([...videoGenerationProvider.options].some((option) => option.value === savedVideoProvider)) videoGenerationProvider.value = savedVideoProvider;
  }

  // Initialize
  initApp().catch((error) => console.error('[initApp] Failed:', error));

  async function initApp() {
    loadSavedSettings();
    stage2AutoGeminiFallback.checked = isAutoGeminiFallbackEnabled();
    updateProviderBadge();

    // Read server capabilities without exposing server-side credentials.
    fetch('/api/config')
      .then((r) => r.json())
      .then((cfg) => {
        uiState.serverCapabilities = {
          hasGemini: !!cfg.hasGemini,
          hasPollinations: !!cfg.hasPollinations,
          hasPexels: !!cfg.hasPexels,
          n8n: {
            configured: !!cfg.n8n?.configured,
            requiresApproval: cfg.n8n?.requiresApproval !== false
          }
        };
        if (cfg.hasGemini) {
          AIAssistant.setProvider('gemini');
          refreshGeminiGenerationCapabilities();
        }
        initializeGenerationProviderSelections();
        renderGenerationProviderControls();
        loadSavedSettings();
        updateProviderBadge();
      })
      .catch((e) => console.warn('Could not fetch server config:', e));

    // Initialize Stage Player
    VideoPlayer.init({
      videoEl: playerVideoEl,
      imageEl: playerImageEl,
      captionEl: captionText,
      hudTimerEl: hudTimer,
      timelineProgressEl: timelineProgress,
      currentSceneBadgeEl: playerCurrentSceneBadge
    });

    VideoPlayer.setOnSceneChange((idx) => {
      uiState.activeSceneIndex = idx;
      VisualTimeline.updatePlayhead(idx);
      renderSceneInspector(idx);
    });

    // Initialize Multi-Track Timeline
    VisualTimeline.init({
      containerEl: document.querySelector('.timeline-studio-deck'),
      tracksWrapperEl: timelineTracks,
      timeRulerEl: timeRuler,
      onSeek: (idx) => {
        selectScene(idx);
        VideoPlayer.goToScene(idx);
      }
    });

    // Subscribe to ProjectStore for reactive state sync
    ProjectStore.subscribe((manifest, action, description) => {
      syncUIWithManifest(manifest);
      if (description) {
        console.log(`[ProjectStore Event] ${action?.type}: ${description}`);
      }
    });

    // Initialize immediately, then recover the latest durable project before enabling edits.
    ProjectStore.init(ProjectManifest.createDefault());

    const restoredManifest = await ProjectStore.restoreLatest();
    if (restoredManifest) {
      ProjectStore.init(restoredManifest, { persisted: true });
      showToast(`Restored "${restoredManifest.metadata?.title || 'your latest project'}".`, 'success');
    } else {
      await ProjectStore.createCurrentProject();
    }

    setupEventListeners();
    await loadBrandProfiles(restoredManifest?.metadata?.brandProfileId || 'profile_default');
    setStage(1);
  }

  // --- Stage Router ---
  function setStage(stageNum) {
    uiState.currentStage = stageNum;

    // Update Stage Stepper Nav
    stepNavBtns.forEach((btn, idx) => {
      const stepIndex = idx + 1;
      btn.classList.toggle('active', stepIndex === stageNum);
      btn.classList.toggle('completed', stepIndex < stageNum && ProjectStore.getManifest().scenes.length > 0);
    });

    // Toggle Stage Views
    stageViews.forEach((view, idx) => {
      const stepIndex = idx + 1;
      view.classList.toggle('active', stepIndex === stageNum);
      view.classList.toggle('hidden', stepIndex !== stageNum);
    });

    const manifest = ProjectStore.getManifest();

    // Trigger Stage-Specific Renders
    if (stageNum === 1) {
      renderStage1Beats(manifest);
    } else if (stageNum === 2) {
      renderStage2Visuals(manifest);
    } else if (stageNum === 3) {
      renderStage3Audio(manifest);
    } else if (stageNum === 4) {
      VideoPlayer.loadManifest(manifest, uiState.activeSceneIndex);
      VisualTimeline.render(manifest, uiState.activeSceneIndex);
      renderSceneInspector(uiState.activeSceneIndex);
    } else if (stageNum === 5) {
      renderStage5Hub(manifest);
    }
  }

  function syncUIWithManifest(manifest) {
    const scenes = manifest.scenes || [];
    const hasScenes = scenes.length > 0;
    const totalDuration = ProjectManifest.getTotalDuration(manifest);

    // Update Header Stats
    totalScenesCountEl.textContent = scenes.length;
    totalDurationEl.textContent = formatDuration(totalDuration);
    activeProjectTitle.textContent = manifest.metadata?.title || 'VidRush Project Stage';

    projectThemeSelect.value = manifest.metadata?.theme || 'cinematic-documentary';
    projectAspectSelect.value = manifest.metadata?.aspectRatio || '16:9';
    const sourcePolicy = typeof manifest.metadata?.sourcePolicy === 'object' ? manifest.metadata.sourcePolicy : {};
    if (rightsModeSelect) rightsModeSelect.value = sourcePolicy.rightsMode === 'allow-unknown' ? 'allow-unknown' : 'known-rights';
    if (brandProfileSelect && manifest.metadata?.brandProfileId) brandProfileSelect.value = manifest.metadata.brandProfileId;
    activeThemeBadge.textContent = projectThemeSelect.options[projectThemeSelect.selectedIndex]?.text || 'Cinematic';

    // Undo / Redo
    undoBtn.disabled = !ProjectStore.canUndo();
    redoBtn.disabled = !ProjectStore.canRedo();

    // Stage 1 Button
    toStage2Btn.disabled = !hasScenes;

    // Re-render active stage
    if (uiState.currentStage === 1) renderStage1Beats(manifest);
    else if (uiState.currentStage === 2) renderStage2Visuals(manifest);
    else if (uiState.currentStage === 3) renderStage3Audio(manifest);
    else if (uiState.currentStage === 4) {
      emptyStageOverlay.classList.toggle('hidden', hasScenes);
      playPauseBtn.disabled = !hasScenes;
      prevSceneBtn.disabled = !hasScenes;
      nextSceneBtn.disabled = !hasScenes;
      captionPresetSelect.value = manifest.captions?.style || 'hormozi';
      toggleCaptionsBtn.classList.toggle('active', manifest.captions?.enabled !== false);
      VideoPlayer.loadManifest(manifest, uiState.activeSceneIndex);
      VisualTimeline.render(manifest, uiState.activeSceneIndex);
      renderSceneInspector(uiState.activeSceneIndex);
    } else if (uiState.currentStage === 5) {
      renderStage5Hub(manifest);
    }
  }

  function renderGeminiGenerationCapabilities() {
    const capabilities = uiState.serverCapabilities.geminiGeneration;
    const configured = uiState.serverCapabilities.hasGemini;
    const renderStatus = (element, capability, label) => {
      if (!element) return;
      if (!configured) {
        element.textContent = 'No Gemini API key is configured.';
        element.className = 'gemini-video-status is-rejected';
        return;
      }
      if (!capabilities) {
        element.textContent = `Checking ${label} model access...`;
        element.className = 'gemini-video-status is-processing';
        return;
      }
      if (!capability?.available) {
        element.textContent = `This API key does not expose a supported ${label} model.`;
        element.className = 'gemini-video-status is-rejected';
        return;
      }
      const model = capability.models?.[0] || `${label} model`;
      element.textContent = `${model} is visible to this API key. Generation still requires an active paid Gemini API billing tier and available quota.`;
      element.className = 'gemini-video-status';
    };

    renderStatus(geminiImageAccessStatus, capabilities?.image, 'Gemini image');
    renderStatus(geminiVideoAccessStatus, capabilities?.video, 'Gemini Veo');
  }

  function renderGenerationProviderControls() {
    const pollinationsReady = uiState.serverCapabilities.hasPollinations || !!getPollinationsKey();
    const renderProvider = (providerSelect, statusElement, button, mediaType) => {
      if (!providerSelect || !statusElement || !button) return;
      const provider = providerSelect.value;
      if (provider === 'pollinations') {
        statusElement.textContent = pollinationsReady
          ? `Pollinations ${mediaType} generation is ready. It uses the account's free allowance first; Gemini will verify the returned ${mediaType}.`
          : 'Add a free Pollinations key in Settings, or select Google Flow to use its daily free credits.';
        statusElement.className = `gemini-video-status ${pollinationsReady ? 'is-approved' : 'is-rejected'}`;
        button.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles"></i> Generate Free-Allowance ${mediaType === 'image' ? 'Image' : 'Video'}`;
      } else if (provider === 'google-flow') {
        statusElement.textContent = `The Gemini-directed prompt will be copied and Google Flow will open. Generate with free credits, download the ${mediaType}, then import it here for Gemini verification.`;
        statusElement.className = 'gemini-video-status is-approved';
        button.innerHTML = '<i class="fa-brands fa-google"></i> Copy Prompt & Open Google Flow';
      } else {
        statusElement.className = 'gemini-video-status';
        button.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles"></i> Generate with Gemini ${mediaType === 'image' ? 'Image' : 'Veo'} (Paid)`;
      }
    };

    renderProvider(imageGenerationProvider, geminiImageAccessStatus, triggerGoogleFlowGenBtn, 'image');
    renderProvider(videoGenerationProvider, geminiVideoAccessStatus, triggerGeminiVeoGenBtn, 'video');
  }

  async function refreshGeminiGenerationCapabilities() {
    renderGeminiGenerationCapabilities();
    try {
      const response = await fetch('/api/gemini/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}'
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.valid) throw new Error(payload.error || 'Gemini model discovery failed.');
      uiState.serverCapabilities.geminiGeneration = payload.capabilities || null;
    } catch (error) {
      console.warn('[refreshGeminiGenerationCapabilities] Failed:', error);
      uiState.serverCapabilities.geminiGeneration = {
        image: { available: false, models: [] },
        video: { available: false, models: [] }
      };
    }
    renderGeminiGenerationCapabilities();
    renderGenerationProviderControls();
  }

  function setupEventListeners() {
    // Stepper Navigation
    stepNavBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const stage = parseInt(btn.getAttribute('data-stage'), 10);
        setStage(stage);
      });
    });

    // Next / Back Stage Buttons
    toStage2Btn.addEventListener('click', () => setStage(2));
    backToStage1Btn.addEventListener('click', () => setStage(1));
    toStage3Btn.addEventListener('click', () => setStage(3));
    backToStage2Btn.addEventListener('click', () => setStage(2));
    toStage4Btn.addEventListener('click', () => setStage(4));
    backToStage3Btn.addEventListener('click', () => setStage(3));
    toStage5Btn.addEventListener('click', () => setStage(5));
    backToStage4Btn.addEventListener('click', () => setStage(4));
    startNewProjectFooterBtn.addEventListener('click', () => {
      setStage(1);
      directorPromptInput.focus();
    });

    // Undo / Redo Actions
    undoBtn.addEventListener('click', () => {
      if (ProjectStore.canUndo()) {
        ProjectStore.undo();
        showToast('Undo', 'info');
      }
    });

    redoBtn.addEventListener('click', () => {
      if (ProjectStore.canRedo()) {
        ProjectStore.redo();
        showToast('Redo', 'info');
      }
    });

    // Keyboard Shortcuts (Ctrl+Z / Ctrl+Y)
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && !['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
        if (e.key === 'z' && !e.shiftKey) {
          e.preventDefault();
          if (ProjectStore.canUndo()) {
            ProjectStore.undo();
            showToast('Undo', 'info');
          }
        } else if (e.key === 'y' || (e.shiftKey && e.key === 'Z')) {
          e.preventDefault();
          if (ProjectStore.canRedo()) {
            ProjectStore.redo();
            showToast('Redo', 'info');
          }
        }
      }
    });

    // Stage 1: Script Mode Toggle
    modePromptBtn.addEventListener('click', () => {
      uiState.activeScriptMode = 'prompt';
      modePromptBtn.classList.add('active');
      modeManualBtn.classList.remove('active');
      directorPromptBox.classList.remove('hidden');
      manualScriptBox.classList.add('hidden');
    });

    modeManualBtn.addEventListener('click', () => {
      uiState.activeScriptMode = 'manual';
      modeManualBtn.classList.add('active');
      modePromptBtn.classList.remove('active');
      manualScriptBox.classList.remove('hidden');
      directorPromptBox.classList.add('hidden');
    });

    // Quick Prompt Chips in Stage 1
    document.querySelectorAll('.agent-chips .chip-btn').forEach((chip) => {
      chip.addEventListener('click', () => {
        const prompt = chip.getAttribute('data-prompt');
        if (uiState.currentStage === 4) {
          chatInputArea.value = prompt;
          handleChatSubmit();
        } else {
          directorPromptInput.value = prompt;
          handleStage1Generate();
        }
      });
    });

    generateScriptBtn.addEventListener('click', handleStage1Generate);

    stage1AddBeatBtn.addEventListener('click', () => {
      const manifest = ProjectStore.getManifest();
      const newIdx = manifest.scenes.length + 1;
      ProjectStore.dispatch({
        type: 'ADD_SCENE',
        sceneData: {
          text: 'New narrative scene beat.',
          captionText: 'New narrative scene beat.',
          durationSec: 4.0
        }
      }, `Add Scene #${newIdx}`);
    });

    projectThemeSelect.addEventListener('change', (e) => {
      ProjectStore.dispatch({ type: 'SET_THEME', theme: e.target.value }, `Set theme to ${e.target.value}`);
    });

    projectAspectSelect.addEventListener('change', (e) => {
      ProjectStore.dispatch({ type: 'SET_ASPECT_RATIO', aspectRatio: e.target.value }, `Set aspect ratio to ${e.target.value}`);
    });

    rightsModeSelect.addEventListener('change', (event) => {
      ProjectStore.dispatch({
        type: 'SET_SOURCE_POLICY',
        sourcePolicy: { rightsMode: event.target.value }
      }, `Set media discovery to ${event.target.value}`);
      showToast(event.target.value === 'allow-unknown'
        ? 'Broad discovery enabled. Unknown-rights media requires your review before publishing.'
        : 'Known-rights sourcing enabled.', 'info');
    });

    brandProfileSelect.addEventListener('change', applySelectedBrandProfile);
    saveBrandProfileBtn.addEventListener('click', saveCurrentBrandProfile);

    // Stage 2: Visuals
    stage2RefreshAllBtn.addEventListener('click', refreshAllStockMedia);
    stage2AutoGeminiFallback.addEventListener('change', (event) => {
      saveAutoGeminiFallback(event.target.checked);
      showToast(event.target.checked
        ? 'Gemini will generate only after every tested candidate receives a no.'
        : 'Gemini image fallback is disabled.', 'info');
    });

    // Stage 3: Audio & Voice
    stage3VoiceSelect.addEventListener('change', (e) => {
      const opt = e.target.options[e.target.selectedIndex];
      ProjectStore.dispatch({
        type: 'SET_VOICE_CONFIG',
        voice: { voiceId: e.target.value, voiceName: opt.text }
      }, `Set voice actor to ${opt.text}`);
    });

    stage3VoiceProvider.addEventListener('change', (e) => {
      ProjectStore.dispatch({
        type: 'SET_VOICE_CONFIG',
        voice: { provider: e.target.value }
      }, `Set voice provider to ${e.target.value}`);
    });

    stage3PreviewVoiceBtn.addEventListener('click', () => {
      const text = "Welcome to VidRush Studio. This is a preview of your narrative voiceover actor.";
      TTSEngine.speak(text);
      showToast('Playing voice sample...');
    });

    stage3BgmTrackSelect.addEventListener('change', (e) => {
      const opt = e.target.options[e.target.selectedIndex];
      ProjectStore.dispatch({
        type: 'SET_BGM_CONFIG',
        bgm: { trackId: e.target.value, trackName: opt.text }
      }, `Set BGM to ${opt.text}`);
    });

    stage3BgmVolume.addEventListener('input', (e) => {
      const vol = parseFloat(e.target.value);
      stage3BgmVolDisplay.textContent = `${Math.round(vol * 100)}%`;
      ProjectStore.dispatch({
        type: 'SET_BGM_CONFIG',
        bgm: { volume: vol }
      }, `Set BGM volume to ${Math.round(vol * 100)}%`);
    });

    // Stage 4: Studio Timeline Controls
    geminiChatBtn.addEventListener('click', openGeminiTraceModal);
    closeGeminiTraceBtn.addEventListener('click', closeGeminiTraceModal);
    closeGeminiTraceFooterBtn.addEventListener('click', closeGeminiTraceModal);
    refreshGeminiTraceBtn.addEventListener('click', loadGeminiTrace);
    sendChatBtn.addEventListener('click', handleChatSubmit);
    cancelDirectorBtn.addEventListener('click', async () => {
      const jobId = uiState.activeDirectorJobId || AIRushAgent.getActiveJobId();
      if (!jobId) return;
      cancelDirectorBtn.disabled = true;
      try {
        await AIRushAgent.cancelJob(jobId);
        showToast('Gemini director job cancelled.', 'warning');
      } catch (error) {
        showToast(`Unable to cancel director job: ${error.message}`, 'error');
      }
    });
    chatInputArea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleChatSubmit();
      }
    });

    playPauseBtn.addEventListener('click', () => {
      if (VideoPlayer.getIsPlaying()) {
        VideoPlayer.pause();
        playPauseBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
      } else {
        VideoPlayer.resume();
        playPauseBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
      }
    });

    prevSceneBtn.addEventListener('click', () => VideoPlayer.goToPrevScene());
    nextSceneBtn.addEventListener('click', () => VideoPlayer.goToNextScene());

    volumeSlider.addEventListener('input', (e) => {
      TTSEngine.setVolume(e.target.value);
      playerVideoEl.volume = parseFloat(e.target.value);
    });

    muteToggleBtn.addEventListener('click', () => {
      const isMuted = muteToggleBtn.classList.toggle('muted');
      TTSEngine.setMuted(isMuted);
      playerVideoEl.muted = isMuted;
      muteToggleBtn.innerHTML = isMuted ? '<i class="fa-solid fa-volume-xmark"></i>' : '<i class="fa-solid fa-volume-high"></i>';
    });

    captionPresetSelect.addEventListener('change', (e) => {
      ProjectStore.dispatch({ type: 'SET_CAPTION_STYLE', style: e.target.value }, `Set caption style to ${e.target.value}`);
    });

    toggleCaptionsBtn.addEventListener('click', () => {
      const manifest = ProjectStore.getManifest();
      const nextEnabled = !(manifest.captions?.enabled !== false);
      ProjectStore.dispatch({ type: 'SET_CAPTION_STYLE', enabled: nextEnabled }, `Toggle captions`);
    });

    fullscreenBtn.addEventListener('click', () => {
      const vp = document.getElementById('videoViewport');
      if (!document.fullscreenElement) vp.requestFullscreen().catch(() => {});
      else document.exitFullscreen().catch(() => {});
    });

    inspectorSceneText.addEventListener('input', (e) => {
      const manifest = ProjectStore.getManifest();
      const scene = manifest.scenes[uiState.activeSceneIndex];
      if (scene) {
        ProjectStore.dispatch({
          type: 'REWRITE_SCENE_TEXT',
          sceneId: scene.id,
          text: e.target.value
        }, `Edit script for Scene #${scene.index}`);
      }
    });

    inspectorDurationInput.addEventListener('change', (e) => {
      const manifest = ProjectStore.getManifest();
      const scene = manifest.scenes[uiState.activeSceneIndex];
      if (scene) {
        const durationSec = Math.max(0.5, Math.min(120, parseFloat(e.target.value) || 4));
        ProjectStore.dispatch({
          type: 'SET_SCENE_DURATION',
          sceneId: scene.id,
          durationSec
        }, `Set duration to ${durationSec}s`);
      }
    });

    inspectorPrevSceneBtn.addEventListener('click', () => {
      if (uiState.activeSceneIndex > 0) selectScene(uiState.activeSceneIndex - 1);
    });

    inspectorNextSceneBtn.addEventListener('click', () => {
      const manifest = ProjectStore.getManifest();
      if (uiState.activeSceneIndex < manifest.scenes.length - 1) selectScene(uiState.activeSceneIndex + 1);
    });

    inspectorSearchStockBtn.addEventListener('click', () => {
      const manifest = ProjectStore.getManifest();
      const scene = manifest.scenes[uiState.activeSceneIndex];
      if (scene) openAssetSearchModal(scene);
    });

    inspectorAiGenBtn.addEventListener('click', () => {
      const manifest = ProjectStore.getManifest();
      const scene = manifest.scenes[uiState.activeSceneIndex];
      if (scene) {
        openAssetSearchModal(scene);
        document.querySelector('.search-tab[data-source="gemini-image"]')?.click();
      }
    });

    inspectorUploadBtn.addEventListener('click', () => {
      const manifest = ProjectStore.getManifest();
      const scene = manifest.scenes[uiState.activeSceneIndex];
      if (scene) {
        openAssetSearchModal(scene);
        document.querySelector('.search-tab[data-source="custom-upload"]')?.click();
      }
    });

    inspectorCopyPromptBtn.addEventListener('click', () => {
      const manifest = ProjectStore.getManifest();
      const scene = manifest.scenes[uiState.activeSceneIndex];
      if (scene?.shotDirection?.aiVisualPrompt) {
        navigator.clipboard.writeText(scene.shotDirection.aiVisualPrompt);
        showToast('Copied AI Visual Prompt!', 'success');
      }
    });

    addCustomSceneBtn.addEventListener('click', () => {
      const manifest = ProjectStore.getManifest();
      const newIdx = manifest.scenes.length + 1;
      ProjectStore.dispatch({
        type: 'ADD_SCENE',
        sceneData: { text: 'New narrative scene beat.', durationSec: 4.0 }
      }, `Add Scene #${newIdx}`);
    });

    // Stage 5: Render & Export Hub
    renderMp4MainBtn.addEventListener('click', trigger1080pRender);

    exportSrtBtn.addEventListener('click', () => {
      const srt = Exporter.generateSRT(ProjectStore.getManifest());
      Exporter.downloadFile(srt, 'vidrush_subtitles.srt', 'text/plain');
      showToast('Exported Subtitles (.SRT)!', 'success');
    });

    exportVttBtn.addEventListener('click', () => {
      const vtt = Exporter.generateVTT(ProjectStore.getManifest());
      Exporter.downloadFile(vtt, 'vidrush_subtitles.vtt', 'text/vtt');
      showToast('Exported WebVTT (.VTT)!', 'success');
    });

    exportJsonBtn.addEventListener('click', () => {
      const json = Exporter.generateProjectJSON(ProjectStore.getManifest());
      Exporter.downloadFile(json, 'vidrush_project_manifest.json', 'application/json');
      showToast('Exported Project Manifest (.JSON)!', 'success');
    });

    exportScriptTxtBtn.addEventListener('click', () => {
      const txt = Exporter.generateScriptTXT(ProjectStore.getManifest());
      Exporter.downloadFile(txt, 'vidrush_script.txt', 'text/plain');
      showToast('Exported Production Script (.TXT)!', 'success');
    });

    exportMediaListBtn.addEventListener('click', () => {
      const csv = Exporter.generateMediaCSV(ProjectStore.getManifest());
      Exporter.downloadFile(csv, 'vidrush_media_provenance.csv', 'text/csv');
      showToast('Exported Media Provenance CSV!', 'success');
    });

    openN8nAutomationBtn.addEventListener('click', () => {
      updateN8nAutomationConfigMessage();
      n8nAutomationModal.classList.remove('hidden');
    });

    // Preflight Modal
    closePreflightBtn.addEventListener('click', () => preflightModal.classList.add('hidden'));
    cancelPreflightBtn.addEventListener('click', () => preflightModal.classList.add('hidden'));
    confirmGenerateBtn.addEventListener('click', executeGenerationPipeline);

    // Settings Modal
    settingsBtn.addEventListener('click', openSettingsModal);
    closeSettingsModalBtn.addEventListener('click', () => settingsModal.classList.add('hidden'));
    saveSettingsBtn.addEventListener('click', saveSettingsModal);

    flowQueueBtn.addEventListener('click', openFlowPromptQueue);
    closeFlowQueueBtn.addEventListener('click', () => flowQueueModal.classList.add('hidden'));
    flowQueueMediaType.addEventListener('change', renderFlowPromptQueue);
    flowQueueOnlyUnresolved.addEventListener('change', renderFlowPromptQueue);
    copyFlowQueueBtn.addEventListener('click', copyFlowPromptQueue);
    downloadFlowQueueCsvBtn.addEventListener('click', () => downloadFlowPromptQueue('csv'));
    downloadFlowQueueTxtBtn.addEventListener('click', () => downloadFlowPromptQueue('txt'));
    downloadFlowQueueJsonBtn.addEventListener('click', () => downloadFlowPromptQueue('json'));
    openGoogleFlowQueueBtn.addEventListener('click', () => window.open('https://labs.google/fx/tools/flow', '_blank', 'noopener'));
    bulkImportFlowMediaBtn.addEventListener('click', () => bulkImportFlowMediaInput.click());
    bulkImportFlowMediaInput.addEventListener('change', importFlowMediaBatch);
    flowQueueList.addEventListener('click', async (event) => {
      const copyButton = event.target.closest('[data-flow-copy-index]');
      if (!copyButton) return;
      const item = uiState.flowQueueItems[Number(copyButton.dataset.flowCopyIndex)];
      if (!item) return;
      await copyGenerationPrompt(item.prompt);
      showToast(`${item.fileStem} prompt copied.`, 'success');
    });

    // n8n Publishing Modal
    closeN8nAutomationBtn.addEventListener('click', () => n8nAutomationModal.classList.add('hidden'));
    refreshN8nConfigurationBtn.addEventListener('click', refreshN8nConfiguration);
    refreshN8nStatusBtn.addEventListener('click', refreshN8nAutomationStatus);
    approveN8nPublishingBtn.addEventListener('click', approveN8nPublishing);

    // Asset Search Modal
    modalSearchBtn.addEventListener('click', performModalSearch);
    modalSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') performModalSearch();
    });
    closeAssetModalBtn.addEventListener('click', closeAssetSearchModal);

    document.querySelectorAll('.search-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.search-tab').forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        uiState.modalActiveTab = tab.getAttribute('data-source');
        handleAssetModalTabSwitch();
      });
    });

    customFileInput.addEventListener('change', handleCustomFileUpload);
    triggerGoogleFlowGenBtn.addEventListener('click', generateGeminiImageFromModal);
    applyGoogleFlowAssetBtn.addEventListener('click', applyGeneratedGeminiImage);
    triggerGeminiVeoGenBtn.addEventListener('click', generateGeminiVeoVideoFromModal);
    applyGeminiVeoAssetBtn.addEventListener('click', applyGeneratedGeminiVeoVideo);
    imageGenerationProvider.addEventListener('change', () => {
      localStorage.setItem(IMAGE_GENERATION_PROVIDER_STORAGE_KEY, imageGenerationProvider.value);
      renderGeminiGenerationCapabilities();
      renderGenerationProviderControls();
    });
    videoGenerationProvider.addEventListener('change', () => {
      localStorage.setItem(VIDEO_GENERATION_PROVIDER_STORAGE_KEY, videoGenerationProvider.value);
      renderGeminiGenerationCapabilities();
      renderGenerationProviderControls();
    });
    importGoogleFlowImageBtn.addEventListener('click', () => googleFlowImageImportInput.click());
    importGoogleFlowVideoBtn.addEventListener('click', () => googleFlowVideoImportInput.click());
    googleFlowImageImportInput.addEventListener('change', () => importGeneratedMediaFromFlow(googleFlowImageImportInput, 'image'));
    googleFlowVideoImportInput.addEventListener('change', () => importGeneratedMediaFromFlow(googleFlowVideoImportInput, 'video'));

    newProjectBtn.addEventListener('click', () => {
      uiState.geminiTraceSessionId = '';
      setStage(1);
      directorPromptInput.focus();
      showToast('Type your topic in Stage 1 to begin!');
    });
  }

  // --- Stage 1 Handlers & Render ---

  async function handleStage1Generate() {
    const text = uiState.activeScriptMode === 'prompt' ? directorPromptInput.value.trim() : manualScriptText.value.trim();
    if (!text) {
      showToast('Please enter a topic or paste a script.', 'warning');
      directorPromptInput.focus();
      return;
    }
    uiState.geminiTraceSessionId = createGeminiTraceSessionId();

    const origBtnHtml = generateScriptBtn.innerHTML;
    generateScriptBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Preparing Preflight...';
    generateScriptBtn.disabled = true;

    try {
      const manifest = ProjectStore.getManifest();
      const preflight = await AIDirector.computePreflight(text, {
        format: manifest.metadata?.format,
        theme: manifest.metadata?.theme,
        aspectRatio: manifest.metadata?.aspectRatio,
        voiceProvider: VoiceProvider.isReady() ? 'elevenlabs' : 'windows-sapi'
      });

      uiState.preflightData = {
        promptText: text,
        preflight
      };

      if (quoteTitle) quoteTitle.textContent = preflight.title;
      if (quoteDuration) quoteDuration.textContent = `~${preflight.targetDurationSec}s (${Math.round(preflight.targetDurationSec / 60)} min)`;
      if (quoteScenes) quoteScenes.textContent = `${preflight.estimatedScenes} Scene Beats`;
      if (quoteModel) quoteModel.textContent = preflight.visualModel;
      if (quoteVoice) quoteVoice.textContent = preflight.voice;
      if (quoteCost) quoteCost.textContent = preflight.costLabel;
      renderPreflightWarnings(preflight);

      if (preflightModal) preflightModal.classList.remove('hidden');
    } catch (err) {
      console.error('[handleStage1Generate] Error:', err);
      showToast(`Preflight error: ${err.message}`, 'error');
    } finally {
      generateScriptBtn.innerHTML = origBtnHtml;
      generateScriptBtn.disabled = false;
    }
  }

  function renderPreflightWarnings(preflight) {
    if (!quoteWarnings) return;
    const warnings = Array.isArray(preflight?.warnings) ? preflight.warnings : [];
    if (warnings.length === 0) {
      quoteWarnings.innerHTML = '<div class="preflight-warning-item is-pass"><i class="fa-solid fa-circle-check"></i><div><strong>Production plan looks feasible</strong><small>Provider availability is still measured scene by scene during retrieval.</small></div></div>';
      return;
    }
    quoteWarnings.innerHTML = warnings.map((warning) => `
      <div class="preflight-warning-item">
        <i class="fa-solid fa-triangle-exclamation"></i>
        <div>
          <strong>${escapeHtml(warning.message || 'Production risk detected')}</strong>
          ${warning.fix ? `<small>${escapeHtml(warning.fix)}</small>` : ''}
        </div>
      </div>
    `).join('');
  }

  async function executeGenerationPipeline() {
    preflightModal.classList.add('hidden');
    generationProgressModal.classList.remove('hidden');
    uiState.isProcessing = true;

    try {
      setPipelineStep(1, 'Gemini is creating the narrative direction...');

      const manifest = ProjectStore.getManifest();
      const pipelineOptions = {
        title: uiState.preflightData.preflight.title,
        format: manifest.metadata?.format,
        aspectRatio: manifest.metadata?.aspectRatio,
        theme: manifest.metadata?.theme,
        voiceProvider: VoiceProvider.isReady() ? 'elevenlabs' : 'windows-sapi',
        voiceId: VoiceProvider.getConfig().voiceId,
        inputMode: uiState.activeScriptMode === 'prompt' ? 'topic' : 'script',
        targetDurationSec: uiState.preflightData.preflight.targetDurationSec,
        estimatedScenes: uiState.preflightData.preflight.estimatedScenes,
        forceGeminiDecomposition: true,
        requireGemini: true,
        autoGenerateFallback: isAutoGeminiFallbackEnabled()
      };

      await createDurableGenerationJob(uiState.preflightData.promptText, pipelineOptions, manifest);
      await queueGenerationJobUpdate({
        status: 'running',
        stage: 'narrative',
        progress: 5,
        message: 'Gemini is creating the narrative direction.'
      });

      const generatedManifest = await AIDirector.generateManifest(uiState.preflightData.promptText, {
        ...pipelineOptions,
        onProgress: (stage, details) => {
          queueGenerationJobUpdate(generationCheckpoint(stage, details));
          if (stage === 'narrative') {
            setPipelineStep(1, details.source === 'gemini'
              ? `Gemini created ${details.sceneCount} narration sections.`
              : 'Preparing the narration for Gemini visual direction...');
          } else if (stage === 'segmentation-start' || stage === 'decomposition-start') {
            setPipelineStep(2, 'Gemini is identifying complete narration units that can be visualized...');
          } else if (stage === 'segmentation-complete' || stage === 'decomposition-complete') {
            setPipelineStep(2, details.provider === 'gemini'
              ? `Gemini created ${details.beatCount} complete visualizable narration units.`
              : 'Gemini segmentation was unavailable; using a local emergency split.');
          } else if (stage === 'visual-direction') {
            setPipelineStep(3, `Gemini is creating strict visual contracts and search wording for ${details.beatCount} units...`);
          } else if (stage === 'visual-direction-batch') {
            setPipelineStep(3, `Gemini visual-contract batch ${details.current} of ${details.total} (${details.completedScenes}/${details.totalScenes} units complete)...`);
          } else if (stage === 'segmentation-batch') {
            setPipelineStep(2, `Gemini segmentation batch ${details.current} of ${details.total} (${details.beatCount} visual units so far)...`);
          } else if (stage === 'media-sourcing') {
            setPipelineStep(4, `Finding a matching visual for beat ${details.current} of ${details.total}: ${details.query}`);
          }
        }
      });

      setPipelineStep(5, 'Assembling multi-track video timeline...');
      await delay(400);

      const committedManifest = await ProjectStore.replaceWithGeneratedProject(
        generatedManifest,
        `Generated project "${generatedManifest.metadata.title}"`
      );
      await queueGenerationJobUpdate({
        status: 'completed',
        stage: 'complete',
        progress: 100,
        projectId: committedManifest.id,
        message: `Generated ${committedManifest.scenes?.length || 0} verified scene beats.`,
        result: {
          projectId: committedManifest.id,
          title: committedManifest.metadata?.title || '',
          revision: committedManifest.metadata?.revision || 1,
          sceneCount: committedManifest.scenes?.length || 0
        }
      });

      generationProgressModal.classList.add('hidden');
      uiState.isProcessing = false;
      showToast('Storyboard generated successfully!', 'success');
      setStage(1);
    } catch (err) {
      console.error('Generation error:', err);
      await queueGenerationJobUpdate({
        status: 'failed',
        stage: 'failed',
        message: 'Generation failed.',
        error: err.message || 'Unknown generation error.'
      });
      generationProgressModal.classList.add('hidden');
      uiState.isProcessing = false;
      showToast('Generation encountered an issue: ' + err.message, 'error');
    }
  }

  let generationJobUpdateQueue = Promise.resolve();

  async function createDurableGenerationJob(inputText, options, manifest) {
    uiState.activeGenerationJobId = '';
    generationJobUpdateQueue = Promise.resolve();
    try {
      const response = await fetch('/api/generation/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: manifest?.id || '',
          stage: 'preflight-complete',
          message: 'Preflight approved; generation queued.',
          input: {
            mode: uiState.activeScriptMode,
            text: inputText,
            preflight: uiState.preflightData?.preflight || null
          },
          options
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `Job creation returned HTTP ${response.status}.`);
      uiState.activeGenerationJobId = payload.job?.id || '';
      return payload.job || null;
    } catch (error) {
      console.warn('[GenerationJob] Durable job creation failed; generation will continue:', error.message);
      return null;
    }
  }

  function queueGenerationJobUpdate(patch) {
    const jobId = uiState.activeGenerationJobId;
    if (!jobId || !patch) return Promise.resolve(null);
    generationJobUpdateQueue = generationJobUpdateQueue
      .catch(() => null)
      .then(async () => {
        const response = await fetch(`/api/generation/jobs/${encodeURIComponent(jobId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch)
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || `Job update returned HTTP ${response.status}.`);
        }
        return response.json();
      })
      .catch((error) => {
        console.warn('[GenerationJob] Checkpoint save failed:', error.message);
        return null;
      });
    return generationJobUpdateQueue;
  }

  function generationCheckpoint(stage, details = {}) {
    const batchFraction = Number(details.total) > 0
      ? Math.max(0, Math.min(1, Number(details.current || 0) / Number(details.total)))
      : 0;
    const sceneFraction = Number(details.totalScenes) > 0
      ? Math.max(0, Math.min(1, Number(details.completedScenes || details.current || 0) / Number(details.totalScenes)))
      : batchFraction;
    const checkpoints = {
      narrative: { progress: 18, message: `Narrative ready with ${details.sceneCount || 0} sections.` },
      'segmentation-start': { progress: 22, message: 'Gemini started atomic script segmentation.' },
      'decomposition-start': { progress: 22, message: 'Gemini started atomic script segmentation.' },
      'segmentation-batch': { progress: 22 + (sceneFraction * 18), message: `Segmenting narration batch ${details.current || 1} of ${details.total || 1}.` },
      'segmentation-complete': { progress: 40, message: `Gemini created ${details.beatCount || 0} visual beats.` },
      'decomposition-complete': { progress: 40, message: `Gemini created ${details.beatCount || 0} visual beats.` },
      'visual-direction': { progress: 44, message: `Creating visual contracts for ${details.beatCount || 0} beats.` },
      'visual-direction-batch': { progress: 44 + (batchFraction * 20), message: `Visual-contract batch ${details.current || 1} of ${details.total || 1}.` },
      'media-sourcing': { progress: 64 + (batchFraction * 30), message: `Sourcing and verifying scene ${details.current || 1} of ${details.total || 1}.` }
    };
    const checkpoint = checkpoints[stage] || { progress: 10, message: String(stage || 'Generation in progress.') };
    return {
      status: 'running',
      stage: String(stage || 'running'),
      progress: Math.round(checkpoint.progress),
      message: checkpoint.message,
      detail: details
    };
  }

  function setPipelineStep(stepNum, statusText) {
    [stageStep1, stageStep2, stageStep3, stageStep4, stageStep5].forEach((el, idx) => {
      const stepIndex = idx + 1;
      el.classList.toggle('completed', stepIndex < stepNum);
      el.classList.toggle('active', stepIndex === stepNum);
    });
    generationProgressSubtitle.textContent = statusText;
  }

  function renderStage1Beats(manifest) {
    const scenes = manifest.scenes || [];
    const decompositionProvider = manifest.metadata?.decomposition?.provider;
    stage1BeatCount.textContent = scenes.length;
    if (stage1DecompositionBadge) {
      const usedGemini = decompositionProvider === 'gemini' || decompositionProvider === 'gemini-client';
      stage1DecompositionBadge.textContent = usedGemini ? 'Gemini Decomposed' : scenes.length ? 'Needs Gemini Re-plan' : 'Awaiting Gemini';
      stage1DecompositionBadge.classList.toggle('badge-success', usedGemini);
    }
    stage1BeatsList.innerHTML = '';

    if (scenes.length === 0) {
      stage1BeatsList.innerHTML = `
        <div class="empty-state-card">
          <i class="fa-solid fa-file-lines empty-icon"></i>
          <h4>No Script Beats Yet</h4>
          <p>Type a topic on the left and click <strong>Generate & Dissect Script Beats</strong> to build your narrative.</p>
        </div>
      `;
      return;
    }

    scenes.forEach((scene) => {
      const plan = scene.shotDirection || {};
      const primaryQuery = plan.searchQueries?.[0] || 'Gemini has not selected a query yet';
      const planIsStale = Boolean(plan.needsReplan);
      const row = document.createElement('div');
      row.className = `beat-row-card ${planIsStale ? 'scene-plan-stale' : ''}`;
      row.innerHTML = `
        <div class="beat-num-badge">#${scene.index}</div>
        <div class="beat-content-col">
          <textarea class="beat-text-input" rows="2">${scene.text}</textarea>
          <div class="beat-meta-row">
            <span><i class="fa-regular fa-clock"></i> ${scene.durationSec}s</span>
            <span><i class="fa-solid fa-camera"></i> ${plan.shotType || 'Cinematic Shot'}</span>
            <span class="gemini-plan-tag"><i class="fa-brands fa-google"></i> Gemini: ${formatVisualType(plan.visualType)}</span>
          </div>
          <div class="beat-plan-summary">
            <span>${planIsStale ? 'Script changed — re-plan this visual with Gemini.' : (plan.visualIntent || 'Gemini is preparing a visual brief for this beat.')}</span>
            <code title="${primaryQuery}">${primaryQuery}</code>
          </div>
        </div>
        <div class="beat-row-actions">
          <button class="btn btn-secondary btn-sm gemini-replan-btn" title="Have Gemini re-plan the visual and find a matching asset">
            <i class="fa-brands fa-google"></i> ${planIsStale ? 'Re-plan' : 'Gemini Plan'}
          </button>
          <button class="beat-delete-btn" title="Delete Beat"><i class="fa-solid fa-trash"></i></button>
        </div>
      `;

      const input = row.querySelector('.beat-text-input');
      input.addEventListener('change', (e) => {
        ProjectStore.dispatch({
          type: 'REWRITE_SCENE_TEXT',
          sceneId: scene.id,
          text: e.target.value
        }, `Edit script for Beat #${scene.index}`);
      });

      row.querySelector('.gemini-replan-btn').addEventListener('click', (event) => {
        replanSceneWithGemini(scene.id, event.currentTarget);
      });

      const delBtn = row.querySelector('.beat-delete-btn');
      delBtn.addEventListener('click', () => {
        ProjectStore.dispatch({
          type: 'REMOVE_SCENE',
          sceneId: scene.id
        }, `Remove Beat #${scene.index}`);
      });

      stage1BeatsList.appendChild(row);
    });
  }

  // --- Stage 2: Visual Sourcing Render ---

  function renderStage2Visuals(manifest) {
    const scenes = manifest.scenes || [];
    stage2VisualsGrid.innerHTML = '';

    if (scenes.length === 0) {
      stage2VisualsGrid.innerHTML = '<p class="text-muted" style="grid-column: 1/-1; text-align: center; padding: 40px;">No scenes found. Generate your script in Stage 1 first.</p>';
      return;
    }

    stage2VisualsGrid.innerHTML = `
      <div class="scene-plan-table-header" role="row">
        <span role="columnheader">Script Chunk</span>
        <span role="columnheader">Gemini Visual Search</span>
        <span role="columnheader">Selected Visual</span>
      </div>
    `;

    scenes.forEach((scene) => {
      const card = document.createElement('div');
      const plan = scene.shotDirection || {};
      const primaryQuery = plan.searchQueries?.[0] || 'Gemini has not selected a query yet';
      const planIsStale = Boolean(plan.needsReplan);
      card.className = `scene-visual-card ${planIsStale ? 'scene-plan-stale' : ''}`;
      const visual = scene.visual || {};
      const hasVisualPreview = Boolean(visual.thumbnail || visual.url);
      const verification = visual.visualVerification || {};
      const placementOnly = verification.placementOnly === true;
      const selectionStatus = visual.selectionStatus === 'UNVERIFIED'
        ? 'UNRESOLVED'
        : visual.selectionStatus || (visual.generatedBy === 'gemini' ? 'GENERATED' : visual.type === 'placeholder' ? 'UNRESOLVED' : 'MANUAL');
      const selectionLabels = {
        VERIFIED: placementOnly ? 'User Approved · Gemini Placed' : 'Gemini Verified',
        GENERATED: 'Gemini Generated',
        MANUAL: 'Manual Override',
        UNRESOLVED: 'Needs Review'
      };
      const candidateReviews = scene.visualCandidates || [];
      const hasReviewedCandidates = candidateReviews.some((candidate) => candidate.visualVerification?.previewAnalyzed);
      const requiresVisionVerification = candidateReviews.some((candidate) => candidate.requiresVisionVerification);
      const hasStrongCandidate = candidateReviews.some((candidate) => candidate.visualVerification?.eligible === true && candidate.visualVerification?.verdict === 'strong-match');
      const geminiYesCount = candidateReviews.filter((candidate) => candidate.visualVerification?.answer === 'yes').length;
      const geminiNoCount = candidateReviews.filter((candidate) => candidate.visualVerification?.answer === 'no').length;
      const geminiNotTestedCount = candidateReviews.filter((candidate) => !['yes', 'no'].includes(candidate.visualVerification?.answer)).length;
      const auditSummary = candidateReviews.length === 0
        ? 'no candidates'
        : `${geminiYesCount} yes / ${geminiNoCount} no${geminiNotTestedCount ? ` / ${geminiNotTestedCount} not tested` : ''}`;
      const allCandidatesRejected = candidateReviews.length > 0 && candidateReviews.every((candidate) => candidate.visualVerification?.previewAnalyzed === true && candidate.visualVerification?.answer === 'no');
      const verificationLabel = placementOnly
        ? 'Gemini content placement'
        : verification.previewAnalyzed
        ? (verification.verdict === 'strong-match' ? 'Gemini preview match' : verification.verdict === 'reject' ? 'Gemini rejected preview' : 'Gemini preview checked')
        : '';
      const mediaMarkup = !hasVisualPreview
        ? `<div class="media-pending"><i class="fa-solid fa-wand-magic-sparkles"></i><span>${(hasReviewedCandidates || requiresVisionVerification) && !hasStrongCandidate ? 'No approved visual match' : 'No matching media yet'}</span><small>${allCandidatesRejected ? 'Gemini copied and checked every candidate, then answered no to all of them.' : (hasReviewedCandidates || requiresVisionVerification) && !hasStrongCandidate ? 'Gemini could not approve the available copied-media candidates. See the audit below.' : 'Search stock or generate an asset'}</small></div>`
        : visual.type === 'video'
          ? `<video class="scene-video-preview" src="${visual.url}" poster="${visual.thumbnail || ''}" controls muted loop playsinline preload="metadata"></video>`
          : `<img src="${visual.thumbnail || visual.url}" alt="Scene Visual" onerror="this.remove();">`;

      card.innerHTML = `
        <div class="visual-card-top">
          <strong>Scene #${scene.index}</strong>
          <span class="badge badge-sm">${plan.shotType || 'Cinematic Shot'}</span>
        </div>
        <div class="visual-card-media">
          ${mediaMarkup}
          <span class="visual-media-type-tag">${visual.type === 'video' ? 'Video HD' : visual.generatedBy === 'gemini' ? 'Gemini Image' : hasVisualPreview ? 'Photo 4K' : 'Needs Media'}</span>
          <span class="visual-selection-status selection-status-${selectionStatus.toLowerCase()}">${selectionLabels[selectionStatus] || 'Needs Review'}</span>
          ${verificationLabel ? `<span class="gemini-preview-status gemini-preview-${verification.verdict}"><i class="fa-brands fa-google"></i> ${verificationLabel}</span>` : ''}
        </div>
        <div class="visual-card-script-box">"${scene.text}"</div>
        <div class="gemini-plan-panel">
          <div class="gemini-plan-heading">
            <span><i class="fa-brands fa-google"></i> Gemini Visual Brief</span>
            <span class="gemini-plan-type">${formatVisualType(plan.visualType)}</span>
          </div>
          <p>${planIsStale ? 'Script changed — run Gemini Plan before choosing media.' : (plan.visualIntent || 'Gemini will choose a precise visual for this narration beat.')}</p>
          <code title="${primaryQuery}"><i class="fa-solid fa-magnifying-glass"></i> ${primaryQuery}</code>
        </div>
        <div class="visual-card-candidates">
          <span class="chips-label">Candidates (clicking makes a manual override):</span>
          <div class="candidates-strip"></div>
          <details class="gemini-media-audit" open>
            <summary><i class="fa-brands fa-google"></i> Gemini Original-Media Audit <span>${auditSummary} &middot; ${candidateReviews.length} candidates</span></summary>
            <div class="gemini-media-audit-rows"></div>
          </details>
        </div>
        <div class="visual-card-actions">
          <button class="btn btn-accent btn-sm gemini-replan-btn"><i class="fa-brands fa-google"></i> ${planIsStale ? 'Re-plan' : 'Gemini Plan'}</button>
          <button class="btn btn-secondary btn-sm search-stock-btn"><i class="fa-solid fa-magnifying-glass"></i> Search Stock</button>
          <button class="btn btn-secondary btn-sm ai-gen-btn"><i class="fa-brands fa-google" style="color: #4285f4;"></i> Gemini Image</button>
          <button class="btn btn-secondary btn-sm ai-video-btn"><i class="fa-solid fa-film" style="color: #4285f4;"></i> Gemini Video</button>
          <button class="btn btn-secondary btn-sm upload-btn"><i class="fa-solid fa-upload"></i> Upload</button>
        </div>
      `;

      // Populate Candidate Thumbnails
      const strip = card.querySelector('.candidates-strip');
      (scene.visualCandidates || []).slice(0, 4).forEach((cand) => {
        const thumb = document.createElement('div');
        const candidateChecked = Boolean(cand.visualVerification?.previewAnalyzed);
        const candidateApproved = cand.visualVerification?.eligible === true && cand.visualVerification?.verdict === 'strong-match';
        const geminiAnswer = cand.visualVerification?.answer;
        const candidatePlacementOnly = cand.visualVerification?.placementOnly === true;
        const candidateLabel = candidatePlacementOnly ? 'User approved · Gemini placed' : candidateApproved ? 'Gemini said yes' : geminiAnswer === 'no' ? 'Gemini said no' : candidateChecked ? 'Gemini rejected' : 'Not reviewed';
        thumb.className = `candidate-mini-thumb ${cand.url === visual.url ? 'active' : ''} ${candidateChecked ? 'gemini-preview-reviewed' : ''} ${candidateApproved ? 'candidate-approved' : 'candidate-unapproved'}`;
        thumb.title = candidateChecked
          ? `${cand.visualVerification?.eligibilityQuestion || 'Gemini reviewed this visual.'}\n\n${candidateLabel}: ${cand.visualVerification?.reason || 'See scene review details.'}`
          : 'This preview was not reviewed by Gemini.';
        thumb.innerHTML = `<img src="${cand.thumbnail || cand.url}" alt="Candidate" onerror="this.remove();"><span class="candidate-review-label">${candidateApproved ? '✓' : candidateChecked ? '!' : '?'}</span>`;
        thumb.addEventListener('click', () => {
          if (!candidateApproved) {
            showToast('Gemini did not approve this candidate, so it cannot be applied.', 'warning');
            return;
          }
          ProjectStore.dispatch({
            type: 'REPLACE_VISUAL',
            sceneId: scene.id,
            asset: cand,
            selectionStatus: 'VERIFIED'
          }, `Swap Scene #${scene.index} visual`);
          showToast(`Applied Gemini-verified visual to Scene #${scene.index}.`, 'success');
        });
        strip.appendChild(thumb);
      });

      const auditRows = card.querySelector('.gemini-media-audit-rows');
      if (candidateReviews.length === 0) {
        const emptyAudit = document.createElement('p');
        emptyAudit.className = 'gemini-media-audit-empty';
        emptyAudit.textContent = 'No stock candidates were returned, so there was no original media file to inspect.';
        auditRows.appendChild(emptyAudit);
      } else {
        candidateReviews.forEach((candidate, candidateIndex) => {
          const review = candidate.visualVerification || {};
          const placementOnly = review.placementOnly === true;
          const answer = review.answer === 'yes' ? 'YES' : review.answer === 'no' ? 'NO' : 'NOT TESTED';
          const auditRow = document.createElement('article');
          auditRow.className = `gemini-media-audit-row audit-${answer.toLowerCase().replace(/\s+/g, '-')}`;

          const heading = document.createElement('strong');
          heading.textContent = placementOnly
            ? `Candidate ${candidateIndex + 1}: User approved · Gemini placed`
            : `Candidate ${candidateIndex + 1}: Gemini ${answer}`;
          const evidence = document.createElement('span');
          evidence.textContent = placementOnly
            ? `Uploaded media inspected for placement from ${review.reviewedFrameCount || 1} pixel ${review.reviewedFrameCount === 1 ? 'view' : 'views'}.`
            : candidate.generatedBy === 'gemini'
            ? 'Gemini-generated asset reviewed from its local generated file.'
            : review.originalMediaCopied === true
            ? `Original ${candidate.type === 'video' ? 'video' : 'image'} copied; ${review.reviewedFrameCount || 0} frame${review.reviewedFrameCount === 1 ? '' : 's'} inspected.`
            : 'Original media was not copied; Gemini did not approve it.';
          const question = document.createElement('p');
          question.textContent = placementOnly
            ? 'Placement-only analysis; the user approved this media before upload.'
            : review.eligibilityQuestion || 'Gemini eligibility question was not created.';
          const reason = document.createElement('small');
          reason.textContent = review.reason || review.reviewError || 'Awaiting Gemini review.';

          auditRow.append(heading, evidence, question, reason);
          auditRows.appendChild(auditRow);
        });
      }

      card.querySelector('.search-stock-btn').addEventListener('click', () => openAssetSearchModal(scene));
      card.querySelector('.gemini-replan-btn').addEventListener('click', (event) => {
        replanSceneWithGemini(scene.id, event.currentTarget);
      });
      card.querySelector('.ai-gen-btn').addEventListener('click', () => {
        openAssetSearchModal(scene);
        document.querySelector('.search-tab[data-source="gemini-image"]')?.click();
      });
      card.querySelector('.ai-video-btn').addEventListener('click', () => {
        openAssetSearchModal(scene);
        document.querySelector('.search-tab[data-source="gemini-veo-video"]')?.click();
      });
      card.querySelector('.upload-btn').addEventListener('click', () => {
        openAssetSearchModal(scene);
        document.querySelector('.search-tab[data-source="custom-upload"]')?.click();
      });

      stage2VisualsGrid.appendChild(card);
    });
  }

  // --- Stage 3: Audio & Voice Render ---

  function renderStage3Audio(manifest) {
    const scenes = manifest.scenes || [];
    stage3BgmTrackSelect.value = manifest.audio?.backgroundMusic?.trackId || 'ambient-cinematic';
    stage3BgmVolume.value = manifest.audio?.backgroundMusic?.volume || 0.15;
    stage3BgmVolDisplay.textContent = `${Math.round((manifest.audio?.backgroundMusic?.volume || 0.15) * 100)}%`;

    stage3AudioSceneList.innerHTML = '';
    scenes.forEach((scene) => {
      const row = document.createElement('div');
      row.className = 'audio-scene-row';
      row.innerHTML = `
        <div>
          <strong>Scene #${scene.index} (${scene.durationSec}s)</strong>
          <span style="display: block; color: var(--text-secondary); margin-top: 2px;">"${scene.text.slice(0, 70)}..."</span>
        </div>
        <button class="btn btn-secondary btn-sm play-scene-audio-btn">
          <i class="fa-solid fa-play"></i> Listen
        </button>
      `;

      row.querySelector('.play-scene-audio-btn').addEventListener('click', () => {
        TTSEngine.speak(scene.text);
        showToast(`Playing Scene #${scene.index} narration...`);
      });

      stage3AudioSceneList.appendChild(row);
    });
  }

  // --- Stage 4: Studio Timeline & Rush Copilot ---

  async function handleChatSubmit() {
    const text = chatInputArea.value.trim();
    if (!text || uiState.isProcessing) return;

    chatInputArea.value = '';
    appendChatMessage('user', text);

    let manifest = ProjectStore.getManifest();
    sendChatBtn.disabled = true;
    chatInputArea.disabled = true;
    cancelDirectorBtn.disabled = false;
    showToast('Gemini is planning a video-use timeline edit...');

    try {
      await ProjectStore.saveNow('Before Gemini director request');
      manifest = ProjectStore.getManifest();
      const response = await AIRushAgent.parseCommand(text, manifest, uiState.activeSceneIndex, {
        onJobCreated(job) {
          uiState.activeDirectorJobId = job.id;
          cancelDirectorBtn.classList.remove('hidden');
        }
      });
      appendChatMessage('bot', response.replyText);
      if (response.requiresConfirmation && (response.action || response.actions?.length)) {
        appendTimelineProposal(response, Number(response.baseRevision || manifest.metadata?.revision || 1));
        showToast('Gemini proposal ready. Review it before applying.', 'success');
      }
    } catch (error) {
      const cancelled = error.code === 'DIRECTOR_CANCELLED';
      appendChatMessage('bot', cancelled ? 'Director job cancelled. The timeline was not changed.' : `I could not prepare that timeline edit: ${error.message}`);
      showToast(cancelled ? 'Director job cancelled.' : `Gemini timeline edit failed: ${error.message}`, cancelled ? 'warning' : 'error');
    } finally {
      uiState.activeDirectorJobId = '';
      sendChatBtn.disabled = false;
      chatInputArea.disabled = false;
      cancelDirectorBtn.disabled = false;
      cancelDirectorBtn.classList.add('hidden');
      chatInputArea.focus();
    }
  }

  function selectScene(index) {
    const manifest = ProjectStore.getManifest();
    if (index < 0 || index >= manifest.scenes.length) return;
    uiState.activeSceneIndex = index;
    renderSceneInspector(index);
    VisualTimeline.updatePlayhead(index);
  }

  function renderSceneInspector(index) {
    const manifest = ProjectStore.getManifest();
    const scene = manifest.scenes[index];
    if (!scene) {
      inspectorEmptyState.classList.remove('hidden');
      inspectorActiveScene.classList.add('hidden');
      return;
    }

    inspectorEmptyState.classList.add('hidden');
    inspectorActiveScene.classList.remove('hidden');

    inspectorSceneNumberBadge.textContent = `Scene #${scene.index} / ${manifest.scenes.length}`;
    inspectorShotTypeBadge.textContent = scene.shotDirection?.shotType || 'Cinematic Shot';
    inspectorDirectorReasoning.textContent = scene.shotDirection?.directorReasoning || 'Cinematic framing creates narrative momentum.';
    inspectorSceneText.value = scene.text;
    inspectorWordCount.textContent = `${scene.text.split(/\s+/).filter(Boolean).length} words`;
    inspectorDurationInput.value = scene.durationSec || 4.0;

    const visual = scene.visual;
    if (visual) {
      inspectorMediaThumb.onerror = function() {
        this.onerror = null;
        this.removeAttribute('src');
      };
      if (visual.thumbnail || visual.url) inspectorMediaThumb.src = visual.thumbnail || visual.url;
      else inspectorMediaThumb.removeAttribute('src');
      inspectorMediaTypePill.textContent = visual.type === 'video' ? 'Video HD' : visual.type === 'placeholder' ? 'Needs Media' : 'Photo 4K';
      inspectorMediaSourceTitle.textContent = visual.title || visual.source || 'Stock';
    }

    inspectorCandidatesGrid.innerHTML = '';
    (scene.visualCandidates || []).slice(0, 6).forEach((cand) => {
      const card = document.createElement('div');
      const candidateApproved = isGeminiVerifiedMedia(cand);
      card.className = `candidate-card ${cand.url === visual?.url ? 'active' : ''}`;
      card.innerHTML = `<img src="${cand.thumbnail || cand.url}" alt="Candidate" onerror="this.remove();">`;
      card.addEventListener('click', () => {
        if (!candidateApproved) {
          showToast('Gemini did not approve this candidate, so it cannot be applied.', 'warning');
          return;
        }
        ProjectStore.dispatch({
          type: 'REPLACE_VISUAL',
          sceneId: scene.id,
          asset: cand,
          selectionStatus: 'VERIFIED'
        }, `Swap Scene #${scene.index} visual`);
        showToast('Scene visual updated with a Gemini-verified candidate!', 'success');
      });
      inspectorCandidatesGrid.appendChild(card);
    });
  }

  // --- Stage 5: Render & Export Hub ---

  function renderStage5Hub(manifest) {
    const hasScenes = manifest.scenes && manifest.scenes.length > 0;
    renderMp4MainBtn.disabled = !hasScenes;
  }

  async function trigger1080pRender() {
    const manifest = ProjectStore.getManifest();
    if (!manifest.scenes || manifest.scenes.length === 0) {
      showToast('Generate a storyboard before rendering.', 'warning');
      return;
    }
    const unverifiedScenes = manifest.scenes.filter((scene) => !isGeminiVerifiedMedia(scene.visual));
    if (unverifiedScenes.length > 0) {
      showToast(`Render blocked: ${unverifiedScenes.length} scene(s) still need a Gemini-approved visual.`, 'warning');
      return;
    }

    renderHubInitialBox.classList.add('hidden');
    renderHubProgressBox.classList.remove('hidden');
    renderHubSuccessBox.classList.add('hidden');
    renderHubStatusText.textContent = 'FFmpeg is downloading media, synthesizing narration & mixing background music with ducking...';

    try {
      const renderResult = await Exporter.renderMp4Video(manifest, (msg) => {
        renderHubStatusText.textContent = msg;
      });

      renderHubProgressBox.classList.add('hidden');
      renderHubSuccessBox.classList.remove('hidden');

      renderedVideoPreviewEl.src = renderResult.downloadUrl;
      renderedDurationLabel.innerHTML = `<i class="fa-regular fa-clock"></i> ${renderResult.durationSeconds}s`;
      downloadRenderedMp4Link.href = renderResult.downloadUrl;
      downloadRenderedMp4Link.download = `${(manifest.metadata.title || 'video').replace(/[^\w\s-]/g, '').replace(/\s+/g, '_')}_1080p.mp4`;

      copyVideoLinkBtn.onclick = () => {
        const fullUrl = window.location.origin + renderResult.downloadUrl;
        navigator.clipboard.writeText(fullUrl);
        showToast('Video URL copied to clipboard!', 'success');
      };

      applyN8nAutomationState(renderResult.automation, renderResult.renderId);

      showToast('1080p MP4 rendered successfully!', 'success');
    } catch (err) {
      console.error('Render error:', err);
      renderHubStatusText.textContent = 'Render Error: ' + err.message;
      showToast('Render failed: ' + err.message, 'error');
    }
  }

  // --- Stock Refresh & Modals ---

  async function replanSceneWithGemini(sceneId, button) {
    const manifest = ProjectStore.getManifest();
    const scene = manifest.scenes.find((item) => item.id === sceneId);
    if (!scene) return;

    const originalLabel = button?.innerHTML;
    if (button) {
      button.disabled = true;
      button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Planning';
    }
    showToast(`Gemini is planning Scene #${scene.index}...`);

    try {
      const fullScript = manifest.scenes.map((item) => item.text).join(' ');
      const plan = await AIDirector.generateShotDirection(scene.text, fullScript);
      const query = plan.searchQueries?.[0] || scene.text;
      const media = await StockAPI.searchMedia(query, 'all', {
        sceneIndex: scene.index - 1,
        sceneText: scene.text,
        searchQueries: plan.searchQueries || [query],
        visualType: plan.visualType,
        visualIntent: plan.visualIntent,
        candidateAcceptanceTest: plan.candidateAcceptanceTest,
        aiVisualPrompt: plan.aiVisualPrompt,
        autoGenerateFallback: isAutoGeminiFallbackEnabled()
      });

      const selectedMedia = StockAPI.selectBestMatch(media, query);
      const hasApprovedMatch = selectedMedia.type !== 'placeholder';
      ProjectStore.dispatch({
        type: 'REPLACE_VISUAL',
        sceneId: scene.id,
        asset: selectedMedia,
        visualCandidates: media,
        shotDirection: { ...plan, needsReplan: false }
      }, `Gemini re-planned Scene #${scene.index}`);

      showToast(hasApprovedMatch
        ? selectedMedia.generatedBy === 'gemini'
          ? `Gemini generated a fallback visual for Scene #${scene.index}.`
          : `Gemini planned and matched Scene #${scene.index}!`
        : `Gemini rejected the available stock previews for Scene #${scene.index}; choose another candidate or generate an asset.`, hasApprovedMatch ? 'success' : 'warning');
    } catch (error) {
      console.error('[replanSceneWithGemini] Error:', error);
      showToast(`Gemini could not re-plan Scene #${scene.index}: ${error.message}`, 'error');
    } finally {
      if (button?.isConnected) {
        button.disabled = false;
        button.innerHTML = originalLabel;
      }
    }
  }

  async function refreshAllStockMedia() {
    const manifest = ProjectStore.getManifest();
    if (manifest.scenes.length === 0) return;
    showToast('Refreshing stock media for all scenes...');

    const actions = [];
    let approvedCount = 0;
    let unresolvedCount = 0;
    for (let i = 0; i < manifest.scenes.length; i++) {
      const s = manifest.scenes[i];
      const plan = s.shotDirection?.needsReplan
        ? await AIDirector.generateShotDirection(s.text, manifest.scenes.map((scene) => scene.text).join(' '))
        : s.shotDirection;
      const query = plan?.searchQueries?.[0] || s.text;
      const results = await StockAPI.searchMedia(query, 'all', {
        sceneIndex: i,
        sceneText: s.text,
        searchQueries: plan?.searchQueries || [query],
        visualType: plan?.visualType,
        visualIntent: plan?.visualIntent,
        candidateAcceptanceTest: plan?.candidateAcceptanceTest,
        aiVisualPrompt: plan?.aiVisualPrompt,
        autoGenerateFallback: isAutoGeminiFallbackEnabled()
      });
      const selectedMedia = StockAPI.selectBestMatch(results, query);
      if (selectedMedia.type === 'placeholder') unresolvedCount += 1;
      else approvedCount += 1;
      actions.push({
        type: 'REPLACE_VISUAL',
        sceneId: s.id,
        asset: selectedMedia,
        visualCandidates: results,
        shotDirection: { ...plan, needsReplan: false }
      });
    }

    if (actions.length > 0) {
      ProjectStore.dispatch({
        type: 'BATCH_ACTION',
        actions
      }, 'Refresh all stock media');
      showToast(unresolvedCount > 0
        ? `${approvedCount} scenes approved; ${unresolvedCount} scenes need a new search or Gemini image.`
        : 'All stock media refreshed with Gemini-approved matches!', unresolvedCount > 0 ? 'warning' : 'success');
    }
  }

  function openAssetSearchModal(scene) {
    uiState.generatedVideoJobToken = null;
    uiState.activeModalSceneId = scene.id;
    modalSceneNumBadge.textContent = `Scene #${scene.index}`;
    modalSearchInput.value = scene.shotDirection?.searchQueries?.[0] || scene.text.slice(0, 30);
    googleFlowPromptInput.value = scene.shotDirection?.aiVisualPrompt || `Create one 16:9 visual that literally depicts: ${scene.text.slice(0, 120)}`;
    geminiVeoPromptInput.value = (scene.shotDirection?.aiVisualPrompt || scene.shotDirection?.visualIntent || scene.text)
      .replace(/\s*--ar\s+\d+:\d+/gi, '');
    generatedAiPromptText.textContent = scene.shotDirection?.aiVisualPrompt || `Cinematic 8k shot --ar 16:9`;
    googleFlowAiResultBox.classList.add('hidden');
    uiState.generatedModalAsset = null;
    geminiImageVerificationText.textContent = '';
    geminiImageVerificationText.className = 'gemini-video-verification';
    applyGoogleFlowAssetBtn.disabled = true;
    resetGeminiVeoModalState();
    renderGeminiGenerationCapabilities();
    renderGenerationProviderControls();

    assetSearchModal.classList.remove('hidden');
    performModalSearch();
  }

  function closeAssetSearchModal() {
    uiState.generatedVideoJobToken = null;
    assetSearchModal.classList.add('hidden');
  }

  function resetGeminiVeoModalState() {
    uiState.generatedVideoModalAsset = null;
    geminiVeoResultBox.classList.add('hidden');
    geminiVeoGeneratedVideo.pause();
    geminiVeoGeneratedVideo.removeAttribute('src');
    geminiVeoGeneratedVideo.load();
    geminiVeoVerificationText.textContent = '';
    geminiVeoVerificationText.className = 'gemini-video-verification';
    geminiVeoJobStatus.textContent = 'Veo jobs can take a few minutes. Keep this dialog open while it checks the job.';
    geminiVeoJobStatus.className = 'gemini-video-status';
    triggerGeminiVeoGenBtn.disabled = false;
    triggerGeminiVeoGenBtn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Generate & Verify Video';
    applyGeminiVeoAssetBtn.disabled = true;
  }

  async function performModalSearch() {
    const query = modalSearchInput.value.trim();
    if (!query) return;

    modalMediaResultsGrid.innerHTML = '<div class="media-verification-loading"><div class="spinner"></div><p>Copying original media files and waiting for Gemini yes/no answers&hellip;</p></div>';
    const filter = uiState.modalActiveTab === 'video' ? 'video' : uiState.modalActiveTab === 'image' ? 'image' : 'all';
    const manifest = ProjectStore.getManifest();
    const scene = manifest.scenes.find((s) => s.id === uiState.activeModalSceneId);
    const sceneIdx = scene ? scene.index - 1 : 0;

    const results = await StockAPI.searchMedia(query, filter, {
      sceneIndex: sceneIdx,
      sceneText: scene ? scene.text : query,
      searchQueries: scene?.shotDirection?.searchQueries || [query],
      visualType: scene?.shotDirection?.visualType,
      visualIntent: scene?.shotDirection?.visualIntent,
      candidateAcceptanceTest: scene?.shotDirection?.candidateAcceptanceTest,
      aiVisualPrompt: scene?.shotDirection?.aiVisualPrompt,
      autoGenerateFallback: isAutoGeminiFallbackEnabled()
    });

    modalMediaResultsGrid.innerHTML = '';
    if (results.length === 0) {
      modalMediaResultsGrid.innerHTML = '<p class="text-muted" style="grid-column: 1/-1; text-align: center;">No media found. Try broader keywords or generate with AI.</p>';
      return;
    }

    results.forEach((media) => {
      const itemEl = document.createElement('div');
      itemEl.className = 'modal-media-item';
      itemEl.innerHTML = `
        <img src="${media.thumbnail || media.url}" alt="${media.title}">
        <span class="media-type-badge">${media.type === 'video' ? 'Video' : 'Photo'}</span>
        <span class="media-source-label">${media.title || media.source}</span>
      `;

      itemEl.addEventListener('click', () => {
        if (scene) {
          if (!isGeminiVerifiedMedia(media)) {
            showToast('Gemini did not approve this search result, so it cannot be applied.', 'warning');
            return;
          }
          ProjectStore.dispatch({
            type: 'REPLACE_VISUAL',
            sceneId: scene.id,
            asset: media,
            selectionStatus: 'VERIFIED'
          }, `Set Scene #${scene.index} visual to "${media.title || media.source}"`);

          closeAssetSearchModal();
          showToast(`Applied media to Scene #${scene.index}!`, 'success');
        }
      });

      modalMediaResultsGrid.appendChild(itemEl);
    });
  }

  function generatedVisualContext(scene, prompt, provider = '') {
    return {
      provider,
      prompt,
      sceneText: scene?.text || '',
      visualType: scene?.shotDirection?.visualType,
      visualIntent: scene?.shotDirection?.visualIntent,
      candidateAcceptanceTest: scene?.shotDirection?.candidateAcceptanceTest
    };
  }

  function showGeneratedImageReview(asset) {
    uiState.generatedModalAsset = asset;
    googleFlowGeneratedImg.src = asset.thumbnail || asset.url;
    googleFlowAiResultBox.classList.remove('hidden');
    const verified = isGeminiVerifiedImage(asset);
    const review = asset.visualVerification || {};
    const imageDecision = verified
      ? `Gemini Verified: ${review.reason || 'The generated image matches this scene.'}`
      : `Gemini Rejected: ${review.reason || 'The generated image did not prove the required visual.'} It cannot be applied.`;
    geminiImageVerificationText.textContent = review.eligibilityQuestion
      ? `Gemini asked: ${review.eligibilityQuestion} ${imageDecision}`
      : imageDecision;
    geminiImageVerificationText.className = `gemini-video-verification ${verified ? 'is-approved' : 'is-rejected'}`;
    applyGoogleFlowAssetBtn.disabled = !verified;
    showToast(verified
      ? `${asset.source || 'AI'} generated an image and Gemini approved it.`
      : 'Gemini rejected the generated image; it cannot be applied.', verified ? 'success' : 'warning');
    return verified;
  }

  async function copyGenerationPrompt(text) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
  }

  const FLOW_QUEUE_DELIMITER = '\n\n@@@NEXT@@@\n\n';

  function cleanFlowPromptLine(value, maximumLength = 1800) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maximumLength);
  }

  function flowContractList(value) {
    const values = Array.isArray(value) ? value : value ? [value] : [];
    return values.map((item) => cleanFlowPromptLine(item, 240)).filter(Boolean).join('; ');
  }

  function buildFlowPromptForScene(scene, scenePosition, mediaType, aspectRatio) {
    const direction = scene.shotDirection || {};
    const contract = scene.visualContract || direction.visualContract || {};
    const sceneNumber = Number(scene.index) || scenePosition + 1;
    const durationSec = Math.max(2, Math.min(15, Number(scene.durationSec || scene.duration || 5)));
    const primaryPrompt = cleanFlowPromptLine(
      direction.aiVisualPrompt || direction.visualIntent || contract.visualIntent || scene.text,
      1800
    );
    const visualIntent = cleanFlowPromptLine(direction.visualIntent || contract.visualIntent, 600);
    const acceptanceTest = cleanFlowPromptLine(
      direction.candidateAcceptanceTest || direction.acceptanceTest || contract.acceptanceTest,
      700
    );
    const mustShow = flowContractList(direction.mustShow || contract.mustShow);
    const mustNotShow = flowContractList(direction.mustNotShow || contract.mustNotShow);
    const shotType = cleanFlowPromptLine(direction.shotType, 180);
    const visualType = cleanFlowPromptLine(direction.visualType || contract.visualType || scene.visualType, 120).toLowerCase();
    const promptAlreadyContainsContract = /required visible facts|must visibly show|forbidden substitutions|must not show/i.test(primaryPrompt);
    const requiresFunctionalText = /chart|diagram|data|interface|map|timeline|infographic/.test(visualType);
    const promptParts = [primaryPrompt];

    if (!promptAlreadyContainsContract && visualIntent && !primaryPrompt.toLowerCase().includes(visualIntent.toLowerCase())) {
      promptParts.push(`Required visual: ${visualIntent}.`);
    }
    if (!promptAlreadyContainsContract && mustShow) promptParts.push(`Must visibly show: ${mustShow}.`);
    if (!promptAlreadyContainsContract && mustNotShow) promptParts.push(`Must not show: ${mustNotShow}.`);
    if (!promptAlreadyContainsContract && acceptanceTest) promptParts.push(`Acceptance requirement: ${acceptanceTest}.`);
    if (shotType) promptParts.push(`Shot direction: ${shotType}.`);
    promptParts.push(mediaType === 'video'
      ? `Generate one coherent cinematic video clip suitable for a ${durationSec.toFixed(1)}-second edit. Keep the same subject, setting, and action throughout the shot.`
      : 'Generate one cinematic still image with the requested subject unmistakably visible.');
    promptParts.push(requiresFunctionalText
      ? `Aspect ratio ${aspectRatio}. No subtitles, logos, or watermark. Include only labels or interface text explicitly required by the scene.`
      : `Aspect ratio ${aspectRatio}. No on-screen text, subtitles, logos, or watermark.`);

    return {
      order: scenePosition + 1,
      sceneId: scene.id,
      sceneNumber,
      fileStem: `scene_${String(sceneNumber).padStart(3, '0')}`,
      mediaType,
      durationSec,
      narration: cleanFlowPromptLine(scene.text, 900),
      visualIntent,
      prompt: promptParts.filter(Boolean).join('\n')
    };
  }

  function buildFlowPromptQueue() {
    const manifest = ProjectStore.getManifest();
    const mediaType = flowQueueMediaType.value === 'image' ? 'image' : 'video';
    const aspectRatio = manifest.metadata?.aspectRatio === '9:16' ? '9:16' : '16:9';
    const onlyUnresolved = flowQueueOnlyUnresolved.checked;
    return (manifest.scenes || [])
      .map((scene, scenePosition) => ({ scene, scenePosition }))
      .filter(({ scene }) => !onlyUnresolved || !isGeminiVerifiedMedia(scene.visual))
      .map(({ scene, scenePosition }) => buildFlowPromptForScene(scene, scenePosition, mediaType, aspectRatio));
  }

  function renderFlowPromptQueue() {
    uiState.flowQueueItems = buildFlowPromptQueue();
    const mediaLabel = flowQueueMediaType.value === 'image' ? 'image' : 'video';
    flowQueueSummary.textContent = `${uiState.flowQueueItems.length} ordered ${mediaLabel} prompt${uiState.flowQueueItems.length === 1 ? '' : 's'}`;
    flowQueueEmpty.classList.toggle('hidden', uiState.flowQueueItems.length > 0);
    flowQueueList.classList.toggle('hidden', uiState.flowQueueItems.length === 0);
    flowQueueList.innerHTML = uiState.flowQueueItems.map((item, itemIndex) => `
      <article class="flow-queue-item">
        <div class="flow-queue-item-head">
          <div>
            <strong>${escapeHtml(item.fileStem)}</strong>
            <span>Scene ${item.sceneNumber} · ${escapeHtml(item.mediaType)} · ${item.durationSec.toFixed(1)}s</span>
          </div>
          <button class="btn btn-secondary btn-sm" data-flow-copy-index="${itemIndex}"><i class="fa-regular fa-copy"></i> Copy</button>
        </div>
        <p class="flow-queue-narration">${escapeHtml(item.narration)}</p>
        <pre>${escapeHtml(item.prompt)}</pre>
      </article>
    `).join('');
  }

  function openFlowPromptQueue() {
    renderFlowPromptQueue();
    flowQueueModal.classList.remove('hidden');
  }

  function serializedFlowPromptQueue(format) {
    const items = uiState.flowQueueItems;
    if (format === 'csv') {
      const rows = items.map((item) => `"${item.prompt.replace(/"/g, '""')}"`);
      return `\uFEFFprompt\n${rows.join('\n')}`;
    }
    if (format === 'json') {
      return JSON.stringify(items.map((item) => ({
        prompt: item.prompt,
        scene: item.fileStem,
        durationSec: item.durationSec,
        narration: item.narration
      })), null, 2);
    }
    return items.map((item) => item.prompt).join(FLOW_QUEUE_DELIMITER);
  }

  async function copyFlowPromptQueue() {
    renderFlowPromptQueue();
    if (!uiState.flowQueueItems.length) {
      showToast('There are no scenes in this queue.', 'warning');
      return;
    }
    await copyGenerationPrompt(serializedFlowPromptQueue('txt'));
    showToast(`Copied ${uiState.flowQueueItems.length} prompts using the @@@NEXT@@@ separator.`, 'success');
  }

  function downloadFlowPromptQueue(format) {
    renderFlowPromptQueue();
    if (!uiState.flowQueueItems.length) {
      showToast('There are no scenes in this queue.', 'warning');
      return;
    }
    const mediaType = flowQueueMediaType.value === 'image' ? 'images' : 'videos';
    const mimeTypes = { csv: 'text/csv;charset=utf-8', txt: 'text/plain;charset=utf-8', json: 'application/json' };
    Exporter.downloadFile(
      serializedFlowPromptQueue(format),
      `scriptflow_google_flow_${mediaType}.${format}`,
      mimeTypes[format]
    );
    showToast(`Downloaded ${uiState.flowQueueItems.length} ordered prompts as ${format.toUpperCase()}.`, 'success');
  }

  function flowFileMediaType(file) {
    const mimeType = String(file?.type || '').toLowerCase();
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('image/')) return 'image';
    const extension = String(file?.name || '').split('.').pop().toLowerCase();
    if (['mp4', 'webm', 'mov', 'm4v', 'avi'].includes(extension)) return 'video';
    if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'].includes(extension)) return 'image';
    return '';
  }

  function flowFileContentType(file, mediaType) {
    if (file.type) return file.type;
    const extension = String(file.name || '').split('.').pop().toLowerCase();
    const mimeTypes = {
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif',
      mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', m4v: 'video/x-m4v', avi: 'video/x-msvideo'
    };
    return mimeTypes[extension] || (mediaType === 'video' ? 'video/mp4' : 'image/jpeg');
  }

  function compareFlowMediaFiles(left, right) {
    return String(left.name || '').localeCompare(String(right.name || ''), undefined, {
      numeric: true,
      sensitivity: 'base'
    });
  }

  function buildFlowBulkUpload(files) {
    const acceptedFiles = [];
    const skipped = [];
    [...files].sort(compareFlowMediaFiles).forEach((file) => {
      const mediaType = flowFileMediaType(file);
      if (!mediaType) {
        skipped.push({ file, reason: 'Unsupported file type. Choose an image or video.' });
        return;
      }
      acceptedFiles.push(file);
    });
    return { acceptedFiles, skipped };
  }

  function flowPlacementCatalogScenes() {
    const manifest = ProjectStore.getManifest();
    const sceneById = new Map((manifest.scenes || []).map((scene) => [scene.id, scene]));
    return [...uiState.flowQueueItems]
      .sort((left, right) => left.order - right.order)
      .map((item) => {
        const scene = sceneById.get(item.sceneId);
        if (!scene) return null;
        const plan = scene.shotDirection || {};
        return {
          sceneId: scene.id,
          sceneNumber: item.sceneNumber,
          narration: scene.text || item.narration,
          visualType: plan.visualType || '',
          visualIntent: plan.visualIntent || '',
          mustShow: Array.isArray(plan.mustShow) ? plan.mustShow : [],
          mustNotShow: Array.isArray(plan.mustNotShow) ? plan.mustNotShow : [],
          acceptanceTest: plan.candidateAcceptanceTest || ''
        };
      })
      .filter(Boolean);
  }

  function setFlowBulkImportBusy(isBusy) {
    uiState.flowBulkImportBusy = isBusy;
    bulkImportFlowMediaBtn.disabled = isBusy;
    flowQueueMediaType.disabled = isBusy;
    flowQueueOnlyUnresolved.disabled = isBusy;
    bulkImportFlowMediaBtn.innerHTML = isBusy
      ? '<i class="fa-solid fa-spinner fa-spin"></i> Recognizing & Auto-Placing...'
      : '<i class="fa-solid fa-cloud-arrow-up"></i> Upload Approved Media + AI Sort';
  }

  function flowBulkResultMarkup(label, fileName, sceneNumber, message, status) {
    return `
      <div class="flow-bulk-result is-${status}" data-flow-bulk-label="${escapeHtml(label)}">
        <strong>${escapeHtml(fileName)}</strong>
        <span>${sceneNumber ? `Scene ${sceneNumber}` : 'Not assigned'} · ${escapeHtml(message)}</span>
      </div>
    `;
  }

  async function importFlowMediaBatch() {
    if (uiState.flowBulkImportBusy) return;
    const files = Array.from(bulkImportFlowMediaInput.files || []);
    if (!files.length) return;

    renderFlowPromptQueue();
    const upload = buildFlowBulkUpload(files);
    const catalogScenes = flowPlacementCatalogScenes();
    flowBulkImportPanel.classList.remove('hidden');
    flowBulkImportResults.innerHTML = upload.skipped.map(({ file, reason }) => (
      flowBulkResultMarkup('skipped', file.name, null, reason, 'skipped')
    )).join('');

    if (!upload.acceptedFiles.length) {
      flowBulkImportSummary.textContent = 'No supported image or video files were selected.';
      flowBulkImportProgressText.textContent = `0 / ${files.length}`;
      flowBulkImportProgress.max = Math.max(1, files.length);
      flowBulkImportProgress.value = files.length;
      bulkImportFlowMediaInput.value = '';
      showToast('Choose image or video files to auto-sort.', 'warning');
      return;
    }
    if (!catalogScenes.length) {
      flowBulkImportSummary.textContent = 'There are no scenes in the current Flow Queue.';
      bulkImportFlowMediaInput.value = '';
      showToast('Add scenes or include scenes that already have visuals.', 'warning');
      return;
    }

    setFlowBulkImportBusy(true);
    flowBulkImportProgress.max = upload.acceptedFiles.length;
    flowBulkImportProgress.value = 0;
    flowBulkImportProgressText.textContent = `0 / ${upload.acceptedFiles.length}`;
    flowBulkImportSummary.textContent = `Preparing ${upload.acceptedFiles.length} user-approved files for Gemini content recognition...`;
    const counters = { recognized: 0, placed: 0, failed: 0, unassigned: 0 };
    const resultLabelByMediaId = new Map();

    try {
      if (!uiState.geminiTraceSessionId) uiState.geminiTraceSessionId = createGeminiTraceSessionId();
      const catalogResponse = await fetch('/api/generated-media/placement-catalogs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenes: catalogScenes })
      });
      const catalogPayload = await catalogResponse.json().catch(() => ({}));
      if (!catalogResponse.ok || !catalogPayload.catalog?.catalogId) {
        throw new Error(catalogPayload.error || 'The server could not start the media placement session.');
      }
      const catalogId = catalogPayload.catalog.catalogId;

      for (let index = 0; index < upload.acceptedFiles.length; index += 1) {
        const file = upload.acceptedFiles[index];
        const resultLabel = `item-${index}`;
        flowBulkImportResults.insertAdjacentHTML('beforeend', flowBulkResultMarkup(
          resultLabel,
          file.name,
          null,
          'Gemini is recognizing the actual pixels for scene placement...',
          'processing'
        ));
        const resultElement = flowBulkImportResults.querySelector(`[data-flow-bulk-label="${resultLabel}"]`);
        try {
          const mediaType = flowFileMediaType(file);
          const response = await fetch(`/api/generated-media/placement-catalogs/${encodeURIComponent(catalogId)}/media?name=${encodeURIComponent(file.name)}`, {
            method: 'POST',
            headers: { 'Content-Type': flowFileContentType(file, mediaType) },
            body: file
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok || !payload.media?.mediaId) {
            throw new Error(payload.error || 'Gemini could not recognize this media file.');
          }
          counters.recognized += 1;
          resultLabelByMediaId.set(payload.media.mediaId, resultLabel);
          if (resultElement) {
            resultElement.className = 'flow-bulk-result is-recognized';
            resultElement.querySelector('span').textContent = `Recognized · ${payload.media.inspection?.summary || 'Visible content cataloged'}`;
          }
        } catch (error) {
          counters.failed += 1;
          if (resultElement) {
            resultElement.className = 'flow-bulk-result is-failed';
            resultElement.querySelector('span').textContent = `Recognition failed · ${error.message}`;
          }
        }

        flowBulkImportProgress.value = index + 1;
        flowBulkImportProgressText.textContent = `${index + 1} / ${upload.acceptedFiles.length}`;
        flowBulkImportSummary.textContent = `${counters.recognized} recognized · ${counters.failed} failed · placement starts after every file is understood`;
      }

      if (!counters.recognized) throw new Error('Gemini could not recognize any uploaded media files.');
      flowBulkImportSummary.textContent = `Gemini recognized ${counters.recognized} files. Optimizing the whole batch across ${catalogScenes.length} scenes...`;
      const assignmentResponse = await fetch(`/api/generated-media/placement-catalogs/${encodeURIComponent(catalogId)}/assign`, {
        method: 'POST'
      });
      const assignmentPayload = await assignmentResponse.json().catch(() => ({}));
      if (!assignmentResponse.ok) {
        throw new Error(assignmentPayload.error || 'Gemini could not complete the global scene assignment.');
      }

      const manifest = ProjectStore.getManifest();
      (assignmentPayload.assignments || []).forEach((assignment) => {
        const scene = (manifest.scenes || []).find((candidate) => candidate.id === assignment.sceneId);
        const resultLabel = resultLabelByMediaId.get(assignment.mediaId);
        const resultElement = resultLabel
          ? flowBulkImportResults.querySelector(`[data-flow-bulk-label="${resultLabel}"]`)
          : null;
        if (!scene || !assignment.asset) {
          counters.unassigned += 1;
          if (resultElement) {
            resultElement.className = 'flow-bulk-result is-unassigned';
            resultElement.querySelector('span').textContent = 'Not assigned · the selected scene no longer exists';
          }
          return;
        }
        ProjectStore.dispatch({
          type: 'REPLACE_VISUAL',
          sceneId: scene.id,
          asset: assignment.asset,
          selectionStatus: 'VERIFIED'
        }, `Gemini placed user-approved media in Scene #${scene.index}`);
        counters.placed += 1;
        if (resultElement) {
          const confidence = Math.round((Number(assignment.confidence) || 0) * 100);
          resultElement.className = 'flow-bulk-result is-placed';
          resultElement.querySelector('span').textContent = `Scene ${assignment.sceneNumber} · Gemini placed (${confidence}% confidence): ${assignment.reason}`;
        }
      });

      (assignmentPayload.unassignedMedia || []).forEach((item) => {
        counters.unassigned += 1;
        const resultLabel = resultLabelByMediaId.get(item.mediaId);
        const resultElement = resultLabel
          ? flowBulkImportResults.querySelector(`[data-flow-bulk-label="${resultLabel}"]`)
          : null;
        if (resultElement) {
          resultElement.className = 'flow-bulk-result is-unassigned';
          resultElement.querySelector('span').textContent = `Not assigned · ${item.reason}`;
        }
      });

      const scenesStillWaiting = Math.max(0, catalogScenes.length - counters.placed);
      flowBulkImportSummary.textContent = `${counters.placed} placed · ${counters.unassigned} unassigned · ${counters.failed} failed · ${upload.skipped.length} skipped · ${scenesStillWaiting} scenes still waiting`;
      showToast(
        `Gemini placed ${counters.placed} user-approved media files by visible content.`,
        counters.failed || counters.unassigned ? 'warning' : 'success'
      );
    } catch (error) {
      flowBulkImportSummary.textContent = `Auto-placement stopped · ${error.message}`;
      showToast(`Media auto-placement failed: ${error.message}`, 'error');
    } finally {
      setFlowBulkImportBusy(false);
      bulkImportFlowMediaInput.value = '';
      renderFlowPromptQueue();
    }
  }

  async function openGoogleFlowHandoff(scene, prompt, mediaType) {
    const flowWindow = window.open('https://labs.google/fx/tools/flow', '_blank', 'noopener');
    const handoffPrompt = [
      prompt,
      scene?.shotDirection?.visualIntent ? `Visible requirement: ${scene.shotDirection.visualIntent}.` : '',
      scene?.shotDirection?.candidateAcceptanceTest ? `The result must clearly pass this test: ${scene.shotDirection.candidateAcceptanceTest}.` : '',
      mediaType === 'video'
        ? 'Create a coherent cinematic video clip with the subject and action clearly visible. No captions, logos, or watermark.'
        : 'Create a cinematic image with the literal subject clearly visible. No captions, logos, or watermark.'
    ].filter(Boolean).join('\n');
    try {
      await copyGenerationPrompt(handoffPrompt);
      const statusElement = mediaType === 'video' ? geminiVideoAccessStatus : geminiImageAccessStatus;
      statusElement.textContent = `Prompt copied. Generate the ${mediaType} in Google Flow, download it, then click Import Flow ${mediaType === 'video' ? 'Video' : 'Image'} + Verify.`;
      statusElement.className = 'gemini-video-status is-approved';
      showToast('Google Flow opened and the Gemini-directed prompt was copied.', 'success');
    } catch (error) {
      showToast(`Google Flow opened, but the prompt could not be copied: ${error.message}`, 'warning');
    }
    if (!flowWindow) showToast('Your browser blocked the Google Flow tab. Allow popups for this local app.', 'warning');
  }

  function encodeGenerationContext(value) {
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    let binary = '';
    for (let index = 0; index < bytes.length; index += 8192) {
      binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  async function importGeneratedMediaFromFlow(input, expectedMediaType) {
    const file = input.files?.[0];
    if (!file) return;
    const actualMediaType = file.type.startsWith('video/') ? 'video' : file.type.startsWith('image/') ? 'image' : '';
    const statusElement = expectedMediaType === 'video' ? geminiVeoJobStatus : geminiImageAccessStatus;
    const importButton = expectedMediaType === 'video' ? importGoogleFlowVideoBtn : importGoogleFlowImageBtn;
    if (actualMediaType !== expectedMediaType) {
      showToast(`Choose a ${expectedMediaType} file from Google Flow.`, 'warning');
      input.value = '';
      return;
    }

    const manifest = ProjectStore.getManifest();
    const scene = manifest.scenes.find((item) => item.id === uiState.activeModalSceneId);
    if (!scene) return;
    const prompt = expectedMediaType === 'video' ? geminiVeoPromptInput.value.trim() : googleFlowPromptInput.value.trim();
    importButton.disabled = true;
    statusElement.textContent = `Uploading the Flow ${expectedMediaType} and waiting for Gemini pixel verification...`;
    statusElement.className = 'gemini-video-status is-processing';

    try {
      const response = await fetch('/api/generated-media/import', {
        method: 'POST',
        headers: {
          'Content-Type': file.type,
          'X-ScriptFlow-Context': encodeGenerationContext({
            ...generatedVisualContext(scene, prompt, 'google-flow'),
            model: 'Google Flow selected model'
          })
        },
        body: file
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.asset) throw new Error(payload.error || 'The Flow result could not be imported.');
      if (expectedMediaType === 'video') {
        const verified = isGeminiVerifiedVideo(payload.asset);
        showGeminiVeoReview({ asset: payload.asset, status: verified ? 'ready' : 'rejected', error: null });
      } else {
        const verified = showGeneratedImageReview(payload.asset);
        geminiImageAccessStatus.textContent = verified
          ? 'Google Flow image imported and approved by Gemini.'
          : 'Google Flow image imported, but Gemini rejected its visual match.';
        geminiImageAccessStatus.className = `gemini-video-status ${verified ? 'is-approved' : 'is-rejected'}`;
      }
    } catch (error) {
      statusElement.textContent = `Flow import failed: ${error.message}`;
      statusElement.className = 'gemini-video-status is-rejected';
      showToast(`Flow import failed: ${error.message}`, 'error');
    } finally {
      importButton.disabled = false;
      input.value = '';
    }
  }

  async function generateGeminiImageFromModal() {
    const manifest = ProjectStore.getManifest();
    const scene = manifest.scenes.find((item) => item.id === uiState.activeModalSceneId);
    const prompt = googleFlowPromptInput.value.trim();
    if (!scene || !prompt) {
      showToast('Enter a scene image prompt first.', 'warning');
      return;
    }

    const provider = imageGenerationProvider.value;
    if (provider === 'google-flow') {
      await openGoogleFlowHandoff(scene, prompt, 'image');
      return;
    }

    const originalLabel = triggerGoogleFlowGenBtn.innerHTML;
    triggerGoogleFlowGenBtn.disabled = true;
    triggerGoogleFlowGenBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${provider === 'pollinations' ? 'Free provider is generating' : 'Gemini is generating'}`;
    geminiImageAccessStatus.textContent = provider === 'pollinations'
      ? 'Pollinations is generating the image; Gemini verification follows automatically...'
      : 'Gemini is generating the image. This is a paid API operation...';
    geminiImageAccessStatus.className = 'gemini-video-status is-processing';
    googleFlowAiResultBox.classList.add('hidden');

    try {
      const response = await fetch(provider === 'pollinations' ? '/api/pollinations/generate-image' : '/api/gemini/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...generatedVisualContext(scene, prompt, provider),
          pollinationsApiKey: getPollinationsKey(),
          model: provider === 'pollinations' ? 'flux' : undefined,
          aspectRatio: manifest.metadata?.aspectRatio === '9:16' ? '9:16' : '16:9'
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.asset) throw new Error(payload.error || 'The AI provider did not return an image.');
      const verified = showGeneratedImageReview(payload.asset);
      geminiImageAccessStatus.textContent = verified
        ? `${payload.asset.source || 'AI provider'} image generated and approved by Gemini.`
        : `${payload.asset.source || 'AI provider'} image generated, but Gemini rejected its visual match.`;
      geminiImageAccessStatus.className = `gemini-video-status ${verified ? 'is-approved' : 'is-rejected'}`;
    } catch (error) {
      console.error('[generateGeminiImageFromModal] Error:', error);
      geminiImageAccessStatus.textContent = error.message;
      geminiImageAccessStatus.className = 'gemini-video-status is-rejected';
      showToast(`AI image generation failed: ${error.message}`, 'error');
    } finally {
      triggerGoogleFlowGenBtn.disabled = false;
      triggerGoogleFlowGenBtn.innerHTML = originalLabel;
    }
  }

  function applyGeneratedGeminiImage() {
    const asset = uiState.generatedModalAsset;
    const manifest = ProjectStore.getManifest();
    const scene = manifest.scenes.find((item) => item.id === uiState.activeModalSceneId);
    if (!asset || !scene || !isGeminiVerifiedImage(asset)) {
      showToast('Only a Gemini-verified generated image can be applied.', 'warning');
      return;
    }

    ProjectStore.dispatch({
      type: 'REPLACE_VISUAL',
      sceneId: scene.id,
      asset
    }, `Apply Gemini-generated visual to Scene #${scene.index}`);
    closeAssetSearchModal();
    showToast(`Applied Gemini image to Scene #${scene.index}!`, 'success');
  }

  function isGeminiVerifiedMedia(asset) {
    const review = asset?.visualVerification;
    return review?.previewAnalyzed === true
      && review?.answer === 'yes'
      && review?.eligible === true
      && review?.verdict === 'strong-match';
  }

  function isGeminiVerifiedImage(asset) {
    return isGeminiVerifiedMedia(asset);
  }

  function isGeminiVerifiedVideo(asset) {
    return isGeminiVerifiedMedia(asset);
  }

  function showGeminiVeoReview(job) {
    const asset = job.asset;
    const verified = isGeminiVerifiedVideo(asset);
    uiState.generatedVideoModalAsset = asset || null;

    if (asset) {
      geminiVeoGeneratedVideo.src = asset.url;
      geminiVeoGeneratedVideo.poster = asset.thumbnail || '';
      geminiVeoResultBox.classList.remove('hidden');
      const review = asset.visualVerification || {};
      const videoDecision = verified
        ? `Gemini Verified: ${review.reason || 'The generated frames match this scene.'}`
        : `Gemini Rejected: ${review.reason || 'The generated frames did not prove the required visual.'} This clip cannot be applied.`;
      geminiVeoVerificationText.textContent = review.eligibilityQuestion
        ? `Gemini asked: ${review.eligibilityQuestion} ${videoDecision}`
        : videoDecision;
      geminiVeoVerificationText.className = `gemini-video-verification ${verified ? 'is-approved' : 'is-rejected'}`;
      applyGeminiVeoAssetBtn.disabled = !verified;
    }

    if (verified) {
      geminiVeoJobStatus.textContent = 'Gemini completed and verified this Veo clip. It is ready for the selected scene.';
      geminiVeoJobStatus.className = 'gemini-video-status is-approved';
      showToast('Gemini verified the generated video against this scene.', 'success');
    } else if (job.status === 'rejected') {
      geminiVeoJobStatus.textContent = 'Gemini reviewed the generated clip and rejected it. It was not added to your scene.';
      geminiVeoJobStatus.className = 'gemini-video-status is-rejected';
      showToast('Gemini rejected this generated clip; it cannot be applied.', 'warning');
    } else {
      geminiVeoJobStatus.textContent = job.error || 'Gemini could not finish this video job.';
      geminiVeoJobStatus.className = 'gemini-video-status is-rejected';
      showToast(`Gemini video generation failed: ${job.error || 'No verified clip was returned.'}`, 'error');
    }
  }

  async function pollGeminiVeoJob(jobId, token) {
    while (uiState.generatedVideoJobToken === token) {
      const response = await fetch('/api/gemini/video-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.job) throw new Error(payload.error || 'Could not check the Gemini Veo job.');
      if (uiState.generatedVideoJobToken !== token) return;

      const job = payload.job;
      if (job.status === 'generating') {
        geminiVeoJobStatus.textContent = 'Gemini Veo is generating the clip. This normally takes a few minutes...';
        await delay(10_000);
        continue;
      }
      if (job.status === 'reviewing') {
        geminiVeoJobStatus.textContent = 'Veo finished. Gemini is now reviewing actual video frames against the scene...';
        await delay(4_000);
        continue;
      }

      showGeminiVeoReview(job);
      return;
    }
  }

  async function generateGeminiVeoVideoFromModal() {
    const manifest = ProjectStore.getManifest();
    const scene = manifest.scenes.find((item) => item.id === uiState.activeModalSceneId);
    const prompt = geminiVeoPromptInput.value.trim();
    if (!scene || !prompt) {
      showToast('Enter a precise scene video prompt first.', 'warning');
      return;
    }

    const provider = videoGenerationProvider.value;
    if (provider === 'google-flow') {
      await openGoogleFlowHandoff(scene, prompt, 'video');
      return;
    }

    const token = `veo_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const originalLabel = triggerGeminiVeoGenBtn.innerHTML;
    uiState.generatedVideoJobToken = token;
    uiState.generatedVideoModalAsset = null;
    geminiVeoResultBox.classList.add('hidden');
    triggerGeminiVeoGenBtn.disabled = true;
    triggerGeminiVeoGenBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${provider === 'pollinations' ? 'Generating free-allowance clip' : 'Starting Veo job'}`;
    geminiVeoJobStatus.textContent = provider === 'pollinations'
      ? 'Pollinations Nova Reel is generating the clip from account allowance. This can take several minutes; Gemini frame verification follows.'
      : 'Starting an official Gemini Veo job...';
    geminiVeoJobStatus.className = 'gemini-video-status is-processing';

    try {
      const response = await fetch(provider === 'pollinations' ? '/api/pollinations/generate-video' : '/api/gemini/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...generatedVisualContext(scene, prompt, provider),
          aspectRatio: manifest.metadata?.aspectRatio === '9:16' ? '9:16' : '16:9',
          durationSec: scene.duration,
          pollinationsApiKey: getPollinationsKey(),
          model: provider === 'pollinations' ? 'nova-reel' : undefined
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (provider === 'pollinations') {
        if (!response.ok || !payload.asset) throw new Error(payload.error || 'The free AI video provider did not return a clip.');
        const verified = isGeminiVerifiedVideo(payload.asset);
        showGeminiVeoReview({ asset: payload.asset, status: verified ? 'ready' : 'rejected', error: null });
      } else {
        if (!response.ok || !payload.job?.jobId) throw new Error(payload.error || 'Gemini Veo did not start a job.');
        await pollGeminiVeoJob(payload.job.jobId, token);
      }
    } catch (error) {
      if (uiState.generatedVideoJobToken === token) {
        geminiVeoJobStatus.textContent = `AI video generation could not start or complete: ${error.message}`;
        geminiVeoJobStatus.className = 'gemini-video-status is-rejected';
        showToast(`AI video generation failed: ${error.message}`, 'error');
      }
    } finally {
      if (uiState.generatedVideoJobToken === token) {
        uiState.generatedVideoJobToken = null;
        triggerGeminiVeoGenBtn.disabled = false;
        triggerGeminiVeoGenBtn.innerHTML = originalLabel;
      }
    }
  }

  function applyGeneratedGeminiVeoVideo() {
    const asset = uiState.generatedVideoModalAsset;
    const manifest = ProjectStore.getManifest();
    const scene = manifest.scenes.find((item) => item.id === uiState.activeModalSceneId);
    if (!asset || !scene || !isGeminiVerifiedVideo(asset)) {
      showToast('Only a Gemini-verified generated clip can be applied.', 'warning');
      return;
    }

    ProjectStore.dispatch({
      type: 'REPLACE_VISUAL',
      sceneId: scene.id,
      asset,
      selectionStatus: 'VERIFIED'
    }, `Apply Gemini-verified Veo clip to Scene #${scene.index}`);
    closeAssetSearchModal();
    showToast(`Applied Gemini-verified Veo clip to Scene #${scene.index}!`, 'success');
  }

  function handleCustomFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const fileUrl = URL.createObjectURL(file);
    const isVideo = file.type.startsWith('video');

    const customMedia = {
      assetId: `upload_${Date.now()}`,
      type: isVideo ? 'video' : 'photo',
      url: fileUrl,
      thumbnail: fileUrl,
      title: file.name,
      source: 'upload'
    };

    const manifest = ProjectStore.getManifest();
    const scene = manifest.scenes.find((s) => s.id === uiState.activeModalSceneId);
    if (scene) {
      ProjectStore.dispatch({
        type: 'REPLACE_VISUAL',
        sceneId: scene.id,
        asset: customMedia,
        selectionStatus: 'MANUAL'
      }, `Uploaded visual for Scene #${scene.index}`);

      closeAssetSearchModal();
      showToast(`Uploaded and applied "${file.name}"!`, 'success');
    }
  }

  function handleAssetModalTabSwitch() {
    modalMediaResultsGrid.classList.add('hidden');
    modalUploadSection.classList.add('hidden');
    modalAiPromptSection.classList.add('hidden');
    modalGoogleFlowAiSection.classList.add('hidden');
    modalGeminiVeoSection.classList.add('hidden');

    if (uiState.modalActiveTab === 'gemini-image') {
      modalGoogleFlowAiSection.classList.remove('hidden');
    } else if (uiState.modalActiveTab === 'gemini-veo-video') {
      modalGeminiVeoSection.classList.remove('hidden');
    } else if (uiState.modalActiveTab === 'custom-upload') {
      modalUploadSection.classList.remove('hidden');
    } else if (uiState.modalActiveTab === 'ai-prompts') {
      modalAiPromptSection.classList.remove('hidden');
    } else {
      modalMediaResultsGrid.classList.remove('hidden');
      performModalSearch();
    }
  }

  // --- Settings & Webhooks ---

  function openSettingsModal() {
    elevenLabsApiKeyInput.value = TTSEngine.getElevenLabsKey();
    aiProviderSelect.value = AIAssistant.getProvider();
    openaiApiKeyInput.value = AIAssistant.getOpenAIKey();
    ollamaUrlInput.value = AIAssistant.getOllamaUrl();
    pexelsApiKeyInput.value = StockAPI.getPexelsKey();
    pixabayApiKeyInput.value = StockAPI.getPixabayKey();
    pollinationsApiKeyInput.value = getPollinationsKey();
    settingsModal.classList.remove('hidden');
  }

  function saveSettingsModal() {
    TTSEngine.setElevenLabsKey(elevenLabsApiKeyInput.value);
    VoiceProvider.setConfig({ apiKey: elevenLabsApiKeyInput.value });
    AIAssistant.setProvider(aiProviderSelect.value);
    AIAssistant.setOpenAIKey(openaiApiKeyInput.value);
    AIAssistant.setOllamaUrl(ollamaUrlInput.value);
    StockAPI.setPexelsKey(pexelsApiKeyInput.value);
    StockAPI.setPixabayKey(pixabayApiKeyInput.value);
    savePollinationsKey(pollinationsApiKeyInput.value);
    uiState.serverCapabilities.hasPollinations = uiState.serverCapabilities.hasPollinations || !!getPollinationsKey();

    settingsModal.classList.add('hidden');
    updateProviderBadge();
    initializeGenerationProviderSelections();
    renderGenerationProviderControls();
    showToast('Settings saved successfully!', 'success');
  }

  function updateProviderBadge() {
    if (!stage1ProviderBadge) return;
    const p = AIAssistant.getProvider();
    if (uiState.serverCapabilities.hasGemini) stage1ProviderBadge.textContent = '✨ AI: Gemini Director Active';
    else if (p === 'openai' && AIAssistant.hasLiveApiKey()) stage1ProviderBadge.textContent = '✨ AI: GPT-4o Active';
    else if (p === 'ollama') stage1ProviderBadge.textContent = '✨ AI: Ollama Active';
    else stage1ProviderBadge.textContent = AIAssistant.getGeminiKey() ? '✨ AI: Gemini Director Active' : 'AI: Gemini Key Required';
  }

  async function loadBrandProfiles(selectedId = '') {
    if (!brandProfileSelect) return [];
    try {
      const response = await fetch('/api/brand-profiles', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `Profile service returned HTTP ${response.status}.`);
      uiState.brandProfiles = Array.isArray(payload.profiles) ? payload.profiles : [];
      brandProfileSelect.innerHTML = uiState.brandProfiles.map((profile) =>
        `<option value="${escapeHtml(profile.id)}">${escapeHtml(profile.name)}</option>`
      ).join('');
      const desiredId = selectedId || ProjectStore.getManifest().metadata?.brandProfileId || 'profile_default';
      if (uiState.brandProfiles.some((profile) => profile.id === desiredId)) brandProfileSelect.value = desiredId;
      return uiState.brandProfiles;
    } catch (error) {
      console.warn('[BrandProfile] Load failed:', error.message);
      brandProfileSelect.innerHTML = '<option value="">Profiles unavailable</option>';
      return [];
    }
  }

  function applySelectedBrandProfile() {
    const profile = (uiState.brandProfiles || []).find((item) => item.id === brandProfileSelect.value);
    if (!profile) return;
    ProjectStore.dispatch({
      type: 'BATCH_ACTION',
      actions: [
        { type: 'SET_THEME', theme: profile.visual?.theme || 'cinematic-documentary' },
        { type: 'SET_ASPECT_RATIO', aspectRatio: profile.visual?.aspectRatio || '16:9' },
        { type: 'SET_CAPTION_STYLE', style: profile.captions?.style || 'hormozi' },
        { type: 'SET_VOICE_CONFIG', voice: profile.voice || {} },
        { type: 'SET_SOURCE_POLICY', sourcePolicy: profile.sourcing || {}, brandProfileId: profile.id }
      ]
    }, `Apply brand profile ${profile.name}`);
    showToast(`Applied brand profile: ${profile.name}`, 'success');
  }

  async function saveCurrentBrandProfile() {
    const manifest = ProjectStore.getManifest();
    const name = window.prompt('Profile name:', `${manifest.metadata?.title || 'YouTube Documentary'} Profile`)?.trim();
    if (!name) return;
    const sourcePolicy = typeof manifest.metadata?.sourcePolicy === 'object' ? manifest.metadata.sourcePolicy : {};
    try {
      const response = await fetch('/api/brand-profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile: {
            id: `profile_${Date.now()}`,
            name,
            language: 'en',
            format: manifest.metadata?.format || 'documentary',
            visual: {
              theme: manifest.metadata?.theme || 'cinematic-documentary',
              aspectRatio: manifest.metadata?.aspectRatio || '16:9',
              targetAverageShotSec: 4.5,
              preferredVideoRatio: 0.7,
              transitions: 'mostly-cuts'
            },
            captions: manifest.captions || {},
            voice: manifest.audio?.voice || {},
            sourcing: sourcePolicy
          }
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `Profile service returned HTTP ${response.status}.`);
      await loadBrandProfiles(payload.profile?.id || '');
      ProjectStore.dispatch({
        type: 'SET_SOURCE_POLICY',
        sourcePolicy,
        brandProfileId: payload.profile?.id || ''
      }, `Save brand profile ${name}`);
      showToast(`Saved brand profile: ${name}`, 'success');
    } catch (error) {
      showToast(`Profile save failed: ${error.message}`, 'error');
    }
  }

  function loadSavedSettings() {
    elevenLabsApiKeyInput.value = TTSEngine.getElevenLabsKey();
    openaiApiKeyInput.value = AIAssistant.getOpenAIKey();
    pexelsApiKeyInput.value = StockAPI.getPexelsKey();
    pixabayApiKeyInput.value = StockAPI.getPixabayKey();
  }

  function n8nStatusLabel(status) {
    return ({
      'not-configured': 'Not configured',
      blocked: 'Blocked',
      'awaiting-approval': 'Awaiting approval',
      dispatching: 'Sending to n8n',
      queued: 'Queued',
      publishing: 'Publishing',
      published: 'Published',
      failed: 'Publishing failed',
      'dispatch-failed': 'Dispatch failed'
    })[status] || 'Unknown status';
  }

  function applyN8nAutomationState(automation, renderId) {
    if (!automation) return;
    uiState.n8nRenderId = renderId || uiState.n8nRenderId || '';
    n8nAutomationPanel.classList.remove('hidden');
    const status = automation.status || 'not-configured';
    n8nAutomationPanel.dataset.status = status;
    n8nAutomationStatusBadge.textContent = n8nStatusLabel(status);
    n8nAutomationStatusText.textContent = automation.message || automation.reason || 'No n8n publishing update is available.';

    const canApprove = automation.configured === true
      && automation.eligible === true
      && status === 'awaiting-approval';
    approveN8nPublishingBtn.classList.toggle('hidden', !canApprove);
    approveN8nPublishingBtn.disabled = !canApprove;

    if (automation.publishedUrl) {
      n8nPublishedVideoLink.href = automation.publishedUrl;
      n8nPublishedVideoLink.classList.remove('hidden');
    } else {
      n8nPublishedVideoLink.removeAttribute('href');
      n8nPublishedVideoLink.classList.add('hidden');
    }
  }

  function updateN8nAutomationConfigMessage() {
    const n8n = uiState.serverCapabilities?.n8n || {};
    n8nAutomationConfigMessage.textContent = n8n.configured
      ? `n8n is configured server-side. ${n8n.requiresApproval ? 'Every Gemini-verified render needs an explicit approval before it is queued.' : 'Gemini-verified renders queue automatically after completion.'}`
      : 'n8n is not configured. Add N8N_RENDER_WEBHOOK_URL, N8N_WEBHOOK_SECRET, and N8N_CALLBACK_SECRET to the server environment, then restart Scriptflow.';
  }

  async function refreshN8nConfiguration() {
    try {
      const response = await fetch('/api/config');
      const config = await response.json();
      if (!response.ok || !config.ok) throw new Error(config.error || `HTTP ${response.status}`);
      uiState.serverCapabilities = {
        ...(uiState.serverCapabilities || {}),
        n8n: {
          configured: !!config.n8n?.configured,
          requiresApproval: config.n8n?.requiresApproval !== false
        }
      };
      updateN8nAutomationConfigMessage();
      showToast('n8n configuration refreshed.', 'success');
    } catch (error) {
      showToast(`Could not refresh n8n configuration: ${error.message}`, 'error');
    }
  }

  async function refreshN8nAutomationStatus() {
    if (!uiState.n8nRenderId) {
      showToast('Render a video first to view n8n publishing status.', 'warning');
      return;
    }
    try {
      const response = await fetch(`/api/automation/renders/${encodeURIComponent(uiState.n8nRenderId)}`);
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || `HTTP ${response.status}`);
      applyN8nAutomationState(payload.automation, uiState.n8nRenderId);
    } catch (error) {
      showToast(`Could not refresh n8n status: ${error.message}`, 'error');
    }
  }

  async function approveN8nPublishing() {
    if (!uiState.n8nRenderId) return;
    approveN8nPublishingBtn.disabled = true;
    try {
      const response = await fetch(`/api/automation/renders/${encodeURIComponent(uiState.n8nRenderId)}/approve`, {
        method: 'POST'
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || `HTTP ${response.status}`);
      applyN8nAutomationState(payload.automation, uiState.n8nRenderId);
      showToast('Verified render queued for n8n publishing.', 'success');
    } catch (error) {
      showToast(`n8n approval failed: ${error.message}`, 'error');
      approveN8nPublishingBtn.disabled = false;
    }
  }

  // --- Utilities ---

  function formatVisualType(visualType) {
    return String(visualType || 'documentary-footage')
      .split('-')
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  function createGeminiTraceSessionId() {
    const suffix = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '')
      : `${Date.now()}${Math.random().toString(36).slice(2)}`;
    return `gemini_${suffix}`.slice(0, 96);
  }

  function openGeminiTraceModal() {
    geminiTraceModal.classList.remove('hidden');
    loadGeminiTrace();
    if (uiState.geminiTraceRefreshTimer) clearInterval(uiState.geminiTraceRefreshTimer);
    uiState.geminiTraceRefreshTimer = setInterval(() => {
      if (!geminiTraceModal.classList.contains('hidden')) loadGeminiTrace();
    }, 2000);
  }

  function closeGeminiTraceModal() {
    geminiTraceModal.classList.add('hidden');
    if (uiState.geminiTraceRefreshTimer) clearInterval(uiState.geminiTraceRefreshTimer);
    uiState.geminiTraceRefreshTimer = null;
  }

  async function loadGeminiTrace() {
    const sessionId = uiState.geminiTraceSessionId;
    geminiTraceRunLabel.textContent = sessionId ? 'Current run' : 'No active run';
    geminiTraceFeed.replaceChildren();
    if (!sessionId) {
      geminiTraceEmpty.hidden = false;
      geminiTraceEmpty.textContent = 'Start a generation to create a Gemini operation trace.';
      return;
    }

    refreshGeminiTraceBtn.disabled = true;
    try {
      const response = await fetch(`/api/gemini/traces/${encodeURIComponent(sessionId)}`);
      const payload = await response.json().catch(() => ({}));
      const entries = Array.isArray(payload.trace?.entries) ? payload.trace.entries : [];
      geminiTraceEmpty.hidden = entries.length > 0;
      if (entries.length === 0) {
        geminiTraceEmpty.textContent = uiState.isProcessing
          ? 'Waiting for the first Gemini operation...'
          : 'No Gemini prompts were recorded for this run.';
        return;
      }

      entries.forEach((entry, index) => {
        const card = document.createElement('details');
        card.className = 'gemini-trace-entry';
        card.open = index === entries.length - 1;
        const summary = document.createElement('summary');
        summary.textContent = `${entry.status === 'completed' ? '✓' : entry.status === 'failed' ? '×' : '…'} ${entry.operation} · ${entry.model}`;
        const meta = document.createElement('p');
        meta.className = 'text-muted';
        meta.textContent = `${entry.startedAt || ''}${entry.expectJson ? ' · JSON response requested' : ''}`;
        const promptTitle = document.createElement('strong');
        promptTitle.textContent = 'Prompt sent to Gemini';
        const prompt = document.createElement('pre');
        prompt.className = 'gemini-trace-text';
        prompt.textContent = entry.prompt || '(no text prompt recorded)';
        const responseTitle = document.createElement('strong');
        responseTitle.textContent = 'Gemini response';
        const responseText = document.createElement('pre');
        responseText.className = 'gemini-trace-text';
        responseText.textContent = entry.response || '(no response returned)';
        card.append(summary, meta, promptTitle, prompt, responseTitle, responseText);
        if (entry.error) {
          const error = document.createElement('p');
          error.className = 'gemini-trace-error';
          error.textContent = `Error: ${entry.error}`;
          card.append(error);
        }
        geminiTraceFeed.append(card);
      });
    } catch (error) {
      geminiTraceEmpty.hidden = false;
      geminiTraceEmpty.textContent = `Unable to load the Gemini chat: ${error.message}`;
    } finally {
      refreshGeminiTraceBtn.disabled = false;
    }
  }

  function appendChatMessage(sender, text) {
    const msg = document.createElement('div');
    msg.className = `chat-msg ${sender}-msg`;
    msg.innerHTML = `<div class="msg-content">${formatMarkdown(text)}</div>`;
    chatFeed.appendChild(msg);
    chatFeed.scrollTop = chatFeed.scrollHeight;
  }

  function timelineProposalActions(response) {
    if (Array.isArray(response?.actions) && response.actions.length > 0) return response.actions;
    if (response?.action?.type === 'BATCH_ACTION') return response.action.actions || [];
    return response?.action ? [response.action] : [];
  }

  function describeTimelineAction(action) {
    const manifest = ProjectStore.getManifest();
    const scene = manifest.scenes.find((item) => item.id === action.sceneId);
    const sceneLabel = scene ? `Scene ${scene.index}` : 'Timeline';
    if (action.type === 'SET_SCENE_DURATION') return `${sceneLabel}: set duration to ${action.durationSec}s`;
    if (action.type === 'SET_SCENE_MOTION') return `${sceneLabel}: use ${action.motion.replace(/-/g, ' ')} motion`;
    if (action.type === 'MOVE_SCENE') return `${sceneLabel}: move to position ${action.toIndex}`;
    if (action.type === 'REORDER_SCENES') return `Reorder all ${action.orderedSceneIds.length} scenes`;
    if (action.type === 'REPLACE_VISUAL') return `${sceneLabel}: replace visual using “${action.query || 'Gemini search'}”`;
    if (action.type === 'REWRITE_SCENE_TEXT') return `${sceneLabel}: rewrite narration`;
    if (action.type === 'SET_CAPTION_STYLE') return `Captions: ${action.style}${action.position ? `, ${action.position}` : ''}`;
    if (action.type === 'SET_BGM_CONFIG') return `Music: ${Math.round((action.bgm?.volume || 0) * 100)}% volume`;
    if (action.type === 'SET_THEME') return `Project theme: ${action.theme}`;
    if (action.type === 'ADD_SCENE') return 'Add a new scene beat';
    if (action.type === 'REMOVE_SCENE') return `${sceneLabel}: remove scene`;
    return action.type.replace(/_/g, ' ').toLowerCase();
  }

  function appendTimelineProposal(response, baseRevision) {
    const actions = timelineProposalActions(response);
    if (actions.length === 0) return;
    const jobId = response.jobId || response.id || '';
    const proposalId = ++uiState.timelineProposalSerial;
    const card = document.createElement('section');
    card.className = 'timeline-edit-proposal';
    card.setAttribute('aria-label', `Gemini timeline edit proposal ${proposalId}`);

    const header = document.createElement('div');
    header.className = 'proposal-header';
    const title = document.createElement('strong');
    title.textContent = `Gemini proposal · ${actions.length} edit${actions.length === 1 ? '' : 's'}`;
    const badge = document.createElement('span');
    badge.className = 'proposal-engine-badge';
    badge.textContent = 'Gemini tools · staged';
    header.append(title, badge);

    const metadata = document.createElement('p');
    metadata.className = 'proposal-metadata';
    metadata.textContent = `Base revision ${baseRevision} · ${response.operationSchemaVersion || '1.0.0'} operation schema${jobId ? ` · job ${jobId}` : ''}`;

    const list = document.createElement('ol');
    list.className = 'proposal-action-list';
    actions.forEach((action) => {
      const item = document.createElement('li');
      item.textContent = describeTimelineAction(action);
      list.appendChild(item);
    });

    const footer = document.createElement('div');
    footer.className = 'proposal-actions';
    const cancelButton = document.createElement('button');
    cancelButton.className = 'btn btn-secondary btn-sm';
    cancelButton.type = 'button';
    cancelButton.textContent = 'Discard';
    const rebaseButton = document.createElement('button');
    rebaseButton.className = 'btn btn-secondary btn-sm hidden';
    rebaseButton.type = 'button';
    rebaseButton.textContent = 'Rebase on Current Timeline';
    const applyButton = document.createElement('button');
    applyButton.className = 'btn btn-primary btn-sm';
    applyButton.type = 'button';
    applyButton.textContent = 'Apply to Timeline';
    footer.append(cancelButton, rebaseButton, applyButton);
    card.append(header, metadata, list, footer);
    chatFeed.appendChild(card);
    chatFeed.scrollTop = chatFeed.scrollHeight;

    let resultLine = null;
    const showResult = (message) => {
      if (!resultLine) {
        resultLine = document.createElement('p');
        resultLine.className = 'proposal-result';
        card.appendChild(resultLine);
      }
      resultLine.textContent = message;
    };

    const settle = (state, message) => {
      card.dataset.state = state;
      applyButton.disabled = true;
      cancelButton.disabled = true;
      rebaseButton.disabled = true;
      showResult(message);
    };

    cancelButton.addEventListener('click', async () => {
      cancelButton.disabled = true;
      applyButton.disabled = true;
      try {
        if (jobId) await AIRushAgent.rejectProposal(jobId);
        settle('discarded', 'Proposal rejected. The active timeline was not changed.');
      } catch (error) {
        cancelButton.disabled = false;
        applyButton.disabled = false;
        showResult(`Could not reject the proposal: ${error.message}`);
      }
    });

    applyButton.addEventListener('click', async () => {
      applyButton.disabled = true;
      cancelButton.disabled = true;
      try {
        if (!jobId) throw new Error('This proposal has no persistent director job id.');
        await ProjectStore.saveNow('Before Gemini proposal approval');
        const approval = await AIRushAgent.approveProposal(jobId);
        ProjectStore.acceptCommittedTransaction(
          approval.transaction,
          approval.manifest,
          response.description || 'Gemini video-use timeline edit'
        );
        settle('applied', 'Approved and applied as one undoable transaction. video-use will render this committed revision.');
        showToast(response.description || 'Gemini timeline proposal applied', 'success');
      } catch (error) {
        if (error.code === 'STALE_PROPOSAL') {
          card.dataset.state = 'stale';
          rebaseButton.classList.remove('hidden');
          rebaseButton.disabled = false;
          cancelButton.disabled = false;
          showResult('The timeline changed after this proposal. Reject it or rebase Gemini on the current revision.');
          showToast('Proposal is stale; no edit was applied.', 'warning');
          return;
        }
        applyButton.disabled = false;
        cancelButton.disabled = false;
        showResult(`Could not apply the proposal: ${error.message}`);
        showToast(`Proposal apply failed: ${error.message}`, 'error');
      }
    });

    rebaseButton.addEventListener('click', async () => {
      rebaseButton.disabled = true;
      cancelButton.disabled = true;
      try {
        const rebasedJob = await AIRushAgent.rebaseProposal(jobId, ProjectStore.getManifest(), uiState.activeSceneIndex, {
          onJobCreated(job) {
            uiState.activeDirectorJobId = job.id;
            cancelDirectorBtn.classList.remove('hidden');
          }
        });
        const rebasedResponse = {
          ...rebasedJob,
          jobId: rebasedJob.id,
          actions: rebasedJob.operations || [],
          action: rebasedJob.operations?.length ? { type: 'BATCH_ACTION', actions: rebasedJob.operations } : null
        };
        appendChatMessage('bot', rebasedJob.replyText || rebasedJob.summary || 'Gemini rebased the proposal.');
        if (rebasedResponse.requiresConfirmation && rebasedResponse.actions.length > 0) {
          appendTimelineProposal(rebasedResponse, rebasedJob.baseRevision);
        }
        settle('rebased', 'Superseded by a new Gemini proposal based on the current timeline.');
      } catch (error) {
        rebaseButton.disabled = false;
        cancelButton.disabled = false;
        showResult(`Could not rebase the proposal: ${error.message}`);
      } finally {
        uiState.activeDirectorJobId = '';
        cancelDirectorBtn.classList.add('hidden');
      }
    });
  }

  function formatMarkdown(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\n\n/g, '<br><br>')
      .replace(/\n/g, '<br>');
  }

  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = 'toast';
    const icon = type === 'success' ? 'circle-check' : type === 'warning' ? 'triangle-exclamation' : type === 'error' ? 'circle-xmark' : 'circle-info';
    const color = type === 'success' ? 'var(--accent-green)' : type === 'error' ? 'var(--accent-rose)' : 'var(--accent-cyan)';
    toast.innerHTML = `<i class="fa-solid fa-${icon}" style="color: ${color}"></i> <span>${message}</span>`;
    document.getElementById('toastContainer').appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  function delay(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }
});
