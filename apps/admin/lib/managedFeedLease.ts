/** Raised when a worker can no longer prove that it owns its tenant feed lease. */
export class ManagedFeedLeaseLostError extends Error {
  constructor(message = "Managed inventory feed lease was lost.") {
    super(message);
    this.name = "ManagedFeedLeaseLostError";
  }
}

/** Stop before the next side effect once the cron heartbeat has lost ownership. */
export function assertManagedFeedLeaseActive(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  const reason = signal.reason;
  throw new ManagedFeedLeaseLostError(
    reason instanceof Error && reason.message ? reason.message : undefined,
  );
}
