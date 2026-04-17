import { motion, useReducedMotion } from 'framer-motion'

const variants = {
  initial: { opacity: 0, y: 20, scale: 0.985, filter: 'blur(10px)' },
  animate: { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' },
  exit: { opacity: 0, y: -14, scale: 0.985, filter: 'blur(8px)' },
}

const reducedVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
}

export default function PageTransition({ children, className = '', delay = 0, ...props }) {
  const reduceMotion = useReducedMotion()
  const activeVariants = reduceMotion ? reducedVariants : variants

  return (
    <motion.div
      variants={activeVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={
        reduceMotion
          ? { duration: 0.18, delay }
          : { duration: 0.42, delay, ease: [0.22, 1, 0.36, 1] }
      }
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  )
}
