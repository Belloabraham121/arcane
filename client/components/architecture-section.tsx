"use client"

import { motion } from "framer-motion"

const ease = [0.22, 1, 0.36, 1] as const

const TECH_STACK = [
  { category: "Chain", items: ["Somnia", "EVM-compatible", "Sub-cent fees", "1M TPS"] },
  {
    category: "Smart Accounts",
    items: ["ERC-4337", "Account Abstraction", "ERC-6900 Modular"],
  },
  {
    category: "On-Chain AI",
    items: ["Somnia Native Agents", "JSON API Agent", "LLM Inference Agent", "Parse Website Agent"],
  },
  {
    category: "Payments",
    items: ["x402 Protocol", "HTTP-native", "Micropayments", "USDC Settlement"],
  },
  {
    category: "Reputation",
    items: ["ERC-8004 Standard", "Trustless Identity", "On-chain Scoring", "Signal Accuracy Tracking"],
  },
  {
    category: "Backend",
    items: ["Node.js", "TypeScript", "PostgreSQL", "Redis"],
  },
]

export function ArchitectureSection() {
  return (
    <section className="w-full px-6 py-20 lg:px-12">
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
            {"// TECH_FOUNDATION"}
          </span>
          <div className="flex-1 border-t border-border" />
          <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
            002
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
            Built on Somnia&apos;s Native Agent Platform
          </h2>
          <p className="text-sm text-muted-foreground font-mono max-w-2xl">
            Arcane doesn&apos;t run its own oracles or AI models. All on-chain intelligence routes through
            Somnia&apos;s native agents — validated by consensus, auditable by design.
          </p>
        </motion.div>

        {/* Tech stack grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-12">
          {TECH_STACK.map((stack, index) => (
            <motion.div
              key={stack.category}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, delay: index * 0.08, ease }}
              className="border border-border rounded-lg p-4 lg:p-6 bg-foreground/2"
            >
              {/* Category title */}
              <h3 className="text-sm font-mono font-bold uppercase tracking-widest text-[#ea580c] mb-3">
                {stack.category}
              </h3>

              {/* Items list */}
              <ul className="space-y-2">
                {stack.items.map((item) => (
                  <li
                    key={item}
                    className="text-xs font-mono text-muted-foreground flex items-start gap-2"
                  >
                    <span className="text-[#ea580c] mt-1">▪</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>

        {/* Key differentiator callout */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5, delay: 0.4, ease }}
          className="border-2 border-[#ea580c] rounded-lg p-8 bg-[#ea580c]/5"
        >
          <h3 className="text-lg font-mono font-bold uppercase tracking-tight mb-3 text-foreground">
            {"// What Makes Arcane Different"}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <p className="text-xs font-mono text-muted-foreground leading-relaxed">
                <span className="text-[#ea580c] font-bold">Verifiable Reasoning:</span> Every agent decision is
                auditable on-chain via Somnia validators.
              </p>
            </div>
            <div>
              <p className="text-xs font-mono text-muted-foreground leading-relaxed">
                <span className="text-[#ea580c] font-bold">Signal Marketplace:</span> Agents trade intelligence
                peer-to-peer with x402 micropayments.
              </p>
            </div>
            <div>
              <p className="text-xs font-mono text-muted-foreground leading-relaxed">
                <span className="text-[#ea580c] font-bold">Trustless Reputation:</span> ERC-8004 standards
                track agent accuracy transparently.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
