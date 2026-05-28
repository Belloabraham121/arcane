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

const ROOT_AGENT_COUNT = 4
const SUB_AGENTS_PER_ROOT = 4
const ROOT_BASE_SCALE = 0.72
const SUB_BASE_SCALE = 0.78

type AgentRole = "user" | "root" | "sub"
type SubTripPhase = "idle" | "to_marketplace" | "at_marketplace" | "to_home"
type RootTripPhase = "at_protocol" | "to_protocol"

interface Agent {
  id: string
  role: AgentRole
  /** Current protocol (color); root travels across all protocols */
  homeProtocolIndex: number
  rootId?: string
  position: [number, number, number]
  tvl: number
  reputation: number
  signals: { selling: number; buying: number }
  activity: "selling" | "buying" | "managing" | "idle"
  orbitPhase: number
  sourceNodeIndex: number
  targetNodeIndex: number
  routeProgress: number
  routeSpeed: number
  routeHeight: number
  tripPhase: SubTripPhase
  rootTripPhase: RootTripPhase
  pauseRemaining: number
  signalGlow: number
  routeOrigin: [number, number, number]
}

function protocolColor(nodes: NetworkNode[], protocolIndex: number) {
  return nodes[protocolIndex]?.color ?? "#ffffff"
}

function protocolCount(nodes: NetworkNode[]) {
  return nodes.filter((n) => n.kind === "protocol").length
}

function orbitAroundPoint(
  center: [number, number, number],
  orbitPhase: number,
  laneOffset: number
): [number, number, number] {
  const r = 3 + laneOffset
  return [
    center[0] + Math.cos(orbitPhase) * r,
    center[1] + Math.sin(orbitPhase * 0.5) * 0.6,
    center[2] + Math.sin(orbitPhase) * r,
  ]
}

function nodeOrbitPosition(
  node: NetworkNode,
  orbitPhase: number,
  laneOffset: number
): [number, number, number] {
  const r = node.radius + 4 + laneOffset
  return [
    node.position[0] + Math.cos(orbitPhase) * r,
    node.position[1] + Math.sin(orbitPhase * 0.5) * 0.8,
    node.position[2] + Math.sin(orbitPhase) * r,
  ]
}

function interpolateRoute(
  source: NetworkNode,
  target: NetworkNode,
  t: number,
  arcHeight: number
): [number, number, number] {
  return interpolatePoints(
    [source.position[0], source.position[1], source.position[2]],
    [target.position[0], target.position[1], target.position[2]],
    t,
    arcHeight
  )
}

function interpolatePoints(
  from: [number, number, number],
  to: [number, number, number],
  t: number,
  arcHeight: number
): [number, number, number] {
  const arc = Math.sin(t * Math.PI) * arcHeight
  return [
    from[0] + (to[0] - from[0]) * t,
    from[1] + (to[1] - from[1]) * t + arc,
    from[2] + (to[2] - from[2]) * t,
  ]
}

function pickNextProtocol(current: number, total: number) {
  let next = current
  while (next === current) {
    next = Math.floor(Math.random() * total)
  }
  return next
}

function getRootAgent(agents: Agent[], rootId?: string) {
  return agents.find((a) => a.id === rootId && a.role === "root")
}

