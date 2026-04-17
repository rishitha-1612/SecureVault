import { useEffect, useMemo, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Activity,
  Bell,
  CalendarDays,
  FolderLock,
  LayoutDashboard,
  Search,
  Shield,
  ShieldCheck,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import Sidebar from './Sidebar'

const mobileLinks = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Overview' },
  { to: '/vault', icon: FolderLock, label: 'Vault' },
  { to: '/notifications', icon: Bell, label: 'Alerts' },
]

export default function DashboardLayout() {
  const [expanded, setExpanded] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [timestamp, setTimestamp] = useState(() => new Date())
  const { user } = useAuth()
  const loc = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const routeMeta = useMemo(() => ({
    '/dashboard': {
      eyebrow: 'Security Overview',
      title: 'Command Center',
      copy: 'Monitor account posture, authentication events, and vault resilience in one surface.',
    },
    '/vault': {
      eyebrow: 'Encrypted Storage',
      title: 'Secure Vault',
      copy: 'Upload, filter, and retrieve files inside a hardened encrypted workspace.',
    },
    '/notifications': {
      eyebrow: 'Threat Feed',
      title: 'Notifications',
      copy: 'Review intruder alerts, suspicious logins, and verification activity in real time.',
    },
  }), [])

  useEffect(() => {
    setSearchTerm(searchParams.get('q') || '')
  }, [searchParams])

  useEffect(() => {
    const timer = window.setInterval(() => setTimestamp(new Date()), 60000)
    return () => window.clearInterval(timer)
  }, [])

  const handleSearchChange = (event) => {
    const value = event.target.value
    setSearchTerm(value)

    const params = new URLSearchParams(searchParams)
    if (value.trim()) {
      params.set('q', value)
    } else {
      params.delete('q')
    }

    const targetPath = loc.pathname === '/notifications' ? '/notifications' : '/vault'
    navigate({ pathname: targetPath, search: params.toString() }, { replace: loc.pathname === targetPath })
  }

  const activeRoute = routeMeta[loc.pathname] ?? routeMeta['/dashboard']
  const initials = (user?.username || 'OP').slice(0, 2).toUpperCase()
  const formattedTimestamp = timestamp.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div className="dashboard-shell text-vault-text">
      <div className="dashboard-frame">
        <div className="flex min-h-screen lg:min-h-[calc(100vh-1.5rem)]">
          <Sidebar expanded={expanded} onToggle={() => setExpanded((value) => !value)} />

          <div className="flex min-w-0 flex-1 flex-col">
            <motion.header
              initial={{ opacity: 0, y: -14 }}
              animate={{ opacity: 1, y: 0 }}
              className="topbar"
            >
              <div className="max-w-[1400px] mx-auto flex w-full items-center gap-4 px-6 md:px-10">
                <div className="flex min-w-0 flex-1 items-center gap-4">
                  <div className="flex min-w-0 items-center gap-3 lg:hidden">
                    <Link to="/dashboard" className="brand-mark">
                      <Shield className="h-5 w-5" />
                    </Link>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-white">SecureVault</div>
                      <div className="truncate text-xs text-vault-muted">{activeRoute.title}</div>
                    </div>
                  </div>

                  <div className="hidden min-w-0 xl:block">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-100/70">
                      {activeRoute.eyebrow}
                    </div>
                    <div className="mt-1 text-2xl font-semibold text-white">{activeRoute.title}</div>
                  </div>

                  <div className="topbar-search hidden min-w-0 max-w-2xl flex-1 md:flex">
                    <Search className="h-4 w-4 shrink-0 text-cyan-200/70" />
                    <input
                      type="search"
                      value={searchTerm}
                      onChange={handleSearchChange}
                      placeholder="Search vault files, login events, or alerts"
                      className="min-w-0 flex-1 bg-transparent text-sm text-vault-text outline-none placeholder:text-vault-muted"
                      aria-label="Search vault files, login events, or alerts"
                    />
                  </div>
                </div>

                <div className="ml-auto flex items-center gap-2 sm:gap-3">
                  <div className="status-pill hidden border-emerald-300/20 bg-emerald-300/10 text-emerald-100 sm:flex">
                    <Activity className="h-3.5 w-3.5 animate-pulse" />
                    Threat shield active
                  </div>
                  <div className="status-pill hidden text-vault-muted xl:flex">
                    <CalendarDays className="h-3.5 w-3.5 text-cyan-200" />
                    {formattedTimestamp}
                  </div>
                  <Link to="/notifications" className="icon-button relative" aria-label="Notifications">
                    <Bell className="h-4 w-4" />
                    <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-rose-400 shadow-[0_0_14px_rgba(251,113,133,0.9)]" />
                  </Link>
                  <div className="profile-chip px-2.5 sm:px-3.5">
                    <div className="profile-avatar">{initials}</div>
                    <div className="hidden min-w-0 sm:block">
                      <div className="truncate text-sm font-semibold text-white">{user?.username || 'Operator'}</div>
                      <div className="flex items-center gap-1 text-[11px] text-vault-muted">
                        <ShieldCheck className="h-3 w-3 text-cyan-200" />
                        MFA verified
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.header>

            <div className="pt-4 lg:hidden">
              <div className="max-w-[1400px] mx-auto w-full rounded-[1.7rem] border border-white/10 bg-white/[0.04] p-4 px-6 backdrop-blur-2xl md:px-10">
                <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-100/70">
                  {activeRoute.eyebrow}
                </div>
                <div className="mt-2 text-2xl font-semibold text-white">{activeRoute.title}</div>
                <p className="mt-2 max-w-xl text-sm leading-6 text-vault-muted">{activeRoute.copy}</p>
                <div className="topbar-search mt-4 md:hidden">
                  <Search className="h-4 w-4 shrink-0 text-cyan-200/70" />
                  <input
                    type="search"
                    value={searchTerm}
                    onChange={handleSearchChange}
                    placeholder="Search secure assets"
                    className="min-w-0 flex-1 bg-transparent text-sm text-vault-text outline-none placeholder:text-vault-muted"
                    aria-label="Search secure assets"
                  />
                </div>
              </div>
            </div>

            <nav className="mobile-nav lg:hidden">
              {mobileLinks.map(({ to, icon: Icon, label }) => {
                const active = loc.pathname === to
                return (
                  <Link key={to} to={to} className={`mobile-nav-link ${active ? 'mobile-nav-link-active' : ''}`}>
                    <Icon className="h-4 w-4" />
                    <span>{label}</span>
                  </Link>
                )
              })}
            </nav>

            <main className="flex-1 pb-6 pt-4">
              <div className="max-w-[1400px] mx-auto px-6 md:px-10">
                <Outlet />
              </div>
            </main>
          </div>
        </div>
      </div>
    </div>
  )
}
