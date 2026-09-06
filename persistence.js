const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const rootDirectory = __dirname;
const dataDirectory = path.join(rootDirectory, '.scriptflow-data');
fs.mkdirSync(dataDirectory, { recursive: true });

const databasePath = path.join(dataDirectory, 'scriptflow.sqlite');
const database = new DatabaseSync(databasePath);
database.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;

  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1,
    manifest_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS project_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL,
    revision INTEGER NOT NULL,
    label TEXT NOT NULL,
    manifest_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS project_versions_project_created
    ON project_versions(project_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS generation_jobs (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    status TEXT NOT NULL,
    stage TEXT NOT NULL,
    progress REAL NOT NULL DEFAULT 0,
    message TEXT NOT NULL DEFAULT '',
    input_json TEXT NOT NULL,
    options_json TEXT NOT NULL,
    result_json TEXT,
    error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT
  );

  CREATE INDEX IF NOT EXISTS generation_jobs_updated
    ON generation_jobs(updated_at DESC);

  CREATE TABLE IF NOT EXISTS generation_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT NOT NULL,
    stage TEXT NOT NULL,
    status TEXT NOT NULL,
    progress REAL NOT NULL,
    message TEXT NOT NULL DEFAULT '',
    detail_json TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY(job_id) REFERENCES generation_jobs(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS generation_events_job_created
    ON generation_events(job_id, created_at ASC);

  CREATE TABLE IF NOT EXISTS render_jobs (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    project_revision INTEGER NOT NULL,
    type TEXT NOT NULL,
    status TEXT NOT NULL,
    stage TEXT NOT NULL,
    progress REAL NOT NULL DEFAULT 0,
    message TEXT NOT NULL DEFAULT '',
    input_json TEXT NOT NULL,
    result_json TEXT,
    error TEXT,
    logs_json TEXT NOT NULL DEFAULT '[]',
    process_id INTEGER,
    created_at TEXT NOT NULL,
    started_at TEXT,
    updated_at TEXT NOT NULL,
    completed_at TEXT
  );

  CREATE INDEX IF NOT EXISTS render_jobs_updated
    ON render_jobs(updated_at DESC);

  CREATE INDEX IF NOT EXISTS render_jobs_project
    ON render_jobs(project_id, updated_at DESC);

  CREATE TABLE IF NOT EXISTS director_jobs (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    status TEXT NOT NULL,
    stage TEXT NOT NULL,
    progress REAL NOT NULL DEFAULT 0,
    message TEXT NOT NULL DEFAULT '',
    command TEXT NOT NULL,
    base_revision INTEGER NOT NULL,
    base_fingerprint TEXT NOT NULL,
    base_manifest_json TEXT NOT NULL,
    request_json TEXT NOT NULL,
    operations_json TEXT NOT NULL DEFAULT '[]',
    staged_manifest_json TEXT,
    summary TEXT NOT NULL DEFAULT '',
    tool_trace_json TEXT NOT NULL DEFAULT '[]',
    usage_json TEXT NOT NULL DEFAULT '{}',
    result_json TEXT,
    error TEXT,
    supersedes_job_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT
  );

  CREATE INDEX IF NOT EXISTS director_jobs_updated
    ON director_jobs(updated_at DESC);

  CREATE INDEX IF NOT EXISTS director_jobs_project
    ON director_jobs(project_id, updated_at DESC);

  CREATE TABLE IF NOT EXISTS brand_profiles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    profile_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS media_search_cache (
    cache_key TEXT PRIMARY KEY,
    items_json TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS media_search_cache_expiry
    ON media_search_cache(expires_at);

  CREATE TABLE IF NOT EXISTS media_embeddings (
    asset_key TEXT NOT NULL,
    model TEXT NOT NULL,
    embedding_json TEXT NOT NULL,
    metadata_json TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY(asset_key, model)
  );
`);

const jobStatuses = new Set(['queued', 'running', 'completed', 'failed', 'cancelled']);
const renderJobStatuses = new Set(['queued', 'running', 'completed', 'failed', 'cancelled']);
const renderJobTypes = new Set(['preview', 'draft', 'grade', 'final']);
const directorJobStatuses = new Set(['queued', 'running', 'awaiting_approval', 'completed', 'approved', 'rejected', 'cancelled', 'failed', 'stale']);
const terminalDirectorStatuses = new Set(['completed', 'approved', 'rejected', 'cancelled', 'failed', 'stale']);

function nowIso() {
  return new Date().toISOString();
}

function parseJson(value, fallback = null) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function safeIdentifier(value, prefix) {
  const candidate = String(value || '').trim();
  if (/^[A-Za-z0-9._-]{4,160}$/.test(candidate)) return candidate;
  return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

function publicProjectRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function persistenceError(message, code = 'PERSISTENCE_ERROR', statusCode = 400) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function requireIdentifier(value, label = 'identifier') {
  const candidate = String(value || '').trim();
  if (!/^[A-Za-z0-9._-]{4,160}$/.test(candidate)) throw persistenceError(`Invalid ${label}.`, 'INVALID_IDENTIFIER');
  return candidate;
}

function assertValidManifest(manifest, projectManifest) {
  const issues = projectManifest.validate(manifest);
  if (issues.length > 0) throw persistenceError(issues[0].message, issues[0].code || 'INVALID_MANIFEST');
}

function writeProjectRow(manifest, options = {}) {
  const id = requireIdentifier(manifest.id, 'project id');
  const timestamp = options.timestamp || nowIso();
  const title = String(manifest.metadata?.title || 'ScriptFlow Project').trim().slice(0, 180);
  const revision = manifest.metadata.revision;
  const manifestJson = JSON.stringify(manifest);
  const existing = database.prepare('SELECT created_at FROM projects WHERE id = ?').get(id);
  const createdAt = existing?.created_at || manifest.metadata?.createdAt || timestamp;
  database.prepare(`
    INSERT INTO projects (id, title, revision, manifest_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      revision = excluded.revision,
      manifest_json = excluded.manifest_json,
      updated_at = excluded.updated_at
  `).run(id, title, revision, manifestJson, createdAt, timestamp);
  if (options.createVersion !== false) {
    database.prepare(`
      INSERT INTO project_versions (project_id, revision, label, manifest_json, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, revision, String(options.label || 'Project transaction').slice(0, 180), manifestJson, timestamp);
    database.prepare(`
      DELETE FROM project_versions
      WHERE project_id = ? AND id NOT IN (
        SELECT id FROM project_versions WHERE project_id = ? ORDER BY id DESC LIMIT 100
      )
    `).run(id, id);
  }
  return {
    project: { id, title, revision, createdAt, updatedAt: timestamp },
    manifest,
    versionId: Number(database.prepare('SELECT id FROM project_versions WHERE project_id = ? ORDER BY id DESC LIMIT 1').get(id)?.id || 0)
  };
}

function createProject(payload = {}, dependencies = {}) {
  const projectManifest = dependencies.projectManifest;
  if (!projectManifest) throw persistenceError('Project manifest dependency is required.', 'SERVER_CONFIGURATION_ERROR', 500);
  const id = requireIdentifier(payload.id || `proj_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`, 'project id');
  if (database.prepare('SELECT id FROM projects WHERE id = ?').get(id)) throw persistenceError('Project already exists.', 'PROJECT_EXISTS', 409);
  const manifest = projectManifest.createDefault({
    id,
    title: String(payload.title || 'VidRush Documentary Project').slice(0, 180),
    description: String(payload.description || 'AI-generated long-form video documentary.').slice(0, 1000),
    format: String(payload.format || 'documentary').slice(0, 80),
    aspectRatio: payload.aspectRatio === '9:16' ? '9:16' : '16:9',
    theme: String(payload.theme || 'cinematic-documentary').slice(0, 80),
    sourcePolicy: payload.sourcePolicy,
    voiceProvider: ['elevenlabs', 'windows-sapi'].includes(payload.voiceProvider) ? payload.voiceProvider : 'windows-sapi',
    voiceId: String(payload.voiceId || '').slice(0, 180),
    voiceName: String(payload.voiceName || '').slice(0, 300)
  });
  assertValidManifest(manifest, projectManifest);
  database.exec('BEGIN IMMEDIATE');
  try {
    const saved = writeProjectRow(manifest, { label: 'Project created' });
    database.exec('COMMIT');
    return saved;
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

function applyProjectTransaction(projectId, transaction, dependencies = {}, options = {}) {
  const editingEngine = dependencies.editingEngine;
  const projectManifest = dependencies.projectManifest;
  if (!editingEngine || !projectManifest) throw persistenceError('Editing dependencies are required.', 'SERVER_CONFIGURATION_ERROR', 500);
  const id = requireIdentifier(projectId, 'project id');
  database.exec('BEGIN IMMEDIATE');
  try {
    const row = database.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    if (!row) throw persistenceError('Project not found.', 'PROJECT_NOT_FOUND', 404);
    const currentManifest = parseJson(row.manifest_json);
    assertValidManifest(currentManifest, projectManifest);
    const expectedRevision = Number(transaction?.meta?.baseRevision);
    const expectedFingerprint = String(transaction?.meta?.baseFingerprint || '');
    const currentFingerprint = editingEngine.manifestFingerprint(currentManifest);
    if (!Number.isInteger(expectedRevision) || !expectedFingerprint) throw persistenceError('Transaction base revision and fingerprint are required.', 'MISSING_TRANSACTION_BASE');
    if (expectedRevision !== row.revision || expectedFingerprint !== currentFingerprint) throw persistenceError('Project transaction is stale.', 'STALE_TRANSACTION', 409);
    const prepared = editingEngine.prepareTransaction(currentManifest, transaction, {
      expectedRevision,
      allowLoadProject: options.allowLoadProject === true
    });
    assertValidManifest(prepared.manifest, projectManifest);
    const saved = prepared.changed
      ? writeProjectRow(prepared.manifest, { label: options.label || 'Project transaction', createVersion: options.createVersion !== false })
      : { project: publicProjectRow(row), manifest: currentManifest, versionId: 0 };
    database.exec('COMMIT');
    return { ...saved, transaction: prepared.transaction, changed: prepared.changed };
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

function saveProject(manifest, options = {}) {
  if (!manifest || typeof manifest !== 'object') throw new Error('A project manifest is required.');
  const id = safeIdentifier(manifest.id, 'proj');
  const timestamp = nowIso();
  const title = String(manifest.metadata?.title || 'ScriptFlow Project').trim().slice(0, 180);
  const revision = Math.max(1, Number.parseInt(manifest.metadata?.revision, 10) || 1);
  const normalizedManifest = { ...manifest, id };
  const manifestJson = JSON.stringify(normalizedManifest);
  const existing = database.prepare('SELECT revision, manifest_json, created_at FROM projects WHERE id = ?').get(id);
  const createdAt = existing?.created_at || timestamp;

  database.exec('BEGIN IMMEDIATE');
  try {
    database.prepare(`
      INSERT INTO projects (id, title, revision, manifest_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        revision = excluded.revision,
        manifest_json = excluded.manifest_json,
        updated_at = excluded.updated_at
    `).run(id, title, revision, manifestJson, createdAt, timestamp);

    const shouldCreateVersion = options.createVersion !== false
      && (!existing || existing.revision !== revision || existing.manifest_json !== manifestJson);
    if (shouldCreateVersion) {
      database.prepare(`
        INSERT INTO project_versions (project_id, revision, label, manifest_json, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(id, revision, String(options.label || 'Autosave').slice(0, 180), manifestJson, timestamp);
      database.prepare(`
        DELETE FROM project_versions
        WHERE project_id = ? AND id NOT IN (
          SELECT id FROM project_versions WHERE project_id = ? ORDER BY id DESC LIMIT 100
        )
      `).run(id, id);
    }
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }

  return {
    project: { id, title, revision, createdAt, updatedAt: timestamp },
    manifest: normalizedManifest
  };
}

function loadProject(projectId) {
  const id = safeIdentifier(projectId, 'invalid');
  const row = database.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  if (!row) return null;
  return { ...publicProjectRow(row), manifest: parseJson(row.manifest_json, {}) };
}

function listProjects(limit = 30) {
  return database.prepare('SELECT id, title, revision, created_at, updated_at FROM projects ORDER BY updated_at DESC LIMIT ?')
    .all(Math.max(1, Math.min(100, Number(limit) || 30)))
    .map(publicProjectRow);
}

function latestProject() {
  const row = database.prepare('SELECT * FROM projects ORDER BY updated_at DESC LIMIT 1').get();
  if (!row) return null;
  return { ...publicProjectRow(row), manifest: parseJson(row.manifest_json, {}) };
}

function latestValidProject(projectManifest) {
  const rows = database.prepare('SELECT * FROM projects ORDER BY updated_at DESC LIMIT 100').all();
  for (const row of rows) {
    const manifest = parseJson(row.manifest_json);
    if (manifest && projectManifest.validate(manifest).length === 0) return { ...publicProjectRow(row), manifest };
  }
  return null;
}

function listProjectVersions(projectId, limit = 30) {
  return database.prepare(`
    SELECT id, project_id, revision, label, created_at
    FROM project_versions WHERE project_id = ? ORDER BY id DESC LIMIT ?
  `).all(safeIdentifier(projectId, 'invalid'), Math.max(1, Math.min(100, Number(limit) || 30))).map((row) => ({
    id: row.id,
    projectId: row.project_id,
    revision: row.revision,
    label: row.label,
    createdAt: row.created_at
  }));
}

function restoreProjectVersion(projectId, versionId, dependencies = {}) {
  const editingEngine = dependencies.editingEngine;
  const projectManifest = dependencies.projectManifest;
  const id = requireIdentifier(projectId, 'project id');
  database.exec('BEGIN IMMEDIATE');
  try {
    const currentRow = database.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    const versionRow = database.prepare('SELECT manifest_json FROM project_versions WHERE id = ? AND project_id = ?').get(Number(versionId), id);
    if (!currentRow || !versionRow) {
      database.exec('ROLLBACK');
      return null;
    }
    const current = parseJson(currentRow.manifest_json);
    const target = parseJson(versionRow.manifest_json);
    assertValidManifest(current, projectManifest);
    assertValidManifest(target, projectManifest);
    const timestamp = nowIso();
    target.id = current.id;
    target.metadata.createdAt = current.metadata.createdAt;
    target.metadata.updatedAt = timestamp;
    target.metadata.revision = currentRow.revision + 1;
    const prepared = editingEngine.prepareTransaction(current, {
      type: 'LOAD_PROJECT',
      manifest: target,
      meta: {
        transactionId: `restore_${versionId}_${Date.now()}`,
        timestamp,
        source: 'server-version-restore',
        baseRevision: currentRow.revision,
        baseFingerprint: editingEngine.manifestFingerprint(current)
      }
    }, { expectedRevision: currentRow.revision, allowLoadProject: true });
    assertValidManifest(prepared.manifest, projectManifest);
    const saved = writeProjectRow(prepared.manifest, { label: `Restored version ${versionId}` });
    database.exec('COMMIT');
    return { ...saved, transaction: prepared.transaction };
  } catch (error) {
    try { database.exec('ROLLBACK'); } catch {}
    throw error;
  }
}

function restoreProjectFingerprint(projectId, fingerprint, dependencies = {}) {
  const editingEngine = dependencies.editingEngine;
  const id = requireIdentifier(projectId, 'project id');
  const expected = String(fingerprint || '');
  if (!expected) throw persistenceError('A history fingerprint is required.', 'MISSING_FINGERPRINT');
  const rows = database.prepare('SELECT id, manifest_json FROM project_versions WHERE project_id = ? ORDER BY id DESC LIMIT 100').all(id);
  const match = rows.find((row) => {
    const manifest = parseJson(row.manifest_json);
    return manifest && editingEngine.manifestFingerprint(manifest) === expected;
  });
  if (!match) return null;
  return restoreProjectVersion(id, match.id, dependencies);
}

function publicJobRow(row, includePayload = false) {
  if (!row) return null;
  const job = {
    id: row.id,
    projectId: row.project_id || '',
    status: row.status,
    stage: row.stage,
    progress: row.progress,
    message: row.message,
    error: row.error || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at || ''
  };
  if (includePayload) {
    job.input = parseJson(row.input_json, {});
    job.options = parseJson(row.options_json, {});
    job.result = parseJson(row.result_json, null);
  }
  return job;
}

function appendGenerationEvent(jobId, event) {
  database.prepare(`
    INSERT INTO generation_events (job_id, stage, status, progress, message, detail_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    jobId,
    String(event.stage || 'queued').slice(0, 80),
    String(event.status || 'running').slice(0, 32),
    Math.max(0, Math.min(100, Number(event.progress) || 0)),
    String(event.message || '').slice(0, 500),
    event.detail ? JSON.stringify(event.detail) : null,
    nowIso()
  );
}

function createGenerationJob(payload = {}) {
  const id = safeIdentifier(payload.id, 'job');
  const timestamp = nowIso();
  const projectId = payload.projectId ? safeIdentifier(payload.projectId, 'proj') : null;
  const status = 'queued';
  const stage = String(payload.stage || 'preflight').slice(0, 80);
  database.prepare(`
    INSERT INTO generation_jobs (
      id, project_id, status, stage, progress, message, input_json, options_json,
      result_json, error, created_at, updated_at, completed_at
    ) VALUES (?, ?, ?, ?, 0, ?, ?, ?, NULL, NULL, ?, ?, NULL)
  `).run(
    id,
    projectId,
    status,
    stage,
    String(payload.message || 'Generation queued.').slice(0, 500),
    JSON.stringify(payload.input || {}),
    JSON.stringify(payload.options || {}),
    timestamp,
    timestamp
  );
  appendGenerationEvent(id, { stage, status, progress: 0, message: payload.message || 'Generation queued.' });
  return getGenerationJob(id, true);
}

function updateGenerationJob(jobId, patch = {}) {
  const id = safeIdentifier(jobId, 'invalid');
  const existing = database.prepare('SELECT * FROM generation_jobs WHERE id = ?').get(id);
  if (!existing) return null;
  const status = jobStatuses.has(patch.status) ? patch.status : existing.status;
  const stage = String(patch.stage || existing.stage).slice(0, 80);
  const progress = Math.max(0, Math.min(100, Number.isFinite(Number(patch.progress)) ? Number(patch.progress) : existing.progress));
  const message = String(patch.message ?? existing.message ?? '').slice(0, 500);
  const error = patch.error ? String(patch.error).slice(0, 1200) : (status === 'failed' ? existing.error : null);
  const resultJson = patch.result === undefined ? existing.result_json : JSON.stringify(patch.result);
  const timestamp = nowIso();
  const completedAt = new Set(['completed', 'failed', 'cancelled']).has(status) ? timestamp : null;

  database.prepare(`
    UPDATE generation_jobs
    SET project_id = ?, status = ?, stage = ?, progress = ?, message = ?, result_json = ?, error = ?, updated_at = ?, completed_at = ?
    WHERE id = ?
  `).run(
    patch.projectId ? safeIdentifier(patch.projectId, 'proj') : existing.project_id,
    status,
    stage,
    progress,
    message,
    resultJson,
    error,
    timestamp,
    completedAt,
    id
  );
  appendGenerationEvent(id, { stage, status, progress, message, detail: patch.detail });
  return getGenerationJob(id, true);
}

function getGenerationJob(jobId, includePayload = false) {
  const id = safeIdentifier(jobId, 'invalid');
  return publicJobRow(database.prepare('SELECT * FROM generation_jobs WHERE id = ?').get(id), includePayload);
}

function listGenerationJobs(limit = 30) {
  return database.prepare('SELECT * FROM generation_jobs ORDER BY updated_at DESC LIMIT ?')
    .all(Math.max(1, Math.min(100, Number(limit) || 30)))
    .map((row) => publicJobRow(row, false));
}

function listGenerationEvents(jobId, limit = 250) {
  return database.prepare(`
    SELECT * FROM generation_events WHERE job_id = ? ORDER BY id ASC LIMIT ?
  `).all(safeIdentifier(jobId, 'invalid'), Math.max(1, Math.min(500, Number(limit) || 250))).map((row) => ({
    id: row.id,
    jobId: row.job_id,
    stage: row.stage,
    status: row.status,
    progress: row.progress,
    message: row.message,
    detail: parseJson(row.detail_json, null),
    createdAt: row.created_at
  }));
}

function publicRenderJobRow(row, includePayload = false) {
  if (!row) return null;
  const job = {
    id: row.id,
    projectId: row.project_id,
    projectRevision: row.project_revision,
    type: row.type,
    status: row.status,
    stage: row.stage,
    progress: row.progress,
    message: row.message,
    processId: row.process_id || null,
    error: row.error || '',
    logs: parseJson(row.logs_json, []),
    createdAt: row.created_at,
    startedAt: row.started_at || '',
    updatedAt: row.updated_at,
    completedAt: row.completed_at || ''
  };
  if (includePayload) {
    job.input = parseJson(row.input_json, {});
    job.result = parseJson(row.result_json, null);
  }
  return job;
}

function createRenderJob(payload = {}) {
  const id = safeIdentifier(payload.id, 'renderjob');
  const projectId = requireIdentifier(payload.projectId, 'project id');
  const type = renderJobTypes.has(payload.type) ? payload.type : null;
  if (!type) throw persistenceError('Render job type must be preview, draft, grade, or final.', 'INVALID_RENDER_JOB_TYPE');
  const timestamp = nowIso();
  database.prepare(`
    INSERT INTO render_jobs (
      id, project_id, project_revision, type, status, stage, progress, message,
      input_json, result_json, error, logs_json, process_id, created_at,
      started_at, updated_at, completed_at
    ) VALUES (?, ?, ?, ?, 'queued', 'queued', 0, ?, ?, NULL, NULL, '[]', NULL, ?, NULL, ?, NULL)
  `).run(
    id,
    projectId,
    Math.max(1, Number.parseInt(payload.projectRevision, 10) || 1),
    type,
    String(payload.message || `${type} render queued.`).slice(0, 500),
    JSON.stringify(payload.input || {}),
    timestamp,
    timestamp
  );
  return getRenderJob(id, true);
}

function updateRenderJob(jobId, patch = {}) {
  const id = requireIdentifier(jobId, 'render job id');
  const existing = database.prepare('SELECT * FROM render_jobs WHERE id = ?').get(id);
  if (!existing) return null;
  const status = renderJobStatuses.has(patch.status) ? patch.status : existing.status;
  const timestamp = nowIso();
  const logs = parseJson(existing.logs_json, []);
  const incomingLogs = patch.logs || (patch.log ? [patch.log] : []);
  for (const entry of incomingLogs) {
    const message = String(typeof entry === 'string' ? entry : entry?.message || '').replace(/[\u0000-\u001F]/g, ' ').trim().slice(0, 1200);
    if (message) logs.push({
      at: String(entry?.at || timestamp).slice(0, 40),
      stream: ['stdout', 'stderr', 'system'].includes(entry?.stream) ? entry.stream : 'system',
      message
    });
  }
  const processId = patch.processId === undefined
    ? existing.process_id
    : (Number.isInteger(Number(patch.processId)) && Number(patch.processId) > 0 ? Number(patch.processId) : null);
  const completedAt = ['completed', 'failed', 'cancelled'].includes(status) ? (existing.completed_at || timestamp) : null;
  const startedAt = status === 'running' ? (existing.started_at || timestamp) : existing.started_at;
  database.prepare(`
    UPDATE render_jobs
    SET status = ?, stage = ?, progress = ?, message = ?, result_json = ?, error = ?,
        logs_json = ?, process_id = ?, started_at = ?, updated_at = ?, completed_at = ?
    WHERE id = ?
  `).run(
    status,
    String(patch.stage || existing.stage).slice(0, 80),
    Math.max(0, Math.min(100, Number.isFinite(Number(patch.progress)) ? Number(patch.progress) : existing.progress)),
    String(patch.message ?? existing.message ?? '').slice(0, 500),
    patch.result === undefined ? existing.result_json : JSON.stringify(patch.result),
    patch.error === undefined ? existing.error : (patch.error ? String(patch.error).slice(0, 2000) : null),
    JSON.stringify(logs.slice(-200)),
    processId,
    startedAt,
    timestamp,
    completedAt,
    id
  );
  return getRenderJob(id, true);
}

function getRenderJob(jobId, includePayload = false) {
  const id = requireIdentifier(jobId, 'render job id');
  return publicRenderJobRow(database.prepare('SELECT * FROM render_jobs WHERE id = ?').get(id), includePayload);
}

function listRenderJobs(limit = 30) {
  return database.prepare('SELECT * FROM render_jobs ORDER BY updated_at DESC LIMIT ?')
    .all(Math.max(1, Math.min(100, Number(limit) || 30)))
    .map((row) => publicRenderJobRow(row, false));
}

function listInterruptedRenderJobs() {
  return database.prepare("SELECT * FROM render_jobs WHERE status IN ('queued', 'running') ORDER BY created_at ASC")
    .all()
    .map((row) => publicRenderJobRow(row, true));
}

function publicDirectorJobRow(row, includePayload = false) {
  if (!row) return null;
  const job = {
    id: row.id,
    projectId: row.project_id || '',
    status: row.status,
    stage: row.stage,
    progress: row.progress,
    message: row.message,
    command: row.command,
    baseRevision: row.base_revision,
    baseFingerprint: row.base_fingerprint,
    operations: parseJson(row.operations_json, []),
    summary: row.summary || '',
    usage: parseJson(row.usage_json, {}),
    error: row.error || '',
    supersedesJobId: row.supersedes_job_id || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at || ''
  };
  if (includePayload) {
    job.baseManifest = parseJson(row.base_manifest_json, {});
    job.request = parseJson(row.request_json, {});
    job.stagedManifest = parseJson(row.staged_manifest_json, null);
    job.toolTrace = parseJson(row.tool_trace_json, []);
    job.result = parseJson(row.result_json, null);
  }
  return job;
}

function cleanupDirectorJobs(maxRows = 300, ttlMs = 7 * 24 * 60 * 60 * 1000) {
  const cutoff = new Date(Date.now() - Math.max(60_000, ttlMs)).toISOString();
  database.prepare(`
    DELETE FROM director_jobs
    WHERE status IN ('completed', 'approved', 'rejected', 'cancelled', 'failed', 'stale')
      AND updated_at < ?
  `).run(cutoff);
  database.prepare(`
    DELETE FROM director_jobs
    WHERE status IN ('completed', 'approved', 'rejected', 'cancelled', 'failed', 'stale')
      AND id NOT IN (SELECT id FROM director_jobs ORDER BY updated_at DESC LIMIT ?)
  `).run(Math.max(20, Math.min(1000, Number(maxRows) || 300)));
}

function createDirectorJob(payload = {}) {
  cleanupDirectorJobs();
  const id = safeIdentifier(payload.id, 'director');
  const timestamp = nowIso();
  const status = directorJobStatuses.has(payload.status) ? payload.status : 'queued';
  const stage = String(payload.stage || 'queued').slice(0, 80);
  database.prepare(`
    INSERT INTO director_jobs (
      id, project_id, status, stage, progress, message, command, base_revision,
      base_fingerprint, base_manifest_json, request_json, operations_json,
      staged_manifest_json, summary, tool_trace_json, usage_json, result_json,
      error, supersedes_job_id, created_at, updated_at, completed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    payload.projectId ? safeIdentifier(payload.projectId, 'proj') : null,
    status,
    stage,
    Math.max(0, Math.min(100, Number(payload.progress) || 0)),
    String(payload.message || 'Gemini director job queued.').slice(0, 500),
    String(payload.command || '').slice(0, 4000),
    Math.max(1, Number.parseInt(payload.baseRevision, 10) || 1),
    String(payload.baseFingerprint || '').slice(0, 180),
    JSON.stringify(payload.baseManifest || {}),
    JSON.stringify(payload.request || {}),
    JSON.stringify(payload.operations || []),
    payload.stagedManifest ? JSON.stringify(payload.stagedManifest) : null,
    String(payload.summary || '').slice(0, 2000),
    JSON.stringify(payload.toolTrace || []),
    JSON.stringify(payload.usage || {}),
    payload.result === undefined ? null : JSON.stringify(payload.result),
    payload.error ? String(payload.error).slice(0, 1200) : null,
    payload.supersedesJobId ? safeIdentifier(payload.supersedesJobId, 'director') : null,
    timestamp,
    timestamp,
    terminalDirectorStatuses.has(status) ? timestamp : null
  );
  return getDirectorJob(id, true);
}

function updateDirectorJob(jobId, patch = {}) {
  const id = safeIdentifier(jobId, 'invalid');
  const existing = database.prepare('SELECT * FROM director_jobs WHERE id = ?').get(id);
  if (!existing) return null;
  const status = directorJobStatuses.has(patch.status) ? patch.status : existing.status;
  const stage = String(patch.stage || existing.stage).slice(0, 80);
  const progress = Math.max(0, Math.min(100, Number.isFinite(Number(patch.progress)) ? Number(patch.progress) : existing.progress));
  const message = String(patch.message ?? existing.message ?? '').slice(0, 500);
  const operationsJson = patch.operations === undefined ? existing.operations_json : JSON.stringify(patch.operations || []);
  const stagedManifestJson = patch.stagedManifest === undefined
    ? existing.staged_manifest_json
    : (patch.stagedManifest ? JSON.stringify(patch.stagedManifest) : null);
  const summary = String(patch.summary ?? existing.summary ?? '').slice(0, 2000);
  const toolTraceJson = patch.toolTrace === undefined ? existing.tool_trace_json : JSON.stringify(patch.toolTrace || []);
  const usageJson = patch.usage === undefined ? existing.usage_json : JSON.stringify(patch.usage || {});
  const resultJson = patch.result === undefined ? existing.result_json : JSON.stringify(patch.result);
  const error = patch.error === undefined ? existing.error : (patch.error ? String(patch.error).slice(0, 1200) : null);
  const timestamp = nowIso();
  const completedAt = terminalDirectorStatuses.has(status) ? (existing.completed_at || timestamp) : null;
  database.prepare(`
    UPDATE director_jobs
    SET status = ?, stage = ?, progress = ?, message = ?, operations_json = ?,
        staged_manifest_json = ?, summary = ?, tool_trace_json = ?, usage_json = ?,
        result_json = ?, error = ?, updated_at = ?, completed_at = ?
    WHERE id = ?
  `).run(
    status,
    stage,
    progress,
    message,
    operationsJson,
    stagedManifestJson,
    summary,
    toolTraceJson,
    usageJson,
    resultJson,
    error,
    timestamp,
    completedAt,
    id
  );
  return getDirectorJob(id, true);
}

function getDirectorJob(jobId, includePayload = false) {
  const id = safeIdentifier(jobId, 'invalid');
  return publicDirectorJobRow(database.prepare('SELECT * FROM director_jobs WHERE id = ?').get(id), includePayload);
}

function commitDirectorProposal(jobId, dependencies = {}) {
  const editingEngine = dependencies.editingEngine;
  const projectManifest = dependencies.projectManifest;
  const id = requireIdentifier(jobId, 'director job id');
  database.exec('BEGIN IMMEDIATE');
  try {
    const directorRow = database.prepare('SELECT * FROM director_jobs WHERE id = ?').get(id);
    if (!directorRow) throw persistenceError('Director job not found.', 'DIRECTOR_NOT_FOUND', 404);
    if (directorRow.status !== 'awaiting_approval') throw persistenceError('This proposal is not awaiting approval.', 'INVALID_DIRECTOR_STATE', 409);
    const projectRow = database.prepare('SELECT * FROM projects WHERE id = ?').get(directorRow.project_id);
    if (!projectRow) throw persistenceError('The proposal project no longer exists.', 'PROJECT_NOT_FOUND', 404);
    const currentManifest = parseJson(projectRow.manifest_json);
    assertValidManifest(currentManifest, projectManifest);
    const currentFingerprint = editingEngine.manifestFingerprint(currentManifest);
    if (projectRow.revision !== directorRow.base_revision || currentFingerprint !== directorRow.base_fingerprint) {
      const timestamp = nowIso();
      database.prepare(`
        UPDATE director_jobs SET status = 'stale', stage = 'stale', progress = 100,
          message = ?, updated_at = ?, completed_at = ? WHERE id = ?
      `).run('The authoritative active project changed after this proposal. Reject it or rebase it.', timestamp, timestamp, id);
      database.exec('COMMIT');
      return { stale: true };
    }
    const operations = parseJson(directorRow.operations_json, []);
    const stagedManifest = parseJson(directorRow.staged_manifest_json, null);
    const result = parseJson(directorRow.result_json, {});
    const usage = parseJson(directorRow.usage_json, {});
    const transaction = {
      type: 'BATCH_ACTION',
      actions: operations,
      operationSchemaVersion: editingEngine.OPERATION_SCHEMA_VERSION,
      meta: {
        transactionId: `director_${id}_${usage.proposalCount || 1}`,
        timestamp: stagedManifest?.metadata?.updatedAt || nowIso(),
        source: 'gemini-director-approved',
        baseRevision: directorRow.base_revision,
        baseFingerprint: directorRow.base_fingerprint,
        directorJobId: id
      }
    };
    const prepared = editingEngine.prepareTransaction(currentManifest, transaction, { expectedRevision: directorRow.base_revision });
    if (prepared.stagedFingerprint !== result.stagedFingerprint) throw persistenceError('Staged proposal integrity check failed.', 'PROPOSAL_INTEGRITY_ERROR', 409);
    assertValidManifest(prepared.manifest, projectManifest);
    const saved = writeProjectRow(prepared.manifest, { label: `Approved Gemini proposal ${id}` });
    const timestamp = nowIso();
    database.prepare(`
      UPDATE director_jobs SET status = 'approved', stage = 'approved', progress = 100,
        message = ?, updated_at = ?, completed_at = ? WHERE id = ?
    `).run('Proposal approved and committed atomically to the active project.', timestamp, timestamp, id);
    database.exec('COMMIT');
    return { stale: false, ...saved, transaction, job: getDirectorJob(id, true) };
  } catch (error) {
    try { database.exec('ROLLBACK'); } catch {}
    throw error;
  }
}

function listDirectorJobs(limit = 30) {
  return database.prepare('SELECT * FROM director_jobs ORDER BY updated_at DESC LIMIT ?')
    .all(Math.max(1, Math.min(100, Number(limit) || 30)))
    .map((row) => publicDirectorJobRow(row, true));
}

function recoverInterruptedDirectorJobs() {
  const timestamp = nowIso();
  database.prepare(`
    UPDATE director_jobs
    SET status = 'failed', stage = 'interrupted', progress = 100,
        message = 'Server restarted before this director job completed.',
        error = 'Interrupted by server restart.', updated_at = ?, completed_at = ?
    WHERE status IN ('queued', 'running')
  `).run(timestamp, timestamp);
}

function defaultBrandProfile() {
  const timestamp = nowIso();
  return {
    id: 'profile_default',
    name: 'Default YouTube Documentary',
    language: 'en',
    format: 'documentary',
    voice: { provider: 'windows-sapi', voiceId: '', modelId: 'eleven_multilingual_v2' },
    visual: {
      theme: 'cinematic-documentary',
      aspectRatio: '16:9',
      targetAverageShotSec: 4.5,
      preferredVideoRatio: 0.7,
      transitions: 'mostly-cuts'
    },
    captions: { style: 'hormozi', position: 'bottom', fontSize: 44 },
    sourcing: {
      tiers: ['stock', 'open-archive'],
      rightsMode: 'known-rights',
      blacklist: [],
      whitelist: []
    },
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function saveBrandProfile(profile = {}) {
  const timestamp = nowIso();
  const normalized = {
    ...defaultBrandProfile(),
    ...profile,
    id: safeIdentifier(profile.id, 'profile'),
    name: String(profile.name || 'Untitled Profile').trim().slice(0, 100),
    updatedAt: timestamp
  };
  const existing = database.prepare('SELECT created_at FROM brand_profiles WHERE id = ?').get(normalized.id);
  normalized.createdAt = existing?.created_at || profile.createdAt || timestamp;
  database.prepare(`
    INSERT INTO brand_profiles (id, name, profile_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, profile_json = excluded.profile_json, updated_at = excluded.updated_at
  `).run(normalized.id, normalized.name, JSON.stringify(normalized), normalized.createdAt, timestamp);
  return normalized;
}

function listBrandProfiles() {
  const rows = database.prepare('SELECT profile_json FROM brand_profiles ORDER BY updated_at DESC').all();
  if (rows.length === 0) return [saveBrandProfile(defaultBrandProfile())];
  return rows.map((row) => parseJson(row.profile_json, {}));
}

function deleteBrandProfile(profileId) {
  const result = database.prepare('DELETE FROM brand_profiles WHERE id = ? AND id <> ?')
    .run(safeIdentifier(profileId, 'invalid'), 'profile_default');
  return result.changes > 0;
}

function getCachedSearch(cacheKey) {
  const row = database.prepare('SELECT items_json, expires_at FROM media_search_cache WHERE cache_key = ?').get(cacheKey);
  if (!row) return null;
  if (row.expires_at <= Date.now()) {
    database.prepare('DELETE FROM media_search_cache WHERE cache_key = ?').run(cacheKey);
    return null;
  }
  return parseJson(row.items_json, null);
}

function setCachedSearch(cacheKey, items, ttlMs = 30 * 60 * 1000) {
  database.prepare(`
    INSERT INTO media_search_cache (cache_key, items_json, expires_at, created_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(cache_key) DO UPDATE SET items_json = excluded.items_json, expires_at = excluded.expires_at, created_at = excluded.created_at
  `).run(cacheKey, JSON.stringify(items || []), Date.now() + Math.max(10_000, ttlMs), nowIso());
}

function getMediaEmbedding(assetKey, model) {
  const row = database.prepare('SELECT embedding_json FROM media_embeddings WHERE asset_key = ? AND model = ?').get(assetKey, model);
  return parseJson(row?.embedding_json, null);
}

function setMediaEmbedding(assetKey, model, embedding, metadata = null) {
  database.prepare(`
    INSERT INTO media_embeddings (asset_key, model, embedding_json, metadata_json, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(asset_key, model) DO UPDATE SET embedding_json = excluded.embedding_json, metadata_json = excluded.metadata_json, updated_at = excluded.updated_at
  `).run(assetKey, model, JSON.stringify(embedding), metadata ? JSON.stringify(metadata) : null, nowIso());
}

module.exports = {
  applyProjectTransaction,
  commitDirectorProposal,
  cleanupDirectorJobs,
  createProject,
  createDirectorJob,
  databasePath,
  createGenerationJob,
  createRenderJob,
  deleteBrandProfile,
  getCachedSearch,
  getDirectorJob,
  getGenerationJob,
  getMediaEmbedding,
  getRenderJob,
  latestProject,
  latestValidProject,
  listBrandProfiles,
  listDirectorJobs,
  listGenerationEvents,
  listGenerationJobs,
  listProjects,
  listProjectVersions,
  listRenderJobs,
  listInterruptedRenderJobs,
  loadProject,
  restoreProjectVersion,
  restoreProjectFingerprint,
  recoverInterruptedDirectorJobs,
  saveBrandProfile,
  setCachedSearch,
  setMediaEmbedding,
  updateDirectorJob,
  updateGenerationJob,
  updateRenderJob
};
