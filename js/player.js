/**
 * VidRush Studio - Stage Video Player & Kinetic Caption Engine
 * Pure view over the canonical Project Manifest.
 * Renders video/image media, word-by-word kinetic captions, and syncs time.
 */

const VideoPlayer = (() => {
  let manifest = null;
  let currentSceneIndex = 0;
  let isPlaying = false;
  let showCaptions = true;
  let timerInterval = null;
  let sceneTimeout = null;
  let elapsedSeconds = 0;
  let totalProjectDuration = 0;

  // DOM references
  let videoEl = null;
  let imageEl = null;
  let captionEl = null;
  let captionsOverlayEl = null;
  let hudTimerEl = null;
  let timelineProgressEl = null;
  let currentSceneBadgeEl = null;
  let onSceneChangeCallback = null;

  function init(elements) {
    videoEl = elements.videoEl;
    imageEl = elements.imageEl;
    captionEl = elements.captionEl;
    captionsOverlayEl = document.getElementById('captionsOverlay');
    hudTimerEl = elements.hudTimerEl;
    timelineProgressEl = elements.timelineProgressEl;
    currentSceneBadgeEl = elements.currentSceneBadgeEl;
  }

  function loadManifest(newManifest, initialSceneIndex = 0) {
    manifest = newManifest;
    const scenes = manifest?.scenes || [];
    totalProjectDuration = ProjectManifest.getTotalDuration(manifest);
    currentSceneIndex = Math.min(Math.max(0, initialSceneIndex), Math.max(0, scenes.length - 1));
    
    // Recalculate elapsed seconds to start of current scene
    elapsedSeconds = scenes[currentSceneIndex]?.startSec || 0;

    applyCaptionStyles();
    renderSceneVisuals(scenes[currentSceneIndex]);
    updateProgressUI();
  }

  function applyCaptionStyles() {
    if (!captionsOverlayEl || !captionEl || !manifest) return;
    const cap = manifest.captions || {};

    captionsOverlayEl.className = `captions-overlay pos-${cap.position || 'bottom'} preset-${cap.style || 'hormozi'}`;
    captionEl.style.fontSize = `${cap.fontSize || 44}px`;
    captionsOverlayEl.classList.toggle('hidden', !cap.enabled || !showCaptions);
  }

  function start() {
    const scenes = manifest?.scenes || [];
    if (scenes.length === 0) return;
    isPlaying = true;
    playScene(currentSceneIndex);
    startTimer();
  }

  function stop() {
    isPlaying = false;
    clearTimeout(sceneTimeout);
    clearInterval(timerInterval);
    TTSEngine.stop();
    if (videoEl) {
      videoEl.pause();
      videoEl.src = '';
    }
  }

  function pause() {
    isPlaying = false;
    clearTimeout(sceneTimeout);
    clearInterval(timerInterval);
    TTSEngine.pause();
    if (videoEl) videoEl.pause();
  }

  function resume() {
    const scenes = manifest?.scenes || [];
    if (scenes.length === 0) return;
    isPlaying = true;
    TTSEngine.resume();
    if (videoEl && !videoEl.classList.contains('hidden')) {
      videoEl.play().catch(() => {});
    }
    startTimer();
  }

  function goToScene(index) {
    const scenes = manifest?.scenes || [];
    if (index < 0 || index >= scenes.length) return;
    currentSceneIndex = index;
    elapsedSeconds = scenes[currentSceneIndex]?.startSec || 0;

    if (isPlaying) {
      clearTimeout(sceneTimeout);
      playScene(currentSceneIndex);
    } else {
      renderSceneVisuals(scenes[currentSceneIndex]);
      updateProgressUI();
    }
  }

  function goToNextScene() {
    const scenes = manifest?.scenes || [];
    if (currentSceneIndex < scenes.length - 1) {
      goToScene(currentSceneIndex + 1);
    }
  }

  function goToPrevScene() {
    if (currentSceneIndex > 0) {
      goToScene(currentSceneIndex - 1);
    }
  }

  function playScene(index) {
    const scenes = manifest?.scenes || [];
    if (index >= scenes.length) {
      stop();
      currentSceneIndex = 0;
      elapsedSeconds = 0;
      updateProgressUI();
      return;
    }

    currentSceneIndex = index;
    const scene = scenes[index];
    const durationMs = (scene.durationSec || 4) * 1000;

    renderSceneVisuals(scene);
    renderKineticCaptions(scene);

    // Speak narration
    TTSEngine.speak(scene.text);

    if (onSceneChangeCallback) {
      onSceneChangeCallback(currentSceneIndex, scene);
    }

    clearTimeout(sceneTimeout);
    sceneTimeout = setTimeout(() => {
      if (isPlaying) {
        goToScene(currentSceneIndex + 1);
      }
    }, durationMs);
  }

  function renderSceneVisuals(scene) {
    if (!scene) return;
    const visual = scene.visual;

    if (visual && visual.type === 'video') {
      imageEl.classList.add('hidden');
      videoEl.classList.remove('hidden');
      videoEl.src = visual.url;
      videoEl.currentTime = 0;
      videoEl.play().catch(() => {});
    } else if (visual && visual.type === 'photo' && visual.url) {
      videoEl.pause();
      videoEl.classList.add('hidden');
      imageEl.classList.remove('hidden');
      imageEl.src = visual.url;
      imageEl.classList.remove('ken-burns');
      void imageEl.offsetWidth; // Restart CSS animation
      imageEl.classList.add('ken-burns');
    } else {
      videoEl.classList.add('hidden');
      imageEl.classList.remove('hidden');
      imageEl.removeAttribute('src');
      imageEl.alt = visual?.title || 'No scene media selected';
    }

    updateProgressUI();
  }

  function renderKineticCaptions(scene) {
    if (!captionEl || !captionsOverlayEl) return;
    if (!showCaptions || !manifest?.captions?.enabled) {
      captionsOverlayEl.classList.add('hidden');
      return;
    }
    captionsOverlayEl.classList.remove('hidden');

    const text = scene.captionText || scene.text || '';
    const words = text.split(/\s+/).filter(Boolean);

    captionEl.innerHTML = words.map((w, i) => `<span class="caption-word" id="cap_word_${i}">${w}</span>`).join(' ');

    const intervalPerWord = ((scene.durationSec || 4) * 1000) / Math.max(1, words.length);
    words.forEach((_, i) => {
      setTimeout(() => {
        if (!isPlaying) return;
        const wEl = document.getElementById(`cap_word_${i}`);
        if (wEl) {
          document.querySelectorAll('.caption-word.active-word').forEach((el) => el.classList.remove('active-word'));
          wEl.classList.add('active-word');
        }
      }, i * intervalPerWord);
    });
  }

  function startTimer() {
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      if (isPlaying) {
        elapsedSeconds += 0.25;
        updateProgressUI();
      }
    }, 250);
  }

  function updateProgressUI() {
    const scenes = manifest?.scenes || [];
    if (hudTimerEl) {
      hudTimerEl.textContent = `${formatTime(elapsedSeconds)} / ${formatTime(totalProjectDuration)}`;
    }
    if (timelineProgressEl) {
      const pct = totalProjectDuration > 0 ? (elapsedSeconds / totalProjectDuration) * 100 : 0;
      timelineProgressEl.style.width = `${Math.min(100, pct)}%`;
    }
    if (currentSceneBadgeEl && scenes[currentSceneIndex]) {
      currentSceneBadgeEl.textContent = `Scene ${currentSceneIndex + 1} / ${scenes.length}`;
    }
  }

  function formatTime(secs) {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  function setShowCaptions(val) {
    showCaptions = !!val;
    if (captionsOverlayEl) {
      captionsOverlayEl.classList.toggle('hidden', !showCaptions);
    }
  }

  function setOnSceneChange(cb) {
    onSceneChangeCallback = cb;
  }

  function getIsPlaying() { return isPlaying; }
  function getCurrentSceneIndex() { return currentSceneIndex; }

  return {
    init,
    loadManifest,
    setScenes: (scenes) => {
      if (manifest) {
        manifest.scenes = scenes;
        loadManifest(manifest, currentSceneIndex);
      }
    },
    start,
    stop,
    pause,
    resume,
    goToScene,
    goToNextScene,
    goToPrevScene,
    setShowCaptions,
    applyCaptionStyles,
    getIsPlaying,
    getCurrentSceneIndex,
    setOnSceneChange
  };
})();
