"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Canvas, useFrame } from "@react-three/fiber"
import { OrbitControls, PerspectiveCamera } from "@react-three/drei"
import * as THREE from "three"
import type { AccountMode } from "@/lib/api/auth"
import type { PoolRouteCommand } from "@/lib/trading-feed-helpers"
import { cn } from "@/lib/utils"
import {
  buildPoolNetworkNodes,
  poolNodeIndex,
  type PoolNetworkNode,
} from "@/lib/pool-network-layout"

type AgentTrip = {
  sourceIndex: number
  targetIndex: number
  progress: number
  speed: number
}

function interpolatePoints(
  from: [number, number, number],
  to: [number, number, number],
  t: number,
): [number, number, number] {
  const arc = Math.sin(t * Math.PI) * 4
  return [
    from[0] + (to[0] - from[0]) * t,
    from[1] + (to[1] - from[1]) * t + arc,
    from[2] + (to[2] - from[2]) * t,
  ]
}

function PoolNodeMesh({ node }: { node: PoolNetworkNode }) {
  const meshRef = useRef<THREE.Mesh>(null)

  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.rotation.y += 0.004
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
          opacity={0.65}
        />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[node.radius + 1.5, 0.2, 8, 32]} />
        <meshPhongMaterial
          color={node.color}
          emissive={node.color}
          emissiveIntensity={0.35}
        />
      </mesh>
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
  const tripRef = useRef(trip)
  tripRef.current = trip

  useFrame((_, delta) => {
    const current = tripRef.current
    const mesh = meshRef.current
    if (!mesh || !current) {
      return
    }

    const source = nodes[current.sourceIndex]
    const target = nodes[current.targetIndex]
    if (!source || !target) {
      return
    }

    current.progress = Math.min(1, current.progress + delta * current.speed)
    const pos = interpolatePoints(source.position, target.position, current.progress)
    mesh.position.set(pos[0], pos[1] + 3, pos[2])
    mesh.rotation.y += delta * 2

    if (current.progress >= 1) {
      current.sourceIndex = current.targetIndex
      current.progress = 0
    }
  })

  const startNode = trip ? nodes[trip.sourceIndex] : nodes[0]
  const initial = startNode?.position ?? [0, 3, 0]

  return (
    <mesh ref={meshRef} position={[initial[0], initial[1] + 3, initial[2]]}>
      <octahedronGeometry args={[1.2, 0]} />
      <meshPhongMaterial
        color="#ea580c"
        emissive="#ea580c"
        emissiveIntensity={0.55}
      />
    </mesh>
  )
}

function PoolTradingScene({
  nodes,
  routeCommand,
}: {
  nodes: PoolNetworkNode[]
  routeCommand: PoolRouteCommand | null
}) {
  const [trip, setTrip] = useState<AgentTrip | null>(() =>
    nodes.length > 0
      ? { sourceIndex: 0, targetIndex: 0, progress: 0, speed: 0.45 }
      : null,
  )

  useEffect(() => {
    if (!routeCommand || nodes.length === 0) {
      return
    }

    const targetIndex = poolNodeIndex(nodes, routeCommand.poolTo)
    const sourceIndex = poolNodeIndex(nodes, routeCommand.poolFrom)

    if (targetIndex < 0 && sourceIndex < 0) {
      return
    }

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
      <ambientLight intensity={0.35} />
      <pointLight position={[20, 30, 20]} intensity={1.1} color="#ea580c" />
      <pointLight position={[-20, 10, -20]} intensity={0.6} color="#ffffff" />

      {nodes.map((node) => (
        <PoolNodeMesh key={node.id} node={node} />
      ))}

      <TravelingAgent nodes={nodes} trip={trip} />
      <gridHelper args={[120, 24]} position={[0, -12, 0]} />
    </>
  )
}

type PoolTradingCanvasProps = {
  poolIds: string[]
  routeCommand?: PoolRouteCommand | null
  accountMode?: AccountMode
}

export function PoolTradingCanvas({
  poolIds,
  routeCommand = null,
  accountMode,
}: PoolTradingCanvasProps) {
  const nodes = useMemo(() => buildPoolNetworkNodes(poolIds), [poolIds])
  const isDemo = accountMode === "demo"

  if (poolIds.length === 0) {
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
        <PerspectiveCamera makeDefault position={[0, 28, 42]} fov={50} />
        <OrbitControls
          enablePan
          enableZoom
          maxPolarAngle={Math.PI / 2.1}
          minDistance={20}
          maxDistance={90}
        />
        <PoolTradingScene nodes={nodes} routeCommand={routeCommand} />
      </Canvas>
      <div
        className={cn(
          "pointer-events-none absolute bottom-4 left-4 rounded border bg-card/90 px-3 py-2 font-mono text-[10px] backdrop-blur",
          isDemo
            ? "border-amber-500/30 text-amber-800/90 dark:text-amber-300/90"
            : "border-border text-muted-foreground",
        )}
      >
        {isDemo
          ? "Orange agent = demo wallet · nodes = QuickSwap pools on the Anvil fork"
          : "Orange agent = your agent wallet · nodes = QuickSwap pools on Somnia mainnet"}
      </div>
    </div>
  )
}
