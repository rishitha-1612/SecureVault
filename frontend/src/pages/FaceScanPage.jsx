import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import Webcam from 'react-webcam'
import { AlertCircle, Camera, CheckCircle, ScanFace } from 'lucide-react'
import { authAPI } from '../api/api'
import { useAuth } from '../context/AuthContext'
import { primeBrowserLocation, withBrowserLocation } from '../utils/securityCapture'
import PageTransition from '../components/PageTransition'

export default function FaceScanPage() {
  const navigate = useNavigate()
  const { sessionId, setLocation } = useAuth()
  const webcamRef = useRef(null)
  const hasScannedRef = useRef(false)
  const redirectIntervalRef = useRef(null)
  const scanTimeoutRef = useRef(null)

  const [status, setStatus] = useState('idle')
  const [message, setMessage] = useState('')
  const [camReady, setCamReady] = useState(false)
  const [countdown, setCountdown] = useState(null)
  const [cameraEnabled, setCameraEnabled] = useState(false)

  useEffect(() => {
    if (!sessionId) {
      navigate('/login', { replace: true })
    }
  }, [navigate, sessionId])

  useEffect(() => {
    primeBrowserLocation()

    return () => {
      if (scanTimeoutRef.current) {
        window.clearTimeout(scanTimeoutRef.current)
      }
      if (redirectIntervalRef.current) {
        window.clearInterval(redirectIntervalRef.current)
      }
    }
  }, [])

  const scan = useCallback(async () => {
    if (!sessionId || hasScannedRef.current || status === 'scanning' || status === 'success') {
      return
    }

    const video = webcamRef.current?.video
    if (!video || video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
      setStatus('error')
      setMessage('Camera feed is not ready. Return to login and try again.')
      return
    }

    const screenshot = webcamRef.current?.getScreenshot()
    if (!screenshot) {
      setStatus('error')
      setMessage('Could not capture image. Return to login and try again.')
      return
    }

    hasScannedRef.current = true
    setStatus('scanning')
    setMessage('Analysing your face...')

    try {
      const payload = await withBrowserLocation({ session_id: sessionId, face_image: screenshot })
      const res = await authAPI.faceVerify(payload)

      if (res.data?.location) {
        setLocation(res.data.location)
      }

      setStatus('success')
      setMessage('Face verified! OTP sent to your email.')

      let nextCount = 3
      setCountdown(nextCount)

      if (redirectIntervalRef.current) {
        window.clearInterval(redirectIntervalRef.current)
      }

      redirectIntervalRef.current = window.setInterval(() => {
        nextCount -= 1
        setCountdown(nextCount)

        if (nextCount <= 0) {
          window.clearInterval(redirectIntervalRef.current)
          redirectIntervalRef.current = null
          navigate('/verify-otp', { replace: true })
        }
      }, 1000)
    } catch (err) {
      const detail = err.response?.data?.detail || 'Face scan failed. Please try again.'
      const blocked = err.response?.status === 403

      if (blocked) {
        console.log('Intruder detected')
      }

      hasScannedRef.current = false
      setStatus(blocked ? 'blocked' : 'error')
      setMessage(detail)
    }
  }, [navigate, sessionId, setLocation, status])

  const startCamera = useCallback(() => {
    hasScannedRef.current = false
    setCameraEnabled(true)
    setCamReady(false)
    setCountdown(null)
    setStatus('idle')
    setMessage('Center your face in the frame. Capturing in a moment...')
  }, [])

  useEffect(() => {
    if (sessionId) {
      startCamera()
    }
  }, [sessionId, startCamera])

  const handleUserMedia = useCallback(() => {
    setCamReady(true)
    console.log('Camera started')

    const video = webcamRef.current?.video
    if (!video) {
      return
    }

    if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
      scanTimeoutRef.current = window.setTimeout(() => {
        void scan()
      }, 900)
      return
    }

    const handleLoadedData = () => {
      scanTimeoutRef.current = window.setTimeout(() => {
        void scan()
      }, 900)
    }

    video.addEventListener('loadeddata', handleLoadedData, { once: true })
  }, [scan])

  const statusColor = {
    idle: 'border-vault-accent',
    scanning: 'border-yellow-500',
    success: 'border-green-500',
    error: 'border-red-500',
    blocked: 'border-red-500',
  }[status]

  return (
    <div className="auth-page">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-violet-500/5 blur-3xl" />
      </div>

      <PageTransition className="auth-card relative z-10 text-center">
        <motion.div
          animate={{ scale: status === 'scanning' ? [1, 1.05, 1] : 1 }}
          transition={{ repeat: status === 'scanning' ? Infinity : 0, duration: 1.5 }}
          className="inline-flex rounded-2xl bg-vault-accent/10 p-4 glow-accent mb-4"
        >
          <ScanFace className="h-10 w-10 text-vault-accent" />
        </motion.div>

        <h1 className="mb-1 text-xl font-semibold">Face Verification</h1>
        <p className="mb-6 text-sm text-vault-muted">Step 2 of 3 - Look directly at your camera</p>

        <div className="mb-6 flex justify-center gap-2">
          {[0, 1, 2].map((step) => (
            <div
              key={step}
              className={`h-1.5 rounded-full transition-all duration-300 ${step <= 1 ? 'w-8 bg-vault-accent' : 'w-4 bg-vault-border'}`}
            />
          ))}
        </div>

        <div className={`relative mx-auto mb-6 w-full max-w-xs overflow-hidden rounded-2xl border-2 bg-black aspect-cam transition-colors duration-500 ${statusColor}`}>
          {cameraEnabled && (
            <Webcam
              ref={webcamRef}
              audio={false}
              screenshotFormat="image/jpeg"
              screenshotQuality={0.95}
              videoConstraints={{
                facingMode: 'user',
                width: { ideal: 640 },
                height: { ideal: 480 },
              }}
              onUserMedia={handleUserMedia}
              onUserMediaError={() => {
                hasScannedRef.current = false
                setCamReady(false)
                setStatus('error')
                setMessage('Camera access denied. Allow camera access and sign in again.')
              }}
              className="h-full w-full object-cover"
            />
          )}

          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className={`h-44 w-36 rounded-full border-2 border-dashed opacity-60 transition-colors duration-500 ${statusColor}`} />
          </div>

          {status === 'scanning' && <div className="scan-line" />}

          {status === 'success' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 flex items-center justify-center bg-green-500/20">
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 300 }}>
                <CheckCircle className="h-16 w-16 text-green-400" />
              </motion.div>
            </motion.div>
          )}

          {(status === 'error' || status === 'blocked') && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 flex items-center justify-center bg-red-500/20">
              <AlertCircle className="h-16 w-16 text-red-400" />
            </motion.div>
          )}
        </div>

        {message && (
          <motion.p
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`mb-4 text-sm ${status === 'success' ? 'text-green-400' : status === 'error' || status === 'blocked' ? 'text-red-400' : 'text-vault-muted'}`}
          >
            {message}
            {countdown !== null && status === 'success' && ` Redirecting in ${countdown}s...`}
          </motion.p>
        )}

        {!camReady && status === 'idle' && (
          <p className="mb-4 text-xs text-vault-muted">Starting camera and preparing automatic capture...</p>
        )}

        {status === 'idle' && camReady && (
          <div className="btn-primary pointer-events-none flex items-center justify-center gap-2">
            <Camera className="h-4 w-4" />
            Auto capture starting
          </div>
        )}

        {status === 'scanning' && (
          <div className="btn-primary pointer-events-none flex items-center justify-center gap-2">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}
              className="h-5 w-5 rounded-full border-2 border-white/30 border-t-white"
            />
            Scanning
          </div>
        )}

        {(status === 'error' || status === 'blocked') && (
          <div className="flex flex-col gap-3">
            {status === 'error' && (
              <button
                type="button"
                onClick={startCamera}
                className="btn-primary flex items-center justify-center gap-2"
              >
                <Camera className="h-4 w-4" />
                Try Again
              </button>
            )}
            <button type="button" onClick={() => navigate('/login', { replace: true })} className={status === 'blocked' ? 'btn-danger flex items-center justify-center gap-2' : 'btn-ghost flex items-center justify-center gap-2'}>
              {status === 'blocked' ? 'Access denied' : 'Back to Login'}
            </button>
          </div>
        )}
      </PageTransition>
    </div>
  )
}
