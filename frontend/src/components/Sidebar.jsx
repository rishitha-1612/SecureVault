import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Activity,
  Bell,
  ChevronLeft,
  ChevronRight,
  FolderLock,
  LayoutDashboard,
  LogOut,
  Shield,
  Sparkles,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { systemAPI } from '../api/api'

const links = [
  {
    to: '/dashboard',
    icon: LayoutDashboard,
    label: 'Dashboard',
    caption: 'Live security posture',
  },
  {
    to: '/vault',
    icon: FolderLock,
    label: 'Vault',
    caption: 'Encrypted file storage',
  },
  {
    to: '/notifications',
    icon: Bell,
    label: 'Notifications',
    caption: 'Threat and login feed',
  },
]

export default function Sidebar({ expanded, onToggle }) {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const loc = useLocation()
  const [health, setHealth] = useState({ status: 'online', score: 100 })

  useEffect(() => {
    let active = true

    const loadStatus = async () => {
      try {
        const res = await systemAPI.status()
        if (active) setHealth(res.data)
      } catch {
        if (active) setHealth({ status: 'offline', score: 0 })
      }
    }

    loadStatus()
    const timer = window.setInterval(loadStatus, 10000)

    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [])

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  const healthLabel = health.status === 'online'
    ? 'Systems online'
    : health.status === 'degraded'
      ? 'Systems degraded'
      : 'Systems offline'

  const healthTone = health.status === 'online'
    ? 'text-emerald-300'
    : health.status === 'degraded'
      ? 'text-amber-300'
      : 'text-rose-300'

  const healthWidth = `${Math.max(4, Math.min(100, health.score ?? 0))}%`
  const scoreBucket = useMemo(() => (
    health.score >= 85 ? 'Nominal' : health.score >= 60 ? 'Monitor' : 'Critical'
  ), [health.score])
  const healthBadgeTone = health.status === 'online'
    ? 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100'
    : health.status === 'degraded'
      ? 'border-amber-300/20 bg-amber-300/10 text-amber-100'
      : 'border-rose-300/20 bg-rose-300/10 text-rose-100'

  return (
    <motion.aside
      animate={{ width: expanded ? 312 : 96 }}
      transition={{ type: 'spring', stiffness: 220, damping: 28 }}
      className="dashboard-sidebar hidden shrink-0 border-r border-white/10 lg:flex"
    >
      <div className="flex h-full flex-col gap-4 p-4">
        <div className="flex items-center gap-3">
          <Link to="/dashboard" className="flex min-w-0 flex-1 items-center gap-3">
            <div className="brand-mark">
              <Shield className="h-5 w-5" />
            </div>
            {expanded && (
              <motion.div
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                className="min-w-0"
              >
                <div className="truncate text-base font-semibold text-white">SecureVault</div>
                <div className="text-xs text-cyan-100/70">Zero-trust command shell</div>
              </motion.div>
            )}
          </Link>

          <button type="button" onClick={onToggle} className="icon-button" aria-label="Toggle sidebar">
            {expanded ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </div>

        <motion.div
          layout
          className="overflow-hidden rounded-[1.7rem] border border-white/10 bg-white/[0.04] p-4"
        >
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-100/70">
            <Sparkles className="h-3.5 w-3.5" />
            SOC Layer
          </div>
          {expanded && (
            <>
              <p className="mt-3 text-sm leading-6 text-vault-muted">
                Continuous monitoring, live alerting, and encrypted storage working together.
              </p>
              <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100">
                <Activity className="h-3 w-3 animate-pulse" />
                Active telemetry
              </div>
            </>
          )}
        </motion.div>

        <nav className="space-y-2">
          {links.map(({ to, icon: Icon, label, caption }) => {
            const active = loc.pathname === to

            return (
              <Link key={to} to={to} className={`sidebar-link ${active ? 'sidebar-link-active' : ''}`}>
                <Icon className="h-5 w-5 shrink-0" />
                {expanded && (
                  <div className="min-w-0 flex-1">
                    <div>{label}</div>
                    <div className="sidebar-link-caption">{caption}</div>
                  </div>
                )}
                {active && <motion.span layoutId="sidebar-active-glow" className="sidebar-active-glow" />}
              </Link>
            )
          })}
        </nav>

        <div className="mt-auto space-y-3">
          <div className="rounded-[1.7rem] border border-white/10 bg-white/[0.04] p-4">
            <div className={`flex items-center gap-2 text-sm font-semibold ${healthTone}`}>
              <Activity className="h-4 w-4 animate-pulse" />
              {expanded ? healthLabel : null}
            </div>

            {expanded && (
              <>
                <div className="mt-4 flex items-end justify-between">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.24em] text-vault-muted">Cluster score</div>
                    <div className="mt-1 text-3xl font-semibold text-white">{Math.round(health.score ?? 0)}</div>
                  </div>
                  <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${healthBadgeTone}`}>
                    {scoreBucket}
                  </span>
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-300 via-blue-400 to-violet-400"
                    animate={{ width: healthWidth }}
                    transition={{ duration: 0.45, ease: 'easeOut' }}
                  />
                </div>
              </>
            )}
          </div>

          <button type="button" onClick={handleLogout} className="sidebar-link w-full hover:text-rose-200">
            <LogOut className="h-5 w-5 shrink-0" />
            {expanded && (
              <div className="min-w-0">
                <div>Logout</div>
                <div className="sidebar-link-caption">End current secure session</div>
              </div>
            )}
          </button>
        </div>
      </div>
    </motion.aside>
  )
}
