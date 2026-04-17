import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  FolderLock,
  HardDrive,
  MapPin,
  Shield,
  Sparkles,
  XCircle,
} from 'lucide-react'
import { userAPI } from '../api/api'
import { useAuth } from '../context/AuthContext'
import Card from '../components/Card'
import PageTransition from '../components/PageTransition'

const statusIcon = (status) => ({
  success: <CheckCircle className="h-3.5 w-3.5 text-emerald-300" />,
  fail: <XCircle className="h-3.5 w-3.5 text-rose-300" />,
  intruder: <AlertTriangle className="h-3.5 w-3.5 text-amber-300" />,
}[status] ?? <Activity className="h-3.5 w-3.5 text-cyan-300" />)

const statusBadge = (status) => ({
  success: 'badge-success',
  fail: 'badge-danger',
  intruder: 'badge-warn',
}[status] ?? 'badge-info')

function SkeletonDashboard() {
  return (
    <div className="space-y-6">
      <div className="skeleton h-28" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((item) => <div key={item} className="skeleton h-40" />)}
      </div>
      <div className="skeleton h-80" />
    </div>
  )
}

export default function DashboardPage() {
  const { user, location } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    userAPI.dashboard()
      .then((res) => setData(res.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const attempts = data?.recent_attempts ?? []
  const intrusions = attempts.filter((item) => item.status === 'intruder' || item.status === 'fail').length
  const lastLogin = attempts[0]?.created_at || 'No events yet'

  const stats = useMemo(() => ([
    {
      icon: Shield,
      label: 'Security Status',
      value: 'Protected',
      sub: 'Password, face, and OTP are active',
      tone: 'text-emerald-300',
      ring: 'from-emerald-300/30 to-cyan-300/10',
      accent: 'emerald',
    },
    {
      icon: Activity,
      label: 'Login Attempts',
      value: attempts.length,
      sub: 'Recent authentication events',
      tone: 'text-cyan-300',
      ring: 'from-cyan-300/30 to-blue-400/10',
      accent: 'cyan',
    },
    {
      icon: Clock,
      label: 'Last Login',
      value: lastLogin,
      sub: location?.city ? `Current node: ${location.city}` : 'Session telemetry active',
      tone: 'text-sky-300',
      ring: 'from-sky-300/30 to-indigo-300/10',
      compact: true,
      accent: 'violet',
    },
    {
      icon: AlertTriangle,
      label: 'Intrusion Alerts',
      value: intrusions,
      sub: intrusions ? 'Review failed attempts' : 'No active threats detected',
      tone: intrusions ? 'text-amber-300' : 'text-emerald-300',
      ring: intrusions ? 'from-amber-300/30 to-rose-400/10' : 'from-emerald-300/25 to-cyan-300/10',
      accent: intrusions ? 'amber' : 'emerald',
    },
  ]), [attempts.length, intrusions, lastLogin, location?.city])

  if (loading) return <SkeletonDashboard />

  return (
    <PageTransition className="space-y-6">
      <section className="hero-panel overflow-hidden px-7 py-8 sm:px-8">
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-3xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-xs font-semibold text-cyan-100">
              <Sparkles className="h-3.5 w-3.5" />
              Live security posture
            </div>
            <h1 className="text-4xl font-semibold leading-tight text-white xl:text-[3.6rem]">
              Welcome back, <span className="gradient-text">{user?.username || 'Operator'}</span>
            </h1>
            <p className="mt-4 max-w-2xl text-lg leading-8 text-vault-muted">
              Your vault is guarded by multi-factor authentication, session intelligence, and encrypted storage.
            </p>
          </div>
          <Link to="/vault" className="ripple-button hero-action-button group w-full justify-center sm:w-auto">
            <FolderLock className="h-4 w-4" />
            Open Vault
            <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
          </Link>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, index) => (
          <Card key={stat.label} delay={0.05 * index} accent={stat.accent} className="metric-card group min-h-[240px] p-6">
            <div className="mb-8 flex items-center justify-between">
              <div className={`rounded-2xl bg-gradient-to-br ${stat.ring} p-4 shadow-[0_0_28px_rgba(34,211,238,0.12)]`}>
                <stat.icon className={`h-5 w-5 ${stat.tone}`} />
              </div>
              <span className="metric-dot" />
            </div>
            <div className={`${stat.compact ? 'text-[1.1rem] leading-9 xl:text-[1.35rem]' : 'text-5xl leading-none'} font-semibold text-white`}>
              {stat.value}
            </div>
            <div className="mt-4 text-[1.05rem] font-semibold text-vault-text">{stat.label}</div>
            <p className="mt-3 text-sm leading-6 text-vault-muted">{stat.sub}</p>
          </Card>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.3fr_0.95fr] xl:items-start">
        <Card hover={false} accent="cyan" className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-cyan-300" />
              <h2 className="text-[1.15rem] font-semibold text-white">Recent Login Activity</h2>
            </div>
            <span className="badge-stage">{attempts.length} events</span>
          </div>
          <div className="divide-y divide-white/10">
            {attempts.length === 0 && (
              <p className="py-10 text-center text-sm text-vault-muted">No login events yet.</p>
            )}
            {attempts.map((attempt, index) => (
              <motion.div
                key={attempt.id}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.04 * index }}
                className="group flex items-center gap-4 px-6 py-5 transition hover:bg-white/[0.04]"
              >
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/[0.04]">
                  {statusIcon(attempt.status)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`${statusBadge(attempt.status)} capitalize`}>
                      {attempt.status}
                    </span>
                    {attempt.stage && <span className="badge-stage capitalize">{attempt.stage}</span>}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-vault-muted">
                    <Clock className="h-3 w-3" />
                    <span>{attempt.created_at}</span>
                    {attempt.location && (
                      <>
                        <span>/</span>
                        <MapPin className="h-3 w-3" />
                        <span>{attempt.location}</span>
                      </>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </Card>

        <Card hover={false} accent="violet" className="p-6">
          <div className="mb-6 flex items-center gap-2">
            <HardDrive className="h-4 w-4 text-sky-300" />
            <h2 className="text-[1.15rem] font-semibold text-white">Vault Capacity</h2>
          </div>
          <div className="flex items-end justify-between">
            <div>
              <div className="text-5xl font-semibold leading-none text-white">{data?.vault_summary?.total_files ?? 0}</div>
              <p className="mt-3 text-[1.05rem] text-vault-muted">Encrypted files</p>
            </div>
            <div className="text-right">
              <div className="text-[2rem] font-semibold leading-none text-cyan-200">{data?.vault_summary?.total_mb ?? 0} MB</div>
              <p className="mt-2 text-sm text-vault-muted">Storage used</p>
            </div>
          </div>
          <div className="mt-8 h-3 overflow-hidden rounded-full bg-white/10">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-cyan-300 via-violet-300 to-emerald-300"
              initial={{ width: 0 }}
              animate={{ width: '68%' }}
              transition={{ duration: 1, ease: 'easeOut' }}
            />
          </div>
        </Card>
      </section>
    </PageTransition>
  )
}
