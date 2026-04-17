import { AnimatePresence, LayoutGroup, motion } from 'framer-motion'

export default function VaultGrid({ children, className = '' }) {
  return (
    <LayoutGroup>
      <motion.div
        layout
        className={`vault-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 ${className}`}
      >
        <AnimatePresence mode="popLayout">{children}</AnimatePresence>
      </motion.div>
    </LayoutGroup>
  )
}
