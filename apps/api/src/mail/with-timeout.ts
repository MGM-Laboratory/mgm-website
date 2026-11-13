/** A send whose answer never came, so the provider may or may not have delivered it. */
export class OutcomeUnknownError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OutcomeUnknownError";
  }
}

/**
 * Whether an error of a mail client means that the outcome of the send is
 * unknown, which holds for the timeouts of this file, of the AWS SDK and of
 * nodemailer. A refusal that the provider answered is not unknown.
 */
export function outcomeUnknown(error: unknown): boolean {
  if (error instanceof OutcomeUnknownError) return true;
  if (!(error instanceof Error)) return false;
  return error.name === "TimeoutError" || (error as { code?: unknown }).code === "ETIMEDOUT";
}

/**
 * Waits for `work` for at most `ms` and then rejects with a message that names
 * the `label`. The call that `work` started is not cancelled, because the
 * client it comes from has no way to abort it, so the caller must treat the
 * timeout as "outcome unknown".
 */
export async function withTimeout<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new OutcomeUnknownError(`${label} did not answer within ${ms} ms`)),
      ms,
    );
  });
  try {
    return await Promise.race([work, limit]);
  } finally {
    clearTimeout(timer);
  }
}
