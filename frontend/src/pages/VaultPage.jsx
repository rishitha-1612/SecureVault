import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useSearchParams } from 'react-router-dom'
import {
  AlertCircle,
  Archive,
  CheckCircle,
  Download,
  File,
  FileText,
  Film,
  FolderLock,
  HardDrive,
  Image,
  Music,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { vaultAPI } from '../api/api'
import Card from '../components/Card'
import PageTransition from '../components/PageTransition'
import VaultGrid from '../components/VaultGrid'

const CATEGORY_ICONS = {
  image: { Icon: Image, color: 'text-cyan-300', bg: 'bg-cyan-300/10', border: 'border-cyan-300/20' },
  document: { Icon: FileText, color: 'text-emerald-300', bg: 'bg-emerald-300/10', border: 'border-emerald-300/20' },
  video: { Icon: Film, color: 'text-violet-200', bg: 'bg-violet-300/10', border: 'border-violet-300/20' },
  audio: { Icon: Music, color: 'text-rose-300', bg: 'bg-rose-300/10', border: 'border-rose-300/20' },
  archive: { Icon: Archive, color: 'text-amber-300', bg: 'bg-amber-300/10', border: 'border-amber-300/20' },
  other: { Icon: File, color: 'text-slate-200', bg: 'bg-white/10', border: 'border-white/10' },
}

const FILTER_CONFIG = {
  all: { label: 'All Files', Icon: FolderLock },
  image: { label: 'Images', Icon: Image },
  document: { label: 'Docs', Icon: FileText },
  video: { label: 'Videos', Icon: Film },
  audio: { label: 'Audio', Icon: Music },
  archive: { label: 'Archive', Icon: Archive },
  other: { label: 'Other', Icon: File },
}

const FILE_CARD_ACCENTS = {
  image: 'card-accent-cyan',
  document: 'card-accent-emerald',
  video: 'card-accent-violet',
  audio: 'card-accent-rose',
  archive: 'card-accent-amber',
  other: 'card-accent-slate',
}

function fmtSize(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function fmtDate(str) {
  if (!str) return 'Unknown date'
  const date = new Date(str)
  if (Number.isNaN(date.getTime())) return 'Unknown date'
  return date.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function safeDownloadName(name) {
  const cleaned = (name || 'download').replace(/\\/g, '/').split('/').pop().trim()
  return cleaned.replace(/[\r\n]/g, '') || 'download'
}

function FileCard({ file, onDownload, onDelete, downloading, deleting }) {
  const { Icon, color, bg, border } = CATEGORY_ICONS[file.file_type] ?? CATEGORY_ICONS.other
  const accentClass = FILE_CARD_ACCENTS[file.file_type] ?? FILE_CARD_ACCENTS.other

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.96, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.92, y: 12 }}
      whileHover={{ y: -5 }}
      className={`glass-card ${accentClass} group flex min-h-[190px] flex-col gap-4 p-4`}
    >
      <div className="flex items-start gap-3">
        <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-lg border ${bg} ${border}`}>
          <Icon className={`h-5 w-5 ${color}`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white" title={file.original_name}>{file.original_name}</p>
          <p className="mt-1 text-xs capitalize text-vault-muted">{file.file_type}</p>
        </div>
      </div>

      <div className="mt-auto rounded-lg border border-white/10 bg-white/[0.03] p-3">
        <div className="flex items-center justify-between text-xs text-vault-muted">
          <span>{fmtSize(file.file_size)}</span>
          <span>{fmtDate(file.created_at)}</span>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onDownload(file)}
          disabled={downloading === file.id}
          className="secondary-action flex-1"
        >
          {downloading === file.id
            ? <span className="spinner-small" />
            : <Download className="h-3.5 w-3.5" />}
          Download
        </button>
        <button
          type="button"
          onClick={() => onDelete(file)}
          disabled={deleting === file.id}
          className="danger-action"
          aria-label={`Delete ${file.original_name}`}
        >
          {deleting === file.id ? <span className="spinner-small" /> : <Trash2 className="h-3.5 w-3.5" />}
        </button>
      </div>
    </motion.div>
  )
}

function VaultSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
      {[0, 1, 2, 3, 4, 5, 6, 7].map((item) => <div key={item} className="skeleton h-48" />)}
    </div>
  )
}

export default function VaultPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [files, setFiles] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadPct, setUploadPct] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [downloading, setDownloading] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [toast, setToast] = useState(null)
  const [search, setSearch] = useState(() => searchParams.get('q') || '')
  const [filter, setFilter] = useState('all')
  const [deleteModal, setDeleteModal] = useState(null)
  const fileInput = useRef(null)
  const toastTimerRef = useRef(null)

  const showToast = (msg, type = 'success') => {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current)
    }
    setToast({ msg, type })
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null)
      toastTimerRef.current = null
    }, 3500)
  }

  const loadStats = async () => {
    try {
      const res = await vaultAPI.stats()
      setStats(res.data)
    } catch {
      // Keep the current summary if a refresh fails after an otherwise successful action.
    }
  }

  const loadData = async () => {
    try {
      const [f, s] = await Promise.all([vaultAPI.listFiles(), vaultAPI.stats()])
      setFiles(f.data.files)
      setStats(s.data)
    } catch {
      showToast('Failed to load vault files.', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  useEffect(() => {
    setSearch(searchParams.get('q') || '')
  }, [searchParams])

  useEffect(() => () => {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current)
    }
  }, [])

  const handleSearchChange = (event) => {
    const value = event.target.value
    setSearch(value)

    const nextParams = new URLSearchParams(searchParams)
    if (value.trim()) {
      nextParams.set('q', value)
    } else {
      nextParams.delete('q')
    }
    setSearchParams(nextParams, { replace: true })
  }

  const openFilePicker = () => {
    if (!fileInput.current || uploading) return
    fileInput.current.value = ''
    fileInput.current.click()
  }

  const syncUploadedFile = (uploadedFile) => {
    if (!uploadedFile?.id) return

    setFiles((prev) => {
      const alreadyTracked = prev.some((item) => item.id === uploadedFile.id)

      setStats((prevStats) => {
        if (alreadyTracked) {
          return prevStats
        }

        const totalBytes = (prevStats?.total_bytes ?? 0) + (uploadedFile.file_size ?? 0)
        const byType = { ...(prevStats?.by_type || {}) }
        byType[uploadedFile.file_type] = (byType[uploadedFile.file_type] || 0) + 1

        return {
          total_files: (prevStats?.total_files ?? prev.length) + 1,
          total_bytes: totalBytes,
          total_mb: Number((totalBytes / 1_000_000).toFixed(2)),
          by_type: byType,
        }
      })

      return [uploadedFile, ...prev.filter((item) => item.id !== uploadedFile.id)]
    })
  }

  const uploadFile = async (file) => {
    if (!file || uploading) return
    setUploading(true)
    setUploadPct(0)
    const formData = new FormData()
    formData.append('file', file)
    formData._onProgress = (ev) => {
      if (ev.total) setUploadPct(Math.round((ev.loaded * 100) / ev.total))
    }

    try {
      const res = await vaultAPI.upload(formData)
      syncUploadedFile(res.data?.file)
      void loadStats()
      showToast(`"${file.name}" uploaded successfully.`)
    } catch (err) {
      showToast(err.response?.data?.detail || 'Upload failed.', 'error')
    } finally {
      setUploading(false)
      setUploadPct(0)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const handleUpload = (e) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      void uploadFile(selectedFile)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    const droppedFile = e.dataTransfer.files?.[0]
    if (droppedFile) {
      void uploadFile(droppedFile)
    }
  }

  const handleDownload = async (file) => {
    setDownloading(file.id)
    try {
      const res = await vaultAPI.download(file.id)
      const blob = res.data instanceof Blob ? res.data : new Blob([res.data])
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = safeDownloadName(file.original_name)
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      showToast(`"${file.original_name}" downloaded.`)
    } catch {
      showToast('Download failed.', 'error')
    } finally {
      setDownloading(null)
    }
  }

  const confirmDelete = async () => {
    if (!deleteModal) return
    setDeleting(deleteModal.id)
    try {
      await vaultAPI.deleteFile(deleteModal.id)
      setFiles((prev) => prev.filter((f) => f.id !== deleteModal.id))
      showToast(`"${deleteModal.original_name}" deleted.`)
      setStats((prev) => prev ? {
        ...prev,
        total_files: Math.max(0, (prev.total_files || 1) - 1),
        total_bytes: Math.max(0, (prev.total_bytes || 0) - deleteModal.file_size),
        total_mb: Number((Math.max(0, ((prev.total_bytes || 0) - deleteModal.file_size) / 1e6)).toFixed(2)),
        by_type: Object.entries(prev.by_type || {}).reduce((next, [type, count]) => {
          if (type === deleteModal.file_type) {
            const remaining = Math.max(0, count - 1)
            if (remaining > 0) {
              next[type] = remaining
            }
          } else {
            next[type] = count
          }
          return next
        }, {}),
      } : prev)
    } catch {
      showToast('Delete failed.', 'error')
    } finally {
      setDeleting(null)
      setDeleteModal(null)
    }
  }

  const filtered = useMemo(() => files.filter((file) => {
    const matchCat = filter === 'all' || file.file_type === filter
    const matchQ = file.original_name.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchQ
  }), [files, filter, search])

  const filterCounts = useMemo(() => (
    Object.keys(FILTER_CONFIG).reduce((acc, key) => ({
      ...acc,
      [key]: key === 'all' ? files.length : files.filter((file) => file.file_type === key).length,
    }), {})
  ), [files])

  return (
    <PageTransition className="space-y-6">
      <section className="hero-panel p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="brand-mark h-12 w-12">
              <FolderLock className="h-6 w-6" />
            </div>
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs font-semibold text-emerald-100">
                <ShieldCheck className="h-3.5 w-3.5" />
                Encrypted storage
              </div>
              <h1 className="mt-2 text-3xl font-semibold text-white sm:text-4xl">Secure Vault</h1>
              <p className="mt-2 text-sm text-vault-muted">Drop files into a hardened workspace with quick filters and encrypted retrieval.</p>
            </div>
          </div>
          <input ref={fileInput} type="file" onChange={handleUpload} className="hidden" accept="*/*" tabIndex={-1} />
          <button type="button" onClick={openFilePicker} disabled={uploading} className="ripple-button group w-full justify-center sm:w-auto">
            {uploading ? <span className="spinner-small border-white/50" /> : <Upload className="h-4 w-4" />}
            {uploading ? `Uploading ${uploadPct}%` : 'Upload File'}
            <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
          </button>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.2fr]">
        <Card hover={false} className={`drop-zone p-5 ${dragging ? 'drop-zone-active' : ''}`}>
          <div
            className="flex h-full min-h-44 flex-col items-center justify-center rounded-lg border border-dashed border-cyan-300/30 bg-cyan-300/[0.04] p-6 text-center"
            role="button"
            tabIndex={0}
            onClick={openFilePicker}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                openFilePicker()
              }
            }}
            onDragEnter={(e) => { e.preventDefault(); setDragging(true) }}
            onDragOver={(e) => e.preventDefault()}
            onDragLeave={(e) => { e.preventDefault(); setDragging(false) }}
            onDrop={handleDrop}
          >
            <div className="grid h-14 w-14 place-items-center rounded-lg border border-cyan-300/20 bg-cyan-300/10 text-cyan-100">
              <Upload className="h-6 w-6" />
            </div>
            <h2 className="mt-4 text-lg font-semibold text-white">Drop a file to encrypt</h2>
            <p className="mt-2 max-w-sm text-sm leading-6 text-vault-muted">Upload images, docs, video, audio, archives, or anything that needs to stay private.</p>
            {uploading && (
              <div className="mt-5 w-full max-w-sm">
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <motion.div className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-emerald-300" animate={{ width: `${uploadPct}%` }} />
                </div>
                <div className="mt-2 text-xs text-cyan-100">{uploadPct}% sealed</div>
              </div>
            )}
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: HardDrive, label: 'Total Files', val: stats?.total_files ?? files.length, color: 'text-cyan-300' },
            { icon: HardDrive, label: 'Storage Used', val: `${stats?.total_mb ?? 0} MB`, color: 'text-sky-300' },
            ...Object.entries(stats?.by_type || {}).slice(0, 2).map(([type, count]) => ({
              icon: (CATEGORY_ICONS[type] ?? CATEGORY_ICONS.other).Icon,
              label: `${type.charAt(0).toUpperCase()}${type.slice(1)}s`,
              val: count,
              color: (CATEGORY_ICONS[type] ?? CATEGORY_ICONS.other).color,
            })),
          ].map(({ icon: Icon, label, val, color }, index) => (
            <Card key={label} delay={0.04 * index} className="p-4">
              <Icon className={`mb-4 h-5 w-5 ${color}`} />
              <div className="text-2xl font-semibold text-white">{val}</div>
              <div className="mt-1 text-xs text-vault-muted">{label}</div>
            </Card>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-200/60" />
          <input value={search} onChange={handleSearchChange} placeholder="Search encrypted files" className="vault-input pl-10" />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {Object.entries(FILTER_CONFIG).map(([key, { label, Icon }]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`filter-chip whitespace-nowrap ${filter === key ? 'filter-chip-active' : ''}`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{label}</span>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/70">
                {filterCounts[key] ?? 0}
              </span>
            </button>
          ))}
        </div>
      </section>

      {loading ? (
        <VaultSkeleton />
      ) : filtered.length === 0 ? (
        <Card hover={false} className="flex flex-col items-center justify-center py-20 text-center">
          <div className="grid h-16 w-16 place-items-center rounded-lg border border-cyan-300/20 bg-cyan-300/10">
            <FolderLock className="h-8 w-8 text-cyan-100" />
          </div>
          <p className="mt-5 font-semibold text-white">{search || filter !== 'all' ? 'No files match your filters' : 'Your vault is empty'}</p>
          <p className="mt-2 text-sm text-vault-muted">{search || filter !== 'all' ? 'Try a different search or file type.' : 'Upload your first encrypted file.'}</p>
          {!search && filter === 'all' && (
            <button type="button" onClick={openFilePicker} className="secondary-action mt-5">
              <Plus className="h-4 w-4" />
              Upload First File
            </button>
          )}
        </Card>
      ) : (
        <VaultGrid>
          {filtered.map((file) => (
            <FileCard
              key={file.id}
              file={file}
              onDownload={handleDownload}
              onDelete={setDeleteModal}
              downloading={downloading}
              deleting={deleting}
            />
          ))}
        </VaultGrid>
      )}

      <AnimatePresence>
        {deleteModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.94 }} className="glass-card w-full max-w-sm p-6">
              <div className="mb-4 flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-lg border border-rose-300/20 bg-rose-300/10">
                  <Trash2 className="h-5 w-5 text-rose-300" />
                </div>
                <h3 className="font-semibold text-white">Delete file?</h3>
              </div>
              <p className="text-sm text-vault-muted">This permanently removes the encrypted file:</p>
              <p className="mt-2 truncate text-sm font-semibold text-white">"{deleteModal.original_name}"</p>
              <div className="mt-6 flex gap-3">
                <button type="button" onClick={() => setDeleteModal(null)} className="secondary-action flex-1 justify-center">Cancel</button>
                <button type="button" onClick={confirmDelete} disabled={!!deleting} className="danger-action flex-1 justify-center px-4">
                  {deleting ? <span className="spinner-small" /> : <Trash2 className="h-4 w-4" />}
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }} className={`toast ${toast.type === 'success' ? 'toast-success' : 'toast-error'}`}>
            {toast.type === 'success' ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            <span>{toast.msg}</span>
            <button type="button" onClick={() => setToast(null)} className="rounded-md p-1 opacity-70 transition hover:bg-white/10 hover:opacity-100" aria-label="Close notification">
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </PageTransition>
  )
}
