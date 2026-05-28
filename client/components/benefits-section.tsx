"use client"

import { motion } from "framer-motion"
import {
  Zap,
  TrendingUp,
  Network,
  Shield,
  BarChart3,
  Lock,
} from "lucide-react"

const ease = [0.22, 1, 0.36, 1] as const

const BENEFITS = [
  {
    icon: Zap,
    title: "Autonomous Management",
    description:
      "Deploy agents that continuously manage your capital across DeFi protocols without manual intervention.",
  },
  {
    icon: TrendingUp,
    title: "Signal Generation",
    description:
      "Agents generate buy/sell signals based on market analysis, fund rates, yields, and protocol opportunities.",
  },
  {
    icon: Network,
    title: "Peer-to-Peer Trading",
    description:
      "Monetize your agent&apos;s signals by selling them to other agents. Buy signals from high-reputation agents to enhance your strategy.",
  },
  {
    icon: Shield,
    title: "On-Chain Verification",
    description:
      "All agent decisions and signal settlements happen on-chain with cryptographic proof via Somnia validators.",
  },
  {
    icon: BarChart3,
    title: "Transparent Reputation",
    description:
      "Agent accuracy is tracked on-chain using ERC-8004 standards. High-performing agents attract more signal purchases.",
  },
  {
    icon: Lock,
    title: "Trustless Execution",
    description:
      "x402 micropayments settle automatically. No intermediaries. No arbitration disputes. Pure code execution.",
  },
]

export function BenefitsSection() {
  return (
    <section className="w-full px-6 py-20 lg:px-12 bg-muted/20">
      <div className="max-w-6xl mx-auto">
        {/* Section label */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5, ease }}
          className="flex items-center gap-4 mb-12"
        >
          <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
            {"// KEY_BENEFITS"}
          </span>
          <div className="flex-1 border-t border-border" />
          <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
            003
          </span>
        </motion.div>

        {/* Section heading */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5, delay: 0.1, ease }}
          className="mb-16"
        >
          <h2 className="text-3xl lg:text-4xl font-mono font-bold tracking-tight uppercase text-balance mb-4">
            What You Get with Arcane
          </h2>
          <p className="text-sm text-muted-foreground font-mono max-w-2xl">
            Build a living, self-organizing market of agent intelligence. Your agents
            manage capital. Generate signals. Trade with others. Earn reputation.
          </p>
        </motion.div>

        {/* Benefits grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {BENEFITS.map((benefit, index) => {
            const Icon = benefit.icon
            return (
              <motion.div
                key={benefit.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.5, delay: index * 0.08, ease }}
                className="border border-border rounded-lg p-6 hover:border-foreground/50 transition-colors group"
              >
                {/* Icon */}
                <motion.div
                  className="mb-4 p-3 bg-[#ea580c]/10 rounded w-fit"
                  whileHover={{ scale: 1.1, rotate: 5 }}
                  transition={{ type: "spring", stiffness: 400, damping: 20 }}
                >
                  <Icon size={24} className="text-[#ea580c]" strokeWidth={1.5} />
                </motion.div>

                {/* Title */}
                <h3 className="text-sm lg:text-base font-mono font-bold uppercase tracking-tight mb-2">
                  {benefit.title}
                </h3>

                {/* Description */}
                <p className="text-xs lg:text-sm text-muted-foreground font-mono leading-relaxed">
                  {benefit.description}
                </p>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
