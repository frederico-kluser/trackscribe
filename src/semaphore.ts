/**
 * A minimal counting semaphore with direct permit transfer.
 *
 * On `release`, if a waiter is queued the permit is handed straight to it
 * instead of being returned to the pool and re-acquired — this avoids the
 * classic race where a just-freed permit is stolen by a newcomer ahead of an
 * earlier waiter. Used to bound parallel Whisper API calls and to limit
 * concurrent cloud diarization jobs.
 *
 * ---
 *
 * Semáforo de contagem com transferência direta de permissão, usado para
 * limitar as chamadas paralelas à API do Whisper e os jobs de diarização na
 * nuvem.
 */
export class Semaphore {
  private permits: number;
  private readonly waiters: Array<() => void> = [];

  constructor(max: number) {
    if (!Number.isInteger(max) || max < 1) {
      throw new Error(`Semaphore max must be an integer >= 1 (got ${max}).`);
    }
    this.permits = max;
  }

  private acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => this.waiters.push(resolve));
  }

  private release(): void {
    const next = this.waiters.shift();
    if (next) {
      next(); // transfer the permit directly to the next waiter
    } else {
      this.permits++;
    }
  }

  /** Acquire a permit, run `fn`, and always release the permit afterwards. */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}
