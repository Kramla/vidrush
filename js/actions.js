/**
 * Compatibility facade for the shared deterministic editing engine.
 */

const ProjectActions = (() => {
  const engine = typeof EditingEngine !== 'undefined'
    ? EditingEngine
    : (typeof require !== 'undefined' ? require('./editingEngine.js') : null);

  const api = {
    reduce(manifest, action, options = {}) {
      return engine.applyTransaction(manifest, action, options);
    },
    prepare(manifest, action, options = {}) {
      return engine.prepareTransaction(manifest, action, options);
    },
    operationSchemaVersion: engine.OPERATION_SCHEMA_VERSION
  };

  if (typeof window !== 'undefined') window.ProjectActions = api;
  if (typeof globalThis !== 'undefined') globalThis.ProjectActions = api;
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