const generateAgents = (nodes: NetworkNode[]): Agent[] => {
  const agents: Agent[] = []
  const count = protocolCount(nodes)

  agents.push({
    id: "user-agent-0",
    role: "user",
    homeProtocolIndex: 0,
    position: [0, 6, 0],
    tvl: 500000,
    reputation: 847,
    signals: { selling: 247, buying: 128 },
    activity: "managing",
    orbitPhase: 0,
    sourceNodeIndex: 0,
    targetNodeIndex: 0,
    routeProgress: 0,
    routeSpeed: 0,
    routeHeight: 0,
    tripPhase: "idle",
    rootTripPhase: "at_protocol",
    pauseRemaining: 0,
    signalGlow: 0,
    routeOrigin: [0, 6, 0],
  })

  for (let r = 0; r < ROOT_AGENT_COUNT; r++) {
    const rootId = `root-${r}`
    const startProtocol = r % count
    const node = nodes[startProtocol]
    const orbitPhase = Math.random() * Math.PI * 2
    const startPos = nodeOrbitPosition(node, orbitPhase, 0)

    agents.push({
      id: rootId,
      role: "root",
      homeProtocolIndex: startProtocol,
      position: startPos,
      tvl: 800000 + Math.random() * 400000,
      reputation: 700 + Math.random() * 200,
      signals: {
        selling: Math.floor(Math.random() * 200),
        buying: Math.floor(Math.random() * 150),
      },
      activity: "managing",
      orbitPhase,
      sourceNodeIndex: startProtocol,
      targetNodeIndex: startProtocol,
      routeProgress: 0,
      routeSpeed: 0.0014 + Math.random() * 0.0008,
      routeHeight: 3 + Math.random() * 4,
      tripPhase: "idle",
      rootTripPhase: "at_protocol",
      pauseRemaining: 2 + r * 0.7,
      signalGlow: 0,
      routeOrigin: startPos,
    })

    for (let s = 0; s < SUB_AGENTS_PER_ROOT; s++) {
      const subPhase =
        (orbitPhase + (s / SUB_AGENTS_PER_ROOT) * Math.PI * 2) % (Math.PI * 2)
      const subPos = orbitAroundPoint(startPos, subPhase, 1 + s * 0.4)

      agents.push({
        id: `sub-${r}-${s}`,
        role: "sub",
        rootId,
        homeProtocolIndex: startProtocol,
        position: subPos,
        tvl: 50000 + Math.random() * 80000,
        reputation: Math.random() * 500,
        signals: { selling: 0, buying: 0 },
        activity: "buying",
        orbitPhase: subPhase,
        sourceNodeIndex: startProtocol,
        targetNodeIndex: MARKETPLACE_NODE_INDEX,
        routeProgress: 0,
        routeSpeed: 0.0016 + Math.random() * 0.001,
        routeHeight: 8 + Math.random() * 6,
        tripPhase: "idle",
        rootTripPhase: "at_protocol",
        pauseRemaining: 0.8 + s * 1.1 + r * 0.3,
        signalGlow: 0,
        routeOrigin: subPos,
      })
    }
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
    </group>
  )
}

const UserAgentMesh: React.FC<{ isHovered: boolean }> = ({ isHovered }) => {
  const meshRef = useRef<THREE.Mesh>(null)
  const ringRef = useRef<THREE.Mesh>(null)

  useFrame(({ clock }) => {
    if (!meshRef.current) return
    const pulse = 1 + Math.sin(clock.getElapsedTime() * 3) * 0.15
    const scale = 1.05 * pulse
    meshRef.current.scale.set(scale, scale, scale)
    meshRef.current.rotation.y += 0.01
    if (ringRef.current) ringRef.current.rotation.z += 0.008
  })

  return (
    <group position={[0, 6, 0]}>
      <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[2.2, 0.08, 8, 32]} />
        <meshPhongMaterial color="#ea580c" emissive="#ea580c" emissiveIntensity={0.5} />
      </mesh>
      <mesh ref={meshRef}>
        <octahedronGeometry args={[1, 0]} />
        <meshPhongMaterial
          color="#ea580c"
          emissive={isHovered ? "#ff8c42" : "#ea580c"}
          emissiveIntensity={0.45}
        />
      </mesh>
    </group>
  )
}

