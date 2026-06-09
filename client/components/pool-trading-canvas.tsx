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
  color: string
  orbitIndex: number
  orbitTotal: number
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

const ORBIT_RING_RADIUS = 11.8
const ORBIT_SPEED_BASE = 0.6
const FOLLOW_TRAIL_OFFSET = 3.5

function SubAgentNodeMesh({
  node,
  agentMeshRef,
  tripRef,
  poolNodes,
}: {
  node: SubAgentNode
  agentMeshRef: React.RefObject<THREE.Mesh | null>
  tripRef: React.RefObject<AgentTrip | null>
  poolNodes: PoolNetworkNode[]
}) {
  const groupRef = useRef<THREE.Group>(null)
  const coreRef = useRef<THREE.Mesh>(null)
  const pulseRef = useRef<THREE.Mesh>(null)
  const angleRef = useRef(
    (node.orbitIndex / Math.max(node.orbitTotal, 1)) * Math.PI * 2,
  )
  const prevAgentPos = useRef(new THREE.Vector3())
  const targetVec = useRef(new THREE.Vector3())

  useFrame((_, delta) => {
    if (!groupRef.current || !agentMeshRef.current) return

    const trip = tripRef.current
    const agentPos = agentMeshRef.current.position

    const agentSpeed = agentPos.distanceTo(prevAgentPos.current) / Math.max(delta, 0.001)
    prevAgentPos.current.copy(agentPos)

    const isAgentMoving = agentSpeed > 0.5

    if (isAgentMoving && trip) {
      const source = poolNodes[trip.sourceIndex]
      const target = poolNodes[trip.targetIndex]
      if (source && target) {
        const trailDelay = FOLLOW_TRAIL_OFFSET * (node.orbitIndex + 1)
        const trailProgress = Math.max(0, trip.progress - trailDelay * 0.04)

        const trailPos = interpolateArc(
          source.position,
          target.position,
          trailProgress,
          5,
        )

        const spreadAngle =
          ((node.orbitIndex + 1) / (node.orbitTotal + 1)) * Math.PI - Math.PI / 2
        const spreadX = Math.cos(spreadAngle) * 2.5
        const spreadY = Math.sin(spreadAngle) * 1.5

        targetVec.current.set(
          trailPos[0] + spreadX,
          trailPos[1] + 3 + spreadY,
          trailPos[2],
        )
        groupRef.current.position.lerp(targetVec.current, Math.min(1, delta * 5))
      }
    } else {
      const restingIndex = trip ? trip.targetIndex : 0
      const restPool = poolNodes[restingIndex] ?? poolNodes[0]
      if (restPool) {
        const orbitSpeed =
          ORBIT_SPEED_BASE +
          node.orbitIndex * 0.15 +
          (node.status === "running" ? 0.4 : 0)

        angleRef.current += delta * orbitSpeed

        const cx = restPool.position[0]
        const cy = restPool.position[1]
        const cz = restPool.position[2]

        targetVec.current.set(
          cx + Math.cos(angleRef.current) * ORBIT_RING_RADIUS,
          cy + 0.3,
          cz + Math.sin(angleRef.current) * ORBIT_RING_RADIUS,
        )
        groupRef.current.position.lerp(targetVec.current, Math.min(1, delta * 2.5))
      }
    }

    if (coreRef.current) {
      coreRef.current.rotation.x += delta * 1.5
      coreRef.current.rotation.y += delta * 1.0
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
  })

  return (
    <group ref={groupRef} position={[0, 0, 0]}>
      <mesh ref={coreRef}>
        <tetrahedronGeometry args={[0.9, 0]} />
        <meshPhongMaterial
          color={node.color}
          emissive={node.color}
          emissiveIntensity={node.status === "idle" ? 0.25 : 0.7}
          transparent
          opacity={node.status === "idle" ? 0.7 : 0.95}
        />
      </mesh>

      <mesh ref={pulseRef} visible={false}>
        <sphereGeometry args={[1.4, 12, 12]} />
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
                {node.summary.slice(0, 40)}
                {(node.summary.length ?? 0) > 40 ? "…" : ""}
              </span>
            )}
          </div>
        </Html>
      )}
    </group>
  )
}


function TravelingAgent({
  nodes,
  trip,
  meshRef,
  tripRef,
}: {
  nodes: PoolNetworkNode[]
  trip: AgentTrip | null
  meshRef: React.RefObject<THREE.Mesh | null>
  tripRef: React.MutableRefObject<AgentTrip | null>
}) {
  const trailRef = useRef<THREE.Points>(null)
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
): SubAgentNode[] {
  const ids = enabledSubAgentIds.filter((id) => id !== "root-orchestrator")
  if (ids.length === 0) return []

  return ids.map((id, index) => {
    const status = subAgents.find((s) => s.agentId === id)
    const name = status?.agentName ?? id.replace(/-/g, " ")

    return {
      agentId: id,
      agentName: name,
      color: subAgentColor(id, index),
      orbitIndex: index,
      orbitTotal: ids.length,
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

  const agentMeshRef = useRef<THREE.Mesh>(null)
  const tripRef = useRef<AgentTrip | null>(trip)
  tripRef.current = trip

  const subAgentNodes = useMemo(
    () => buildSubAgentNodes(subAgentStatuses, enabledSubAgentIds),
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

      {subAgentNodes.map((node) => (
        <SubAgentNodeMesh
          key={node.agentId}
          node={node}
          agentMeshRef={agentMeshRef}
          tripRef={tripRef}
          poolNodes={nodes}
        />
      ))}

      <TravelingAgent nodes={nodes} trip={trip} meshRef={agentMeshRef} tripRef={tripRef} />
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
        Agent (executor · inside pool)
        {enabledSubAgentIds.length > 0 && (
          <>
            <span className="mx-2">·</span>
            <span className="inline-block h-1.5 w-1.5 rotate-45 bg-[#3b82f6]" />
            <span className="ml-1">Sub-agents orbit the pool ring</span>
          </>
        )}
      </div>
    </div>
  )
}
