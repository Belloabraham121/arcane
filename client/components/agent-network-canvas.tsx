"use client"

import { useEffect, useRef, useState } from "react"
import { Canvas, useFrame } from "@react-three/fiber"
import { PerspectiveCamera, OrbitControls } from "@react-three/drei"
import * as THREE from "three"
import {
  DEFAULT_NETWORK_LAYOUT,
  type NetworkLayoutConfig,
  type ProtocolNodeId,
} from "@/lib/network-layout-config"

interface Agent {
  id: string
  position: [number, number, number]
  velocity: [number, number, number]
  tvl: number
  reputation: number
  isUserAgent: boolean
  userAgentIndex?: number
  signals: {
    selling: number
    buying: number
  }
  activity: "selling" | "buying" | "managing" | "idle"
  protocolIndex: number
  orbitPhase: number
  targetPhase?: number
  isBuyingSignals: boolean
  sourceProtocolIndex: number
  targetProtocolIndex: number
  routeProgress: number
  routeSpeed: number
  routeHeight: number
}

interface Protocol {
  id: ProtocolNodeId
  name: string
  position: [number, number, number]
  amount: number
  radius: number
  color: string
  scale: [number, number, number]
}

const PROTOCOL_COLORS: Record<ProtocolNodeId, string> = {
  uniswap: "#ff007a",
  aave: "#7928ca",
  compound: "#00d4ff",
  lido: "#00a3e0",
}

const PROTOCOL_NAMES: Record<ProtocolNodeId, string> = {
  uniswap: "Uniswap",
  aave: "AAVE",
  compound: "Compound",
  lido: "Lido",
}

// Generate protocol objects from layout + TVL amounts
const generateProtocols = (
  amounts: Record<string, number>,
  layout: NetworkLayoutConfig
): Protocol[] => {
  return (Object.keys(layout.protocols) as ProtocolNodeId[]).map((id) => {
    const node = layout.protocols[id]
    return {
      id,
      name: PROTOCOL_NAMES[id],
      position: [node.positionX, 0, node.positionZ],
      amount: amounts[id] || 25000000,
      radius: node.radius,
      color: PROTOCOL_COLORS[id],
      scale: [node.width, node.height, node.width],
    }
  })
}

// Generate initial agent particles distributed across protocols
const generateAgents = (protocols: Protocol[]): Agent[] => {
  const agents: Agent[] = []
  const count = 60

  // User's agents - positioned at center (we'll support multiple user agents)
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
    sourceProtocolIndex: 0,
    targetProtocolIndex: 0,
    routeProgress: 0,
    routeSpeed: 0,
    routeHeight: 0,
  })

  // Other agents distributed across protocols
  for (let i = 0; i < count - 1; i++) {
    const protocolIndex = i % protocols.length
    const protocol = protocols[protocolIndex]
    const orbitPhase = Math.random() * Math.PI * 2
    const isBuyingSignals = Math.random() > 0.5
    const targetProtocolIndex = (protocolIndex + 1 + Math.floor(Math.random() * (protocols.length - 1))) % protocols.length

    agents.push({
      id: `agent-${i}`,
      position: [
        protocol.position[0] + Math.cos(orbitPhase) * (protocol.radius + 5),
        protocol.position[1] + (Math.random() - 0.5) * 10,
        protocol.position[2] + Math.sin(orbitPhase) * (protocol.radius + 5),
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
      protocolIndex,
      orbitPhase,
      isBuyingSignals,
      sourceProtocolIndex: protocolIndex,
      targetProtocolIndex,
      routeProgress: Math.random(),
      routeSpeed: 0.0025 + Math.random() * 0.004,
      routeHeight: 1.5 + Math.random() * 5,
    })
  }

  return agents
}