const RootAgentMesh: React.FC<{
  agent: Agent
  nodes: NetworkNode[]
  isHovered: boolean
}> = ({ agent, nodes, isHovered }) => {
  const meshRef = useRef<THREE.Mesh>(null)
  const ringRef = useRef<THREE.Mesh>(null)
  const totalProtocols = protocolCount(nodes)

  useFrame((_, delta) => {
    const mesh = meshRef.current
    if (!mesh || totalProtocols === 0) return

    const color = protocolColor(nodes, agent.homeProtocolIndex)

    if (agent.rootTripPhase === "at_protocol") {
      agent.pauseRemaining -= delta
      const node = nodes[agent.homeProtocolIndex]
      if (!node) return

      agent.orbitPhase += delta * 0.4
      const pos = nodeOrbitPosition(node, agent.orbitPhase, 0)
      mesh.position.set(pos[0], pos[1], pos[2])
      agent.position = pos

      if (agent.pauseRemaining <= 0) {
        const next = pickNextProtocol(agent.homeProtocolIndex, totalProtocols)
        agent.sourceNodeIndex = agent.homeProtocolIndex
        agent.targetNodeIndex = next
        agent.routeProgress = 0
        agent.routeSpeed = 0.0012 + Math.random() * 0.0008
        agent.routeHeight = 3 + Math.random() * 5
        agent.rootTripPhase = "to_protocol"
      }
    } else {
      agent.routeProgress += agent.routeSpeed
      const source = nodes[agent.sourceNodeIndex]
      const target = nodes[agent.targetNodeIndex]
      if (!source || !target) return

      const t = Math.min(agent.routeProgress, 1)
      const pos = interpolateRoute(source, target, t, agent.routeHeight)
      mesh.position.set(pos[0], pos[1], pos[2])
      agent.position = pos

      if (agent.routeProgress >= 1) {
        agent.homeProtocolIndex = agent.targetNodeIndex
        agent.rootTripPhase = "at_protocol"
        agent.pauseRemaining = 2.5 + Math.random() * 2
        agent.routeProgress = 0
      }
    }

    agent.signalGlow = Math.max(0, agent.signalGlow - delta)
    const glowPulse = 1 + agent.signalGlow * 0.35
    const base = ROOT_BASE_SCALE * glowPulse * (isHovered ? 1.15 : 1)
    mesh.scale.set(base, base, base)
    mesh.rotation.y += 0.006

    if (ringRef.current) {
      ringRef.current.position.copy(mesh.position)
      ringRef.current.rotation.x += 0.004
      const ringMat = ringRef.current.material as THREE.MeshPhongMaterial
      ringMat.color.set(color)
      ringMat.emissive.set(color)
    }

    const bodyMat = mesh.material as THREE.MeshPhongMaterial
    bodyMat.color.set(color)
    bodyMat.emissive.set(color)
  })

  const initialColor = protocolColor(nodes, agent.homeProtocolIndex)

  return (
    <>
      <mesh ref={ringRef}>
        <torusGeometry args={[1.1, 0.05, 8, 24]} />
        <meshPhongMaterial
          color={initialColor}
          emissive={initialColor}
          emissiveIntensity={0.35}
        />
      </mesh>
      <mesh ref={meshRef}>
        <dodecahedronGeometry args={[0.55, 0]} />
        <meshPhongMaterial
          color={initialColor}
          emissive={initialColor}
          emissiveIntensity={isHovered ? 0.5 : 0.28}
        />
      </mesh>
    </>
  )
}

