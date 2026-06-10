import { createLogger } from "../../shared/logger";

const log = createLogger("demo-cycle-mutex");

export const DEMO_WALLET_NOTICE =
  "Demo trades run on a shared simulation wallet";

let demoCycleOwnerUserId: string | null = null;

type QueuedWaiter = {
  userId: string;
  resolve: () => void;
  reject: (err: Error) => void;
};

const waitQueue: QueuedWaiter[] = [];

export class DemoCycleBusyError extends Error {
  constructor() {
    super(
      "Another demo trading cycle is in progress on the shared simulation wallet. Try again shortly.",
    );
    this.name = "DemoCycleBusyError";
  }
}

export function isDemoWalletCycleRunning(): boolean {
  return demoCycleOwnerUserId !== null;
}

export function getDemoCycleOwnerUserId(): string | null {
  return demoCycleOwnerUserId;
}

export function resetDemoCycleMutexForTests(): void {
  demoCycleOwnerUserId = null;
  for (const waiter of waitQueue.splice(0)) {
    waiter.reject(new Error("Demo cycle mutex reset"));
  }
}

function wakeNextWaiter(): void {
  const next = waitQueue.shift();
  if (!next) {
    return;
  }
  demoCycleOwnerUserId = next.userId;
  log.debug("Demo cycle lock granted from queue", { userId: next.userId });
  next.resolve();
}

/**
 * Global mutex for the shared demo wallet — one fork trading cycle at a time.
 * Concurrent callers wait in FIFO order.
 */
export function acquireDemoCycleLock(userId: string): Promise<void> {
  if (demoCycleOwnerUserId === userId) {
    return Promise.resolve();
  }

  if (demoCycleOwnerUserId === null) {
    demoCycleOwnerUserId = userId;
    log.debug("Demo cycle lock acquired", { userId });
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    waitQueue.push({ userId, resolve, reject });
    log.debug("Demo cycle lock queued", {
      userId,
      owner: demoCycleOwnerUserId,
      queueDepth: waitQueue.length,
    });
  });
}

export function releaseDemoCycleLock(userId: string): void {
  if (demoCycleOwnerUserId !== userId) {
    return;
  }

  demoCycleOwnerUserId = null;
  log.debug("Demo cycle lock released", { userId });
  wakeNextWaiter();
}

export async function withDemoCycleLock<T>(
  userId: string,
  fn: () => Promise<T>,
): Promise<T> {
  await acquireDemoCycleLock(userId);
  try {
    return await fn();
  } finally {
    releaseDemoCycleLock(userId);
  }
}
