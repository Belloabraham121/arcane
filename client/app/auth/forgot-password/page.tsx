'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowRight, ArrowLeft, CheckCircle } from 'lucide-react'

const ease = [0.22, 1, 0.36, 1] as const

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    // Password reset logic would go here
    setTimeout(() => {
      setIsSubmitted(true)
      setIsLoading(false)
    }, 1000)
  }

  return (
    <div className="min-h-screen dot-grid-bg flex flex-col">
      {/* Header */}
      <header className="relative z-10 w-full border-b border-border">
        <div className="flex items-center justify-between px-12 py-4 lg:px-24">
          <Link href="/" className="flex items-center gap-3">
            <div className="text-xs font-mono tracking-[0.15em] uppercase font-bold">
              ARCANE
            </div>
          </Link>
          <Link
            href="/"
            className="text-xs font-mono tracking-[0.1em] uppercase text-muted-foreground hover:text-foreground transition-colors"
          >
            Back to Home
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center px-6 py-12 lg:px-24">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease }}
          className="w-full max-w-md"
        >
          {!isSubmitted ? (
            <>
              {/* Form Container */}
              <div className="border border-border bg-background/50 backdrop-blur">
                <div className="border-b border-border px-6 py-4 lg:px-8 lg:py-5">
                  <h1 className="text-2xl lg:text-3xl font-pixel font-bold tracking-tight uppercase">
                    RESET PASSWORD
                  </h1>
                  <p className="text-xs lg:text-sm text-muted-foreground font-mono mt-2">
                    Enter your email to receive a reset link
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="px-6 py-6 lg:px-8 lg:py-8 space-y-5">
                  {/* Email Input */}
                  <div className="space-y-2">
                    <label className="text-xs uppercase font-mono tracking-widest text-foreground block">
                      Email Address
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="agent@arcane.dev"
                      className="w-full px-3 py-2 bg-muted border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:border-foreground transition-colors font-mono text-sm"
                      required
                    />
                    <p className="text-[10px] text-muted-foreground font-mono">
                      We&apos;ll send a secure reset link to this email.
                    </p>
                  </div>

                  {/* Submit Button */}
                  <motion.button
                    type="submit"
                    disabled={isLoading}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="w-full group flex items-center justify-center gap-0 bg-foreground text-background text-sm font-mono tracking-wider uppercase disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isLoading ? (
                      <span className="flex items-center gap-2">
                        <motion.span
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        >
                          ◆
                        </motion.span>
                        SENDING
                      </span>
                    ) : (
                      <>
                        <span className="flex-1 py-2.5">SEND RESET LINK</span>
                        <span className="flex items-center justify-center w-10 h-10 bg-[#ea580c]">
                          <ArrowRight size={16} strokeWidth={2} className="text-background" />
                        </span>
                      </>
                    )}
                  </motion.button>
                </form>
              </div>

              {/* Back to Sign In Link */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2, duration: 0.5 }}
                className="mt-6 flex items-center justify-center"
              >
                <Link
                  href="/auth/signin"
                  className="flex items-center gap-2 text-xs font-mono tracking-widest text-muted-foreground hover:text-foreground transition-colors uppercase"
                >
                  <ArrowLeft size={14} strokeWidth={1.5} />
                  Back to Sign In
                </Link>
              </motion.div>
            </>
          ) : (
            <>
              {/* Success State */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, ease }}
                className="border border-border bg-background/50 backdrop-blur p-6 lg:p-8 text-center space-y-6"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, duration: 0.4 }}
                  className="flex justify-center"
                >
                  <CheckCircle
                    size={64}
                    strokeWidth={1}
                    className="text-[#ea580c]"
                  />
                </motion.div>

                <div className="space-y-3">
                  <h2 className="text-xl lg:text-2xl font-pixel font-bold tracking-tight uppercase">
                    CHECK YOUR EMAIL
                  </h2>
                  <p className="text-xs lg:text-sm text-muted-foreground font-mono leading-relaxed">
                    We&apos;ve sent a password reset link to:
                  </p>
                  <p className="text-sm font-mono text-foreground break-all">
                    {email}
                  </p>
                  <p className="text-xs lg:text-sm text-muted-foreground font-mono leading-relaxed pt-2">
                    The link will expire in 1 hour. Check your spam folder if you don&apos;t see it.
                  </p>
                </div>

                {/* Action Buttons */}
                <div className="space-y-3 pt-4">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setIsSubmitted(false)}
                    className="w-full px-4 py-2 border border-foreground text-foreground text-xs font-mono tracking-wider uppercase hover:bg-foreground hover:text-background transition-colors"
                  >
                    TRY ANOTHER EMAIL
                  </motion.button>
                  <Link
                    href="/auth/signin"
                    className="block px-4 py-2 bg-foreground text-background text-xs font-mono tracking-wider uppercase text-center hover:bg-muted transition-colors"
                  >
                    BACK TO SIGN IN
                  </Link>
                </div>
              </motion.div>
            </>
          )}
        </motion.div>
      </main>
    </div>
  )
}
