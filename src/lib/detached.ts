import { after } from "next/server";

/**
 * Run background work that must outlive the response.
 *
 * A bare `void promise` is not safe on serverless. Once the response is flushed the platform is
 * free to freeze or reclaim the instance, so a fire-and-forget agent run can be killed
 * mid-generation — leaving a project stuck at GENERATING with paid work half-done. `after` hands
 * the work to the framework instead, so it is registered as part of the invocation and runs
 * within the route's `maxDuration`.
 *
 * This is a real improvement, not a guarantee: work that outruns `maxDuration` is still cut off.
 * The durable fix is a queue with its own workers; `serverResetStuckGeneration` remains the
 * backstop for runs that don't finish, and AssetDirector's skip-if-already-completed checks make
 * resuming safe.
 *
 * The try/catch covers callers outside a request scope (scripts, local tooling), where `after`
 * has no invocation to attach to and plain detachment is the only option available.
 */
export function runDetached(label: string, work: () => Promise<unknown>): void {
  const guarded = () =>
    work().catch((e) => console.error(`[${label}] detached execution failed:`, e));
  try {
    after(guarded);
  } catch {
    void guarded();
  }
}
