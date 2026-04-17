import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Download, X, Smartphone } from 'lucide-react'
import { useLocation } from 'react-router-dom'

const INSTALL_PROMPT_DISMISS_KEY = 'sv_install_hidden'

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
}

export default function DownloadAppButton() {
  const location = useLocation()
  const [installPrompt, setInstallPrompt] = useState(null)
  const [installed, setInstalled] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(INSTALL_PROMPT_DISMISS_KEY) === '1'
    } catch {
      return false
    }
  })

  const deviceHint = useMemo(() => {
    const ua = navigator.userAgent || ''
    if (/iphone|ipad|ipod/i.test(ua)) {
      return 'Open Share, then Add to Home Screen.'
    }
    if (/android/i.test(ua)) {
      return 'Use Install app or Add to Home screen from your browser menu.'
    }
    return 'Use your browser install option to add SecureVault to this device.'
  }, [])

  useEffect(() => {
    setInstalled(isStandalone())

    const onBeforeInstallPrompt = (event) => {
      event.preventDefault()
      setInstallPrompt(event)
      setDismissed(false)
      try {
        localStorage.removeItem(INSTALL_PROMPT_DISMISS_KEY)
      } catch {
        // Ignore storage failures and continue showing the install prompt.
      }
    }

    const onInstalled = () => {
      setInstalled(true)
      setInstallPrompt(null)
      setShowHelp(false)
      setDismissed(false)
      try {
        localStorage.removeItem(INSTALL_PROMPT_DISMISS_KEY)
      } catch {
        // Ignore storage failures after install.
      }
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const install = async () => {
    if (!installPrompt) {
      setShowHelp(true)
      return
    }

    installPrompt.prompt()
    const choice = await installPrompt.userChoice
    if (choice.outcome === 'accepted') {
      setInstalled(true)
    }
    setInstallPrompt(null)
  }

  const dismiss = () => {
    setShowHelp(false)
    setInstallPrompt(null)
    setDismissed(true)
    try {
      localStorage.setItem(INSTALL_PROMPT_DISMISS_KEY, '1')
    } catch {
      // Ignore storage failures and still dismiss for this session.
    }
  }

  const hideOnAuthBridgeScreens = location.pathname === '/face-scan' ||
    location.pathname === '/verify-otp'

  if (installed || dismissed || hideOnAuthBridgeScreens) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 18 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        className="fixed bottom-4 right-4 z-[70] w-[min(92vw,360px)]"
      >
        <motion.div whileHover={{ y: -4 }} className="download-card">
          <div className="flex items-start gap-3">
            <div className="download-chip">
              <Smartphone className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-vault-text">Install SecureVault</div>
              <p className="mt-1 text-xs leading-5 text-vault-muted">
                Pin the dashboard for faster encrypted access on desktop and mobile.
              </p>
            </div>
            <button
              type="button"
              onClick={dismiss}
              className="rounded-xl p-1.5 text-vault-muted transition hover:bg-white/10 hover:text-vault-text"
              aria-label="Dismiss install app prompt"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {showHelp && (
            <p className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-3 text-xs leading-5 text-vault-text">
              {deviceHint}
            </p>
          )}

          <button
            type="button"
            onClick={install}
            className="download-button mt-3"
          >
            <Download className="h-4 w-4" />
            Install App
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
