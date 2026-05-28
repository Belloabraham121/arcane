"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ChevronDown, ChevronUp, GripVertical } from "lucide-react"
import { cn } from "@/lib/utils"
import { GRID_SIZE, snapToGrid, type PanelId } from "@/hooks/use-panel-layout"

type DraggableGridPanelProps = {
  id: PanelId
  title: string
  x: number
  y: number
  collapsed: boolean
  onPositionChange: (x: number, y: number) => void
  onToggleCollapsed: () => void
  children: React.ReactNode
  className?: string
  contentClassName?: string
  width?: number
  alignRight?: boolean
  containerRef: React.RefObject<HTMLElement | null>
}

export function DraggableGridPanel({
  id,
  title,
  x,
  y,
  collapsed,
  onPositionChange,
  onToggleCollapsed,
  children,
  className,
  contentClassName,
  width = 288,
  alignRight = false,
  containerRef,
}: DraggableGridPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [livePos, setLivePos] = useState<{ x: number; y: number } | null>(null)

  const displayX = livePos?.x ?? x
  const displayY = livePos?.y ?? y

  const resolvePosition = useCallback(
    (offsetX: number, rawY: number) => {
      const container = containerRef.current
      const panel = panelRef.current
      if (!container || !panel) {
        return { x: snapToGrid(offsetX), y: snapToGrid(rawY) }
      }
      const containerRect = container.getBoundingClientRect()
      const panelRect = panel.getBoundingClientRect()
      const panelW = panelRect.width
      const panelH = collapsed ? 40 : panelRect.height

      const maxY = Math.max(0, containerRect.height - panelH)
      const snappedY = Math.min(Math.max(0, snapToGrid(rawY)), snapToGrid(maxY))

      if (alignRight) {
        const maxOffset = Math.max(0, containerRect.width - panelW)
        const snappedOffset = Math.min(Math.max(0, snapToGrid(offsetX)), snapToGrid(maxOffset))
        return { x: snappedOffset, y: snappedY }
      }

      const maxX = Math.max(0, containerRect.width - panelW)
      return {
        x: Math.min(Math.max(0, snapToGrid(offsetX)), snapToGrid(maxX)),
        y: snappedY,
      }
    },
    [alignRight, collapsed, containerRef]
  )

  const onPointerDownHandle = (e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const panel = panelRef.current
    const container = containerRef.current
    if (!panel || !container) return

    const panelRect = panel.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()
    const left = panelRect.left - containerRect.left
    const startX = alignRight
      ? containerRect.width - left - panelRect.width
      : left
    const startY = panelRect.top - containerRect.top

    setDragOffset({
      x: e.clientX - panelRect.left,
      y: e.clientY - panelRect.top,
    })
    setLivePos({ x: startX, y: startY })
    setDragging(true)
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      if (!dragging) return
      const container = containerRef.current
      if (!container) return
      const containerRect = container.getBoundingClientRect()
      const panel = panelRef.current
      const panelW = panel?.offsetWidth ?? width
      const rawLeft = e.clientX - containerRect.left - dragOffset.x
      const offsetX = alignRight
        ? containerRect.width - rawLeft - panelW
        : rawLeft
      const rawY = e.clientY - containerRect.top - dragOffset.y
      const snapped = resolvePosition(offsetX, rawY)
      setLivePos(snapped)
    },
    [dragging, dragOffset, containerRef, resolvePosition]
  )

  const onPointerUp = useCallback(() => {
    if (!dragging || !livePos) {
      setDragging(false)
      setLivePos(null)
      return
    }
    const final = resolvePosition(livePos.x, livePos.y)
    onPositionChange(final.x, final.y)
    setDragging(false)
    setLivePos(null)
  }, [dragging, livePos, onPositionChange, resolvePosition])

  useEffect(() => {
    if (!dragging) return
    window.addEventListener("pointermove", onPointerMove)
    window.addEventListener("pointerup", onPointerUp)
    return () => {
      window.removeEventListener("pointermove", onPointerMove)
      window.removeEventListener("pointerup", onPointerUp)
    }
  }, [dragging, onPointerMove, onPointerUp])

  const style: React.CSSProperties = alignRight
    ? { right: displayX, top: displayY, width }
    : { left: displayX, top: displayY, width }

  return (
    <div
      ref={panelRef}
      id={`panel-${id}`}
      className={cn(
        "absolute z-20 flex flex-col overflow-hidden rounded border border-border bg-black/90 font-mono text-xs shadow-lg",
        dragging && "ring-1 ring-[#ea580c]/60",
        className
      )}
      style={style}
    >
      <div className="flex items-center gap-1 border-b border-border bg-black/95 px-1 py-1">
        <button
          type="button"
          aria-label={`Drag ${title}`}
          onPointerDown={onPointerDownHandle}
          className="flex cursor-grab items-center justify-center rounded p-1.5 text-muted-foreground hover:bg-white/10 hover:text-foreground active:cursor-grabbing"
        >
          <GripVertical size={14} />
        </button>
        <p className="min-w-0 flex-1 truncate px-1 text-[10px] uppercase tracking-widest text-muted-foreground">
          {title}
        </p>
        <button
          type="button"
          aria-label={collapsed ? `Expand ${title}` : `Collapse ${title}`}
          onClick={onToggleCollapsed}
          className="rounded p-1.5 text-muted-foreground hover:bg-white/10 hover:text-foreground"
        >
          {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
      </div>

      {!collapsed && (
        <div className={cn("overflow-auto p-4", contentClassName)}>{children}</div>
      )}

      {dragging && (
        <div
          className="pointer-events-none absolute inset-0 rounded border border-dashed border-[#ea580c]/40"
          style={{
            backgroundImage: `linear-gradient(to right, rgba(234,88,12,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(234,88,12,0.08) 1px, transparent 1px)`,
            backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px`,
          }}
        />
      )}
    </div>
  )
}
