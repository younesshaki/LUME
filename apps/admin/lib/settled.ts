/**
 * Start independent work early without letting an early failure escape.
 *
 * `settle` begins a read now and holds its outcome, so it can overlap other
 * awaits without an early rejection ever going unhandled. `unwrapSettled`
 * re-throws the ORIGINAL error at the point the result is actually used — so
 * moving a read earlier does not move where, or how, its failure surfaces.
 */
export type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown };

export function settle<T>(work: PromiseLike<T>): Promise<Settled<T>> {
  return Promise.resolve(work).then(
    (value): Settled<T> => ({ ok: true, value }),
    (error: unknown): Settled<T> => ({ ok: false, error }),
  );
}

export async function unwrapSettled<T>(settled: Promise<Settled<T>>): Promise<T> {
  const outcome = await settled;
  if (outcome.ok) return outcome.value;
  throw outcome.error;
}