const SubAgentMesh: React.FC<{
  agent: Agent
  agents: Agent[]
  nodes: NetworkNode[]
  isHovered: boolean
  onArriveAtNode: (agentId: string, nodeIndex: number) => void
  onReturnHome: (subId: string, rootId: string) => void
}> = ({ agent, agents, nodes, isHovered, onArriveAtNode, onReturnHome }) => {
  const meshRef = useRef<THREE.Mesh>(null)
  const marketNode = nodes[MARKETPLACE_NODE_INDEX]
  const marketPos: [number, number, number] = marketNode
    ? [marketNode.position[0], marketNode.position[1], marketNode.position[2]]
    : [0, 34, 0]

  useFrame((_, delta) => {
    const mesh = meshRef.current
    const root = getRootAgent(agents, agent.rootId)
    if (!mesh || !root || !marketNode) return

    const rootPos = root.position
    agent.homeProtocolIndex = root.homeProtocolIndex
    const rootColor = protocolColor(nodes, root.homeProtocolIndex)
    const mat = mesh.material as THREE.MeshPhongMaterial
    if (isHovered) {
      mat.color.set("#ea580c")
      mat.emissive.set("#ea580c")
      mat.emissiveIntensity = 0.55
    } else {
      mat.color.set(rootColor)
      mat.emissive.set(rootColor)
      mat.emissiveIntensity = 0.38
    }

    if (agent.tripPhase === "idle") {
      agent.pauseRemaining -= delta
      if (agent.pauseRemaining <= 0) {
        agent.tripPhase = "to_marketplace"
        agent.routeProgress = 0
        agent.routeSpeed = 0.0016 + Math.random() * 0.001
        agent.routeHeight = 8 + Math.random() * 6
        agent.routeOrigin = [...rootPos]
      }
      agent.orbitPhase += delta * 0.6
      const pos = orbitAroundPoint(rootPos, agent.orbitPhase, 1.2)
      mesh.position.set(pos[0], pos[1], pos[2])
      agent.position = pos
    } else if (agent.tripPhase === "at_marketplace") {
      agent.pauseRemaining -= delta
      mesh.position.set(marketPos[0], marketPos[1], marketPos[2])
      agent.position = [...marketPos]

      if (agent.pauseRemaining <= 0) {
        agent.tripPhase = "to_home"
        agent.routeProgress = 0
        agent.routeSpeed = 0.0016 + Math.random() * 0.001
        agent.routeHeight = 8 + Math.random() * 6
        agent.routeOrigin = [...marketPos]
      }
    } else {
      agent.routeProgress += agent.routeSpeed

      if (agent.tripPhase === "to_marketplace") {
        const t = Math.min(agent.routeProgress, 1)
        const pos = interpolatePoints(agent.routeOrigin, marketPos, t, agent.routeHeight)
        mesh.position.set(pos[0], pos[1], pos[2])
        agent.position = pos

        if (agent.routeProgress >= 1) {
          agent.tripPhase = "at_marketplace"
          agent.pauseRemaining = 0.45 + Math.random() * 0.35
          agent.routeProgress = 0
          onArriveAtNode(agent.id, MARKETPLACE_NODE_INDEX)
        }
      } else if (agent.tripPhase === "to_home") {
        const t = Math.min(agent.routeProgress, 1)
        const pos = interpolatePoints(agent.routeOrigin, rootPos, t, agent.routeHeight)
        mesh.position.set(pos[0], pos[1], pos[2])
        agent.position = pos

        if (agent.routeProgress >= 1) {
          agent.tripPhase = "idle"
          agent.pauseRemaining = 1.2 + Math.random() * 1.5
          if (agent.rootId) onReturnHome(agent.id, agent.rootId)
        }
      }
    }

    const scale = SUB_BASE_SCALE * (isHovered ? 1.2 : 1)
    mesh.scale.set(scale, scale, scale)
    mesh.rotation.x += 0.02
    mesh.rotation.y += 0.025
  })

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[0.85, 16, 16]} />
      <meshPhongMaterial color="#ff007a" emissive="#ff007a" emissiveIntensity={0.38} />
    </mesh>
  )
}

