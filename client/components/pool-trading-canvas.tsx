"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Canvas, useFrame } from "@react-three/fiber"
import { OrbitControls, PerspectiveCamera, Html } from "@react-three/drei"
import * as THREE from "three"
import type { AccountMode } from "@/lib/api/auth"
import type { SubAgentStatus } from "@/lib/api/trading-socket-types"
import type { PoolRouteCommand } from "@/lib/trading-feed-helpers"
import { cn } from "@/lib/utils"
import type { StrategyCanvasPool } from "@/lib/pool-resolve"
import {
  buildPoolNetworkNodes,
  poolNodeIndex,
  type PoolNetworkNode,
} from "@/lib/pool-network-layout"

const SUB_AGENT_COLORS: Record<string, string> = {
  "signal-scout": "#3b82f6",
  "risk-manager": "#f59e0b",
  "yield-executor": "#22c55e",
  "bridge-scout": "#8b5cf6",
  "root-orchestrator": "#ea580c",
}

const SUB_AGENT_FALLBACK_COLORS = [
  "#06b6d4",
  "#ec4899",
  "#14b8a6",
  "#f97316",
  "#6366f1",
]

function subAgentColor(agentId: string, index: number): string {
  return (
    SUB_AGENT_COLORS[agentId] ??
    SUB_AGENT_FALLBACK_COLORS[index % SUB_AGENT_FALLBACK_COLORS.length]
  )
}

type SubAgentNode = {
  agentId: string
  agentName: string
  position: [number, number, number]
  color: string
  status: "idle" | "running" | "completed"
  summary?: string
}

type AgentTrip = {
  sourceIndex: number
  targetIndex: number
  progress: number
  speed: number
}

function interpolateArc(
  from: [number, number, number],
  to: [number, number, number],
  t: number,
  height: number,
): [number, number, number] {
  const arc = Math.sin(t * Math.PI) * height
  return [
    from[0] + (to[0] - from[0]) * t,
    from[1] + (to[1] - from[1]) * t + arc,
    from[2] + (to[2] - from[2]) * t,
  ]
}

function ParticleRing({ radius, color, y }: { radius: number; color: string; y: number }) {
  const ref = useRef<THREE.Points>(null)
  const count = 120

  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2
      arr[i * 3] = Math.cos(angle) * radius
      arr[i * 3 + 1] = y
      arr[i * 3 + 2] = Math.sin(angle) * radius
    }
    return arr
  }, [radius, y, count])

  useFrame((_, delta) => {
    if (ref.current) {
      ref.current.rotation.y += delta * 0.08
    }
  })

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        color={color}
        size={0.18}
        transparent
        opacity={0.35}
        sizeAttenuation
      />
    </points>
  )
}

function PoolNodeMesh({ node }: { node: PoolNetworkNode }) {
  const meshRef = useRef<THREE.Mesh>(null)
  const ringRef = useRef<THREE.Mesh>(null)

  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += 0.004
      meshRef.current.rotation.x += 0.001
    }
    if (ringRef.current) {
      ringRef.current.rotation.z += delta * 0.15
    }
  })

  return (
    <group position={node.position}>
      <mesh ref={meshRef}>
        <icosahedronGeometry args={[node.radius, 3]} />
        <meshPhongMaterial
          color={node.color}
          emissive={node.color}
          emissiveIntensity={0.25}
          wireframe
          transparent
          opacity={0.6}
        />
      </mesh>
      <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[node.radius + 1.8, 0.15, 8, 48]} />
        <meshPhongMaterial
          color={node.color}
          emissive={node.color}
          emissiveIntensity={0.4}
          transparent
          opacity={0.7}
        />
      </mesh>
      <mesh rotation={[Math.PI / 3, Math.PI / 6, 0]}>
        <torusGeometry args={[node.radius + 2.5, 0.08, 6, 48]} />
        <meshPhongMaterial
          color={node.color}
          emissive={node.color}
          emissiveIntensity={0.2}
          transparent
          opacity={0.3}
        />
      </mesh>
    </group>
  )
}

