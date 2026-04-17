import { useState, useEffect } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Lock, CheckCircle, AlertCircle, Eye, EyeOff, KeyRound, Loader } from 'lucide-react'
import { authAPI } from '../api/api'
import PageTransition from '../components/PageTransition'

export default function ResetPasswordPage() {
  const [params]              = useSearchParams()
  const navigate              = useNavigate()
  const token                 = params.get('token') || ''

  const [tokenState, setTokenState] = useState('validating')   // validating | valid | invalid
  const [username,   setUsername]   = useState('')
  const [form,       setForm]       = useState({ password: '', confirm: '' })
  const [showPw,     setShowPw]     = useState(false)
  const [error,      setError]      = useState('')
  const [success,    setSuccess]    = useState(false)
  const [loading,    setLoading]    = useState(false)

  useEffect(() => {
    if (!token) { setTokenState('invalid'); return }
    authAPI.validateResetToken(token)
      .then(res => { setTokenState('valid'); setUsername(res.data.username) })
      .catch(() => setTokenState('invalid'))
  }, [token])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (form.password !== form.confirm) { setError('Passwords do not match.'); return }
    if (form.password.length < 8)       { setError('Password must be at least 8 characters.'); return }

    const strength = [/[A-Z]/, /[a-z]/, /\d/, /[^A-Za-z0-9]/]
      .filter(r => r.test(form.password)).length
    if (strength < 2) {
      setError('Use a mix of uppercase, lowercase, numbers, and symbols.')
      return
    }

    setLoading(true)
    try {
      await authAPI.resetPassword({ token, new_password: form.password })
      setSuccess(true)
      setTimeout(() => navigate('/login'), 3000)
    } catch (err) {
      setError(err.response?.data?.detail || 'Reset failed. The link may have expired.')
    } finally {
      setLoading(false)
    }
  }

  // Password strength indicator
  const strengthChecks = [
    { label: 'Min. 8 characters',    ok: form.password.length >= 8 },
    { label: 'Uppercase letter',     ok: /[A-Z]/.test(form.password) },
    { label: 'Number',               ok: /\d/.test(form.password)    },
    { label: 'Special character',    ok: /[^A-Za-z0-9]/.test(form.password) },
  ]
  const strengthScore = strengthChecks.filter(c => c.ok).length

  return (
    <div className="auth-page">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-80 h-80
                        bg-vault-accent/5 rounded-full blur-3xl" />
      </div>

      <PageTransition className="auth-card relative z-10">
        {/* Validating */}
        {tokenState === 'validating' && (
          <div className="flex flex-col items-center py-10 gap-4">
            <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.9, ease: 'linear' }}>
              <Loader className="w-10 h-10 text-vault-accent" />
            </motion.div>
            <p className="text-vault-muted text-sm">Validating your reset link…</p>
          </div>
        )}

        {/* Invalid token */}
        {tokenState === 'invalid' && (
          <div className="flex flex-col items-center py-8 text-center gap-4">
            <div className="p-4 rounded-full bg-red-500/10">
              <AlertCircle className="w-10 h-10 text-red-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold mb-2">Invalid or Expired Link</h2>
              <p className="text-vault-muted text-sm mb-6">
                This password reset link is invalid or has expired.
                Reset links are valid for 10 minutes.
              </p>
            </div>
            <div className="flex flex-col gap-2 w-full">
              <Link to="/forgot-password"
                className="btn-primary text-center py-3 text-sm no-underline">
                Request New Reset Link
              </Link>
              <Link to="/login" className="btn-ghost text-center py-3 text-sm no-underline">
                Back to Login
              </Link>
            </div>
          </div>
        )}

        {/* Valid token – form */}
        {tokenState === 'valid' && !success && (
          <>
            <div className="flex items-center gap-3 mb-7">
              <div className="p-2.5 rounded-xl bg-vault-accent/10">
                <KeyRound className="w-6 h-6 text-vault-accent" />
              </div>
              <div>
                <h1 className="text-xl font-semibold">Reset Password</h1>
                <p className="text-sm text-vault-muted">
                  Setting new password for{' '}
                  <span className="text-vault-accent font-medium">{username}</span>
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* New password */}
              <div>
                <label className="vault-label">New Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-vault-muted" />
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    placeholder="Min. 8 characters" className="vault-input pl-10 pr-10" required
                  />
                  <button type="button" onClick={() => setShowPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-vault-muted hover:text-vault-text">
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {/* Strength meter */}
                {form.password && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                    className="mt-3 space-y-1.5">
                    <div className="flex gap-1">
                      {[1, 2, 3, 4].map(i => (
                        <div key={i} className={`h-1 flex-1 rounded-full transition-all duration-300
                          ${strengthScore >= i
                            ? strengthScore <= 1 ? 'bg-red-500'
                              : strengthScore <= 2 ? 'bg-yellow-500'
                              : strengthScore <= 3 ? 'bg-blue-500'
                              : 'bg-green-500'
                            : 'bg-vault-border'}`} />
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      {strengthChecks.map(c => (
                        <div key={c.label} className={`flex items-center gap-1.5 text-xs
                          ${c.ok ? 'text-green-400' : 'text-vault-muted'}`}>
                          <div className={`w-1.5 h-1.5 rounded-full ${c.ok ? 'bg-green-400' : 'bg-vault-border'}`} />
                          {c.label}
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </div>

              {/* Confirm */}
              <div>
                <label className="vault-label">Confirm Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-vault-muted" />
                  <input
                    type="password"
                    value={form.confirm}
                    onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))}
                    placeholder="Repeat new password" className="vault-input pl-10" required
                  />
                  {form.confirm && form.password === form.confirm && (
                    <CheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-green-400" />
                  )}
                </div>
              </div>

              {error && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10
                             border border-red-500/30 text-red-400 text-sm">
                  <AlertCircle className="w-4 h-4 shrink-0" />{error}
                </motion.div>
              )}

              <motion.button whileTap={{ scale: 0.97 }} type="submit" disabled={loading}
                className="btn-primary flex items-center justify-center gap-2">
                {loading
                  ? <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}
                      className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full" />
                  : <><Lock className="w-4 h-4" /> Set New Password</>}
              </motion.button>
            </form>
          </>
        )}

        {/* Success state */}
        {success && (
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="text-center py-8">
            <div className="inline-flex p-4 rounded-full bg-green-500/10 mb-4">
              <CheckCircle className="w-10 h-10 text-green-400" />
            </div>
            <h2 className="text-lg font-semibold mb-2">Password Updated!</h2>
            <p className="text-vault-muted text-sm mb-2">
              Your password has been changed successfully.
            </p>
            <p className="text-xs text-vault-muted">Redirecting to login in 3 seconds…</p>
          </motion.div>
        )}
      </PageTransition>
    </div>
  )
}
