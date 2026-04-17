/**
 * LoginPage.jsx – Stage 1: Password Authentication
 *
 * Enhancements in this version:
 *  1. Shows attempts remaining after each failure ("2 attempts remaining")
 *  2. On the SECOND failure (1 remaining) silently opens webcam to warm it up
 *  3. On the THIRD attempt the captured webcam frame is sent to the backend
 *     as `intruder_image` so the server can save it and email the alert
 *  4. Displays a live lockout countdown timer after the account is locked
 *  5. Camera is always released properly (no resource leaks)
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Shield, User, Lock, ArrowRight, AlertCircle,
  Eye, EyeOff, Clock, AlertTriangle,
} from 'lucide-react'
import { authAPI } from '../api/api'
import { useAuth } from '../context/AuthContext'
import { primeBrowserLocation, withBrowserLocation } from '../utils/securityCapture'
import PageTransition from '../components/PageTransition'

const MAX_ATTEMPTS = 3

export default function LoginPage() {
  const navigate                      = useNavigate()
  const { setSessionId, setLocation } = useAuth()

  const [form,           setForm]           = useState({ username: '', password: '' })
  const [error,          setError]          = useState('')
  const [loading,        setLoading]        = useState(false)
  const [showPw,         setShowPw]         = useState(false)
  const [attemptsLeft,   setAttemptsLeft]   = useState(MAX_ATTEMPTS)
  const [isLocked,       setIsLocked]       = useState(false)
  const [lockCountdown,  setLockCountdown]  = useState(0)
  const [camReady,       setCamReady]       = useState(false)   // webcam warming up

  // Refs for silent webcam capture
  const videoRef    = useRef(null)
  const streamRef   = useRef(null)
  const countdownId = useRef(null)
  const frameWaitId = useRef(null)

  const clearCountdown = useCallback(() => {
    if (countdownId.current) {
      clearInterval(countdownId.current)
      countdownId.current = null
    }
  }, [])

  const onChange = (e) => {
    const { name, value } = e.target
    const usernameChanged = name === 'username' && form.username !== value

    setForm((current) => ({ ...current, [name]: value }))
    setError('')

    if (usernameChanged) {
      clearCountdown()
      setAttemptsLeft(MAX_ATTEMPTS)
      setIsLocked(false)
      setLockCountdown(0)
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
        streamRef.current = null
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null
      }
      setCamReady(false)
    }
  }

  // ── Webcam helpers ────────────────────────────────────────────────────────

  const waitForVideoFrame = useCallback(() => new Promise((resolve) => {
    const startedAt = Date.now()

    const checkFrame = () => {
      const video = videoRef.current
      if (video && video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
        frameWaitId.current = null
        resolve(true)
        return
      }

      if (Date.now() - startedAt >= 1200) {
        frameWaitId.current = null
        resolve(false)
        return
      }

      frameWaitId.current = window.requestAnimationFrame(checkFrame)
    }

    checkFrame()
  }), [])

  /** Open the webcam silently (user won't see the feed). */
  const startWebcam = useCallback(async () => {
    if (streamRef.current) return    // already open
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamReady(false)
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 320 },
          height: { ideal: 240 },
          facingMode: 'user',
        },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => undefined)
      }
      const ready = await waitForVideoFrame()
      setCamReady(ready)
    } catch {
      // Webcam unavailable – non-fatal, request proceeds without image
      setCamReady(false)
    }
  }, [waitForVideoFrame])

  /** Stop and release the webcam. */
  const stopWebcam = useCallback(() => {
    if (frameWaitId.current) {
      window.cancelAnimationFrame(frameWaitId.current)
      frameWaitId.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) videoRef.current.srcObject = null
    setCamReady(false)
  }, [])

  /** Capture one JPEG frame as a base64 string. Returns null on failure. */
  const captureFrame = useCallback(() => {
    if (!videoRef.current || !streamRef.current) return null
    try {
      const canvas = document.createElement('canvas')
      canvas.width  = 320
      canvas.height = 240
      const context = canvas.getContext('2d')
      if (!context) return null
      context.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height)
      return canvas.toDataURL('image/jpeg', 0.85)
    } catch {
      return null
    }
  }, [])

  // Clean up webcam on unmount
  useEffect(() => {
    primeBrowserLocation()
    return () => {
      stopWebcam()
      clearCountdown()
    }
  }, [clearCountdown, stopWebcam])

  // ── Lockout countdown ─────────────────────────────────────────────────────

  const startCountdown = useCallback((seconds) => {
    clearCountdown()
    setLockCountdown(seconds)
    setIsLocked(true)
    countdownId.current = window.setInterval(() => {
      setLockCountdown(prev => {
        if (prev <= 1) {
          clearCountdown()
          setIsLocked(false)
          setAttemptsLeft(MAX_ATTEMPTS)
          setError('')
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }, [clearCountdown])

  // ── Submit handler ────────────────────────────────────────────────────────

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (isLocked) return
    setError('')
    setLoading(true)

    // On the last allowed attempt: capture webcam frame to send as intruder snapshot
    let intruderImage = null
    const isLastAttempt = attemptsLeft === 1
    if (isLastAttempt) {
      if (!camReady) await startWebcam()
      const frameReady = await waitForVideoFrame()
      intruderImage = frameReady ? captureFrame() : null
    }

    try {
      const payload = await withBrowserLocation({ ...form })
      if (intruderImage) payload.intruder_image = intruderImage

      const res = await authAPI.login(payload)

      // ── Success ────────────────────────────────────────────────────────────
      clearCountdown()
      stopWebcam()
      setSessionId(res.data.session_id)
      if (res.data.location) setLocation(res.data.location)
      navigate('/face-scan')

    } catch (err) {
      const status  = err.response?.status
      const detail  = err.response?.data?.detail || 'Login failed. Please try again.'

      if (status === 429) {
        // Account locked – extract seconds from message if present
        const match = detail.match(/(\d+)\s*second/)
        const secs  = match ? parseInt(match[1], 10) : 30
        stopWebcam()
        setAttemptsLeft(0)
        setError(detail)
        startCountdown(secs)
      } else {
        // Extract remaining attempts from message
        const match = detail.match(/(\d+)\s*attempt/)
        const left  = match ? parseInt(match[1], 10) : attemptsLeft - 1
        setAttemptsLeft(Math.max(0, left))
        setError(detail)

        // Warm up webcam when only ONE attempt remains (before the 3rd submit)
        if (left === 1) startWebcam()
      }
    } finally {
      setLoading(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const attemptBarColor = attemptsLeft === 3
    ? 'bg-green-500'
    : attemptsLeft === 2
      ? 'bg-yellow-500'
      : 'bg-red-500'

  return (
    <div className="auth-page">
      <video
        ref={videoRef}
        muted
        playsInline
        className="sr-capture-video"
      />

      <PageTransition className="auth-card relative z-10">
        <div className="flex flex-col items-center mb-8">
          <motion.div
            animate={{ rotate: [0, 5, -5, 0] }}
            transition={{ duration: 3, repeat: Infinity, repeatDelay: 4 }}
            className="p-4 rounded-2xl bg-vault-accent/10 mb-4 glow-accent"
          >
            <Shield className="w-10 h-10 text-vault-accent" />
          </motion.div>
          <h1 className="text-2xl font-semibold gradient-text">SecureVault</h1>
          <p className="text-vault-muted text-sm mt-1">Multi-Factor Authentication</p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-7">
          {['Password', 'Face', 'OTP'].map((step, i) => (
            <div key={step} className="flex items-center gap-2 flex-1">
              <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold
                ${i === 0 ? 'bg-vault-accent text-white' : 'bg-vault-border text-vault-muted'}`}>
                {i + 1}
              </div>
              <span className={`text-xs ${i === 0 ? 'text-vault-accent' : 'text-vault-muted'}`}>{step}</span>
              {i < 2 && <div className="flex-1 h-px bg-vault-border" />}
            </div>
          ))}
        </div>

        {/* ── Lockout Banner ──────────────────────────────────────────────── */}
        <AnimatePresence>
          {isLocked && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="flex items-center gap-3 p-4 mb-5 rounded-xl
                         bg-red-500/10 border border-red-500/40 text-red-400"
            >
              <AlertTriangle className="w-5 h-5 shrink-0 animate-pulse" />
              <div className="text-sm">
                <div className="font-semibold">Account Locked</div>
                <div className="text-xs opacity-80 mt-0.5">
                  Try again in{' '}
                  <span className="font-semibold text-red-300">{lockCountdown}s</span>
                  {' '}· Security alert sent to registered email
                </div>
              </div>
              {/* Countdown arc */}
              <div className="ml-auto flex items-center justify-center w-10 h-10">
                <Clock className="spin-slow w-5 h-5 text-red-400" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Username */}
          <div>
            <label className="vault-label">Username</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-vault-muted" />
              <input
                name="username" value={form.username} onChange={onChange}
                placeholder="Enter your username"
                className="vault-input pl-10" required autoFocus
                disabled={isLocked}
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label className="vault-label">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-vault-muted" />
              <input
                name="password" value={form.password} onChange={onChange}
                type={showPw ? 'text' : 'password'}
                placeholder="Enter your password"
                className="vault-input pl-10 pr-10" required
                disabled={isLocked}
              />
              <button type="button" onClick={() => setShowPw(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-vault-muted hover:text-vault-text"
                disabled={isLocked}>
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* ── Attempt meter (shown after first failure) ────────────────── */}
          <AnimatePresence>
            {attemptsLeft < MAX_ATTEMPTS && !isLocked && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-vault-muted">Login attempts</span>
                  <span className={attemptsLeft === 1 ? 'text-red-400 font-semibold' : 'text-yellow-400'}>
                    {attemptsLeft} attempt{attemptsLeft !== 1 ? 's' : ''} remaining
                  </span>
                </div>
                <div className="h-1.5 bg-vault-border rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: '100%' }}
                    animate={{ width: `${(attemptsLeft / MAX_ATTEMPTS) * 100}%` }}
                    transition={{ duration: 0.4 }}
                    className={`h-full rounded-full ${attemptBarColor}`}
                  />
                </div>
                {attemptsLeft === 1 && (
                  <p className="text-xs text-red-400 mt-1.5">
                    ⚠️ Last attempt. Your camera will be activated for security verification.
                  </p>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error message */}
          {error && !isLocked && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 p-3 rounded-xl
                         bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </motion.div>
          )}

          {/* Submit */}
          <motion.button
            whileTap={{ scale: isLocked ? 1 : 0.97 }}
            type="submit" disabled={loading || isLocked}
            className={`btn-primary flex items-center justify-center gap-2 mt-2
              ${isLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {loading ? (
              <motion.div animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}
                className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full" />
            ) : isLocked ? (
              <><Clock className="w-4 h-4" /><span>Locked ({lockCountdown}s)</span></>
            ) : (
              <><span>Continue</span><ArrowRight className="w-4 h-4" /></>
            )}
          </motion.button>
        </form>

        {/* Links */}
        <div className="mt-6 flex flex-col items-center gap-2 text-sm">
          <Link to="/forgot-password"
            className="text-vault-muted hover:text-vault-accent transition-colors">
            Forgot password?
          </Link>
          <span className="text-vault-muted">
            No account?{' '}
            <Link to="/register" className="text-vault-accent hover:underline font-medium">
              Create one
            </Link>
          </span>
        </div>
      </PageTransition>
    </div>
  )
}
