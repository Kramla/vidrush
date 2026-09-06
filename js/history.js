/**
 * VidRush Studio - Transactional History Store & State Manager (Undo / Redo)
 * 
 * Manages the current Project Manifest state. Every mutation is executed as a
 * discrete, validated transaction. Allows full Undo / Redo functionality.
 */

const ProjectStore = (() => {
  let currentManifest = ProjectManifest.createDefault();
  const undoStack = [];
  const redoStack = [];
  const MAX_HISTORY = 50;
  const listeners = new Set();
  let persistenceTimer = null;
  let persistenceStatus = 'idle';
  let transactionSerial = 0;
  let persistedProject = false;
  let savePromise = null;
  const pendingTransactions = [];

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  async function requestJson(path, options = {}) {
    const response = await fetch(`${apiOrigin()}${path}`, options);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || `Project request returned HTTP ${response.status}.`);
      error.code = payload.code || 'PROJECT_REQUEST_FAILED';
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  function apiOrigin() {
    return typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'http://127.0.0.1:8080';
  }

  async function saveNow(label = 'Autosave', options = {}) {
    if (typeof fetch === 'undefined' || !currentManifest?.id) return null;
    if (persistenceTimer) {
      clearTimeout(persistenceTimer);
      persistenceTimer = null;
    }

    if (!persistedProject) await createCurrentProject();
    if (savePromise) return savePromise;
    persistenceStatus = 'saving';
    savePromise = (async () => {
      let lastPayload = null;
      while (pendingTransactions.length > 0) {
        const pending = pendingTransactions[0];
        const payload = await requestJson(`/api/projects/${encodeURIComponent(currentManifest.id)}/transactions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transaction: pending.transaction,
            label: pending.label || label,
            createVersion: options.createVersion !== false
          })
        });
        pendingTransactions.shift();
        lastPayload = payload;
      }
      persistenceStatus = 'saved';
      return lastPayload;
    })();
    try {
      return await savePromise;
    } catch (error) {
      persistenceStatus = 'error';
      console.warn('[ProjectStore] Durable save failed:', error.message);
      throw error;
    } finally {
      savePromise = null;
    }
  }

  function scheduleSave(label = 'Autosave') {
    if (typeof fetch === 'undefined') return;
    if (persistenceTimer) clearTimeout(persistenceTimer);
    persistenceStatus = 'pending';
    persistenceTimer = setTimeout(() => {
      persistenceTimer = null;
      saveNow(label).catch(() => {});
    }, 700);
  }

  async function restoreLatest() {
    if (typeof fetch === 'undefined') return null;
    try {
      const response = await fetch(`${apiOrigin()}/api/projects?latest=1`, { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `Project restore returned HTTP ${response.status}.`);
      return payload.latest?.manifest || null;
    } catch (error) {
      console.warn('[ProjectStore] Durable restore failed:', error.message);
      return null;
    }
  }

  async function createCurrentProject(options = {}) {
    if (typeof fetch === 'undefined') return null;
    const manifest = currentManifest;
    const payload = await requestJson('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project: {
          id: manifest.id,
          title: manifest.metadata?.title,
          description: manifest.metadata?.description,
          format: manifest.metadata?.format,
          aspectRatio: manifest.metadata?.aspectRatio,
          theme: manifest.metadata?.theme,
          sourcePolicy: manifest.metadata?.sourcePolicy,
          voiceProvider: manifest.audio?.voice?.provider,
          voiceId: manifest.audio?.voice?.voiceId,
          voiceName: manifest.audio?.voice?.voiceName
        }
      })
    });
    currentManifest = clone(payload.manifest);
    persistedProject = true;
    if (options.notify !== false) notify({ type: 'PROJECT_CREATED' }, 'Project created');
    return payload;
  }

  async function replaceWithGeneratedProject(generatedManifest, description = 'Generated project') {
    const issues = ProjectManifest.validate(generatedManifest);
    if (issues.length > 0) throw new Error(issues[0].message);
    if (persistenceTimer) {
      clearTimeout(persistenceTimer);
      persistenceTimer = null;
    }
    const previous = currentManifest;
    currentManifest = clone(generatedManifest);
    persistedProject = false;
    pendingTransactions.length = 0;
    undoStack.length = 0;
    redoStack.length = 0;
    const desired = currentManifest;
    await createCurrentProject({ notify: false });
    const base = currentManifest;
    const action = EditingEngine.compileManifestDiff(base, { ...clone(desired), id: base.id });
    currentManifest = base;
    if (action.actions.length > 0) dispatch(action, description);
    await saveNow(description);
    notify({ type: 'GENERATED_PROJECT_COMMITTED' }, description);
    return clone(currentManifest);
  }

  function init(initialManifest, options = {}) {
    const candidate = initialManifest ? ProjectManifest.recalculateTimings(initialManifest) : ProjectManifest.createDefault();
    const issues = ProjectManifest.validate(candidate);
    if (issues.length > 0) throw new Error(issues[0].message);
    currentManifest = clone(candidate);
    persistedProject = options.persisted === true;
    pendingTransactions.length = 0;
    undoStack.length = 0;
    redoStack.length = 0;
    notify({ type: 'INIT', description: 'Project initialized' });
  }

  function getManifest() {
    return clone(currentManifest);
  }

  /**
   * Dispatch a structured action.
   * Modifies manifest via ProjectActions reducer and pushes to undo stack.
   */
  function dispatch(action, description = '', options = {}) {
    if (!action) return clone(currentManifest);

    const previousManifest = clone(currentManifest);
    const prepared = ProjectActions.prepare(currentManifest, action, {
      timestamp: action.meta?.timestamp || new Date().toISOString(),
      transactionId: action.meta?.transactionId || `editor_${Date.now()}_${++transactionSerial}`,
      source: action.meta?.source || 'manual-editor'
    });
    const nextManifest = prepared.manifest;

    // Only record history if state actually changed
    if (JSON.stringify(previousManifest) !== JSON.stringify(nextManifest)) {
      undoStack.push({
        manifest: previousManifest,
        description: description || action.type,
        timestamp: Date.now()
      });

      if (undoStack.length > MAX_HISTORY) {
        undoStack.shift();
      }

      redoStack.length = 0; // Clear redo stack on new action
      currentManifest = nextManifest;
      if (options.persist !== false) pendingTransactions.push({ transaction: clone(prepared.transaction), label: description || action.type });
      notify(prepared.transaction, description);
      if (options.persist !== false) scheduleSave(description || action.type || 'Autosave');
    }

    return clone(currentManifest);
  }

  async function restoreHistorySnapshot(target, description) {
    await saveNow('Flush before history restore');
    const payload = await requestJson(`/api/projects/${encodeURIComponent(currentManifest.id)}/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fingerprint: EditingEngine.manifestFingerprint(target) })
    });
    const prepared = ProjectActions.prepare(currentManifest, {
      type: 'LOAD_PROJECT',
      manifest: payload.manifest,
      meta: {
        transactionId: `history_${Date.now()}_${++transactionSerial}`,
        timestamp: payload.manifest.metadata?.updatedAt,
        source: 'server-version-restore',
        baseRevision: currentManifest.metadata?.revision
      }
    }, { allowLoadProject: true });
    currentManifest = clone(prepared.manifest);
    persistedProject = true;
    notify(prepared.transaction, description);
    return clone(currentManifest);
  }

  async function undo() {
    if (!canUndo()) return null;

    const last = undoStack.pop();
    const redoEntry = {
      manifest: clone(currentManifest),
      description: last.description,
      timestamp: Date.now()
    };
    try {
      await restoreHistorySnapshot(last.manifest, `Undo: ${last.description}`);
      redoStack.push(redoEntry);
      return clone(currentManifest);
    } catch (error) {
      undoStack.push(last);
      throw error;
    }
  }

  async function redo() {
    if (!canRedo()) return null;

    const next = redoStack.pop();
    const undoEntry = {
      manifest: clone(currentManifest),
      description: next.description,
      timestamp: Date.now()
    };
    try {
      await restoreHistorySnapshot(next.manifest, `Redo: ${next.description}`);
      undoStack.push(undoEntry);
      return clone(currentManifest);
    } catch (error) {
      redoStack.push(next);
      throw error;
    }
  }

  function acceptCommittedTransaction(transaction, authoritativeManifest, description = 'Approved transaction') {
    const prepared = ProjectActions.prepare(currentManifest, transaction);
    if (EditingEngine.manifestFingerprint(prepared.manifest) !== EditingEngine.manifestFingerprint(authoritativeManifest)) {
      throw new Error('The committed project does not match the deterministic local transaction result.');
    }
    undoStack.push({ manifest: clone(currentManifest), description, timestamp: Date.now() });
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
    redoStack.length = 0;
    currentManifest = clone(authoritativeManifest);
    persistedProject = true;
    notify(prepared.transaction, description);
    return clone(currentManifest);
  }

  function canUndo() {
    return undoStack.length > 0;
  }

  function canRedo() {
    return redoStack.length > 0;
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function notify(action, description = '') {
    listeners.forEach((fn) => {
      try {
        fn(clone(currentManifest), clone(action), description);
      } catch (err) {
        console.error('[ProjectStore] Listener error:', err);
      }
    });
  }

  const api = {
    init,
    acceptCommittedTransaction,
    createCurrentProject,
    getManifest,
    dispatch,
    undo,
    redo,
    canUndo,
    canRedo,
    subscribe,
    saveNow,
    restoreLatest,
    replaceWithGeneratedProject,
    getPersistenceStatus: () => persistenceStatus
  };

  if (typeof window !== 'undefined') window.ProjectStore = api;
  if (typeof globalThis !== 'undefined') globalThis.ProjectStore = api;
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