// Protocol object component
const ProtocolObject: React.FC<{ protocol: Protocol }> = ({ protocol }) => {
  const meshRef = useRef<THREE.Mesh>(null)

  useFrame(({ clock }) => {
    if (meshRef.current) {
      meshRef.current.rotation.x += 0.0005
      meshRef.current.rotation.y += 0.0008
    }
  })

  return (
    <group position={protocol.position} scale={protocol.scale}>
      {/* Main protocol sphere */}
      <mesh ref={meshRef}>
        <icosahedronGeometry args={[protocol.radius, 4]} />
        <meshPhongMaterial
          color={protocol.color}
          emissive={protocol.color}
          emissiveIntensity={0.2}
          wireframe={true}
          transparent={true}
          opacity={0.6}
        />
      </mesh>

      {/* Orbital ring */}
      <mesh rotation={[Math.PI / 4, 0, 0]}>
        <torusGeometry args={[protocol.radius + 2, 0.3, 8, 32]} />
        <meshPhongMaterial
          color={protocol.color}
          emissive={protocol.color}
          emissiveIntensity={0.3}
        />
      </mesh>

      {/* Inner glow ring */}
      <mesh rotation={[0, 0, Math.PI / 3]}>
        <torusGeometry args={[protocol.radius * 0.7, 0.2, 8, 32]} />
        <meshPhongMaterial
          color={protocol.color}
          emissive={protocol.color}
          emissiveIntensity={0.4}
        />
      </mesh>
    </group>
  )
}

// Buy signals zone — same scale as protocol nodes, stacked above the quad
const BuySignalsZone: React.FC<{
  radius: number
  y: number
  scale: [number, number, number]
}> = ({ radius, y, scale }) => {
  const meshRef = useRef<THREE.Mesh>(null)

  useFrame(({ clock }) => {
    if (meshRef.current) {
      meshRef.current.rotation.x += 0.0005
      meshRef.current.rotation.y += 0.0008
      const pulse = 1 + Math.sin(clock.getElapsedTime() * 2) * 0.06
      meshRef.current.scale.set(pulse, pulse, pulse)
    }
  })

  return (
    <group position={[0, y, 0]} scale={scale}>
      <mesh ref={meshRef}>
        <icosahedronGeometry args={[radius, 4]} />
        <meshPhongMaterial
          color="#00ff88"
          emissive="#00ff88"
          emissiveIntensity={0.2}
          wireframe={true}
          transparent={true}
          opacity={0.6}
        />
      </mesh>
      <mesh rotation={[Math.PI / 4, 0, 0]}>
        <torusGeometry args={[radius + 2, 0.3, 8, 32]} />
        <meshPhongMaterial
          color="#00ff88"
          emissive="#00ff88"
          emissiveIntensity={0.3}
        />
      </mesh>
      <mesh rotation={[0, 0, Math.PI / 3]}>
        <torusGeometry args={[radius * 0.7, 0.2, 8, 32]} />
        <meshPhongMaterial
          color="#00ff88"
          emissive="#00ff88"
          emissiveIntensity={0.4}
        />
      </mesh>
    </group>
  )
}

