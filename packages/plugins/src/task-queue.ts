/**
 * Runs tasks one at a time. For a control that keeps in-flight state on itself — a URL it reads
 * back after an await, say — overlapping calls read each other's state, and queueing is the only
 * fix a caller can apply from outside.
 */
export function createTaskQueue(): <T>(task: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(task: () => Promise<T>): Promise<T> => {
    const next = tail.then(task);
    // The tail absorbs the outcome, so one caller's failure reaches that caller alone and never
    // strands the callers queued behind it.
    tail = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  };
}