function SubAgentNodeMesh({
  node,
  rootPosition,
}: {
  node: SubAgentNode
  rootPosition: [number, number, number]
}) {
  const groupRef = useRef<THREE.Group>(null)
  const coreRef = useRef<THREE.Mesh>(null)
  const pulseRef = useRef<THREE.Mesh>(null)
  const dataLineRef = useRef<THREE.Line>(null)

  useFrame((_, delta) => {
    if (coreRef.current) {
      coreRef.current.rotation.x += delta * 1.2
      coreRef.current.rotation.y += delta * 0.8
    }

    if (pulseRef.current) {
      if (node.status === "running") {
        const scale = 1.0 + Math.sin(Date.now() * 0.008) * 0.4
        pulseRef.current.scale.set(scale, scale, scale)
        pulseRef.current.visible = true
      } else if (node.status === "completed") {
        pulseRef.current.scale.set(1.3, 1.3, 1.3)
        pulseRef.current.visible = true
      } else {
        pulseRef.current.visible = false
      }
    }

    if (dataLineRef.current && (node.status === "running" || node.status === "completed")) {
      const geom = dataLineRef.current.geometry as THREE.BufferGeometry
      const positions = new Float32Array(6)
      positions[0] = node.position[0]
      positions[1] = node.position[1]
      positions[2] = node.position[2]
      positions[3] = rootPosition[0]
      positions[4] = rootPosition[1]
      positions[5] = rootPosition[2]
      geom.setAttribute("position", new THREE.BufferAttribute(positions, 3))
      geom.attributes.position!.needsUpdate = true
      dataLineRef.current.visible = true

      if (node.status === "running") {
        const mat = dataLineRef.current.material as THREE.LineDashedMaterial
        mat.dashSize = 0.6
        mat.gapSize = 0.4
        mat.opacity = 0.4 + Math.sin(Date.now() * 0.005) * 0.3
      }
    } else if (dataLineRef.current) {
      dataLineRef.current.visible = false
    }

    if (groupRef.current) {
      const hover = node.status !== "idle" ? 0.3 : 0
      const bobble = Math.sin(Date.now() * 0.002 + node.position[0]) * 0.15
      groupRef.current.position.y = node.position[1] + hover + bobble
    }
  })

  const lineGeom = useMemo(() => {
    const geom = new THREE.BufferGeometry()
    const positions = new Float32Array(6)
    geom.setAttribute("position", new THREE.BufferAttribute(positions, 3))
    return geom
  }, [])

  return (
    <>
      <group
        ref={groupRef}
        position={[node.position[0], node.position[1], node.position[2]]}
      >
        <mesh ref={coreRef}>
          <tetrahedronGeometry args={[1.1, 0]} />
          <meshPhongMaterial
            color={node.color}
            emissive={node.color}
            emissiveIntensity={node.status === "idle" ? 0.2 : 0.6}
            transparent
            opacity={node.status === "idle" ? 0.6 : 0.95}
          />
        </mesh>

        <mesh ref={pulseRef} visible={false}>
          <sphereGeometry args={[1.6, 16, 16]} />
          <meshPhongMaterial
            color={node.color}
            emissive={node.color}
            emissiveIntensity={0.3}
            transparent
            opacity={0.15}
            wireframe
          />
        </mesh>

        {node.status !== "idle" && (
          <Html
            center
            distanceFactor={55}
            style={{ pointerEvents: "none", userSelect: "none" }}
          >
            <div className="whitespace-nowrap rounded border border-border/50 bg-card/90 px-2 py-1 font-mono text-[9px] backdrop-blur">
              <span style={{ color: node.color }} className="font-bold">
                {node.agentName}
              </span>
              {node.status === "running" && (
                <span className="ml-1 animate-pulse text-muted-foreground">
                  analyzing…
                </span>
              )}
              {node.status === "completed" && node.summary && (
                <span className="ml-1 text-muted-foreground">
                  {node.summary.slice(0, 50)}
                  {node.summary.length > 50 ? "…" : ""}
                </span>
              )}
            </div>
          </Html>
        )}
      </group>

      <line ref={dataLineRef} geometry={lineGeom} visible={false}>
        <lineDashedMaterial
          color={node.color}
          dashSize={0.6}
          gapSize={0.4}
          transparent
          opacity={0.5}
        />
      </line>
    </>
  )
}