// Agent particle component
const AgentParticle: React.FC<{
  agent: Agent
  hoveredAgent: string | null
  protocols: Protocol[]
}> = ({ agent, hoveredAgent, protocols }) => {
  const meshRef = useRef<THREE.Mesh>(null)
  const isHovered = hoveredAgent === agent.id

  const sizeScale = Math.pow(agent.tvl / 100000, 0.3) * 0.5
  const baseSize = agent.isUserAgent ? sizeScale * 2 : sizeScale

  useFrame(({ clock }) => {
    if (meshRef.current) {
      if (agent.isUserAgent) {
        // User agent pulsing at center
        const pulse = 1 + Math.sin(clock.getElapsedTime() * 3) * 0.2
        meshRef.current.scale.set(baseSize * pulse, baseSize * pulse, baseSize * pulse)
      } else {
        // Each agent independently travels between protocols on its own route.
        agent.routeProgress += agent.routeSpeed
        if (agent.routeProgress >= 1) {
          agent.routeProgress = 0
          agent.sourceProtocolIndex = agent.targetProtocolIndex
          let nextTarget = agent.sourceProtocolIndex
          while (nextTarget === agent.sourceProtocolIndex) {
            nextTarget = Math.floor(Math.random() * protocols.length)
          }
          agent.targetProtocolIndex = nextTarget
          agent.routeSpeed = 0.0025 + Math.random() * 0.004
          agent.routeHeight = 1.5 + Math.random() * 5
        }

        const source = protocols[agent.sourceProtocolIndex]
        const target = protocols[agent.targetProtocolIndex]
        if (!source || !target) return

        const t = agent.routeProgress
        const sx = source.position[0]
        const sz = source.position[2]
        const tx = target.position[0]
        const tz = target.position[2]
        const arc = Math.sin(t * Math.PI) * agent.routeHeight

        meshRef.current.position.x = sx + (tx - sx) * t
        meshRef.current.position.z = sz + (tz - sz) * t
        meshRef.current.position.y = arc

        // Hover animation
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
      }
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

// Dynamic route trails behind each moving agent.
const AgentRouteTrails: React.FC<{
  agents: Agent[]
  protocols: Protocol[]
  hoveredAgent: string | null
}> = ({ agents, protocols, hoveredAgent }) => {
  const linesRef = useRef<THREE.LineSegments>(null)

  useFrame(() => {
    if (!linesRef.current) return

    const positions: number[] = []
    const colors: number[] = []

    agents.forEach((agent) => {
      if (agent.isUserAgent) return
      const source = protocols[agent.sourceProtocolIndex]
      const target = protocols[agent.targetProtocolIndex]
      if (!source || !target) return

      const t = agent.routeProgress
      const x = source.position[0] + (target.position[0] - source.position[0]) * t
      const z = source.position[2] + (target.position[2] - source.position[2]) * t
      const y = Math.sin(t * Math.PI) * agent.routeHeight

      // Trail is drawn from source protocol to current agent position.
      positions.push(source.position[0], 0, source.position[2])
      positions.push(x, y, z)

      const isActive = hoveredAgent === agent.id
      const color: [number, number, number] = isActive ? [1, 0.353, 0.047] : [0.3, 0.3, 0.3]
      colors.push(...color)
      colors.push(...color)
    })

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3))
    geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(colors), 3))

    linesRef.current.geometry.dispose()
    linesRef.current.geometry = geometry
  })

  return (
    <lineSegments ref={linesRef}>
      <lineBasicMaterial vertexColors={true} linewidth={1} />
    </lineSegments>
  )
}

// Main canvas controller
const AgentNetworkScene: React.FC<{
  agents: Agent[]
  protocols: Protocol[]
  hoveredAgent: string | null
  viewMode: "activity" | "reputation" | "tvl"
  layout: NetworkLayoutConfig
}> = ({ agents, protocols, hoveredAgent, viewMode, layout }) => {
  const buySignalsZoneY = layout.buySignals.positionY
  const buySignalsScale: [number, number, number] = [
    layout.buySignals.width,
    layout.buySignals.height,
    layout.buySignals.width,
  ]

  return (
    <>
      <PerspectiveCamera makeDefault position={[120, 70, 120]} fov={75} />
      <OrbitControls
        makeDefault
        autoRotate={false}
        autoRotateSpeed={0}
        enableDamping={true}
        dampingFactor={0.05}
        enableZoom={true}
        enablePan={true}
      />
      <ambientLight intensity={0.5} color={0xffffff} />
      <pointLight position={[100, 100, 100]} intensity={1} color={0xffffff} />
      <pointLight position={[-100, 50, -100]} intensity={0.6} color={0xff007a} />
      <pointLight position={[0, 0, 0]} intensity={0.4} color={0xea580c} />

      {/* Render protocol objects */}
      {protocols.map((protocol) => (
        <ProtocolObject key={protocol.id} protocol={protocol} />
      ))}

      {/* Buy signals zone — small node centered above the four protocols */}
      <BuySignalsZone
        radius={layout.buySignals.radius}
        y={buySignalsZoneY}
        scale={buySignalsScale}
      />

      {/* Render agents */}
      {agents.map((agent) => {
        return (
          <AgentParticle
            key={agent.id}
            agent={agent}
            hoveredAgent={hoveredAgent}
            protocols={protocols}
          />
        )
      })}

      {/* Render dynamic path trails */}
      <AgentRouteTrails agents={agents} protocols={protocols} hoveredAgent={hoveredAgent} />

      {/* Grid for reference */}
      <gridHelper args={[200, 20]} position={[0, -40, 0]} />
    </>
  )
}

