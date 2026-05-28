"use client"

import { useEffect, useRef, useState } from "react"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { PerspectiveCamera, OrbitControls } from "@react-three/drei"
import * as THREE from "three"

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
}

interface Protocol {
  id: string
  name: string
  position: [number, number, number]
  amount: number
  radius: number
  color: string
}

// Generate protocol objects
const generateProtocols = (amounts: Record<string, number>): Protocol[] => {
  const protocols: Protocol[] = [
    { id: "uniswap", name: "Uniswap", position: [40, 0, 0], amount: amounts.uniswap || 50000000, radius: 15, color: "#ff007a" },
    { id: "aave", name: "AAVE", position: [-40, 0, 0], amount: amounts.aave || 30000000, radius: 12, color: "#7928ca" },
    { id: "compound", name: "Compound", position: [0, 0, 40], amount: amounts.compound || 25000000, radius: 11, color: "#00d4ff" },
    { id: "lido", name: "Lido", position: [0, 0, -40], amount: amounts.lido || 35000000, radius: 13, color: "#00a3e0" },
  ]

  return protocols.map(p => ({
    ...p,
    radius: Math.max(8, Math.log(p.amount) * 2),
  }))
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
  })

  // Other agents distributed across protocols
  for (let i = 0; i < count - 1; i++) {
    const protocolIndex = i % protocols.length
    const protocol = protocols[protocolIndex]
    const orbitPhase = Math.random() * Math.PI * 2
    const isBuyingSignals = Math.random() > 0.5

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
    <group position={protocol.position}>
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

// Buy signals zone (top node)
const BuySignalsZone: React.FC = () => {
  const meshRef = useRef<THREE.Mesh>(null)

  useFrame(({ clock }) => {
    if (meshRef.current) {
      meshRef.current.rotation.x += 0.001
      meshRef.current.rotation.y += 0.002
      const pulse = 1 + Math.sin(clock.getElapsedTime() * 2) * 0.1
      meshRef.current.scale.set(pulse * 12, pulse * 12, pulse * 12)
    }
  })

  return (
    <mesh ref={meshRef} position={[0, 80, 0]}>
      <icosahedronGeometry args={[12, 3]} />
      <meshPhongMaterial
        color="#00ff88"
        emissive="#00ff88"
        emissiveIntensity={0.3}
        wireframe={true}
        transparent={true}
        opacity={0.4}
      />
    </mesh>
  )
}

// Agent particle component
const AgentParticle: React.FC<{
  agent: Agent
  hoveredAgent: string | null
  protocol: Protocol
  buySignalsZoneY: number
}> = ({ agent, hoveredAgent, protocol, buySignalsZoneY }) => {
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
        // Non-user agents with buy/sell routing
        const orbitSpeed = 0.8
        let newPhase = agent.orbitPhase + orbitSpeed * 0.01
        agent.orbitPhase = newPhase

        // Smooth routing: agents buying signals go to top, then return
        if (agent.isBuyingSignals) {
          // Move up to buy signals zone, pause, then return
          const cycleTime = clock.getElapsedTime() * 0.3
          const cycleFraction = (cycleTime % 3) / 3 // 3 second cycle

          let targetY: number
          if (cycleFraction < 0.4) {
            // Going up
            targetY = protocol.position[1] + (buySignalsZoneY - protocol.position[1]) * (cycleFraction / 0.4)
          } else if (cycleFraction < 0.6) {
            // At top (pause)
            targetY = buySignalsZoneY
          } else {
            // Coming down
            targetY = buySignalsZoneY - (buySignalsZoneY - protocol.position[1]) * ((cycleFraction - 0.6) / 0.4)
          }

          const orbitRadius = protocol.radius + 8
          meshRef.current.position.x =
            protocol.position[0] + Math.cos(newPhase) * orbitRadius
          meshRef.current.position.z =
            protocol.position[2] + Math.sin(newPhase) * orbitRadius
          meshRef.current.position.y = targetY
        } else {
          // Regular orbital animation
          const orbitRadius = protocol.radius + 8
          meshRef.current.position.x =
            protocol.position[0] + Math.cos(newPhase) * orbitRadius
          meshRef.current.position.z =
            protocol.position[2] + Math.sin(newPhase) * orbitRadius
          meshRef.current.position.y =
            protocol.position[1] + Math.sin(newPhase * 0.5) * 5
        }

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

// Connection lines between agents (signal flow)
const AgentConnections: React.FC<{
  agents: Agent[]
  hoveredAgent: string | null
}> = ({ agents, hoveredAgent }) => {
  const linesRef = useRef<THREE.LineSegments>(null)

  useEffect(() => {
    if (!linesRef.current) return

    const geometry = new THREE.BufferGeometry()
    const positions: number[] = []
    const colors: number[] = []

    // Draw signal connections
    agents.forEach((agent, idx) => {
      if (agent.signals.selling > 0) {
        // Connect to nearest buying agents
        const nearest = agents
          .filter((a) => a.signals.buying > 0 && a.id !== agent.id)
          .sort(
            (a, b) =>
              Math.hypot(
                a.position[0] - agent.position[0],
                a.position[1] - agent.position[1]
              ) -
              Math.hypot(
                b.position[0] - agent.position[0],
                b.position[1] - agent.position[1]
              )
          )
          .slice(0, 2)

        nearest.forEach((buyer) => {
          positions.push(
            agent.position[0],
            agent.position[1],
            agent.position[2]
          )
          positions.push(buyer.position[0], buyer.position[1], buyer.position[2])

          const isActive = hoveredAgent === agent.id || hoveredAgent === buyer.id
          colors.push(
            ...(isActive
              ? [1, 0.353, 0.047] // Orange #ea580c
              : [0.2, 0.2, 0.2]
            ) // Gray
          )
          colors.push(
            ...(isActive
              ? [1, 0.353, 0.047]
              : [0.2, 0.2, 0.2]
            )
          )
        })
      }
    })

    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3))
    geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(colors), 3))

    linesRef.current.geometry.dispose()
    linesRef.current.geometry = geometry
  }, [agents, hoveredAgent])

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
}> = ({ agents, protocols, hoveredAgent, viewMode }) => {
  const buySignalsZoneY = 80

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

      {/* Buy signals zone at top */}
      <BuySignalsZone />

      {/* Render agents */}
      {agents.map((agent) => {
        const protocol = protocols[agent.protocolIndex] || protocols[0]
        return (
          <AgentParticle
            key={agent.id}
            agent={agent}
            hoveredAgent={hoveredAgent}
            protocol={protocol}
            buySignalsZoneY={buySignalsZoneY}
          />
        )
      })}

      {/* Render connections */}
      <AgentConnections agents={agents} hoveredAgent={hoveredAgent} />

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
  const [protocols, setProtocols] = useState<Protocol[]>(() =>
    generateProtocols(protocolAmounts)
  )
  const [agents, setAgents] = useState<Agent[]>(() =>
    generateAgents(generateProtocols(protocolAmounts))
  )
  const [hoveredAgent, setHoveredAgent] = useState<string | null>(null)

  // Update protocols when amounts change
  useEffect(() => {
    const newProtocols = generateProtocols(protocolAmounts)
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
        <div className="absolute top-6 right-6 text-xs font-mono text-white bg-black/90 border border-[#ea580c] p-4 rounded max-w-xs">
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
