import { motion, useReducedMotion } from 'framer-motion'

export default function Card({
  children,
  className = '',
  hover = true,
  delay = 0,
  accent = 'cyan',
  as: Component = motion.div,
  ...props
}) {
  const reduceMotion = useReducedMotion()
  const accentClass = {
    cyan: 'card-accent-cyan',
    violet: 'card-accent-violet',
    emerald: 'card-accent-emerald',
    rose: 'card-accent-rose',
    amber: 'card-accent-amber',
    slate: 'card-accent-slate',
  }[accent] ?? 'card-accent-cyan'

  return (
    <Component
      initial={{ opacity: 0, y: 22, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.42, delay, ease: [0.22, 1, 0.36, 1] }}
      whileHover={hover && !reduceMotion ? { y: -8, scale: 1.012 } : undefined}
      className={`glass-card ${accentClass} ${className}`}
      {...props}
    >
      {children}
    </Component>
  )
}
