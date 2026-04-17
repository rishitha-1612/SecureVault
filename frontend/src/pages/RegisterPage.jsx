import { useState, useRef, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import Webcam from 'react-webcam'
import {
  Shield, User, Mail, Lock, Camera,
  CheckCircle, AlertCircle, ArrowLeft, Eye, EyeOff
} from 'lucide-react'
import { authAPI } from '../api/api'
import PageTransition from '../components/PageTransition'

export default function RegisterPage() {
  const navigate  = useNavigate()
  const webcamRef = useRef(null)

  const [form, setForm] = useState({
    username: '', email: '', password: '', confirm: ''
  })
  const [faceImage, setFaceImage]   = useState(null)   // base64
  const [showCam,   setShowCam]     = useState(false)
  const [camReady,  setCamReady]    = useState(false)
  const [error,     setError]       = useState('')
  const [success,   setSuccess]     = useState('')
  const [loading,   setLoading]     = useState(false)
  const [showPw,    setShowPw]      = useState(false)

  const onChange = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }))

  const captureface = useCallback(() => {
    const img = webcamRef.current?.getScreenshot()
    if (img) { setFaceImage(img); setShowCam(false) }
  }, [webcamRef])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (form.password !== form.confirm) { setError('Passwords do not match.'); return }
    if (form.password.length < 8)       { setError('Password must be at least 8 characters.'); return }
    if (!faceImage)                      { setError('Please capture your face for registration.'); return }

    setLoading(true)
    try {
      await authAPI.register({
        username:   form.username,
        email:      form.email,
        password:   form.password,
        face_image: faceImage,
      })
      setSuccess('Account created! Redirecting to login…')
      setTimeout(() => navigate('/login'), 1800)
    } catch (err) {
      setError(err.response?.data?.detail || 'Registration failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-96 h-96
                        bg-vault-accent2/5 rounded-full blur-3xl" />
      </div>

      <PageTransition className="auth-card relative z-10 max-w-lg w-full">
        <div className="flex items-center gap-3 mb-7">
          <Link to="/login" className="p-2 rounded-lg hover:bg-vault-card transition">
            <ArrowLeft className="w-5 h-5 text-vault-muted" />
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-vault-text">Create Account</h1>
            <p className="text-sm text-vault-muted">Set up your secure vault</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Username */}
          <div>
            <label className="vault-label">Username</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-vault-muted" />
              <input name="username" value={form.username} onChange={onChange}
                placeholder="Choose a username" className="vault-input pl-10" required />
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="vault-label">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-vault-muted" />
              <input name="email" type="email" value={form.email} onChange={onChange}
                placeholder="your@email.com" className="vault-input pl-10" required />
            </div>
          </div>

          {/* Password */}
          <div>
            <label className="vault-label">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-vault-muted" />
              <input name="password" type={showPw ? 'text' : 'password'} value={form.password}
                onChange={onChange} placeholder="Min. 8 characters" className="vault-input pl-10 pr-10" required />
              <button type="button" onClick={() => setShowPw(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-vault-muted hover:text-vault-text">
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Confirm */}
          <div>
            <label className="vault-label">Confirm Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-vault-muted" />
              <input name="confirm" type="password" value={form.confirm} onChange={onChange}
                placeholder="Repeat password" className="vault-input pl-10" required />
            </div>
          </div>

          {/* Face capture section */}
          <div className="rounded-xl border border-vault-border bg-vault-panel p-4">
            <label className="vault-label mb-2">Face Recognition</label>

            {faceImage ? (
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-xl overflow-hidden border-2 border-green-500/50">
                  <img src={faceImage} alt="face" className="w-full h-full object-cover" />
                </div>
                <div className="flex-1">
                  <div className="badge-success mb-1"><CheckCircle className="w-3 h-3" /> Face captured</div>
                  <button type="button" onClick={() => setShowCam(true)}
                    className="text-xs text-vault-muted hover:text-vault-accent transition">
                    Retake photo
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setShowCam(true)}
                className="btn-ghost flex items-center justify-center gap-2 text-sm py-2.5">
                <Camera className="w-4 h-4" />
                Capture Face Photo
              </button>
            )}
          </div>

          {/* Webcam modal */}
          <AnimatePresence>
            {showCam && (
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
              >
                <motion.div
                  initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
                  className="bg-vault-card rounded-2xl p-6 w-full max-w-sm border border-vault-border"
                >
                  <h3 className="text-lg font-semibold mb-4 text-center">Position Your Face</h3>
                  <div className="relative rounded-xl overflow-hidden bg-black aspect-video mb-4">
                    <Webcam
                      ref={webcamRef} audio={false} screenshotFormat="image/jpeg"
                      videoConstraints={{ facingMode: 'user' }}
                      onUserMedia={() => setCamReady(true)}
                      className="w-full h-full object-cover"
                    />
                    {/* Face guide overlay */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-32 h-40 rounded-full border-2 border-vault-accent/60 border-dashed" />
                    </div>
                    <div className="scan-line" />
                  </div>
                  <div className="flex gap-3">
                    <button type="button" onClick={() => setShowCam(false)}
                      className="btn-ghost py-2.5 text-sm">Cancel</button>
                    <button type="button" onClick={captureface} disabled={!camReady}
                      className="btn-primary py-2.5 text-sm flex items-center justify-center gap-2">
                      <Camera className="w-4 h-4" /> Capture
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Feedback */}
          {error && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />{error}
            </motion.div>
          )}
          {success && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="flex items-center gap-2 p-3 rounded-xl bg-green-500/10 border border-green-500/30 text-green-400 text-sm">
              <CheckCircle className="w-4 h-4 shrink-0" />{success}
            </motion.div>
          )}

          <motion.button whileTap={{ scale: 0.97 }} type="submit" disabled={loading}
            className="btn-primary flex items-center justify-center gap-2 mt-2">
            {loading
              ? <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}
                  className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full" />
              : 'Create Account'}
          </motion.button>
        </form>

        <p className="text-center text-sm text-vault-muted mt-5">
          Already have an account?{' '}
          <Link to="/login" className="text-vault-accent hover:underline">Sign in</Link>
        </p>
      </PageTransition>
    </div>
  )
}
