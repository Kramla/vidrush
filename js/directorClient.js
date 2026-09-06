/**
 * Browser client for the persistent Node-hosted Gemini director loop.
 */

const AIRushAgent = (() => {
  let activeJobId = '';

  function apiOrigin() {
    return typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'http://127.0.0.1:8080';
  }

  function delay(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  async function requestJson(path, options = {}) {
    const response = await fetch(`${apiOrigin()}${path}`, options);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || `Director request returned HTTP ${response.status}.`);
      error.code = payload.code || 'DIRECTOR_REQUEST_FAILED';
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  async function waitForJob(jobId, callbacks = {}) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 12 * 60 * 1000) {
      const payload = await requestJson(`/api/director/jobs/${encodeURIComponent(jobId)}`, { cache: 'no-store' });
      const job = payload.job;
      callbacks.onProgress?.(job);
      if (['awaiting_approval', 'completed', 'failed', 'cancelled', 'rejected', 'stale', 'approved'].includes(job.status)) {
        if (job.status === 'failed') {
          const error = new Error(job.error || 'Gemini director job failed.');
          error.code = 'DIRECTOR_FAILED';
          throw error;
        }
        if (job.status === 'cancelled') {
          const error = new Error('Gemini director job was cancelled.');
          error.code = 'DIRECTOR_CANCELLED';
          throw error;
        }
        return job;
      }
      await delay(650);
    }
    throw new Error('Gemini director timed out while the persistent job remains available in the server.');
  }

  async function startJob(path, body, callbacks = {}) {
    const payload = await requestJson(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    activeJobId = payload.job.id;
    callbacks.onJobCreated?.(payload.job);
    try {
      return await waitForJob(payload.job.id, callbacks);
    } finally {
      if (activeJobId === payload.job.id) activeJobId = '';
    }
  }

  async function parseCommand(userMessage, manifest, currentSceneIndex = 0, callbacks = {}) {
    const command = String(userMessage || '').trim();
    if (!command) throw new Error('A Gemini director command is required.');
    const job = await startJob('/api/director/jobs', {
      command,
      projectId: manifest.id,
      activeSceneIndex: currentSceneIndex
    }, callbacks);
    return {
      ...job,
      jobId: job.id,
      action: job.operations?.length ? { type: 'BATCH_ACTION', actions: job.operations } : null,
      actions: job.operations || [],
      replyText: job.replyText || job.summary || 'Gemini completed its project inspection.',
      requiresConfirmation: job.status === 'awaiting_approval'
    };
  }

  async function approveProposal(jobId) {
    return requestJson(`/api/director/jobs/${encodeURIComponent(jobId)}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    });
  }

  async function rejectProposal(jobId) {
    return requestJson(`/api/director/jobs/${encodeURIComponent(jobId)}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    });
  }

  async function rebaseProposal(jobId, manifest, currentSceneIndex = 0, callbacks = {}) {
    return startJob(`/api/director/jobs/${encodeURIComponent(jobId)}/rebase`, {
      projectId: manifest.id,
      activeSceneIndex: currentSceneIndex
    }, callbacks);
  }

  async function cancelJob(jobId = activeJobId) {
    if (!jobId) return null;
    const payload = await requestJson(`/api/director/jobs/${encodeURIComponent(jobId)}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    });
    if (activeJobId === jobId) activeJobId = '';
    return payload.job;
  }

  const api = {
    approveProposal,
    cancelJob,
    getActiveJobId: () => activeJobId,
    parseCommand,
    rebaseProposal,
    rejectProposal,
    waitForJob
  };

  if (typeof window !== 'undefined') window.AIRushAgent = api;
  if (typeof globalThis !== 'undefined') globalThis.AIRushAgent = api;
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
