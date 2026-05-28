"use client"

import { motion } from "framer-motion"
import { useEffect, useState } from "react"

interface ParticleNode {
  id: number
  x: number
  y: number
  radius: number
  delay: number
}

function ParticleNode({ node }: { node: ParticleNode }) {
  return (
    <motion.g
      initial={{ opacity: 0, scale: 0 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, delay: node.delay * 0.02 }}
    >
      {/* Particle node */}
      <circle
        cx={node.x}
        cy={node.y}
        r={node.radius}
        fill="hsl(var(--foreground))"
        opacity={0.7}
      />

      {/* Subtle glow effect */}
      <motion.circle
        cx={node.x}
        cy={node.y}
        r={node.radius}
        fill="none"
        stroke="#ea580c"
        strokeWidth={0.5}
        initial={{ opacity: 0.3 }}
        animate={{ opacity: [0.3, 0.6, 0.3] }}
        transition={{
          duration: 3,
          delay: node.delay * 0.02,
          repeat: Infinity,
        }}
      />
    </motion.g>
  )
}

export function AgentNetworkViz() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return <div className="h-[350px] w-full" />
  }

  const centerX = 600
  const centerY = 175
  const centralRadius = 120

  // Generate many small particles distributed around and in the central node area
  const particles: ParticleNode[] = []
  
  // Create dense cluster of particles
  for (let i = 0; i < 80; i++) {
    const angle = Math.random() * Math.PI * 2
    const distance = Math.random() * centralRadius * 1.3
    const nodeRadius = Math.random() * 4 + 2

    particles.push({
      id: i,
      x: centerX + Math.cos(angle) * distance,
      y: centerY + Math.sin(angle) * distance,
      radius: nodeRadius,
      delay: i,
    })
  }

  return (
    <div className="relative w-full mx-auto flex items-center justify-center">
      <svg
        viewBox="0 0 1200 350"
        className="w-full h-auto"
        role="img"
        aria-label="Central agent node with distributed particle network"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Background - subtle grid pattern */}
        <defs>
          <radialGradient id="centralGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="hsl(var(--foreground))" stopOpacity="0.05" />
            <stop offset="100%" stopColor="hsl(var(--foreground))" stopOpacity="0" />
          </radialGradient>
          <pattern
            id="bgGrid"
            width="50"
            height="50"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 50 0 L 0 0 0 50"
              fill="none"
              stroke="hsl(var(--border))"
              strokeWidth="0.5"
              opacity="0.08"
            />
          </pattern>
        </defs>
        
        {/* Background elements */}
        <rect width="1200" height="350" fill="url(#bgGrid)" />
        
        {/* Central radial glow */}
        <motion.circle
          cx={centerX}
          cy={centerY}
          r={centralRadius * 1.4}
          fill="url(#centralGlow)"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6 }}
        />

        {/* Main central node - large sphere */}
        <motion.g
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
        >
          {/* Central node outer ring */}
          <circle
            cx={centerX}
            cy={centerY}
            r={centralRadius}
            fill="none"
            stroke="hsl(var(--foreground))"
            strokeWidth={1.5}
            opacity={0.4}
          />

          {/* Central node middle ring */}
          <circle
            cx={centerX}
            cy={centerY}
            r={centralRadius * 0.75}
            fill="none"
            stroke="hsl(var(--foreground))"
            strokeWidth={1}
            opacity={0.25}
          />

          {/* Central node inner ring */}
          <circle
            cx={centerX}
            cy={centerY}
            r={centralRadius * 0.5}
            fill="none"
            stroke="hsl(var(--foreground))"
            strokeWidth={0.75}
            opacity={0.2}
          />

          {/* Pulsing outer glow */}
          <motion.circle
            cx={centerX}
            cy={centerY}
            r={centralRadius}
            fill="none"
            stroke="#ea580c"
            strokeWidth={1}
            initial={{ opacity: 0.2 }}
            animate={{ opacity: [0.2, 0.5, 0.2] }}
            transition={{
              duration: 4,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />

          {/* Core bright dot */}
          <motion.circle
            cx={centerX}
            cy={centerY}
            r={8}
            fill="#ea580c"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.6, 1, 0.6] }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        </motion.g>

        {/* Distributed particle nodes */}
        {particles.map((particle) => (
          <ParticleNode key={`particle-${particle.id}`} node={particle} />
        ))}
      </svg>
    </div>
  )
}
