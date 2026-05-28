"use client"

import { useState } from "react"
import { Check, Copy } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  DEFAULT_NETWORK_LAYOUT,
  PROTOCOL_LABELS,
  PROTOCOL_NODE_IDS,
  type NetworkLayoutConfig,
  type ProtocolNodeId,
  copyTextToClipboard,
  formatLayoutCoordinatesForCopy,
  syncProtocolPositionsFromSpread,
} from "@/lib/network-layout-config"

type CanvasLayoutPanelProps = {
  layout: NetworkLayoutConfig
  onLayoutChange: (layout: NetworkLayoutConfig) => void
}

function SliderField({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label className="text-muted-foreground text-[10px] uppercase tracking-wide">
          {label}
        </label>
        <span className="text-foreground tabular-nums">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-[#ea580c]"
      />
    </div>
  )
}

function NodeScaleFields({
  width,
  height,
  onWidthChange,
  onHeightChange,
}: {
  width: number
  height: number
  onWidthChange: (v: number) => void
  onHeightChange: (v: number) => void
}) {
  return (
    <div className="space-y-3">
      <SliderField
        label="Width (X / Z)"
        value={width}
        min={0.3}
        max={3}
        step={0.05}
        onChange={onWidthChange}
      />
      <SliderField
        label="Height (Y)"
        value={height}
        min={0.3}
        max={3}
        step={0.05}
        onChange={onHeightChange}
      />
    </div>
  )
}

export function CanvasLayoutPanel({ layout, onLayoutChange }: CanvasLayoutPanelProps) {
  const [activeTab, setActiveTab] = useState("layout")
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)

  const updateGlobal = (patch: Partial<NetworkLayoutConfig["global"]>) => {
    const next = syncProtocolPositionsFromSpread({
      ...layout,
      global: { ...layout.global, ...patch },
    })
    onLayoutChange(next)
  }

  const updateProtocol = (id: ProtocolNodeId, patch: Partial<NetworkLayoutConfig["protocols"][ProtocolNodeId]>) => {
    onLayoutChange({
      ...layout,
      protocols: {
        ...layout.protocols,
        [id]: { ...layout.protocols[id], ...patch },
      },
    })
  }

  const updateBuySignals = (patch: Partial<NetworkLayoutConfig["buySignals"]>) => {
    onLayoutChange({
      ...layout,
      buySignals: { ...layout.buySignals, ...patch },
      global: {
        ...layout.global,
        buySignalsY: patch.positionY ?? layout.global.buySignalsY,
      },
    })
  }

  const applySpreadToAll = () => {
    onLayoutChange(syncProtocolPositionsFromSpread(layout))
  }

  const handleCopyCoordinates = async () => {
    const text = formatLayoutCoordinatesForCopy(layout)
    const ok = await copyTextToClipboard(text)
    setCopyError(!ok)
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    }
  }

  const coordinatesPreview = formatLayoutCoordinatesForCopy(layout)

  return (
    <div className="absolute top-6 right-6 z-20 w-[min(100vw-3rem,22rem)] text-xs font-mono bg-black/95 border border-border rounded-lg shadow-xl overflow-hidden">
      <div className="px-3 py-2 border-b border-border">
        <p className="text-foreground font-bold tracking-widest uppercase text-[10px]">
          Canvas Layout
        </p>
        <p className="text-muted-foreground text-[10px] mt-0.5">
          Adjust sliders, then use Copy coordinates below
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full h-auto flex flex-wrap gap-0.5 rounded-none bg-muted/40 p-1 border-b border-border">
          <TabsTrigger value="layout" className="text-[9px] px-2 py-1.5 flex-1 min-w-[3.5rem]">
            Layout
          </TabsTrigger>
          {PROTOCOL_NODE_IDS.map((id) => (
            <TabsTrigger key={id} value={id} className="text-[9px] px-2 py-1.5 flex-1 min-w-[3rem]">
              {PROTOCOL_LABELS[id].slice(0, 4)}
            </TabsTrigger>
          ))}
          <TabsTrigger value="buySignals" className="text-[9px] px-2 py-1.5 flex-1 min-w-[3rem]">
            Top
          </TabsTrigger>
          <TabsTrigger value="export" className="text-[9px] px-2 py-1.5 flex-1 min-w-[3.5rem]">
            Export
          </TabsTrigger>
        </TabsList>

        <div className="p-3 max-h-[min(50vh,420px)] overflow-y-auto">
          <TabsContent value="layout" className="mt-0 space-y-3">
            <SliderField
              label="Distance between protocols"
              value={layout.global.protocolSpread}
              min={20}
              max={120}
              step={1}
              onChange={(v) => updateGlobal({ protocolSpread: v })}
            />
            <SliderField
              label="Top node height (Y)"
              value={layout.global.buySignalsY}
              min={20}
              max={120}
              step={1}
              onChange={(v) => updateGlobal({ buySignalsY: v })}
            />
            <button
              type="button"
              onClick={applySpreadToAll}
              className="w-full py-1.5 border border-border rounded text-muted-foreground hover:text-foreground hover:border-[#ea580c]/50 transition-colors text-[10px] uppercase tracking-wide"
            >
              Sync corner positions to spread
            </button>
            <p className="text-muted-foreground text-[10px] leading-relaxed">
              Spread moves all four protocol nodes apart or together. Use per-node tabs for
              individual size and position.
            </p>
          </TabsContent>

          {PROTOCOL_NODE_IDS.map((id) => {
            const node = layout.protocols[id]
            return (
              <TabsContent key={id} value={id} className="mt-0 space-y-3">
                <div
                  className="w-2 h-2 rounded-full mb-1"
                  style={{
                    backgroundColor:
                      id === "uniswap"
                        ? "#ff007a"
                        : id === "aave"
                          ? "#7928ca"
                          : id === "compound"
                            ? "#00d4ff"
                            : "#00a3e0",
                  }}
                />
                <p className="text-foreground font-semibold">{PROTOCOL_LABELS[id]}</p>
                <SliderField
                  label="Radius"
                  value={node.radius}
                  min={4}
                  max={30}
                  step={0.5}
                  onChange={(v) => updateProtocol(id, { radius: v })}
                />
                <NodeScaleFields
                  width={node.width}
                  height={node.height}
                  onWidthChange={(v) => updateProtocol(id, { width: v })}
                  onHeightChange={(v) => updateProtocol(id, { height: v })}
                />
                <SliderField
                  label="Position X"
                  value={node.positionX}
                  min={-120}
                  max={120}
                  step={1}
                  onChange={(v) => updateProtocol(id, { positionX: v })}
                />
                <SliderField
                  label="Position Z"
                  value={node.positionZ}
                  min={-120}
                  max={120}
                  step={1}
                  onChange={(v) => updateProtocol(id, { positionZ: v })}
                />
              </TabsContent>
            )
          })}

          <TabsContent value="buySignals" className="mt-0 space-y-3">
            <p className="text-[#00ff88] font-semibold">Buy Signals (top)</p>
            <SliderField
              label="Radius"
              value={layout.buySignals.radius}
              min={4}
              max={30}
              step={0.5}
              onChange={(v) => updateBuySignals({ radius: v })}
            />
            <NodeScaleFields
              width={layout.buySignals.width}
              height={layout.buySignals.height}
              onWidthChange={(v) => updateBuySignals({ width: v })}
              onHeightChange={(v) => updateBuySignals({ height: v })}
            />
            <SliderField
              label="Position Y"
              value={layout.buySignals.positionY}
              min={20}
              max={120}
              step={1}
              onChange={(v) => updateBuySignals({ positionY: v })}
            />
          </TabsContent>

          <TabsContent value="export" className="mt-0 space-y-3">
            <p className="text-muted-foreground text-[10px] leading-relaxed">
              Preview of everything that will be copied (distances, positions, sizes).
            </p>
            <pre className="text-[9px] leading-relaxed bg-background/80 border border-border rounded p-2 max-h-56 overflow-auto text-foreground/90 whitespace-pre-wrap break-all">
              {coordinatesPreview}
            </pre>
            <button
              type="button"
              onClick={() => onLayoutChange(DEFAULT_NETWORK_LAYOUT)}
              className="w-full py-1.5 border border-border rounded text-muted-foreground hover:text-foreground transition-colors text-[10px] uppercase tracking-wide"
            >
              Reset to defaults
            </button>
          </TabsContent>
        </div>
      </Tabs>

      {/* Always visible — copy current coordinates from any tab */}
      <div className="border-t border-border bg-black p-3 space-y-2">
        <button
          type="button"
          onClick={handleCopyCoordinates}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#ea580c] text-background font-bold rounded uppercase tracking-widest text-[11px] hover:bg-[#ea580c]/90 transition-colors"
        >
          {copied ? (
            <>
              <Check size={16} />
              Coordinates copied
            </>
          ) : (
            <>
              <Copy size={16} />
              Copy coordinates
            </>
          )}
        </button>
        {copyError && (
          <p className="text-red-400 text-[10px] text-center">
            Copy failed — allow clipboard access or use Export tab preview
          </p>
        )}
        <p className="text-muted-foreground text-[9px] text-center leading-relaxed">
          Copies spread, heights, positions, radius &amp; width for all nodes
        </p>
      </div>
    </div>
  )
}