export const AgentNetworkCanvas: React.FC<{
  viewMode: "activity" | "reputation" | "tvl"
  protocolAmounts?: Record<string, number>
  onProtocolAmountsChange?: (amounts: Record<string, number>) => void
}> = ({ viewMode, protocolAmounts = {}, onProtocolAmountsChange }) => {
  const layout: NetworkLayoutConfig = DEFAULT_NETWORK_LAYOUT
  const [protocols, setProtocols] = useState<Protocol[]>(() =>
    generateProtocols(protocolAmounts, DEFAULT_NETWORK_LAYOUT)
  )
  const [agents, setAgents] = useState<Agent[]>(() =>
    generateAgents(generateProtocols(protocolAmounts, DEFAULT_NETWORK_LAYOUT))
  )
  const [hoveredAgent, setHoveredAgent] = useState<string | null>(null)

  // Update protocols when TVL amounts change
  useEffect(() => {
    const newProtocols = generateProtocols(protocolAmounts, layout)
    setProtocols(newProtocols)
    setAgents(generateAgents(newProtocols))
  }, [protocolAmounts])

  return (
    <div
      className="w-full h-screen relative"
      style={{
        backgroundImage: "radial-gradient(circle, hsl(0 0% 20%) 1px, transparent 1px)",
        backgroundSize: "24px 24px",
      }}
    >
      <Canvas>
        <AgentNetworkScene
          agents={agents}
          protocols={protocols}
          hoveredAgent={hoveredAgent}
          viewMode={viewMode}
          layout={layout}
        />
      </Canvas>

      {/* Info panel */}
      <div className="absolute bottom-6 left-6 text-xs font-mono text-white bg-black/80 border border-white/20 p-4 rounded">
        <p>AGENT NETWORK VISUALIZATION</p>
        <p>Rotate: auto-orbit | Hover: agent details</p>
        <p>View Mode: {viewMode.toUpperCase()}</p>
      </div>

      {/* Protocol info */}
      <div className="absolute top-6 left-6 text-xs font-mono text-white bg-black/90 border border-white/20 p-4 rounded max-w-sm">
        <p className="text-white font-bold mb-3">PROTOCOLS</p>
        <div className="space-y-2">
          {protocols.map((protocol) => (
            <div key={protocol.id} className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: protocol.color }}
              />
              <span>{protocol.name}</span>
              <span className="text-white/50">
                ${(protocol.amount / 1000000).toFixed(1)}M
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Hovered agent info */}
      {hoveredAgent && (
        <div className="absolute bottom-24 right-6 text-xs font-mono text-white bg-black/90 border border-[#ea580c] p-4 rounded max-w-xs z-10">
          <p className="text-[#ea580c] font-bold">
            {hoveredAgent === "user-agent" ? "YOUR AGENT" : hoveredAgent.toUpperCase()}
          </p>
          {agents
            .filter((a) => a.id === hoveredAgent)
            .map((agent) => (
              <div key={agent.id} className="mt-2 space-y-1">
                <p>TVL: ${agent.tvl.toLocaleString()}</p>
                <p>Reputation: {agent.reputation.toFixed(0)}/1000</p>
                <p>Activity: {agent.activity.toUpperCase()}</p>
                <p>Signals Selling: {agent.signals.selling}</p>
                <p>Signals Buying: {agent.signals.buying}</p>
              </div>
            ))}
        </div>
      )}
    </div>
  )
}
