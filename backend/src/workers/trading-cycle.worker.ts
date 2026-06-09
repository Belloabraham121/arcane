import type { Address } from "viem";
import { getTradingExecutionEnv } from "../config/env";
import { createLogger } from "../shared/logger";
import { resolveSubAgents } from "../services/somnia/quickswap-llm-tools";
import { isDemoWalletCycleRunning } from "../services/agents/demo-cycle-mutex.service";
import {
  isCycleCooldownActive,
  resolveRiskLimits,
} from "../services/agents/risk-controls.service";
import {
  isUserCycleRunning,
  resolveCycleIntervalMinutes,
  scheduleTradingCycle,
} from "../services/agents/trading-runner.service";
import { findStrategyByUserId } from "../services/agents/strategy.repository";
import {
  listActiveStrategiesForWorker,
  updateBalanceFingerprint,
} from "../services/agents/trading.repository";
import {
  getDemoTradingAvailability,
  resolvePortfolioWallet,
  withPortfolioRpc,
} from "../services/portfolio/wallet-context.service";
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
      if (strategy.accountMode === "demo") {
        const demoAvailability = await getDemoTradingAvailability();
        if (!demoAvailability.available) {
          log.debug("Demo strategy skipped — fork unavailable", {
            userId: strategy.userId,
            reason: demoAvailability.reason,
          });
          continue;
        }
        if (isDemoWalletCycleRunning()) {
          log.debug("Demo strategy skipped — shared wallet cycle in progress", {
            userId: strategy.userId,
          });
          continue;
        }
      }

      const resolved = resolvePortfolioWallet(
        strategy.accountMode,
        strategy.walletAddress as Address,
      );
      const balances = await withPortfolioRpc(resolved.rpcMode, () =>
        getWalletBalances(resolved.walletAddress, strategy.poolIds),
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
        const fullStrategy = await findStrategyByUserId(strategy.userId);
        const subAgents = resolveSubAgents(
          strategy.strategyType as "auto" | "custom",
          fullStrategy?.subAgentConfig,
        );
        const riskLimits = resolveRiskLimits(subAgents);

        if (isCycleCooldownActive(strategy.lastCycleAt, riskLimits)) {
          log.debug("Scheduled cycle skipped — cooldown active", {
            userId: strategy.userId,
          });
          continue;
        }

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
