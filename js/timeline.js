/**
 * VidRush Studio - Multi-Track Visual Timeline Component
 * Pure view over the canonical Project Manifest.
 * Renders tracks for:
 * 1. Visual B-Roll / Clips (with thumbnails, duration, draggable trim handles)
 * 2. Voiceover Narration Waveform Track
 * 3. Background Music Ducking Track
 * 4. Kinetic Subtitles / Captions Track
 */

const VisualTimeline = (() => {
  let containerEl = null;
  let tracksWrapperEl = null;
  let timeRulerEl = null;
  let manifest = null;
  let activeSceneIndex = 0;
  let onSeek = null;

  function init(options) {
    containerEl = options.containerEl;
    tracksWrapperEl = options.tracksWrapperEl;
    timeRulerEl = options.timeRulerEl;
    onSeek = options.onSeek;

    setupGlobalScrubber();
  }

  function render(currentManifest, currentIdx = 0) {
    manifest = currentManifest;
    activeSceneIndex = currentIdx;
    if (!tracksWrapperEl || !manifest) return;

    tracksWrapperEl.innerHTML = '';
    const scenes = manifest.scenes || [];
    const totalDuration = ProjectManifest.getTotalDuration(manifest);

    renderTimeRuler(totalDuration);

    if (scenes.length === 0) {
      tracksWrapperEl.innerHTML = '<div class="empty-timeline-hint">Your video timeline tracks (Visuals, Voiceover, BGM Ducking, Subtitles) will display here.</div>';
      return;
    }

    // --- Track 1: Visual Clips Track ---
    const visualTrack = document.createElement('div');
    visualTrack.className = 'timeline-track track-visuals';

    scenes.forEach((scene, index) => {
      const blockWidthPercent = totalDuration > 0 ? ((scene.durationSec || 4) / totalDuration) * 100 : 20;
      const block = document.createElement('div');
      const isVideo = scene.visual?.type === 'video';
      const isActive = index === activeSceneIndex;
      block.className = `timeline-scene-block ${isVideo ? 'is-video' : 'is-photo'} ${isActive ? 'active-tl-block' : ''}`;
      block.style.width = `${blockWidthPercent}%`;
      block.id = `tl-block-${scene.id}`;

      const mediaThumb = scene.visual?.thumbnail || scene.visual?.url || '';

      block.innerHTML = `
        <div class="block-preview-strip">
          ${mediaThumb ? `<img src="${mediaThumb}" alt="Scene ${index + 1}" class="block-thumb">` : `<div class="block-thumb-placeholder"><i class="fa-solid fa-image"></i></div>`}
          <div class="block-info">
            <span class="block-scene-num">#${index + 1}</span>
            <span class="block-duration-tag">${scene.durationSec || 4}s</span>
          </div>
        </div>
        <div class="block-trim-handle handle-right" title="Drag to trim duration"></div>
      `;

      block.addEventListener('click', (e) => {
        if (e.target.classList.contains('block-trim-handle')) return;
        if (onSeek) onSeek(index);
      });

      setupTrimHandles(block, scene);
      visualTrack.appendChild(block);
    });

    // --- Track 2: Voiceover / Narration Waveform Track ---
    const audioTrack = document.createElement('div');
    audioTrack.className = 'timeline-track track-audio';

    scenes.forEach((scene, index) => {
      const blockWidthPercent = totalDuration > 0 ? ((scene.durationSec || 4) / totalDuration) * 100 : 20;
      const audioBlock = document.createElement('div');
      const isActive = index === activeSceneIndex;
      audioBlock.className = `timeline-audio-block ${isActive ? 'active-tl-block' : ''}`;
      audioBlock.style.width = `${blockWidthPercent}%`;
      audioBlock.innerHTML = `
        <div class="waveform-bars">
          <span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span>
        </div>
        <span class="audio-caption-preview">${(scene.text || '').slice(0, 32)}...</span>
      `;
      audioBlock.addEventListener('click', () => {
        if (onSeek) onSeek(index);
      });
      audioTrack.appendChild(audioBlock);
    });

    // --- Track 3: Background Music Ducking Track ---
    const bgmTrack = document.createElement('div');
    bgmTrack.className = 'timeline-track track-bgm';
    const bgmBlock = document.createElement('div');
    bgmBlock.className = 'timeline-bgm-block';
    bgmBlock.style.width = '100%';
    const bgmVol = Math.round((manifest.audio?.backgroundMusic?.volume || 0.15) * 100);
    bgmBlock.innerHTML = `
      <div class="bgm-wave-strip">
        <i class="fa-solid fa-wave-square"></i>
        <span>${manifest.audio?.backgroundMusic?.trackName || 'Cinematic Ambient Bed'} (${bgmVol}% Ducking Volume)</span>
      </div>
    `;
    bgmTrack.appendChild(bgmBlock);

    // --- Track 4: Captions Track ---
    const captionTrack = document.createElement('div');
    captionTrack.className = 'timeline-track track-captions';

    scenes.forEach((scene) => {
      const blockWidthPercent = totalDuration > 0 ? ((scene.durationSec || 4) / totalDuration) * 100 : 20;
      const capBlock = document.createElement('div');
      capBlock.className = 'timeline-caption-block';
      capBlock.style.width = `${blockWidthPercent}%`;
      capBlock.innerHTML = `<span class="caption-chip"><i class="fa-solid fa-quote-left"></i> ${scene.captionText || scene.text || ''}</span>`;
      captionTrack.appendChild(capBlock);
    });

    tracksWrapperEl.appendChild(visualTrack);
    tracksWrapperEl.appendChild(audioTrack);
    tracksWrapperEl.appendChild(bgmTrack);
    tracksWrapperEl.appendChild(captionTrack);
  }

  function renderTimeRuler(totalDuration) {
    if (!timeRulerEl) return;
    timeRulerEl.innerHTML = '';
    const step = Math.max(1, Math.floor(totalDuration / 10));

    for (let sec = 0; sec <= Math.ceil(totalDuration); sec += step) {
      const marker = document.createElement('div');
      marker.className = 'ruler-marker';
      const pct = totalDuration > 0 ? (sec / totalDuration) * 100 : 0;
      marker.style.left = `${pct}%`;
      marker.innerHTML = `<span class="marker-label">${formatSeconds(sec)}</span>`;
      timeRulerEl.appendChild(marker);
    }
  }

  function setupTrimHandles(blockEl, scene) {
    const rightHandle = blockEl.querySelector('.handle-right');
    if (!rightHandle) return;

    let startX = 0;
    let initialDuration = scene.durationSec || 4;

    rightHandle.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      startX = e.clientX;
      initialDuration = scene.durationSec || 4;

      function onMouseMove(moveEvent) {
        const deltaX = moveEvent.clientX - startX;
        const deltaSeconds = deltaX * 0.05; // 20px = 1 sec
        const newDuration = Math.max(0.5, Math.min(120, Math.round((initialDuration + deltaSeconds) * 10) / 10));

        const tag = blockEl.querySelector('.block-duration-tag');
        if (tag) tag.textContent = `${newDuration}s`;
      }

      function onMouseUp(upEvent) {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);

        const deltaX = upEvent.clientX - startX;
        const deltaSeconds = deltaX * 0.05;
        const finalDuration = Math.max(0.5, Math.min(120, Math.round((initialDuration + deltaSeconds) * 10) / 10));

        if (finalDuration !== initialDuration) {
          ProjectStore.dispatch({
            type: 'SET_SCENE_DURATION',
            sceneId: scene.id,
            durationSec: finalDuration
          }, `Trim Scene #${scene.index} duration to ${finalDuration}s`);
        }
      }

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }

  function setupGlobalScrubber() {
    if (!tracksWrapperEl) return;

    tracksWrapperEl.addEventListener('click', (e) => {
      if (e.target.classList.contains('block-trim-handle')) return;
      const rect = tracksWrapperEl.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const pct = Math.max(0, Math.min(1, clickX / rect.width));

      const scenes = manifest?.scenes || [];
      const totalDuration = ProjectManifest.getTotalDuration(manifest);
      const seekTime = pct * totalDuration;

      let accumulated = 0;
      for (let i = 0; i < scenes.length; i++) {
        accumulated += (scenes[i].durationSec || 4);
        if (seekTime <= accumulated || i === scenes.length - 1) {
          if (onSeek) onSeek(i);
          break;
        }
      }
    });
  }

  function updatePlayhead(currentSceneIndex) {
    activeSceneIndex = currentSceneIndex;
    const scenes = manifest?.scenes || [];
    document.querySelectorAll('.timeline-scene-block.active-tl-block, .timeline-audio-block.active-tl-block').forEach((b) => b.classList.remove('active-tl-block'));
    if (scenes[currentSceneIndex]) {
      const activeBlock = document.getElementById(`tl-block-${scenes[currentSceneIndex].id}`);
      if (activeBlock) activeBlock.classList.add('active-tl-block');
    }
  }

  function formatSeconds(secs) {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  return {
    init,
    render,
    updatePlayhead
  };
})();
