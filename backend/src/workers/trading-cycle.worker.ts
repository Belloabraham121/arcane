import type { Address } from "viem";
import { getTradingExecutionEnv } from "../config/env";
import { createLogger } from "../shared/logger";
import {
  isUserCycleRunning,
  resolveCycleIntervalMinutes,
  scheduleTradingCycle,
} from "../services/agents/trading-runner.service";
import {
  listActiveStrategiesForWorker,
  updateBalanceFingerprint,
} from "../services/agents/trading.repository";
import { getWalletBalances } from "../services/wallet/token-balance.service";

const log = createLogger("trading-worker");

let workerTimer: ReturnType<typeof setInterval> | null = null;

function balanceFingerprint(
  balances: Awaited<ReturnType<typeof getWalletBalances>>,
): string {
  return balances.balances
    .filter((row) => {
      try {
        return BigInt(row.balance) > 0n;
      } catch {
        return false;
      }
    })
    .map((row) => `${row.symbol}:${row.balance}`)
    .sort()
    .join("|");
}

function isDueForScheduledCycle(input: {
  lastCycleAt: Date | null;
  tradingEnabledAt: Date | null;
  intervalMinutes: number;
}): boolean {
  const anchor = input.lastCycleAt ?? input.tradingEnabledAt;
  if (!anchor) {
    return false;
  }
  const elapsedMs = Date.now() - anchor.getTime();
  return elapsedMs >= input.intervalMinutes * 60_000;
}

function depositDetected(
  previous: string | null,
  current: string,
): boolean {
  if (!current) {
    return false;
  }
  if (!previous || previous.length === 0) {
    return current.length > 0;
  }
  return current !== previous && current.length > previous.length;
}

export async function runTradingWorkerTick(): Promise<void> {
  const {
    depositDetectionEnabled,
    autoCycleIntervalMinutes,
    customCycleIntervalMinutes,
  } = getTradingExecutionEnv();

  const strategies = await listActiveStrategiesForWorker();
  if (strategies.length === 0) {
    return;
  }

  log.debug("Trading worker tick", { activeStrategies: strategies.length });

  for (const strategy of strategies) {
    if (isUserCycleRunning(strategy.userId)) {
      continue;
    }

    try {
      const balances = await getWalletBalances(
        strategy.walletAddress as Address,
        strategy.poolIds,
      );
      const fingerprint = balanceFingerprint(balances);

      if (depositDetectionEnabled) {
        const detected = depositDetected(
          strategy.lastObservedBalanceFingerprint,
          fingerprint,
        );
        if (detected && fingerprint.length > 0) {
          log.info("Deposit detected — scheduling trading cycle", {
            userId: strategy.userId,
          });
          scheduleTradingCycle(strategy.userId, "deposit");
          await updateBalanceFingerprint(strategy.strategyId, fingerprint);
          continue;
        }
      }

      await updateBalanceFingerprint(strategy.strategyId, fingerprint);

      const intervalMinutes = resolveCycleIntervalMinutes({
        strategyType: strategy.strategyType as "auto" | "custom",
        cycleIntervalMinutes: strategy.cycleIntervalMinutes,
        autoCycleIntervalMinutes,
        customCycleIntervalMinutes,
      });

      if (
        fingerprint.length > 0 &&
        isDueForScheduledCycle({
          lastCycleAt: strategy.lastCycleAt,
          tradingEnabledAt: strategy.tradingEnabledAt,
          intervalMinutes,
        })
      ) {
        log.info("Scheduled trading cycle due", {
          userId: strategy.userId,
          intervalMinutes,
        });
        scheduleTradingCycle(strategy.userId, "scheduled");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn("Trading worker skipped strategy", {
        userId: strategy.userId,
        message,
      });
    }
  }
}

export function startTradingCycleWorker(): void {
  const { workerEnabled, workerPollIntervalMs } = getTradingExecutionEnv();
  if (!workerEnabled) {
    log.info("Trading cycle worker disabled (TRADING_WORKER_ENABLED=false)");
    return;
  }

  if (workerTimer) {
    return;
  }

  log.info("Starting trading cycle worker", {
    pollIntervalMs: workerPollIntervalMs,
  });

  void runTradingWorkerTick();
  workerTimer = setInterval(() => {
    void runTradingWorkerTick();
  }, workerPollIntervalMs);
}

export function stopTradingCycleWorker(): void {
  if (workerTimer) {
    clearInterval(workerTimer);
    workerTimer = null;
  }
}
