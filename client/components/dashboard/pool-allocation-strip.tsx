"use client"

import { cn } from "@/lib/utils"

export type PoolAllocationSegment = {
  id: string
  color: string
  /** Relative weight — share of bar width (e.g. allocation % or USD). */
  weight: number
  label?: string
}

type PoolAllocationStripProps = {
  segments: PoolAllocationSegment[]
  className?: string
  heightClassName?: string
}

export function PoolAllocationStrip({
  segments,
  className,
  heightClassName = "h-2",
}: PoolAllocationStripProps) {
  const total = segments.reduce((sum, seg) => sum + seg.weight, 0)
  if (total <= 0) {
    return null
  }

  return (
    <div
      className={cn(
        "flex gap-0.5 overflow-hidden rounded bg-border",
        heightClassName,
        className,
      )}
      role="img"
      aria-label="Pool allocation breakdown"
    >
      {segments.map((segment) => (
        <div
          key={segment.id}
          className="min-w-[2px] transition-[flex-grow] duration-300"
          style={{
            flexGrow: segment.weight,
            flexBasis: 0,
            backgroundColor: segment.color,
          }}
          title={segment.label}
        />
      ))}
    </div>
  )
}
