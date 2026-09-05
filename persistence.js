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

function restoreProjectVersion(projectId, versionId) {
  const row = database.prepare(`
    SELECT manifest_json FROM project_versions WHERE id = ? AND project_id = ?
  `).get(Number(versionId), safeIdentifier(projectId, 'invalid'));
  if (!row) return null;
  const manifest = parseJson(row.manifest_json);
  if (!manifest) return null;
  manifest.metadata = {
    ...(manifest.metadata || {}),
    revision: Math.max(1, Number(manifest.metadata?.revision) || 1) + 1,
    updatedAt: nowIso()
  };
  return saveProject(manifest, { label: `Restored version ${versionId}` });
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
  databasePath,
  createGenerationJob,
  deleteBrandProfile,
  getCachedSearch,
  getGenerationJob,
  getMediaEmbedding,
  latestProject,
  listBrandProfiles,
  listGenerationEvents,
  listGenerationJobs,
  listProjects,
  listProjectVersions,
  loadProject,
  restoreProjectVersion,
  saveBrandProfile,
  saveProject,
  setCachedSearch,
  setMediaEmbedding,
  updateGenerationJob
};
