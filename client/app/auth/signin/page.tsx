'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowRight, Eye, EyeOff } from 'lucide-react'

const ease = [0.22, 1, 0.36, 1] as const

export default function SignInPage() {
  const router = useRouter()
  const [showPassword, setShowPassword] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    // Authentication logic would go here
    setTimeout(() => {
      setIsLoading(false)
      // Redirect to dashboard after successful sign in
      router.push('/dashboard')
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
          {/* Form Container */}
          <div className="border border-border bg-background/50 backdrop-blur">
            <div className="border-b border-border px-6 py-4 lg:px-8 lg:py-5">
              <h1 className="text-2xl lg:text-3xl font-pixel font-bold tracking-tight uppercase">
                SIGN IN
              </h1>
              <p className="text-xs lg:text-sm text-muted-foreground font-mono mt-2">
                Enter your credentials to access your account
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
              </div>

              {/* Password Input */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs uppercase font-mono tracking-widest text-foreground">
                    Password
                  </label>
                  <Link
                    href="/auth/forgot-password"
                    className="text-xs uppercase font-mono tracking-widest text-[#ea580c] hover:text-[#ff7a2a] transition-colors"
                  >
                    Forgot?
                  </Link>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 bg-muted border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:border-foreground transition-colors font-mono text-sm"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <EyeOff size={16} strokeWidth={1.5} />
                    ) : (
                      <Eye size={16} strokeWidth={1.5} />
                    )}
                  </button>
                </div>
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
                    SIGNING IN
                  </span>
                ) : (
                  <>
                    <span className="flex-1 py-2.5">SIGN IN</span>
                    <span className="flex items-center justify-center w-10 h-10 bg-[#ea580c]">
                      <ArrowRight size={16} strokeWidth={2} className="text-background" />
                    </span>
                  </>
                )}
              </motion.button>

              {/* Divider */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="px-2 bg-background text-muted-foreground font-mono">OR</span>
                </div>
              </div>

              {/* Sign Up Link */}
              <div className="text-center">
                <p className="text-xs text-muted-foreground font-mono mb-3">
                  Don&apos;t have an account?
                </p>
                <Link
                  href="/auth/signup"
                  className="inline-block px-4 py-2 border border-foreground text-foreground text-xs font-mono tracking-wider uppercase hover:bg-foreground hover:text-background transition-colors"
                >
                  Create Account
                </Link>
              </div>
            </form>
          </div>

          {/* Security Info */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="mt-6 p-4 border border-border/50 bg-background/30"
          >
            <p className="text-[10px] text-muted-foreground font-mono tracking-widest uppercase mb-2">
              SECURITY NOTE
            </p>
            <p className="text-xs text-muted-foreground font-mono leading-relaxed">
              Your credentials are encrypted end-to-end. Arcane never stores plaintext passwords.
            </p>
          </motion.div>
        </motion.div>
      </main>
    </div>
  )
}