function DataPulse({
  from,
  to,
  color,
  active,
}: {
  from: [number, number, number]
  to: [number, number, number]
  color: string
  active: boolean
}) {
  const ref = useRef<THREE.Mesh>(null)
  const progressRef = useRef(0)

  useFrame((_, delta) => {
    if (!ref.current || !active) {
      if (ref.current) ref.current.visible = false
      return
    }
    ref.current.visible = true
    progressRef.current += delta * 0.8
    if (progressRef.current > 1) progressRef.current = 0

    const pos = interpolateArc(from, to, progressRef.current, 2)
    ref.current.position.set(pos[0], pos[1], pos[2])
    const s = 0.3 + Math.sin(progressRef.current * Math.PI) * 0.2
    ref.current.scale.set(s, s, s)
  })

  return (
    <mesh ref={ref} visible={false}>
      <sphereGeometry args={[0.5, 8, 8]} />
      <meshPhongMaterial
        color={color}
        emissive={color}
        emissiveIntensity={0.8}
        transparent
        opacity={0.9}
      />
    </mesh>
  )
}

function RootAgentMesh({
  position,
}: {
  position: [number, number, number]
}) {
  const ref = useRef<THREE.Mesh>(null)
  const glowRef = useRef<THREE.Mesh>(null)

  useFrame((_, delta) => {
    if (ref.current) {
      ref.current.rotation.y += delta * 2
      ref.current.rotation.x += delta * 0.5
    }
    if (glowRef.current) {
      const s = 1 + Math.sin(Date.now() * 0.003) * 0.15
      glowRef.current.scale.set(s, s, s)
    }
  })

  return (
    <group position={position}>
      <mesh ref={glowRef}>
        <sphereGeometry args={[2.2, 16, 16]} />
        <meshPhongMaterial
          color="#ea580c"
          emissive="#ea580c"
          emissiveIntensity={0.15}
          transparent
          opacity={0.1}
        />
      </mesh>
      <mesh ref={ref}>
        <octahedronGeometry args={[1.4, 0]} />
        <meshPhongMaterial
          color="#ea580c"
          emissive="#ea580c"
          emissiveIntensity={0.6}
        />
      </mesh>
      <Html
        center
        distanceFactor={55}
        position={[0, -2.5, 0]}
        style={{ pointerEvents: "none", userSelect: "none" }}
      >
        <div className="whitespace-nowrap font-mono text-[9px] font-bold text-[#ea580c] opacity-80">
          ROOT AGENT
        </div>
      </Html>
    </group>
  )
}

function TravelingAgent({
  nodes,
  trip,
}: {
  nodes: PoolNetworkNode[]
  trip: AgentTrip | null
}) {
  const meshRef = useRef<THREE.Mesh>(null)
  const trailRef = useRef<THREE.Points>(null)
  const tripRef = useRef(trip)
  tripRef.current = trip

  const trailPositions = useMemo(() => new Float32Array(60 * 3), [])
  const trailIndex = useRef(0)

  useFrame((_, delta) => {
    const current = tripRef.current
    const mesh = meshRef.current
    if (!mesh || !current) return

    const source = nodes[current.sourceIndex]
    const target = nodes[current.targetIndex]
    if (!source || !target) return

    current.progress = Math.min(1, current.progress + delta * current.speed)
    const pos = interpolateArc(source.position, target.position, current.progress, 5)
    mesh.position.set(pos[0], pos[1] + 3, pos[2])
    mesh.rotation.y += delta * 3

    if (trailRef.current && current.progress < 1 && current.speed > 0) {
      const idx = trailIndex.current % 60
      trailPositions[idx * 3] = pos[0]
      trailPositions[idx * 3 + 1] = pos[1] + 3
      trailPositions[idx * 3 + 2] = pos[2]
      trailIndex.current++
      const attr = trailRef.current.geometry.attributes.position as THREE.BufferAttribute
      attr.needsUpdate = true
    }

    if (current.progress >= 1) {
      current.sourceIndex = current.targetIndex
      current.progress = 0
    }
  })

  const startNode = trip ? nodes[trip.sourceIndex] : nodes[0]
  const initial = startNode?.position ?? [0, 3, 0]

  return (
    <>
      <mesh ref={meshRef} position={[initial[0], initial[1] + 3, initial[2]]}>
        <octahedronGeometry args={[1.2, 0]} />
        <meshPhongMaterial
          color="#ea580c"
          emissive="#ea580c"
          emissiveIntensity={0.55}
        />
      </mesh>
      <points ref={trailRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={60}
            array={trailPositions}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial
          color="#ea580c"
          size={0.25}
          transparent
          opacity={0.35}
          sizeAttenuation
        />
      </points>
    </>
  )
}

function GridFloor() {
  return (
    <>
      <gridHelper args={[140, 28, "#1a1a2e", "#1a1a2e"]} position={[0, -12, 0]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -12.1, 0]}>
        <planeGeometry args={[140, 140]} />
        <meshPhongMaterial color="#050510" transparent opacity={0.5} />
      </mesh>
    </>
  )
}

