import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Mail, CheckCircle, AlertCircle, RotateCw } from 'lucide-react'
import { authAPI } from '../api/api'
import { useAuth } from '../context/AuthContext'
import PageTransition from '../components/PageTransition'

export default function OTPPage() {
  const navigate              = useNavigate()
  const { sessionId, saveLogin } = useAuth()

  const [digits,  setDigits]  = useState(['', '', '', '', '', ''])
  const [error,   setError]   = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const [resendCd, setResendCd] = useState(0)
  const inputs                = useRef([])
  const redirectTimeoutRef    = useRef(null)

  useEffect(() => {
    if (!sessionId) navigate('/login')
  }, [sessionId, navigate])

  useEffect(() => () => {
    if (redirectTimeoutRef.current) {
      clearTimeout(redirectTimeoutRef.current)
    }
  }, [])

  // Resend cooldown timer
  useEffect(() => {
    if (resendCd <= 0) return
    const t = setTimeout(() => setResendCd(v => v - 1), 1000)
    return () => clearTimeout(t)
  }, [resendCd])

  const focusNext = (i) => inputs.current[i + 1]?.focus()
  const focusPrev = (i) => inputs.current[i - 1]?.focus()

  const handleChange = (i, val) => {
    if (!/^\d?$/.test(val)) return
    const next = [...digits]
    next[i] = val
    setDigits(next)
    if (val) focusNext(i)
    setError('')
  }

  const handleKeyDown = (i, e) => {
    if (e.key === 'Backspace' && !digits[i]) focusPrev(i)
    if (e.key === 'ArrowLeft')  focusPrev(i)
    if (e.key === 'ArrowRight') focusNext(i)
    if (e.key === 'Enter') {
      e.preventDefault()
      submit()
    }
  }

  const handlePaste = (e) => {
    e.preventDefault()
    const paste = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (paste.length === 6) {
      setDigits(paste.split(''))
      inputs.current[5]?.focus()
    }
  }

  const submit = async () => {
    const otp = digits.join('')
    if (otp.length < 6) { setError('Enter the complete 6-digit OTP.'); return }

    setLoading(true)
    setError('')
    try {
      const res = await authAPI.verifyOtp({ session_id: sessionId, otp })
      setSuccess(true)
      saveLogin(res.data)
      redirectTimeoutRef.current = setTimeout(() => navigate('/dashboard'), 1200)
    } catch (err) {
      setError(err.response?.data?.detail || 'Invalid or expired OTP.')
      setDigits(['', '', '', '', '', ''])
      inputs.current[0]?.focus()
    } finally {
      setLoading(false)
    }
  }

  const resend = async () => {
    if (resendCd > 0) return
    try {
      await authAPI.resendOtp({ session_id: sessionId })
      setResendCd(60)
      setError('')
    } catch {
      setError('Failed to resend OTP.')
    }
  }

  return (
    <div className="auth-page">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-72 h-72
                        bg-green-500/5 rounded-full blur-3xl" />
      </div>

      <PageTransition className="auth-card relative z-10 text-center">
        {/* Icon */}
        <motion.div
          animate={success ? { scale: [1, 1.2, 1] } : {}}
          className="inline-flex p-4 rounded-2xl bg-vault-accent/10 mb-4 glow-accent"
        >
          {success
            ? <CheckCircle className="w-10 h-10 text-green-400" />
            : <Mail className="w-10 h-10 text-vault-accent" />}
        </motion.div>

        <h1 className="mb-1 text-xl font-semibold">Email Verification</h1>
        <p className="text-sm text-vault-muted mb-2">Step 3 of 3</p>
        <p className="text-sm text-vault-muted mb-6">
          Enter the 6-digit code sent to your registered email address
        </p>

        {/* Step dots */}
        <div className="flex justify-center gap-2 mb-7">
          {[0, 1, 2].map(i => (
            <div key={i} className={`h-1.5 rounded-full transition-all duration-300
              ${i <= 2 ? 'w-8 bg-vault-accent' : 'w-4 bg-vault-border'}`} />
          ))}
        </div>

        {/* OTP Input Grid */}
        <div className="flex justify-center gap-2 mb-6" onPaste={handlePaste}>
          {digits.map((d, i) => (
            <motion.input
              key={i}
              ref={el => inputs.current[i] = el}
              value={d}
              onChange={e => handleChange(i, e.target.value)}
              onKeyDown={e => handleKeyDown(i, e)}
              maxLength={1}
              inputMode="numeric"
              className={`otp-digit ${d ? 'border-vault-accent' : ''} ${success ? 'border-green-500' : ''}`}
              animate={error ? { x: [0, -4, 4, -4, 4, 0] } : {}}
              transition={{ duration: 0.3 }}
              autoFocus={i === 0}
            />
          ))}
        </div>

        {/* Error */}
        {error && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-center gap-2 p-3 rounded-xl
                       bg-red-500/10 border border-red-500/30 text-red-400 text-sm mb-4">
            <AlertCircle className="w-4 h-4" />{error}
          </motion.div>
        )}

        {/* Success */}
        {success && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="flex items-center justify-center gap-2 p-3 rounded-xl
                       bg-green-500/10 border border-green-500/30 text-green-400 text-sm mb-4">
            <CheckCircle className="w-4 h-4" />Authentication complete! Entering vault…
          </motion.div>
        )}

        {/* Verify button */}
        <motion.button type="button" whileTap={{ scale: 0.97 }} onClick={submit}
          disabled={loading || success}
          className="btn-primary flex items-center justify-center gap-2 mb-4">
          {loading
            ? <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}
                className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full" />
            : 'Verify Code'}
        </motion.button>

        {/* Resend */}
        <button type="button" onClick={resend} disabled={resendCd > 0}
          className="flex items-center justify-center gap-1.5 text-sm text-vault-muted
                     hover:text-vault-accent transition-colors disabled:opacity-50 mx-auto">
          <RotateCw className="w-4 h-4" />
          {resendCd > 0 ? `Resend in ${resendCd}s` : 'Resend OTP'}
        </button>
      </PageTransition>
    </div>
  )
}
