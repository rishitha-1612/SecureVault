import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Info,
  MapPin,
  ShieldAlert,
  UserCheck,
  X,
  XCircle,
} from 'lucide-react'
import { userAPI } from '../api/api'
import Card from '../components/Card'
import PageTransition from '../components/PageTransition'

const statusIcon = (status) => ({
  success: <CheckCircle className="h-3.5 w-3.5 text-emerald-300" />,
  fail: <XCircle className="h-3.5 w-3.5 text-rose-300" />,
  intruder: <AlertTriangle className="h-3.5 w-3.5 text-amber-300" />,
}[status] ?? <Info className="h-3.5 w-3.5 text-cyan-300" />)

const statusBadge = (status) => ({
  success: 'badge-success',
  fail: 'badge-danger',
  intruder: 'badge-warn',
}[status] ?? 'badge-info')

function locationLabel(item) {
  return item.location || item.location_data?.display || 'Unknown location'
}

function NotificationRow({ item, index, onClick, alert = false }) {
  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.04 * index }}
      onClick={() => onClick(item)}
      className="group flex w-full items-center gap-3 px-5 py-4 text-left transition hover:bg-white/[0.04]"
    >
      <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg border ${alert ? 'border-amber-300/20 bg-amber-300/10' : 'border-white/10 bg-white/[0.04]'}`}>
        {alert ? <ShieldAlert className="h-4 w-4 text-amber-300" /> : statusIcon(item.status)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`${statusBadge(item.status)} capitalize`}>
            {alert ? 'Intruder alert' : item.status}
          </span>
          {item.stage && <span className="badge-info capitalize">{item.stage}</span>}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-vault-muted">
          <Clock className="h-3 w-3" />
          <span>{item.created_at}</span>
          <span>/</span>
          <MapPin className="h-3 w-3" />
          <span className="truncate">{locationLabel(item)}</span>
        </div>
      </div>
    </motion.button>
  )
}

function SkeletonNotifications() {
  return (
    <div className="space-y-6">
      <div className="skeleton h-28" />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="skeleton h-96" />
        <div className="skeleton h-96" />
      </div>
    </div>
  )
}

export default function NotificationsPage() {
  const [searchParams] = useSearchParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    userAPI.notifications()
      .then((res) => setData(res.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const query = (searchParams.get('q') || '').trim().toLowerCase()
  const matchesQuery = (item) => {
    if (!query) return true
    return [
      item.status,
      item.stage,
      item.created_at,
      locationLabel(item),
      item.ip_address,
      item.user_agent,
      item.attempt_no ? `#${item.attempt_no}` : '',
    ].some((value) => String(value || '').toLowerCase().includes(query))
  }

  const intruderAlerts = (data?.intruder_alerts ?? []).filter(matchesQuery)
  const loginAttempts = (data?.login_attempts ?? []).filter(matchesQuery)
  const safeLogins = useMemo(
    () => loginAttempts.filter((item) => item.status === 'success').length,
    [loginAttempts]
  )
  const reviewQueue = useMemo(
    () => loginAttempts.filter((item) => item.status !== 'success').length + intruderAlerts.length,
    [intruderAlerts.length, loginAttempts]
  )

  if (loading) return <SkeletonNotifications />

  return (
    <PageTransition className="space-y-6">
      <section className="hero-panel p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="brand-mark h-12 w-12">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-xs font-semibold text-amber-100">
                <AlertTriangle className="h-3.5 w-3.5" />
                Security notifications
              </div>
              <h1 className="mt-2 text-3xl font-semibold text-white sm:text-4xl">Notifications</h1>
              <p className="mt-2 text-sm text-vault-muted">Review intruder alerts and authentication activity from your protected session.</p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:min-w-72 sm:grid-cols-3">
            <div className="rounded-[1.35rem] border border-amber-300/20 bg-amber-300/10 p-3 backdrop-blur-xl">
              <div className="text-2xl font-semibold text-white">{intruderAlerts.length}</div>
              <div className="mt-1 text-xs text-vault-muted">Intruder alerts</div>
            </div>
            <div className="rounded-[1.35rem] border border-emerald-300/20 bg-emerald-300/10 p-3 backdrop-blur-xl">
              <div className="text-2xl font-semibold text-white">{safeLogins}</div>
              <div className="mt-1 text-xs text-vault-muted">Verified logins</div>
            </div>
            <div className="rounded-[1.35rem] border border-cyan-300/20 bg-cyan-300/10 p-3 backdrop-blur-xl">
              <div className="text-2xl font-semibold text-white">{reviewQueue}</div>
              <div className="mt-1 text-xs text-vault-muted">Needs review</div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card hover={false} accent="amber" className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-300" />
              <h2 className="font-semibold text-white">Intruder Alerts</h2>
            </div>
            <span className="badge-warn">{intruderAlerts.length} alerts</span>
          </div>
          <div className="divide-y divide-white/10">
            {intruderAlerts.length === 0 && (
              <p className="py-10 text-center text-sm text-vault-muted">No intruder alerts found.</p>
            )}
            {intruderAlerts.map((item, index) => (
              <NotificationRow key={`alert-${item.id}`} item={item} index={index} onClick={setSelected} alert />
            ))}
          </div>
        </Card>

        <Card hover={false} accent="cyan" className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <div className="flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-cyan-300" />
              <h2 className="font-semibold text-white">Login Attempts</h2>
            </div>
            <span className="badge-info">{loginAttempts.length} events</span>
          </div>
          <div className="divide-y divide-white/10">
            {loginAttempts.length === 0 && (
              <p className="py-10 text-center text-sm text-vault-muted">No login attempts found.</p>
            )}
            {loginAttempts.map((item, index) => (
              <NotificationRow key={`attempt-${item.id}`} item={item} index={index} onClick={setSelected} />
            ))}
          </div>
        </Card>
      </section>

      <AnimatePresence>
        {selected && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.94 }} className="glass-card w-full max-w-md p-6">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`${statusBadge(selected.status)} capitalize`}>{selected.status}</span>
                    {selected.stage && <span className="badge-info capitalize">{selected.stage}</span>}
                  </div>
                  <h3 className="mt-3 text-lg font-semibold text-white">Security event details</h3>
                </div>
                <button type="button" onClick={() => setSelected(null)} className="icon-button" aria-label="Close notification details">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-3 text-sm">
                {[
                  { label: 'Time', val: selected.created_at },
                  { label: 'Location', val: locationLabel(selected) },
                  { label: 'IP address', val: selected.ip_address || 'Unknown' },
                  { label: 'Device', val: selected.user_agent || 'Unknown' },
                  { label: 'Attempt', val: selected.attempt_no ? `#${selected.attempt_no}` : 'Not tracked' },
                ].map(({ label, val }) => (
                  <div key={label} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                    <span className="text-[11px] uppercase text-vault-muted">{label}</span>
                    <div className="mt-1 break-words font-medium text-vault-text">{val}</div>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </PageTransition>
  )
}
