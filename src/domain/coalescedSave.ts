/** Quiet gap so a burst of taps becomes one write of the last value. */
export const CHOICE_SAVE_MS = 200;

type Waiter = {
  resolve: () => void;
  reject: (error: unknown) => void;
};

/**
 * The choice is already on screen. This waits briefly, then writes only the
 * latest value. A tap that arrives while a write is in flight replaces
 * anything not yet sent. A failed write reverts only when it is still the
 * latest choice.
 */
export class CoalescedSave<T> {
  private latest: T;
  private confirmed: T;
  private generation = 0;
  private settled = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private flight: Promise<void> | null = null;
  private pending = new Map<number, Waiter>();

  constructor(
    initial: T,
    private readonly write: (value: T) => Promise<void>,
    private readonly equals: (left: T, right: T) => boolean = sameJson,
    private readonly delayMs = CHOICE_SAVE_MS,
  ) {
    this.latest = initial;
    this.confirmed = initial;
  }

  /** A reload should keep this until the write settles. */
  get dirty(): boolean {
    return this.timer != null || this.flight != null || this.generation !== this.settled;
  }

  get value(): T {
    return this.latest;
  }

  /**
   * A freshly loaded value wins only when nothing is waiting.
   * An in-flight choice stays on screen.
   */
  seen(server: T): T {
    if (this.dirty) return this.latest;
    this.confirmed = server;
    this.latest = server;
    this.settled = this.generation;
    return server;
  }

  choose(value: T): Promise<void> {
    this.generation += 1;
    const generation = this.generation;
    this.latest = value;
    if (this.equals(value, this.confirmed) && this.flight == null) {
      if (this.timer) clearTimeout(this.timer);
      this.timer = null;
      this.settled = generation;
      this.resolveUntil(generation);
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      this.pending.set(generation, { resolve, reject });
      this.schedule();
    });
  }

  private schedule() {
    if (this.flight) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, this.delayMs);
  }

  private flush() {
    if (this.flight) return;
    const generation = this.generation;
    const value = this.latest;
    if (this.equals(value, this.confirmed)) {
      this.settled = generation;
      this.resolveUntil(generation);
      return;
    }
    this.flight = Promise.resolve()
      .then(() => this.write(value))
      .then(
        () => {
          this.flight = null;
          this.confirmed = value;
          if (this.equals(this.latest, value)) {
            this.settled = this.generation;
            this.resolveUntil(this.generation);
            return;
          }
          this.resolveUntil(generation);
          this.schedule();
        },
        (error: unknown) => {
          this.flight = null;
          if (this.generation === generation) {
            this.latest = this.confirmed;
            this.settled = this.generation;
            this.rejectLatest(generation, error);
            return;
          }
          this.resolveOne(generation);
          this.schedule();
        },
      );
  }

  private resolveUntil(generation: number) {
    for (const [id, waiter] of this.pending) {
      if (id > generation) continue;
      waiter.resolve();
      this.pending.delete(id);
    }
  }

  private resolveOne(generation: number) {
    const waiter = this.pending.get(generation);
    if (!waiter) return;
    waiter.resolve();
    this.pending.delete(generation);
  }

  /** Older taps in the same burst stay quiet. The latest tap reports the failure. */
  private rejectLatest(generation: number, error: unknown) {
    for (const [id, waiter] of this.pending) {
      if (id > generation) continue;
      if (id === generation) waiter.reject(error);
      else waiter.resolve();
      this.pending.delete(id);
    }
  }
}

export function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
