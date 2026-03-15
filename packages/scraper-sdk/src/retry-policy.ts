import { clamp, sleep } from "@pinshuffle/core";

export interface RetryPolicy {
  maxAttempts: number;
  minDelayMs: number;
  maxDelayMs: number;
  factor: number;
}

export const defaultRetryPolicy: RetryPolicy = {
  maxAttempts: 3,
  minDelayMs: 500,
  maxDelayMs: 5_000,
  factor: 2
};

export async function executeWithRetry<T>(
  operation: (attempt: number) => Promise<T>,
  policy: Partial<RetryPolicy> = {},
  onRetry?: (
    attempt: number,
    error: unknown,
    nextDelayMs: number
  ) => Promise<void> | void
): Promise<T> {
  const resolvedPolicy = {
    ...defaultRetryPolicy,
    ...policy
  };

  let attempt = 0;
  let lastError: unknown;

  while (attempt < resolvedPolicy.maxAttempts) {
    attempt += 1;

    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      if (attempt >= resolvedPolicy.maxAttempts) {
        break;
      }

      const nextDelayMs = computeBackoffDelay(resolvedPolicy, attempt);
      await onRetry?.(attempt, error, nextDelayMs);
      await sleep(nextDelayMs);
    }
  }

  throw lastError;
}

function computeBackoffDelay(policy: RetryPolicy, attempt: number): number {
  const exponentialDelay =
    policy.minDelayMs * Math.pow(policy.factor, attempt - 1);
  const jitter = Math.random() * policy.minDelayMs;
  return clamp(
    Math.round(exponentialDelay + jitter),
    policy.minDelayMs,
    policy.maxDelayMs
  );
}