function buildSubAgentNodes(
  subAgents: SubAgentStatus[],
  enabledSubAgentIds: string[],
  rootPos: [number, number, number],
): SubAgentNode[] {
  const ids = enabledSubAgentIds.filter((id) => id !== "root-orchestrator")
  if (ids.length === 0) return []

  const radius = 8
  return ids.map((id, index) => {
    const angle = (index / ids.length) * Math.PI * 2 - Math.PI / 2
    const status = subAgents.find((s) => s.agentId === id)
    const name = status?.agentName ?? id.replace(/-/g, " ")

    return {
      agentId: id,
      agentName: name,
      position: [
        rootPos[0] + Math.cos(angle) * radius,
        rootPos[1] + 4,
        rootPos[2] + Math.sin(angle) * radius,
      ] as [number, number, number],
      color: subAgentColor(id, index),
      status: status?.status ?? "idle",
      summary: status?.summary,
    }
  })
}

function PoolTradingScene({
  nodes,
  routeCommand,
  subAgentStatuses,
  enabledSubAgentIds,
}: {
  nodes: PoolNetworkNode[]
  routeCommand: PoolRouteCommand | null
  subAgentStatuses: SubAgentStatus[]
  enabledSubAgentIds: string[]
}) {
  const [trip, setTrip] = useState<AgentTrip | null>(() =>
    nodes.length > 0
      ? { sourceIndex: 0, targetIndex: 0, progress: 0, speed: 0.45 }
      : null,
  )

  const rootPosition: [number, number, number] = [0, 3, 0]

  const subAgentNodes = useMemo(
    () => buildSubAgentNodes(subAgentStatuses, enabledSubAgentIds, rootPosition),
    [subAgentStatuses, enabledSubAgentIds],
  )

  useEffect(() => {
    if (!routeCommand || nodes.length === 0) return

    const targetIndex = poolNodeIndex(nodes, routeCommand.poolTo)
    const sourceIndex = poolNodeIndex(nodes, routeCommand.poolFrom)
    if (targetIndex < 0 && sourceIndex < 0) return

    const resolvedTarget =
      targetIndex >= 0 ? targetIndex : sourceIndex >= 0 ? sourceIndex : 0
    const resolvedSource =
      sourceIndex >= 0 ? sourceIndex : resolvedTarget

    if (routeCommand.replay === false) {
      setTrip({
        sourceIndex: resolvedTarget,
        targetIndex: resolvedTarget,
        progress: 1,
        speed: 0,
      })
      return
    }

    setTrip({
      sourceIndex: resolvedSource,
      targetIndex: resolvedTarget,
      progress: 0,
      speed: 0.55,
    })
  }, [routeCommand, nodes])

  return (
    <>
      <ambientLight intensity={0.2} />
      <pointLight position={[30, 40, 30]} intensity={1.4} color="#ea580c" />
      <pointLight position={[-30, 20, -30]} intensity={0.5} color="#3b82f6" />
      <pointLight position={[0, 50, 0]} intensity={0.3} color="#ffffff" />
      <pointLight position={[0, -10, 0]} intensity={0.2} color="#22c55e" />

      <ParticleRing radius={35} color="#ea580c" y={-5} />
      <ParticleRing radius={12} color="#3b82f6" y={5} />

      {nodes.map((node) => (
        <PoolNodeMesh key={node.id} node={node} />
      ))}

      {subAgentNodes.length > 0 && (
        <RootAgentMesh position={rootPosition} />
      )}

      {subAgentNodes.map((node) => (
        <SubAgentNodeMesh
          key={node.agentId}
          node={node}
          rootPosition={rootPosition}
        />
      ))}

      {subAgentNodes.map((node) => (
        <DataPulse
          key={`pulse-${node.agentId}`}
          from={node.position}
          to={rootPosition}
          color={node.color}
          active={node.status === "running"}
        />
      ))}

      <TravelingAgent nodes={nodes} trip={trip} />
      <GridFloor />
    </>
  )
}

