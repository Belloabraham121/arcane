import { Skeleton } from "@/components/ui/skeleton"

export function DashboardHeroSkeleton() {
  return (
    <div className="space-y-8">
      <div>
        <Skeleton className="mb-2 h-3 w-24" />
        <Skeleton className="h-16 w-72 lg:h-20 lg:w-96" />
      </div>
      <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-6 w-28" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function PoolMetricsStripSkeleton({ tiles = 3 }: { tiles?: number }) {
  return (
    <div className="border border-border">
      <Skeleton className="h-10 w-full rounded-none" />
      <div className="flex gap-px overflow-x-auto bg-border">
        {Array.from({ length: tiles }).map((_, index) => (
          <div key={index} className="min-w-[220px] flex-1 space-y-2 bg-background px-4 py-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-2 w-20" />
            <Skeleton className="h-2 w-32" />
            <Skeleton className="h-2 w-28" />
            <Skeleton className="h-2 w-36" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function ActivePoolsPanelSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="border border-border p-6">
      <Skeleton className="mb-4 h-3 w-24" />
      <div className="space-y-4">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="space-y-2 border-b border-border pb-4 last:border-b-0">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-2 w-48" />
            <Skeleton className="h-2 w-56" />
            <Skeleton className="h-1.5 w-full" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function WalletBalancesSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="flex items-center justify-between gap-3 border border-border px-3 py-2"
        >
          <div className="space-y-1">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-2 w-20" />
          </div>
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
    </div>
  )
}

export function MarketsTableSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="border border-border">
      <div className="hidden border-b border-border bg-muted/20 px-4 py-2 lg:grid lg:grid-cols-8 lg:gap-4">
        {Array.from({ length: 7 }).map((_, index) => (
          <Skeleton key={index} className="h-2 w-16" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="grid grid-cols-2 gap-4 border-b border-border p-4 last:border-b-0 lg:grid-cols-8 lg:items-center"
        >
          <div className="col-span-2 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-2 w-24" />
          </div>
          {Array.from({ length: 5 }).map((__, cellIndex) => (
            <Skeleton key={cellIndex} className="h-4 w-14" />
          ))}
        </div>
      ))}
    </div>
  )
}

export function PoolAllocationEditorSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="border border-border p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-3 w-36" />
          <Skeleton className="h-2 w-56" />
        </div>
        <Skeleton className="h-7 w-24" />
      </div>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="space-y-2 border-b border-border pb-4 last:border-b-0">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-2 w-40" />
          <Skeleton className="h-2 w-52" />
          <Skeleton className="h-8 w-full" />
        </div>
      ))}
    </div>
  )
}

export function DepositAddressCardSkeleton() {
  return (
    <div className="space-y-5 border border-border p-6">
      <div className="space-y-2">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-2 w-full max-w-md" />
      </div>
      <Skeleton className="h-10 w-full" />
      <div className="space-y-2">
        <Skeleton className="h-3 w-24" />
        <WalletBalancesSkeleton rows={2} />
      </div>
      <Skeleton className="h-10 w-full" />
    </div>
  )
}

export function TradingHistoryTableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="border border-border">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-center justify-between gap-4 border-b border-border px-4 py-4 last:border-b-0">
          <div className="space-y-2">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-2 w-48" />
          </div>
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
    </div>
  )
}

export function AgentsCanvasSkeleton() {
  return (
    <div className="relative h-[calc(100vh-120px)] w-full overflow-hidden">
      <Skeleton className="absolute inset-0 rounded-none" />
      <div className="absolute bottom-6 left-6 space-y-3">
        <Skeleton className="h-24 w-56" />
        <Skeleton className="h-16 w-40" />
      </div>
    </div>
  )
}

export function SubAgentEditorSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <div className="space-y-4 border border-border p-6">
      <Skeleton className="h-3 w-40" />
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="space-y-2 border-b border-border pb-4 last:border-b-0">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ))}
    </div>
  )
}
