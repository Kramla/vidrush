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
    if (onProgress) onProgress('Creating a persistent video-use final render job...');
    const response = await fetch('/api/render/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'final',
        projectId: manifest.id,
        projectRevision: manifest.metadata?.revision,
        label: 'Editor final render',
        voice: VoiceProvider.getRenderConfig()
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `Render job creation failed with HTTP ${response.status}`);
    }
    const created = await response.json();
    const jobId = created.job?.id;
    if (!jobId) throw new Error('The render service returned no persistent job id.');
    const startedAt = Date.now();
    while (Date.now() - startedAt < 30 * 60 * 1000) {
      const statusResponse = await fetch(`/api/render/jobs/${encodeURIComponent(jobId)}`, { cache: 'no-store' });
      const payload = await statusResponse.json().catch(() => ({}));
      if (!statusResponse.ok || !payload.job) throw new Error(payload.error || 'Unable to inspect the render job.');
      const job = payload.job;
      if (onProgress) onProgress(`${job.message || job.stage} (${Math.round(job.progress || 0)}%)`);
      if (job.status === 'completed') return job.result;
      if (job.status === 'failed') throw new Error(job.error || 'The persistent render job failed.');
      if (job.status === 'cancelled') throw new Error('The persistent render job was cancelled.');
      await new Promise((resolve) => setTimeout(resolve, 700));
    }
    throw new Error('The persistent render job exceeded the 30-minute editor wait limit.');
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
