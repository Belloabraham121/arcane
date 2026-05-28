"use client"

import Link from "next/link"
import { useState } from "react"
import { motion } from "framer-motion"
import { ChevronRight, Cpu } from "lucide-react"
import { PixelatedCycle } from "@/components/pixelated-cycle"

const ease = [0.22, 1, 0.36, 1] as const

export default function DashboardPage() {
  const [hoveredStrategy, setHoveredStrategy] = useState<"auto" | "custom" | null>(null)

  return (
    <div className="min-h-screen bg-background dot-grid-bg">
      {/* Navbar */}
      <nav className="border-b border-border">
        <div className="max-w-7xl mx-auto px-6 py-4 lg:px-12">
          <div className="flex items-center justify-between">
            <Link href="/">
              <div className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity">
                <Cpu size={18} strokeWidth={1.5} className="text-foreground" />
                <span className="text-sm font-mono tracking-[0.15em] uppercase font-bold">
                  ARCANE
                </span>
              </div>
            </Link>
            <div className="text-xs font-mono text-muted-foreground">
              0x2848...1CB9
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-12 lg:px-12">
        {/* Section Label */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, ease }}
          className="flex items-center gap-4 mb-12"
        >
          <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
            {"// SECTION: STRATEGY_SELECTION"}
          </span>
          <div className="flex-1 border-t border-border" />
          <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">001</span>
        </motion.div>

        {/* Heading */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1, ease }}
          className="text-3xl lg:text-4xl font-pixel mb-2 uppercase tracking-tight mb-12"
        >
          Agent Strategy
        </motion.h1>

        {/* Strategy Cards Container */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-4xl">
          {/* AUTO Strategy */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2, ease }}
            className="relative"
            onMouseEnter={() => setHoveredStrategy("auto")}
            onMouseLeave={() => setHoveredStrategy(null)}
          >
            <Link href="/dashboard/deposit/auto">
              <div
                className="group relative h-80 cursor-pointer transition-all duration-300"
              >
                {/* Pixel Circle Background */}
                <motion.div
                  animate={{
                    boxShadow: hoveredStrategy === "auto" 
                      ? "0 0 40px rgba(234, 88, 12, 0.5)" 
                      : "0 0 20px rgba(234, 88, 12, 0.2)"
                  }}
                  className="absolute inset-0 border-2 border-foreground rounded-lg overflow-hidden"
                >
                  {/* Pixel pattern background */}
                  <div className="absolute inset-0 bg-gradient-to-br from-foreground/5 to-transparent" />
                </motion.div>

                {/* Content */}
                <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center">
                  <div className="mb-6">
                    <PixelatedCycle isHovered={hoveredStrategy === "auto"} size="lg" />
                  </div>

                  <h3 className="text-2xl font-pixel uppercase mb-3 tracking-wide text-foreground">
                    AUTO
                  </h3>

                  {hoveredStrategy === "auto" ? (
                    <motion.p
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-xs font-mono text-muted-foreground leading-relaxed max-w-xs"
                    >
                      Your agents will be motivated to secure the highest yield for your investment. You can always customise your option if you wish.
                    </motion.p>
                  ) : (
                    <p className="text-xs font-mono text-muted-foreground">
                      Maximise yield automatically
                    </p>
                  )}
                </div>

                {/* Hover Indicator */}
                {hoveredStrategy === "auto" && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="absolute bottom-4 right-4"
                  >
                    <ChevronRight size={20} className="text-[#ea580c]" />
                  </motion.div>
                )}
              </div>
            </Link>
          </motion.div>

          {/* CUSTOM Strategy */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3, ease }}
            className="relative"
            onMouseEnter={() => setHoveredStrategy("custom")}
            onMouseLeave={() => setHoveredStrategy(null)}
          >
            <Link href="/dashboard/deposit/custom">
              <div
                className="group relative h-80 cursor-pointer transition-all duration-300"
              >
                {/* Pixel Circle Background */}
                <motion.div
                  animate={{
                    boxShadow: hoveredStrategy === "custom" 
                      ? "0 0 40px rgba(234, 88, 12, 0.5)" 
                      : "0 0 20px rgba(234, 88, 12, 0.2)"
                  }}
                  className="absolute inset-0 border-2 border-foreground rounded-lg overflow-hidden"
                >
                  {/* Pixel pattern background */}
                  <div className="absolute inset-0 bg-gradient-to-br from-foreground/5 to-transparent" />
                </motion.div>

                {/* Content */}
                <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center">
                  <div className="mb-6">
                    <PixelatedCycle isHovered={hoveredStrategy === "custom"} size="lg" />
                  </div>

                  <h3 className="text-2xl font-pixel uppercase mb-3 tracking-wide text-foreground">
                    CUSTOM
                  </h3>

                  {hoveredStrategy === "custom" ? (
                    <motion.p
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-xs font-mono text-muted-foreground leading-relaxed max-w-xs"
                    >
                      Your agent adapts to your preference, letting you adjust parameters anytime, choose protocol market percentages, and optimise with these into settings.
                    </motion.p>
                  ) : (
                    <p className="text-xs font-mono text-muted-foreground">
                      Customise your strategy
                    </p>
                  )}
                </div>

                {/* Hover Indicator */}
                {hoveredStrategy === "custom" && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="absolute bottom-4 right-4"
                  >
                    <ChevronRight size={20} className="text-[#ea580c]" />
                  </motion.div>
                )}
              </div>
            </Link>
          </motion.div>
        </div>
      </main>
    </div>
  )
}
