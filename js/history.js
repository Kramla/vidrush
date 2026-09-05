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

    persistenceStatus = 'saving';
    try {
      const response = await fetch(`${apiOrigin()}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          manifest: currentManifest,
          label,
          createVersion: options.createVersion !== false
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `Project save returned HTTP ${response.status}.`);
      if (payload.manifest?.id && payload.manifest.id !== currentManifest.id) {
        currentManifest = payload.manifest;
      }
      persistenceStatus = 'saved';
      return payload;
    } catch (error) {
      persistenceStatus = 'error';
      console.warn('[ProjectStore] Durable save failed:', error.message);
      return null;
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

  function init(initialManifest) {
    currentManifest = initialManifest ? ProjectManifest.recalculateTimings(initialManifest) : ProjectManifest.createDefault();
    undoStack.length = 0;
    redoStack.length = 0;
    notify({ type: 'INIT', description: 'Project initialized' });
  }

  function getManifest() {
    return currentManifest;
  }

  /**
   * Dispatch a structured action.
   * Modifies manifest via ProjectActions reducer and pushes to undo stack.
   */
  function dispatch(action, description = '') {
    if (!action) return currentManifest;

    const previousManifest = currentManifest;
    const nextManifest = ProjectActions.reduce(currentManifest, action);

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
      notify(action, description);
      scheduleSave(description || action.type || 'Autosave');
    }

    return currentManifest;
  }

  function undo() {
    if (!canUndo()) return null;

    const last = undoStack.pop();
    redoStack.push({
      manifest: currentManifest,
      description: last.description,
      timestamp: Date.now()
    });

    currentManifest = last.manifest;
    notify({ type: 'UNDO' }, `Undo: ${last.description}`);
    scheduleSave(`Undo: ${last.description}`);
    return currentManifest;
  }

  function redo() {
    if (!canRedo()) return null;

    const next = redoStack.pop();
    undoStack.push({
      manifest: currentManifest,
      description: next.description,
      timestamp: Date.now()
    });

    currentManifest = next.manifest;
    notify({ type: 'REDO' }, `Redo: ${next.description}`);
    scheduleSave(`Redo: ${next.description}`);
    return currentManifest;
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
        fn(currentManifest, action, description);
      } catch (err) {
        console.error('[ProjectStore] Listener error:', err);
      }
    });
  }

  const api = {
    init,
    getManifest,
    dispatch,
    undo,
    redo,
    canUndo,
    canRedo,
    subscribe,
    saveNow,
    restoreLatest,
    getPersistenceStatus: () => persistenceStatus
  };

  if (typeof window !== 'undefined') window.ProjectStore = api;
  if (typeof globalThis !== 'undefined') globalThis.ProjectStore = api;
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
