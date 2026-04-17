import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Mail, ArrowLeft, CheckCircle, AlertCircle, Send } from 'lucide-react'
import { authAPI } from '../api/api'
import PageTransition from '../components/PageTransition'

export default function ForgotPasswordPage() {
  const [email,   setEmail]   = useState('')
  const [sent,    setSent]    = useState(false)
  const [error,   setError]   = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await authAPI.forgotPassword({ email })
      setSent(true)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-80 h-80
                        bg-yellow-500/5 rounded-full blur-3xl" />
      </div>

      <PageTransition className="auth-card relative z-10">
        <div className="flex items-center gap-3 mb-8">
          <Link to="/login" className="p-2 rounded-lg hover:bg-vault-card transition">
            <ArrowLeft className="w-5 h-5 text-vault-muted" />
          </Link>
          <div>
            <h1 className="text-xl font-semibold">Forgot Password</h1>
            <p className="text-sm text-vault-muted">We'll send a reset link to your email</p>
          </div>
        </div>

        {sent ? (
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="text-center py-6">
            <div className="inline-flex p-4 rounded-full bg-green-500/10 mb-4">
              <CheckCircle className="w-10 h-10 text-green-400" />
            </div>
            <h2 className="text-lg font-semibold mb-2">Check Your Email</h2>
            <p className="text-vault-muted text-sm mb-6">
              If <strong className="text-vault-text">{email}</strong> is registered,
              you'll receive a password reset link shortly.
            </p>
            <p className="text-xs text-vault-muted mb-6">
              The link expires in <strong>10 minutes</strong>.
              Check your spam folder if you don't see it.
            </p>
            <Link to="/login"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl
                         bg-vault-accent/10 border border-vault-accent/30
                         text-vault-accent hover:bg-vault-accent/20 transition text-sm font-medium">
              Back to Login
            </Link>
          </motion.div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="vault-label">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-vault-muted" />
                <input
                  type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="Enter your registered email"
                  className="vault-input pl-10" required autoFocus
                />
              </div>
            </div>

            {error && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                <AlertCircle className="w-4 h-4" />{error}
              </motion.div>
            )}

            <motion.button whileTap={{ scale: 0.97 }} type="submit" disabled={loading}
              className="btn-primary flex items-center justify-center gap-2">
              {loading
                ? <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}
                    className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full" />
                : <><Send className="w-4 h-4" /> Send Reset Link</>}
            </motion.button>
          </form>
        )}
      </PageTransition>
    </div>
  )
}
