const assert = require('node:assert/strict');
const ProjectManifest = require('../js/manifest');
const EditingEngine = require('../js/editingEngine');

const base = ProjectManifest.createDefault({ id: 'proj_engine_check', title: 'Engine Check' });
base.metadata.createdAt = '2026-01-01T00:00:00.000Z';
base.metadata.updatedAt = '2026-01-01T00:00:00.000Z';
base.scenes = [
  ProjectManifest.createScene({ id: 'scene_a', text: 'First exact narration sentence.', durationSec: 4 }),
  ProjectManifest.createScene({ id: 'scene_b', text: 'Second exact narration sentence.', durationSec: 5 })
];
const manifest = ProjectManifest.recalculateTimings(base, { updatedAt: base.metadata.updatedAt });
const action = {
  type: 'BATCH_ACTION',
  actions: [
    { type: 'SET_SCENE_DURATION', sceneId: 'scene_a', durationSec: 6.25 },
    { type: 'SET_SCENE_MOTION', sceneId: 'scene_b', motion: 'pan-left' },
    { type: 'SET_CAPTION_STYLE', style: 'minimal', position: 'bottom', fontSize: 40 }
  ],
  meta: {
    transactionId: 'tx_engine_check',
    timestamp: '2026-01-02T00:00:00.000Z',
    source: 'test',
    baseRevision: 1
  }
};

const first = EditingEngine.prepareTransaction(manifest, action);
const second = EditingEngine.prepareTransaction(manifest, action);
assert.deepEqual(first.manifest, second.manifest, 'same input transaction must produce identical output');
assert.equal(first.manifest.metadata.revision, 2, 'an atomic batch increments revision exactly once');
assert.equal(first.manifest.scenes[0].durationSec, 6.25);
assert.equal(first.manifest.scenes[1].editing.motion, 'pan-left');
assert.equal(first.manifest.captions.style, 'minimal');
assert.equal(first.transaction.operationSchemaVersion, EditingEngine.OPERATION_SCHEMA_VERSION);
assert.throws(
  () => EditingEngine.prepareTransaction(first.manifest, action),
  (error) => error.code === 'STALE_TRANSACTION'
);

console.log('editing-engine-check: ok');
