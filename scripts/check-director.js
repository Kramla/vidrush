const assert = require('node:assert/strict');
const ProjectManifest = require('../js/manifest');
const EditingEngine = require('../js/editingEngine');
const { createDirectorService } = require('../directorService');

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function createMemoryPersistence() {
  const directorJobs = new Map();
  const generationJobs = new Map();
  let clock = 0;
  const timestamp = () => `2026-01-01T00:00:${String(clock++).padStart(2, '0')}.000Z`;

  return {
    directorJobs,
    generationJobs,
    recoverInterruptedDirectorJobs() {},
    createDirectorJob(payload) {
      const at = timestamp();
      const job = {
        ...clone(payload),
        operations: clone(payload.operations || []),
        toolTrace: clone(payload.toolTrace || []),
        usage: clone(payload.usage || {}),
        result: clone(payload.result || null),
        stagedManifest: clone(payload.stagedManifest || null),
        createdAt: at,
        updatedAt: at,
        completedAt: ''
      };
      directorJobs.set(job.id, job);
      return clone(job);
    },
    updateDirectorJob(jobId, patch) {
      const current = directorJobs.get(jobId);
      if (!current) return null;
      const next = { ...current, ...clone(patch), updatedAt: timestamp() };
      if (['completed', 'approved', 'rejected', 'cancelled', 'failed', 'stale'].includes(next.status)) next.completedAt ||= next.updatedAt;
      directorJobs.set(jobId, next);
      return clone(next);
    },
    getDirectorJob(jobId) {
      return clone(directorJobs.get(jobId) || null);
    },
    listDirectorJobs(limit = 30) {
      return [...directorJobs.values()].slice(-Number(limit)).reverse().map(clone);
    },
    createGenerationJob(payload) {
      const at = timestamp();
      const job = {
        id: payload.id,
        projectId: payload.projectId || '',
        status: 'queued',
        stage: payload.stage || 'queued',
        progress: 0,
        message: payload.message || '',
        input: clone(payload.input || {}),
        options: clone(payload.options || {}),
        result: null,
        error: '',
        createdAt: at,
        updatedAt: at,
        completedAt: ''
      };
      generationJobs.set(job.id, job);
      return clone(job);
    },
    updateGenerationJob(jobId, patch) {
      const current = generationJobs.get(jobId);
      if (!current) return null;
      const next = { ...current, ...clone(patch), updatedAt: timestamp() };
      if (['completed', 'failed', 'cancelled'].includes(next.status)) next.completedAt = next.updatedAt;
      generationJobs.set(jobId, next);
      return clone(next);
    },
    getGenerationJob(jobId) {
      return clone(generationJobs.get(jobId) || null);
    }
  };
}

function modelOutput(calls = [], text = '') {
  const parts = calls.map((call) => ({ functionCall: call }));
  if (text) parts.push({ text });
  return {
    content: { role: 'model', parts },
    functionCalls: calls,
    text,
    usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 }
  };
}

function findFunctionResult(contents, name) {
  for (const content of contents) {
    for (const part of content.parts || []) {
      if (part.functionResponse?.name === name) return part.functionResponse.response;
    }
  }
  return null;
}

function createMockModelTurn(persistence) {
  let turn = 0;
  return async (options) => {
    turn += 1;
    if (turn === 1) return modelOutput([{ id: 'call_project', name: 'inspect_project', args: {} }]);
    if (turn === 2) {
      return modelOutput([
        { id: 'call_transcript', name: 'read_transcript', args: { offset: 0, limit: 20 } },
        { id: 'call_media', name: 'inspect_available_media', args: { offset: 0, limit: 20, candidatesPerScene: 6 } }
      ]);
    }
    if (turn === 3) {
      const revision = findFunctionResult(options.contents, 'inspect_project')?.revision || 1;
      return modelOutput([{
        id: 'call_proposal',
        name: 'propose_edits',
        args: {
          baseRevision: revision,
          description: 'Tighten opening scene',
          replyText: 'I staged a tighter opening with the verified visual.',
          operations: [
            { type: 'SET_SCENE_DURATION', sceneId: 'scene_a', durationSec: 6.25 },
            { type: 'REPLACE_VISUAL', sceneId: 'scene_a', assetId: 'verified_asset' }
          ]
        }
      }]);
    }
    if (turn === 4) return modelOutput([{ id: 'call_preview', name: 'request_draft_preview', args: { label: 'Opening draft' } }]);
    if (turn === 5) {
      const jobId = [...persistence.generationJobs.keys()].at(-1);
      return modelOutput([{ id: 'call_job', name: 'inspect_job_results', args: { jobId } }]);
    }
    return modelOutput([], 'I inspected the preview and staged two edits. Apply is required before the active project changes.');
  };
}

