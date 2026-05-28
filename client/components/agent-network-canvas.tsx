"use client"

import { useEffect, useRef, useState } from "react"
import { Canvas, useFrame } from "@react-three/fiber"
import { PerspectiveCamera, OrbitControls } from "@react-three/drei"
import * as THREE from "three"
import {
  createMarketplaceTradeEvent,
  type TradeEvent,
} from "@/components/agent-trade-feed"
import {
  DEFAULT_NETWORK_LAYOUT,
  type NetworkLayoutConfig,
} from "@/lib/network-layout-config"
import {
  buildNetworkNodes,
  MARKETPLACE_NODE_INDEX,
  type NetworkNode,
} from "@/lib/network-nodes"

interface Agent {
  id: string
  position: [number, number, number]
  velocity: [number, number, number]
  tvl: number
  reputation: number
  isUserAgent: boolean
  userAgentIndex?: number
  signals: { selling: number; buying: number }
  activity: "selling" | "buying" | "managing" | "idle"
  protocolIndex: number
  orbitPhase: number
  isBuyingSignals: boolean
  sourceNodeIndex: number
  targetNodeIndex: number
  routeProgress: number
  routeSpeed: number
  routeHeight: number
}

const generateAgents = (nodes: NetworkNode[]): Agent[] => {
  const agents: Agent[] = []
  const protocolCount = nodes.filter((n) => n.kind === "protocol").length
  const count = 60

  agents.push({
    id: "user-agent-0",
    position: [0, 5, 0],
    velocity: [0, 0, 0],
    tvl: 500000,
    reputation: 847,
    isUserAgent: true,
    userAgentIndex: 0,
    signals: { selling: 247, buying: 128 },
    activity: "managing",
    protocolIndex: 0,
    orbitPhase: 0,
    isBuyingSignals: false,
    sourceNodeIndex: 0,
    targetNodeIndex: 0,
    routeProgress: 0,
    routeSpeed: 0,
    routeHeight: 0,
  })

  const pickTarget = (from: number) => {
    let next = from
    while (next === from) {
      next = Math.floor(Math.random() * nodes.length)
    }
    return next
  }

  for (let i = 0; i < count - 1; i++) {
    const sourceNodeIndex = i % protocolCount
    const node = nodes[sourceNodeIndex]
    const targetNodeIndex = pickTarget(sourceNodeIndex)
    const orbitPhase = Math.random() * Math.PI * 2

    agents.push({
      id: `agent-${i}`,
      position: [
        node.position[0] + Math.cos(orbitPhase) * (node.radius + 5),
        node.position[1],
        node.position[2] + Math.sin(orbitPhase) * (node.radius + 5),
      ],
      velocity: [0, 0, 0],
      tvl: Math.random() * 1000000 + 10000,
      reputation: Math.random() * 1000,
      isUserAgent: false,
      signals: {
        selling: Math.floor(Math.random() * 300),
        buying: Math.floor(Math.random() * 200),
      },
      activity: (["selling", "buying", "managing", "idle"] as const)[
        Math.floor(Math.random() * 4)
      ],
      protocolIndex: sourceNodeIndex,
      orbitPhase,
      isBuyingSignals: Math.random() > 0.5,
      sourceNodeIndex,
      targetNodeIndex,
      routeProgress: Math.random(),
      routeSpeed: 0.002 + Math.random() * 0.004,
      routeHeight: 2 + Math.random() * 8,
    })
  }

  return agents
}

const NetworkNodeObject: React.FC<{ node: NetworkNode }> = ({ node }) => {
  const meshRef = useRef<THREE.Mesh>(null)

  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.rotation.x += 0.0005
      meshRef.current.rotation.y += 0.0008
    }
  })

  return (
    <group position={node.position} scale={node.scale}>
      <mesh ref={meshRef}>
        <icosahedronGeometry args={[node.radius, 4]} />
        <meshPhongMaterial
          color={node.color}
          emissive={node.color}
          emissiveIntensity={0.2}
          wireframe
          transparent
          opacity={0.6}
        />
      </mesh>
      <mesh rotation={[Math.PI / 4, 0, 0]}>
        <torusGeometry args={[node.radius + 2, 0.3, 8, 32]} />
        <meshPhongMaterial
          color={node.color}
          emissive={node.color}
          emissiveIntensity={0.3}
        />
      </mesh>
      <mesh rotation={[0, 0, Math.PI / 3]}>
        <torusGeometry args={[node.radius * 0.7, 0.2, 8, 32]} />
        <meshPhongMaterial
          color={node.color}
          emissive={node.color}
          emissiveIntensity={0.4}
        />
      </mesh>
    </group>
  )
}