const AgentRouteTrails: React.FC<{
  agents: Agent[]
  hoveredAgent: string | null
}> = ({ agents, hoveredAgent }) => {
  const linesRef = useRef<THREE.LineSegments>(null)

  useFrame(() => {
    if (!linesRef.current) return

    const positions: number[] = []
    const colors: number[] = []

    agents.forEach((agent) => {
      if (agent.role !== "sub") return
      if (agent.tripPhase !== "to_marketplace" && agent.tripPhase !== "to_home") return

      const [x, y, z] = agent.position
      const [ox, oy, oz] = agent.routeOrigin

      positions.push(ox, oy, oz, x, y, z)

      const isActive = hoveredAgent === agent.id
      const color: [number, number, number] = isActive
        ? [1, 0.353, 0.047]
        : [0.45, 0.45, 0.45]
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
  onReturnHome: (subId: string, rootId: string) => void
}> = ({ agents, nodes, hoveredAgent, onArriveAtNode, onReturnHome }) => (
  <>
    <PerspectiveCamera makeDefault position={[120, 70, 120]} fov={75} />
    <OrbitControls makeDefault enableDamping dampingFactor={0.05} enableZoom enablePan />
    <ambientLight intensity={0.5} color={0xffffff} />
    <pointLight position={[100, 100, 100]} intensity={1} color={0xffffff} />
    <pointLight position={[-100, 50, -100]} intensity={0.6} color={0xff007a} />
    <pointLight position={[0, 0, 0]} intensity={0.4} color={0xea580c} />

    {nodes.map((node) => (
      <NetworkNodeObject key={node.id} node={node} />
    ))}

    {agents.map((agent) => {
      const isHovered = hoveredAgent === agent.id
      if (agent.role === "user") {
        return <UserAgentMesh key={agent.id} isHovered={isHovered} />
      }
      if (agent.role === "root") {
        return (
          <RootAgentMesh
            key={agent.id}
            agent={agent}
            nodes={nodes}
            isHovered={isHovered}
          />
        )
      }
      return (
        <SubAgentMesh
          key={agent.id}
          agent={agent}
          agents={agents}
          nodes={nodes}
          isHovered={isHovered}
          onArriveAtNode={onArriveAtNode}
          onReturnHome={onReturnHome}
        />
      )
    })}

    <AgentRouteTrails agents={agents} hoveredAgent={hoveredAgent} />
    <gridHelper args={[200, 20]} position={[0, -40, 0]} />
  </>
)

export const AgentNetworkCanvas: React.FC<{
  viewMode: "activity" | "reputation" | "tvl"
  protocolAmounts?: Record<string, number>
  onTradeEvent?: (event: TradeEvent) => void
}> = ({ viewMode, protocolAmounts = {}, onTradeEvent }) => {
  const layout: NetworkLayoutConfig = DEFAULT_NETWORK_LAYOUT
  const [nodes, setNodes] = useState<NetworkNode[]>(() => buildNetworkNodes(layout))
  const [agents, setAgents] = useState<Agent[]>(() =>
    generateAgents(buildNetworkNodes(layout))
  )
  const [hoveredAgent, setHoveredAgent] = useState<string | null>(null)
  const agentsRef = useRef(agents)
  agentsRef.current = agents

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

  const handleReturnHome = (_subId: string, rootId: string) => {
    const root = agentsRef.current.find((a) => a.id === rootId)
    if (root) root.signalGlow = 1
  }

  return (
    <div className="relative h-full w-full min-w-0 flex-1 bg-background">
      <Canvas>
        <AgentNetworkScene
          agents={agents}
          nodes={nodes}
          hoveredAgent={hoveredAgent}
          onArriveAtNode={handleArriveAtNode}
          onReturnHome={handleReturnHome}
        />
      </Canvas>

      {hoveredAgent && (
        <div className="absolute bottom-6 left-1/2 z-10 max-w-xs -translate-x-1/2 rounded border border-[#ea580c] bg-card/95 p-4 font-mono text-xs text-foreground shadow-md backdrop-blur-sm">
          {agents
            .filter((a) => a.id === hoveredAgent)
            .map((agent) => {
              const root = agent.rootId
                ? agents.find((a) => a.id === agent.rootId)
                : null
              return (
                <div key={agent.id}>
                  <p className="font-bold text-[#ea580c]">
                    {agent.role === "user"
                      ? "YOUR AGENT"
                      : agent.role === "root"
                        ? `ROOT · ${nodes[agent.homeProtocolIndex]?.name ?? "Protocol"}`
                        : `SUB · follows ${root?.id ?? "root"}`}
                  </p>
                  <div className="mt-2 space-y-1 text-muted-foreground">
                    <p>TVL: ${agent.tvl.toLocaleString()}</p>
                    <p>Reputation: {agent.reputation.toFixed(0)}/1000</p>
                    {agent.role === "root" && (
                      <p>Moving: {agent.rootTripPhase.replace(/_/g, " ")}</p>
                    )}
                    {agent.role === "sub" && (
                      <p>Trip: {agent.tripPhase.replace(/_/g, " ")}</p>
                    )}
                  </div>
                </div>
              )
            })}
        </div>
      )}
    </div>
  )
}
