/**
 * Waits for `work` for at most `ms` and then rejects with a message that names
 * the `label`. The call that `work` started is not cancelled, because the
 * client it comes from has no way to abort it, so the caller must treat the
 * timeout as "outcome unknown".
 */
export async function withTimeout<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} did not answer within ${ms} ms`)), ms);
  });
  try {
    return await Promise.race([work, limit]);
  } finally {
    clearTimeout(timer);
  }
}