const AgentParticle: React.FC<{
  agent: Agent
  hoveredAgent: string | null
  nodes: NetworkNode[]
  onArriveAtNode: (agentId: string, nodeIndex: number) => void
}> = ({ agent, hoveredAgent, nodes, onArriveAtNode }) => {
  const meshRef = useRef<THREE.Mesh>(null)
  const isHovered = hoveredAgent === agent.id
  const sizeScale = Math.pow(agent.tvl / 100000, 0.3) * 0.5
  const baseSize = agent.isUserAgent ? sizeScale * 2 : sizeScale

  useFrame(({ clock }) => {
    if (!meshRef.current) return

    if (agent.isUserAgent) {
      const pulse = 1 + Math.sin(clock.getElapsedTime() * 3) * 0.2
      meshRef.current.scale.set(baseSize * pulse, baseSize * pulse, baseSize * pulse)
      return
    }

    const prevProgress = agent.routeProgress
    agent.routeProgress += agent.routeSpeed

    if (agent.routeProgress >= 1) {
      const arrivedAt = agent.targetNodeIndex
      agent.routeProgress = 0
      agent.sourceNodeIndex = arrivedAt
      onArriveAtNode(agent.id, arrivedAt)

      let nextTarget = agent.sourceNodeIndex
      while (nextTarget === agent.sourceNodeIndex) {
        nextTarget = Math.floor(Math.random() * nodes.length)
      }
      agent.targetNodeIndex = nextTarget
      agent.routeSpeed = 0.002 + Math.random() * 0.004
      const involvesMarketplace =
        arrivedAt === MARKETPLACE_NODE_INDEX ||
        nextTarget === MARKETPLACE_NODE_INDEX
      agent.routeHeight = involvesMarketplace
        ? 4 + Math.random() * 10
        : 1.5 + Math.random() * 5
    }

    const source = nodes[agent.sourceNodeIndex]
    const target = nodes[agent.targetNodeIndex]
    if (!source || !target) return

    const t = Math.min(agent.routeProgress, 1)
    const sx = source.position[0]
    const sy = source.position[1]
    const sz = source.position[2]
    const tx = target.position[0]
    const ty = target.position[1]
    const tz = target.position[2]
    const arc = Math.sin(t * Math.PI) * agent.routeHeight

    meshRef.current.position.x = sx + (tx - sx) * t
    meshRef.current.position.z = sz + (tz - sz) * t
    meshRef.current.position.y = sy + (ty - sy) * t + arc

    if (isHovered) {
      meshRef.current.scale.lerp(
        new THREE.Vector3(baseSize * 1.5, baseSize * 1.5, baseSize * 1.5),
        0.1
      )
    } else {
      meshRef.current.scale.lerp(
        new THREE.Vector3(baseSize, baseSize, baseSize),
        0.1
      )
    }

  })

  return (
    <mesh ref={meshRef} position={agent.position}>
      <octahedronGeometry args={[1, 0]} />
      <meshPhongMaterial
        color={agent.isUserAgent ? "#ea580c" : "#ffffff"}
        emissive={isHovered ? "#ea580c" : agent.isUserAgent ? "#ea580c" : "#444444"}
        wireframe={false}
      />
    </mesh>
  )
}

const AgentRouteTrails: React.FC<{
  agents: Agent[]
  nodes: NetworkNode[]
  hoveredAgent: string | null
}> = ({ agents, nodes, hoveredAgent }) => {
  const linesRef = useRef<THREE.LineSegments>(null)

  useFrame(() => {
    if (!linesRef.current) return

    const positions: number[] = []
    const colors: number[] = []

    agents.forEach((agent) => {
      if (agent.isUserAgent) return
      const source = nodes[agent.sourceNodeIndex]
      const target = nodes[agent.targetNodeIndex]
      if (!source || !target) return

      const t = Math.min(agent.routeProgress, 1)
      const sx = source.position[0]
      const sy = source.position[1]
      const sz = source.position[2]
      const tx = target.position[0]
      const ty = target.position[1]
      const tz = target.position[2]
      const arc = Math.sin(t * Math.PI) * agent.routeHeight
      const x = sx + (tx - sx) * t
      const z = sz + (tz - sz) * t
      const y = sy + (ty - sy) * t + arc

      positions.push(sx, sy, sz, x, y, z)

      const isActive = hoveredAgent === agent.id
      const color: [number, number, number] = isActive
        ? [1, 0.353, 0.047]
        : [0.35, 0.35, 0.35]
      colors.push(...color, ...color)
    })

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(positions), 3)
    )
    geometry.setAttribute(
      "color",
      new THREE.BufferAttribute(new Float32Array(colors), 3)
    )

    linesRef.current.geometry.dispose()
    linesRef.current.geometry = geometry
  })

  return (
    <lineSegments ref={linesRef}>
      <lineBasicMaterial vertexColors linewidth={1} />
    </lineSegments>
  )
}

