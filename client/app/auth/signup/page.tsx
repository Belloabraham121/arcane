'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowRight, Eye, EyeOff, Check } from 'lucide-react'

const ease = [0.22, 1, 0.36, 1] as const

interface PasswordStrength {
  score: number
  label: string
  color: string
}

function getPasswordStrength(password: string): PasswordStrength {
  if (!password) return { score: 0, label: '', color: '' }
  let score = 0
  if (password.length >= 8) score++
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++
  if (/\d/.test(password)) score++
  if (/[^a-zA-Z\d]/.test(password)) score++
  
  const strengths: PasswordStrength[] = [
    { score: 0, label: '', color: '' },
    { score: 1, label: 'WEAK', color: '#ea580c' },
    { score: 2, label: 'FAIR', color: '#ea580c' },
    { score: 3, label: 'GOOD', color: '#22c55e' },
    { score: 4, label: 'STRONG', color: '#22c55e' },
  ]
  return strengths[score]
}

export default function SignUpPage() {
  const router = useRouter()
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [agreedToTerms, setAgreedToTerms] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const passwordStrength = getPasswordStrength(password)
  const passwordsMatch = password && confirmPassword === password
  const isValid = email && password && confirmPassword && agreedToTerms && passwordsMatch

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isValid) return
    setIsLoading(true)
    // Sign up logic would go here
    setTimeout(() => {
      setIsLoading(false)
      // Redirect to dashboard after successful sign up
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
                CREATE ACCOUNT
              </h1>
              <p className="text-xs lg:text-sm text-muted-foreground font-mono mt-2">
                Join the Arcane network and deploy your agents
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
                <label className="text-xs uppercase font-mono tracking-widest text-foreground">
                  Password
                </label>
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
                {password && (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                      <motion.div
                        className="h-full rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${(passwordStrength.score / 4) * 100}%` }}
                        style={{ backgroundColor: passwordStrength.color }}
                      />
                    </div>
                    <span
                      className="text-[10px] font-mono tracking-widest uppercase"
                      style={{ color: passwordStrength.color }}
                    >
                      {passwordStrength.label}
                    </span>
                  </div>
                )}
              </div>

              {/* Confirm Password Input */}
              <div className="space-y-2">
                <label className="text-xs uppercase font-mono tracking-widest text-foreground">
                  Confirm Password
                </label>
                <div className="relative">
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 bg-muted border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:border-foreground transition-colors font-mono text-sm"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={showConfirm ? 'Hide password' : 'Show password'}
                  >
                    {showConfirm ? (
                      <EyeOff size={16} strokeWidth={1.5} />
                    ) : (
                      <Eye size={16} strokeWidth={1.5} />
                    )}
                  </button>
                </div>
                {confirmPassword && (
                  <div className="flex items-center gap-2">
                    <motion.div
                      animate={{ scale: passwordsMatch ? 1 : 0.8 }}
                      className="flex-shrink-0"
                    >
                      {passwordsMatch ? (
                        <Check size={16} className="text-[#22c55e]" strokeWidth={2} />
                      ) : (
                        <div className="w-4 h-4 border border-[#ea580c] rounded-full" />
                      )}
                    </motion.div>
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {passwordsMatch ? 'Passwords match' : 'Passwords do not match'}
                    </span>
                  </div>
                )}
              </div>

              {/* Terms Checkbox */}
              <div className="space-y-3 pt-2">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={agreedToTerms}
                    onChange={(e) => setAgreedToTerms(e.target.checked)}
                    className="mt-1 w-4 h-4 accent-[#ea580c] cursor-pointer"
                  />
                  <span className="text-xs text-muted-foreground font-mono leading-relaxed">
                    I agree to the{' '}
                    <Link href="#" className="text-[#ea580c] hover:underline">
                      Terms of Service
                    </Link>{' '}
                    and{' '}
                    <Link href="#" className="text-[#ea580c] hover:underline">
                      Privacy Policy
                    </Link>
                  </span>
                </label>
              </div>

              {/* Submit Button */}
              <motion.button
                type="submit"
                disabled={!isValid || isLoading}
                whileHover={{ scale: isValid ? 1.02 : 1 }}
                whileTap={{ scale: isValid ? 0.98 : 1 }}
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
                    CREATING
                  </span>
                ) : (
                  <>
                    <span className="flex-1 py-2.5">CREATE ACCOUNT</span>
                    <span className="flex items-center justify-center w-10 h-10 bg-[#ea580c]">
                      <ArrowRight size={16} strokeWidth={2} className="text-background" />
                    </span>
                  </>
                )}
              </motion.button>
            </form>
          </div>

          {/* Sign In Link */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="mt-6 text-center"
          >
            <p className="text-xs text-muted-foreground font-mono mb-3">
              Already have an account?
            </p>
            <Link
              href="/auth/signin"
              className="inline-block px-4 py-2 border border-foreground text-foreground text-xs font-mono tracking-wider uppercase hover:bg-foreground hover:text-background transition-colors"
            >
              Sign In
            </Link>
          </motion.div>
        </motion.div>
      </main>
    </div>
  )
}
