import { useState, useRef, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import Webcam from 'react-webcam'
import { ScanFace, CheckCircle, AlertCircle, Camera } from 'lucide-react'
import { authAPI } from '../api/api'
import { useAuth } from '../context/AuthContext'
import { primeBrowserLocation, withBrowserLocation } from '../utils/securityCapture'
import PageTransition from '../components/PageTransition'

export default function FaceScanPage() {
  const navigate             = useNavigate()
  const { sessionId, setLocation } = useAuth()
  const webcamRef            = useRef(null)
  const hasScannedRef        = useRef(false)
  const frameWaitRef         = useRef(null)
  const redirectIntervalRef  = useRef(null)
  const blockTimeoutRef      = useRef(null)

  const [status,   setStatus]   = useState('idle')   // idle | scanning | success | error | blocked
  const [message,  setMessage]  = useState('')
  const [camReady, setCamReady] = useState(false)
  const [countdown, setCount]   = useState(null)
  const [cameraKey, setCameraKey] = useState(0)

  // Redirect if no session
  useEffect(() => {
    if (!sessionId) navigate('/login')
  }, [sessionId, navigate])

  useEffect(() => {
    primeBrowserLocation()
    return () => {
      if (frameWaitRef.current) window.cancelAnimationFrame(frameWaitRef.current)
      if (redirectIntervalRef.current) window.clearInterval(redirectIntervalRef.current)
      if (blockTimeoutRef.current) window.clearTimeout(blockTimeoutRef.current)
    }
  }, [])

  const waitForFirstFrame = useCallback(() => new Promise((resolve) => {
    const startedAt = Date.now()

    const checkFrame = () => {
      const video = webcamRef.current?.video
      if (video && video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
        frameWaitRef.current = null
        resolve(true)
        return
      }

      if (Date.now() - startedAt >= 1200) {
        frameWaitRef.current = null
        resolve(false)
        return
      }

      frameWaitRef.current = window.requestAnimationFrame(checkFrame)
    }

    checkFrame()
  }), [])

  const scan = useCallback(async () => {
    const screenshot = webcamRef.current?.getScreenshot({ width: 320, height: 240 })
    if (!screenshot) {
      hasScannedRef.current = false
      setStatus('error')
      setMessage('Could not capture image. Check your camera and try again.')
      return
    }

    setStatus('scanning')
    setMessage('Analysing your face…')

    try {
      const payload = await withBrowserLocation({ session_id: sessionId, face_image: screenshot })
      const res = await authAPI.faceVerify(payload)
      if (res.data?.location) setLocation(res.data.location)
      setStatus('success')
      setMessage('Face verified! OTP sent to your email.')
      // Countdown then navigate
      let c = 3
      setCount(c)
      redirectIntervalRef.current = window.setInterval(() => {
        c--
        setCount(c)
        if (c <= 0) {
          if (redirectIntervalRef.current) {
            window.clearInterval(redirectIntervalRef.current)
            redirectIntervalRef.current = null
          }
          navigate('/verify-otp')
        }
      }, 1000)
    } catch (err) {
      const detail = err.response?.data?.detail || 'Face scan failed. Please try again.'
      const blocked = err.response?.status === 403

      if (blocked) {
        setStatus('blocked')
        setMessage(detail)
        return
      }

      hasScannedRef.current = false
      setStatus('error')
      setMessage(detail)
    }
  }, [sessionId, navigate, setLocation])

  useEffect(() => {
    if (!camReady || !sessionId || status !== 'idle' || hasScannedRef.current) return
    hasScannedRef.current = true
    let cancelled = false

    const runFirstFrameScan = async () => {
      const frameReady = await waitForFirstFrame()
      if (cancelled) return
      if (!frameReady) {
        hasScannedRef.current = false
        setStatus('error')
        setMessage('Could not read the first camera frame. Try again.')
        return
      }
      await scan()
    }

    void runFirstFrameScan()

    return () => {
      cancelled = true
      if (frameWaitRef.current) window.cancelAnimationFrame(frameWaitRef.current)
    }
  }, [camReady, sessionId, scan, status, waitForFirstFrame])

  const handleCameraRetry = () => {
    hasScannedRef.current = false
    if (blockTimeoutRef.current) {
      window.clearTimeout(blockTimeoutRef.current)
      blockTimeoutRef.current = null
    }
    setCameraKey((value) => value + 1)
    setCamReady(false)
    setStatus('idle')
    setMessage('')
    setCount(null)
  }

  const statusColor = {
    idle:     'border-vault-accent',
    scanning: 'border-yellow-500',
    success:  'border-green-500',
    error:    'border-red-500',
    blocked:  'border-red-500',
  }[status]

  return (
    <div className="auth-page">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-80 h-80
                        bg-violet-500/5 rounded-full blur-3xl" />
      </div>

      <PageTransition className="auth-card relative z-10 text-center">
        {/* Header */}
        <motion.div
          animate={{ scale: status === 'scanning' ? [1, 1.05, 1] : 1 }}
          transition={{ repeat: status === 'scanning' ? Infinity : 0, duration: 1.5 }}
          className="inline-flex p-4 rounded-2xl bg-vault-accent/10 mb-4 glow-accent"
        >
          <ScanFace className="w-10 h-10 text-vault-accent" />
        </motion.div>

        <h1 className="mb-1 text-xl font-semibold">Face Verification</h1>
        <p className="text-sm text-vault-muted mb-6">Step 2 of 3 — Look directly at your camera</p>

        {/* Step dots */}
        <div className="flex justify-center gap-2 mb-6">
          {[0, 1, 2].map(i => (
            <div key={i} className={`h-1.5 rounded-full transition-all duration-300
              ${i <= 1 ? 'w-8 bg-vault-accent' : 'w-4 bg-vault-border'}`} />
          ))}
        </div>

        {/* Webcam */}
        <div className={`relative mx-auto w-full max-w-xs rounded-2xl overflow-hidden
                        border-2 ${statusColor} transition-colors duration-500 mb-6 bg-black aspect-cam`}>
          <Webcam
            key={cameraKey}
            ref={webcamRef} audio={false} screenshotFormat="image/jpeg"
            screenshotQuality={0.85}
            videoConstraints={{
              facingMode: 'user',
              width: { ideal: 320 },
              height: { ideal: 240 },
            }}
            onUserMedia={() => setCamReady(true)}
            onUserMediaError={() => {
              hasScannedRef.current = false
              setCamReady(false)
              setStatus('error')
              setMessage('Camera access denied. Allow camera access and try again.')
            }}
            className="w-full h-full object-cover"
          />

          {/* Face oval guide */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className={`w-36 h-44 rounded-full border-2 border-dashed transition-colors duration-500
              ${statusColor} opacity-60`} />
          </div>

          {/* Scan line */}
          {status === 'scanning' && <div className="scan-line" />}

          {/* Success overlay */}
          {status === 'success' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="absolute inset-0 bg-green-500/20 flex items-center justify-center">
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 300 }}>
                <CheckCircle className="w-16 h-16 text-green-400" />
              </motion.div>
            </motion.div>
          )}

          {/* Error overlay */}
          {(status === 'error' || status === 'blocked') && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="absolute inset-0 bg-red-500/20 flex items-center justify-center">
              <AlertCircle className="w-16 h-16 text-red-400" />
            </motion.div>
          )}
        </div>

        {/* Status message */}
        {message && (
          <motion.p initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
            className={`text-sm mb-4 ${
              status === 'success' ? 'text-green-400' :
              status === 'error' || status === 'blocked' ? 'text-red-400' : 'text-vault-muted'
            }`}>
            {message}
            {countdown !== null && status === 'success' && ` Redirecting in ${countdown}s…`}
          </motion.p>
        )}

        {!camReady && status === 'idle' && (
          <p className="text-xs text-vault-muted mb-4">Waiting for camera permission…</p>
        )}

        {/* Scan button */}
        {false && status !== 'success' && (
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={scan}
            disabled={!camReady || status === 'scanning'}
            className="btn-primary flex items-center justify-center gap-2"
          >
            {status === 'scanning' ? (
              <>
                <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}
                  className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full" />
                Scanning…
              </>
            ) : (
              <><Camera className="w-4 h-4" /> Scan My Face</>
            )}
          </motion.button>
        )}

        {status === 'idle' && camReady && (
          <div className="btn-primary flex items-center justify-center gap-2 pointer-events-none">
            <Camera className="w-4 h-4" /> Auto capture starting
          </div>
        )}

        {status === 'scanning' && (
          <div className="btn-primary flex items-center justify-center gap-2 pointer-events-none">
            <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}
              className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full" />
            Scanning
          </div>
        )}

        {status === 'blocked' && (
          <button type="button" onClick={() => navigate('/login')}
            className="btn-danger flex items-center justify-center gap-2">
            Access denied
          </button>
        )}

        {status === 'error' && (
          <div className="flex flex-col gap-3">
            <motion.button
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={handleCameraRetry}
              className="btn-primary flex items-center justify-center gap-2"
            >
              <Camera className="w-4 h-4" />
              Retry Camera
            </motion.button>
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="btn-ghost flex items-center justify-center gap-2"
            >
              Back to Login
            </button>
          </div>
        )}
      </PageTransition>
    </div>
  )
}