const AgentNetworkScene: React.FC<{
  agents: Agent[]
  nodes: NetworkNode[]
  hoveredAgent: string | null
  onArriveAtNode: (agentId: string, nodeIndex: number) => void
}> = ({ agents, nodes, hoveredAgent, onArriveAtNode }) => (
  <>
    <PerspectiveCamera makeDefault position={[120, 70, 120]} fov={75} />
    <OrbitControls
      makeDefault
      enableDamping
      dampingFactor={0.05}
      enableZoom
      enablePan
    />
    <ambientLight intensity={0.5} color={0xffffff} />
    <pointLight position={[100, 100, 100]} intensity={1} color={0xffffff} />
    <pointLight position={[-100, 50, -100]} intensity={0.6} color={0xff007a} />
    <pointLight position={[0, 0, 0]} intensity={0.4} color={0xea580c} />

    {nodes.map((node) => (
      <NetworkNodeObject key={node.id} node={node} />
    ))}

    {agents.map((agent) => (
      <AgentParticle
        key={agent.id}
        agent={agent}
        hoveredAgent={hoveredAgent}
        nodes={nodes}
        onArriveAtNode={onArriveAtNode}
      />
    ))}

    <AgentRouteTrails agents={agents} nodes={nodes} hoveredAgent={hoveredAgent} />
    <gridHelper args={[200, 20]} position={[0, -40, 0]} />
  </>
)

export const AgentNetworkCanvas: React.FC<{
  viewMode: "activity" | "reputation" | "tvl"
  protocolAmounts?: Record<string, number>
  onTradeEvent?: (event: TradeEvent) => void
}> = ({ viewMode, protocolAmounts = {}, onTradeEvent }) => {
  const layout: NetworkLayoutConfig = DEFAULT_NETWORK_LAYOUT
  const [nodes, setNodes] = useState<NetworkNode[]>(() =>
    buildNetworkNodes(layout)
  )
  const [agents, setAgents] = useState<Agent[]>(() =>
    generateAgents(buildNetworkNodes(layout))
  )
  const [hoveredAgent, setHoveredAgent] = useState<string | null>(null)

  useEffect(() => {
    const nextNodes = buildNetworkNodes(layout)
    setNodes(nextNodes)
    setAgents(generateAgents(nextNodes))
  }, [protocolAmounts])

  const handleArriveAtNode = (agentId: string, nodeIndex: number) => {
    if (nodeIndex === MARKETPLACE_NODE_INDEX && onTradeEvent) {
      onTradeEvent(createMarketplaceTradeEvent(agentId))
    }
  }

  return (
    <div className="relative h-full w-full min-w-0 flex-1 bg-background">
      <Canvas>
        <AgentNetworkScene
          agents={agents}
          nodes={nodes}
          hoveredAgent={hoveredAgent}
          onArriveAtNode={handleArriveAtNode}
        />
      </Canvas>

      {hoveredAgent && (
        <div className="absolute bottom-6 left-1/2 z-10 max-w-xs -translate-x-1/2 rounded border border-[#ea580c] bg-black/90 p-4 font-mono text-xs text-white">
          <p className="font-bold text-[#ea580c]">
            {hoveredAgent === "user-agent-0" ? "YOUR AGENT" : hoveredAgent.toUpperCase()}
          </p>
          {agents
            .filter((a) => a.id === hoveredAgent)
            .map((agent) => (
              <div key={agent.id} className="mt-2 space-y-1">
                <p>TVL: ${agent.tvl.toLocaleString()}</p>
                <p>Reputation: {agent.reputation.toFixed(0)}/1000</p>
                <p>Activity: {agent.activity.toUpperCase()}</p>
              </div>
            ))}
        </div>
      )}
    </div>
  )
}
