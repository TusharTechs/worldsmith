/**
 * Per-key async mutex, module-scoped (not per-store-instance, since `createServerProjectStore()`
 * builds a fresh store object on every server-action call). Used to serialize `updateProject`
 * calls for the same project id, so two concurrent operations on one project (e.g. retrying an
 * asset while a generation batch is still running) can't clobber each other's read-modify-write
 * of `costLedger`/`actualCostUSD`/status fields.
 */
const chains = new Map<string, Promise<unknown>>();

export function withProjectLock<T>(projectId: string, fn: () => Promise<T>): Promise<T> {
  const prior = chains.get(projectId) ?? Promise.resolve();
  const run = prior.then(fn, fn); // run after prior settles, whether it resolved or rejected
  // Keep the chain alive but never let a rejection here poison future callers' `.then`.
  chains.set(projectId, run.catch(() => {}));
  return run;
}