type PoolTradingCanvasProps = {
  canvasPools: StrategyCanvasPool[]
  routeCommand?: PoolRouteCommand | null
  accountMode?: AccountMode
  subAgentStatuses?: SubAgentStatus[]
  enabledSubAgentIds?: string[]
}

export function PoolTradingCanvas({
  canvasPools,
  routeCommand = null,
  accountMode,
  subAgentStatuses = [],
  enabledSubAgentIds = [],
}: PoolTradingCanvasProps) {
  const nodes = useMemo(
    () => buildPoolNetworkNodes(canvasPools),
    [canvasPools],
  )
  const isDemo = accountMode === "demo"

  if (canvasPools.length === 0) {
    return (
      <div className="flex h-full items-center justify-center font-mono text-xs text-muted-foreground">
        No active pools — assign capital in setup to see pool nodes.
      </div>
    )
  }

  return (
    <div
      className={cn(
        "relative h-full w-full min-w-0 flex-1 bg-background",
        isDemo && "ring-1 ring-inset ring-amber-500/25",
      )}
    >
      {isDemo && (
        <div className="pointer-events-none absolute right-4 top-4 z-10 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-amber-700 backdrop-blur dark:text-amber-400">
          Anvil fork
        </div>
      )}
      <Canvas>
        <PerspectiveCamera makeDefault position={[0, 32, 50]} fov={50} />
        <OrbitControls
          enablePan
          enableZoom
          maxPolarAngle={Math.PI / 2.1}
          minDistance={20}
          maxDistance={100}
        />
        <PoolTradingScene
          nodes={nodes}
          routeCommand={routeCommand}
          subAgentStatuses={subAgentStatuses}
          enabledSubAgentIds={enabledSubAgentIds}
        />
      </Canvas>

      {enabledSubAgentIds.length > 0 && (
        <div className="pointer-events-none absolute left-4 top-4 z-10 space-y-1">
          {enabledSubAgentIds
            .filter((id) => id !== "root-orchestrator")
            .map((id, i) => {
              const status = subAgentStatuses.find((s) => s.agentId === id)
              const color = subAgentColor(id, i)
              const name = status?.agentName ?? id.replace(/-/g, " ")
              return (
                <div
                  key={id}
                  className="flex items-center gap-2 rounded border border-border/40 bg-card/80 px-2 py-1 backdrop-blur"
                >
                  <span
                    className={cn(
                      "h-2 w-2 shrink-0 rounded-full",
                      status?.status === "running" && "animate-pulse",
                    )}
                    style={{ backgroundColor: color }}
                  />
                  <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                    {name}
                  </span>
                  {status?.status === "running" && (
                    <span className="font-mono text-[8px] text-muted-foreground animate-pulse">
                      ●
                    </span>
                  )}
                  {status?.status === "completed" && (
                    <span className="font-mono text-[8px] text-emerald-500">
                      ✓
                    </span>
                  )}
                </div>
              )
            })}
        </div>
      )}

      <div
        className={cn(
          "pointer-events-none absolute bottom-4 left-4 rounded border bg-card/90 px-3 py-2 font-mono text-[10px] backdrop-blur",
          isDemo
            ? "border-amber-500/30 text-amber-800/90 dark:text-amber-300/90"
            : "border-border text-muted-foreground",
        )}
      >
        <span className="mr-2 inline-block h-2 w-2 rounded-sm bg-[#ea580c]" />
        Root agent (executor)
        {enabledSubAgentIds.length > 0 && (
          <>
            <span className="mx-2">·</span>
            <span className="inline-block h-1.5 w-1.5 rotate-45 bg-[#3b82f6]" />
            <span className="ml-1">Sub-agents (read-only data)</span>
            <span className="mx-2">·</span>
            <span className="text-muted-foreground/60">
              Dashed = data flow · Solid arc = swap execution
            </span>
          </>
        )}
      </div>
    </div>
  )
}
