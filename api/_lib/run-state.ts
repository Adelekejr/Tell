// The run lifecycle machine lives with the shared evidence rules, so the
// server and the web page read run states the same way.
export type { RunLifecycle, RunLifecycleEvent } from './shared.js';
export { acceptsEvidence, closeTimeFor, closedAtOf, isClosed, lifecycleOf, transitionLifecycle } from './shared.js';
