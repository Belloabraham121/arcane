import type { MarketplacePurchaseRecord } from "@/lib/api/marketplace"
import { sumSttWei } from "@/lib/marketplace-display"

export type MarketplaceSpendRange = "24h" | "7d" | "30d" | "all"

export type MarketplaceSpendBucket = {
  key: string
  label: string
  spendStt: number
  spendWei: string
  purchaseCount: number
  ts: number
}

export type MarketplaceSpendSummary = {
  totalSpendWei: string
  totalSpendStt: number
  purchaseCount: number
  avgSpendStt: number
  peakBucketLabel: string | null
  peakSpendStt: number
}

const MS_HOUR = 3_600_000
const MS_DAY = 86_400_000
const STT_SCALE = 1e18

function weiToSttNumber(wei: string): number {
  try {
    return Number(BigInt(wei)) / STT_SCALE
  } catch {
    return 0
  }
}

function startOfHour(ts: number): number {
  const d = new Date(ts)
  d.setMinutes(0, 0, 0)
  return d.getTime()
}

function startOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function formatHourLabel(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  })
}

function formatDayLabel(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })
}

export function successfulMarketplacePurchases(
  purchases: MarketplacePurchaseRecord[],
): MarketplacePurchaseRecord[] {
  return purchases.filter((p) => p.status === "success")
}

export function filterPurchasesInRange(
  purchases: MarketplacePurchaseRecord[],
  range: MarketplaceSpendRange,
  now = Date.now(),
): MarketplacePurchaseRecord[] {
  const success = successfulMarketplacePurchases(purchases)
  if (range === "all") {
    return success
  }
  const cutoff =
    range === "24h"
      ? now - 24 * MS_HOUR
      : range === "7d"
        ? now - 7 * MS_DAY
        : now - 30 * MS_DAY
  return success.filter((p) => new Date(p.createdAt).getTime() >= cutoff)
}

function bucketKey(range: MarketplaceSpendRange, ts: number): string {
  if (range === "24h") {
    return String(startOfHour(ts))
  }
  return String(startOfDay(ts))
}

function emptyBucket(
  range: MarketplaceSpendRange,
  ts: number,
): MarketplaceSpendBucket {
  return {
    key: bucketKey(range, ts),
    label: range === "24h" ? formatHourLabel(ts) : formatDayLabel(ts),
    spendStt: 0,
    spendWei: "0",
    purchaseCount: 0,
    ts,
  }
}

function seedBuckets(
  range: MarketplaceSpendRange,
  now: number,
): MarketplaceSpendBucket[] {
  if (range === "24h") {
    const end = startOfHour(now)
    return Array.from({ length: 24 }, (_, i) => {
      const ts = end - (23 - i) * MS_HOUR
      return emptyBucket(range, ts)
    })
  }

  const days = range === "7d" ? 7 : range === "30d" ? 30 : 0
  const end = startOfDay(now)
  return Array.from({ length: days }, (_, i) => {
    const ts = end - (days - 1 - i) * MS_DAY
    return emptyBucket(range, ts)
  })
}

function seedAllBuckets(
  purchases: MarketplacePurchaseRecord[],
): MarketplaceSpendBucket[] {
  if (purchases.length === 0) {
    return []
  }
  const times = purchases.map((p) => new Date(p.createdAt).getTime())
  const min = startOfDay(Math.min(...times))
  const max = startOfDay(Math.max(...times))
  const buckets: MarketplaceSpendBucket[] = []
  for (let ts = min; ts <= max; ts += MS_DAY) {
    buckets.push(emptyBucket("30d", ts))
  }
  return buckets.length > 0 ? buckets : [emptyBucket("30d", min)]
}

export function buildSpendBuckets(
  purchases: MarketplacePurchaseRecord[],
  range: MarketplaceSpendRange,
  now = Date.now(),
): MarketplaceSpendBucket[] {
  const filtered = filterPurchasesInRange(purchases, range, now)
  const buckets =
    range === "all"
      ? seedAllBuckets(filtered)
      : seedBuckets(range, now)

  const byKey = new Map(buckets.map((b) => [b.key, { ...b }]))

  for (const purchase of filtered) {
    const ts = new Date(purchase.createdAt).getTime()
    const key = bucketKey(range === "all" ? "30d" : range, ts)
    let bucket = byKey.get(key)
    if (!bucket) {
      bucket = emptyBucket(range === "all" ? "30d" : range, startOfDay(ts))
      byKey.set(key, bucket)
    }
    bucket.purchaseCount += 1
    bucket.spendWei = sumSttWei([bucket.spendWei, purchase.amountSttWei])
    bucket.spendStt = weiToSttNumber(bucket.spendWei)
  }

  return Array.from(byKey.values()).sort((a, b) => a.ts - b.ts)
}

export function summarizeMarketplaceSpend(
  purchases: MarketplacePurchaseRecord[],
  range: MarketplaceSpendRange,
  now = Date.now(),
): MarketplaceSpendSummary {
  const filtered = filterPurchasesInRange(purchases, range, now)
  const totalSpendWei = sumSttWei(filtered.map((p) => p.amountSttWei))
  const totalSpendStt = weiToSttNumber(totalSpendWei)
  const purchaseCount = filtered.length
  const avgSpendStt =
    purchaseCount > 0 ? totalSpendStt / purchaseCount : 0

  const buckets = buildSpendBuckets(purchases, range, now)
  let peakBucketLabel: string | null = null
  let peakSpendStt = 0
  for (const bucket of buckets) {
    if (bucket.spendStt > peakSpendStt) {
      peakSpendStt = bucket.spendStt
      peakBucketLabel = bucket.label
    }
  }

  return {
    totalSpendWei,
    totalSpendStt,
    purchaseCount,
    avgSpendStt,
    peakBucketLabel,
    peakSpendStt,
  }
}

export const MARKETPLACE_SPEND_RANGE_LABELS: Record<
  MarketplaceSpendRange,
  string
> = {
  "24h": "24 hours",
  "7d": "7 days",
  "30d": "30 days",
  all: "All time",
}