function createManifest() {
  const manifest = ProjectManifest.createDefault({ id: 'proj_director_check', title: 'Director Check' });
  manifest.metadata.createdAt = '2026-01-01T00:00:00.000Z';
  manifest.metadata.updatedAt = '2026-01-01T00:00:00.000Z';
  const scene = ProjectManifest.createScene({ id: 'scene_a', text: 'The city wakes before sunrise.', durationSec: 4 });
  scene.visualCandidates = [{
    assetId: 'verified_asset',
    type: 'video',
    url: 'https://example.test/city.mp4',
    thumbnail: 'https://example.test/city.jpg',
    title: 'City before sunrise',
    source: 'test-stock',
    selectionStatus: 'GEMINI_VERIFIED',
    rights: { approvedForUse: true },
    visualVerification: {
      previewAnalyzed: true,
      answer: 'yes',
      eligible: true,
      verdict: 'strong-match',
      reason: 'The sampled frames visibly show a city before sunrise.'
    }
  }];
  manifest.scenes = [scene];
  return ProjectManifest.recalculateTimings(manifest, { updatedAt: manifest.metadata.updatedAt });
}

async function run() {
  const persistence = createMemoryPersistence();
  const service = createDirectorService({
    persistence,
    editingEngine: EditingEngine,
    projectManifest: ProjectManifest,
    modelTurn: createMockModelTurn(persistence),
    now: (() => {
      let tick = 0;
      return () => `2026-02-01T00:00:${String(tick++).padStart(2, '0')}.000Z`;
    })()
  });
  const base = createManifest();
  const staged = await service.startJob({ command: 'Tighten the opening and use the approved media.', manifest: base, activeSceneIndex: 0, apiKey: 'test' }, { background: false });
  assert.equal(staged.status, 'awaiting_approval');
  assert.equal(staged.actionCount, 2);
  assert.deepEqual(staged.toolTrace.map((entry) => entry.name), [
    'inspect_project',
    'read_transcript',
    'inspect_available_media',
    'propose_edits',
    'request_draft_preview',
    'inspect_job_results'
  ]);
  assert.equal(staged.previewJobIds.length, 1);

  const approval = service.approveJob(staged.id, base);
  const committed = EditingEngine.applyTransaction(base, approval.transaction);
  assert.equal(committed.metadata.revision, 2);
  assert.equal(committed.scenes[0].durationSec, 6.25);
  assert.equal(committed.scenes[0].visual.assetId, 'verified_asset');
  assert.equal(EditingEngine.manifestFingerprint(committed), staged.stagedFingerprint);

  const staleService = createDirectorService({
    persistence,
    editingEngine: EditingEngine,
    projectManifest: ProjectManifest,
    modelTurn: createMockModelTurn(persistence)
  });
  const staleProposal = await staleService.startJob({ command: 'Prepare the same edit.', manifest: base, apiKey: 'test' }, { background: false });
  const changedBase = EditingEngine.applyTransaction(base, {
    type: 'SET_THEME',
    theme: 'archive-documentary',
    meta: { transactionId: 'manual_change', timestamp: '2026-03-01T00:00:00.000Z', baseRevision: 1 }
  });
  assert.throws(() => staleService.approveJob(staleProposal.id, changedBase), (error) => error.code === 'STALE_PROPOSAL');
  assert.equal(staleService.getJob(staleProposal.id).status, 'stale');

  const rebaseService = createDirectorService({
    persistence,
    editingEngine: EditingEngine,
    projectManifest: ProjectManifest,
    modelTurn: createMockModelTurn(persistence)
  });
  const rebased = await rebaseService.rebaseJob(staleProposal.id, { manifest: changedBase, apiKey: 'test' }, { background: false });
  assert.equal(rebased.status, 'awaiting_approval');
  assert.equal(rebased.baseRevision, 2);
  assert.equal(rebased.supersedesJobId, staleProposal.id);

  console.log('director-check: ok');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
