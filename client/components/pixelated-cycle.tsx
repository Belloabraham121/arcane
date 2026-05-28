'use client'

import { motion } from 'framer-motion'

interface PixelatedCycleProps {
  isHovered?: boolean
  size?: 'sm' | 'md' | 'lg'
}

export function PixelatedCycle({ isHovered = false, size = 'lg' }: PixelatedCycleProps) {
  // Define sizes for different variants
  const sizeMap = {
    sm: { outer: 'w-16 h-16', middle: 'w-12 h-12', inner: 'w-8 h-8' },
    md: { outer: 'w-20 h-20', middle: 'w-16 h-16', inner: 'w-12 h-12' },
    lg: { outer: 'w-28 h-28', middle: 'w-24 h-24', inner: 'w-16 h-16' },
  }

  const classes = sizeMap[size]

  return (
    <motion.div
      animate={{
        scale: isHovered ? 1.1 : 1,
      }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      className="flex items-center justify-center"
    >
      {/* Outer circle with pixelated border */}
      <div
        className={`${classes.outer} relative`}
      >
        {/* Outermost border */}
        <motion.div
          animate={{
            borderColor: isHovered ? 'rgb(234, 88, 12)' : 'rgb(0, 0, 0)',
            boxShadow: isHovered 
              ? '0 0 30px rgba(234, 88, 12, 0.6), inset 0 0 20px rgba(234, 88, 12, 0.2)'
              : '0 0 15px rgba(234, 88, 12, 0.2), inset 0 0 10px rgba(234, 88, 12, 0.05)'
          }}
          className="absolute inset-0 border-[3px] transition-all duration-300"
          style={{
            clipPath: 'polygon(10% 0%, 90% 0%, 100% 10%, 100% 90%, 90% 100%, 10% 100%, 0% 90%, 0% 10%)',
          }}
        />

        {/* Middle circle */}
        <motion.div
          animate={{
            borderColor: isHovered ? 'rgb(234, 88, 12)' : 'rgb(0, 0, 0)',
          }}
          className={`${classes.middle} absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 border-[2px] transition-all duration-300`}
          style={{
            clipPath: 'polygon(15% 0%, 85% 0%, 100% 15%, 100% 85%, 85% 100%, 15% 100%, 0% 85%, 0% 15%)',
          }}
        />

        {/* Inner circle with pulsing effect */}
        <motion.div
          animate={{
            borderColor: isHovered ? 'rgb(234, 88, 12)' : 'rgb(100, 116, 139)',
            backgroundColor: isHovered ? 'rgba(234, 88, 12, 0.1)' : 'transparent',
            boxShadow: isHovered
              ? 'inset 0 0 15px rgba(234, 88, 12, 0.3), 0 0 10px rgba(234, 88, 12, 0.3)'
              : 'none'
          }}
          className={`${classes.inner} absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 border transition-all duration-300`}
          style={{
            clipPath: 'polygon(20% 0%, 80% 0%, 100% 20%, 100% 80%, 80% 100%, 20% 100%, 0% 80%, 0% 20%)',
          }}
        >
          {/* Center core that pulses on hover */}
          {isHovered && (
            <motion.div
              animate={{
                scale: [1, 1.1, 1],
                opacity: [1, 0.8, 1],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
              }}
              className="absolute inset-0 border border-[#ea580c]/50"
              style={{
                clipPath: 'polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)',
              }}
            />
          )}
        </motion.div>
      </div>
    </motion.div>
  )
}
