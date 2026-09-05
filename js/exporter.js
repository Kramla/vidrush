/**
 * VidRush Studio - Master Export & Render Pipeline
 * 
 * Translates the canonical Project Manifest into:
 * 1. video-use EDL + 1080p MP4 rendering job (/api/render)
 * 2. Preflight quote analysis (/api/generation/preflight)
 * 3. SRT / WebVTT Subtitles
 * 4. Project Manifest JSON
 * 5. Production Script TXT
 * 6. Asset Provenance CSV
 */

const Exporter = (() => {
  async function fetchPreflightQuote(payload) {
    const response = await fetch('/api/generation/preflight', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `Preflight request returned HTTP ${response.status}`);
    }
    return response.json();
  }

  async function renderMp4Video(manifest, onProgress) {
    if (onProgress) onProgress('Compiling the Gemini-edited timeline into a video-use EDL...');

    const payload = {
      project: {
        id: manifest.id,
        title: manifest.metadata?.title || 'VidRush Video',
        format: manifest.metadata?.format || 'documentary',
        theme: manifest.metadata?.theme || 'cinematic-documentary',
        aspectRatio: manifest.metadata?.aspectRatio || '16:9',
        sourcePolicy: manifest.metadata?.sourcePolicy
      },
      settings: {
        fps: manifest.settings?.fps || 30
      },
      captionStyle: {
        preset: manifest.captions?.style || 'hormozi',
        position: manifest.captions?.position || 'bottom',
        size: manifest.captions?.fontSize || 44,
        enabled: manifest.captions?.enabled !== false
      },
      backgroundMusic: {
        enabled: manifest.audio?.backgroundMusic?.enabled !== false,
        track: manifest.audio?.backgroundMusic?.trackId || 'ambient-cinematic',
        volume: manifest.audio?.backgroundMusic?.volume || 0.15
      },
      voice: VoiceProvider.getRenderConfig(),
      geminiApiKey: typeof AIAssistant !== 'undefined' ? AIAssistant.getGeminiKey() : '',
      scenes: (manifest.scenes || []).map((s) => ({
        id: s.id,
        text: s.text,
        caption: s.captionText || s.text,
        duration: s.durationSec || 4,
        shotType: s.shotDirection?.shotType,
        editing: {
          motion: s.editing?.motion || 'auto',
          sourceStartSec: s.editing?.sourceStartSec || 0
        },
        selectedMedia: s.visual
      }))
    };

    const response = await fetch('/api/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `Render job failed with HTTP ${response.status}`);
    }

    const result = await response.json();
    return result.render;
  }

  function generateSRT(manifest) {
    const scenes = manifest.scenes || [];
    let srtContent = '';

    scenes.forEach((scene, index) => {
      srtContent += `${index + 1}\n`;
      srtContent += `${formatSRTTime(scene.startSec)} --> ${formatSRTTime(scene.endSec)}\n`;
      srtContent += `${scene.captionText || scene.text}\n\n`;
    });

    return srtContent;
  }

  function generateVTT(manifest) {
    const scenes = manifest.scenes || [];
    let vttContent = 'WEBVTT - VidRush Studio Subtitles\n\n';

    scenes.forEach((scene, index) => {
      vttContent += `${index + 1}\n`;
      vttContent += `${formatVTTTime(scene.startSec)} --> ${formatVTTTime(scene.endSec)}\n`;
      vttContent += `${scene.captionText || scene.text}\n\n`;
    });

    return vttContent;
  }

  function generateProjectJSON(manifest) {
    return JSON.stringify(manifest, null, 2);
  }

  function generateMediaCSV(manifest) {
    const scenes = manifest.scenes || [];
    const prov = manifest.provenance || {};
    let csv = 'Scene_Number,Duration_Sec,Start_Sec,End_Sec,Media_Type,Media_Source,Media_URL,License,Shot_Type,Narration_Script\n';

    scenes.forEach((s) => {
      const visual = s.visual || {};
      const provItem = prov[visual.assetId] || {};
      const cleanText = `"${(s.text || '').replace(/"/g, '""')}"`;
      const cleanShot = `"${(s.shotDirection?.shotType || '').replace(/"/g, '""')}"`;
      const cleanSource = `"${(visual.source || provItem.source || 'stock').replace(/"/g, '""')}"`;
      const cleanLicense = `"${(provItem.license || 'Commercial Free').replace(/"/g, '""')}"`;
      csv += `${s.index},${s.durationSec},${s.startSec},${s.endSec},${visual.type || 'unknown'},${cleanSource},${visual.url || ''},${cleanLicense},${cleanShot},${cleanText}\n`;
    });

    return csv;
  }

  function generateScriptTXT(manifest) {
    const meta = manifest.metadata || {};
    const scenes = manifest.scenes || [];
    const totalDuration = ProjectManifest.getTotalDuration(manifest);

    let txt = `========================================================\n`;
    txt += `VIDRUSH STUDIO - PRODUCTION SCRIPT & SHOT LIST\n`;
    txt += `Project: ${meta.title || 'Untitled Video'}\n`;
    txt += `Format: ${meta.format || 'documentary'} (${meta.aspectRatio || '16:9'})\n`;
    txt += `Total Scenes: ${scenes.length} | Est. Duration: ${totalDuration}s\n`;
    txt += `========================================================\n\n`;

    scenes.forEach((s) => {
      txt += `[SCENE ${s.index}] (${s.durationSec}s | ${formatSeconds(s.startSec)} - ${formatSeconds(s.endSec)})\n`;
      txt += `Shot Direction: ${s.shotDirection?.shotType || 'Cinematic Shot'}\n`;
      txt += `Narration: "${s.text}"\n`;
      if (s.shotDirection?.directorReasoning) {
        txt += `Director Note: ${s.shotDirection.directorReasoning}\n`;
      }
      if (s.visual) {
        txt += `Visual Asset: [${s.visual.type?.toUpperCase()}] ${s.visual.title || s.visual.url}\n`;
      }
      txt += `\n--------------------------------------------------------\n\n`;
    });

    return txt;
  }

  function downloadFile(content, fileName, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function formatSRTTime(seconds) {
    const ms = Math.floor((seconds % 1) * 1000);
    const totalSecs = Math.floor(seconds);
    const s = totalSecs % 60;
    const m = Math.floor((totalSecs / 60) % 60);
    const h = Math.floor(totalSecs / 3600);
    return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)},${pad(ms, 3)}`;
  }

  function formatVTTTime(seconds) {
    const ms = Math.floor((seconds % 1) * 1000);
    const totalSecs = Math.floor(seconds);
    const s = totalSecs % 60;
    const m = Math.floor((totalSecs / 60) % 60);
    const h = Math.floor(totalSecs / 3600);
    return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)}.${pad(ms, 3)}`;
  }

  function formatSeconds(secs) {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${pad(s, 2)}`;
  }

  function pad(num, size) {
    let s = num + '';
    while (s.length < size) s = '0' + s;
    return s;
  }

  return {
    fetchPreflightQuote,
    renderMp4Video,
    generateSRT,
    generateVTT,
    generateProjectJSON,
    generateMediaCSV,
    generateScriptTXT,
    downloadFile
  };
})();
