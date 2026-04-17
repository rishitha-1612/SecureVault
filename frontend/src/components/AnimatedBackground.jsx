import { motion, useReducedMotion } from 'framer-motion'

const orbs = [
  {
    className: 'cyber-orb left-[-8%] top-[-14%] h-[34rem] w-[34rem] bg-cyan-400/25',
    animate: {
      x: [0, 52, -24, 0],
      y: [0, 44, 88, 0],
      scale: [1, 1.08, 0.94, 1],
    },
    duration: 26,
  },
  {
    className: 'cyber-orb right-[-10%] top-[2%] h-[30rem] w-[30rem] bg-violet-500/22',
    animate: {
      x: [0, -36, 28, 0],
      y: [0, 64, -18, 0],
      scale: [0.94, 1.06, 0.98, 0.94],
    },
    duration: 28,
  },
  {
    className: 'cyber-orb left-[22%] bottom-[-18%] h-[28rem] w-[28rem] bg-emerald-400/18',
    animate: {
      x: [0, 46, -16, 0],
      y: [0, -58, -12, 0],
      scale: [1, 1.04, 0.92, 1],
    },
    duration: 24,
  },
]

const nodes = [
  { className: 'left-[11%] top-[18%] h-2.5 w-2.5 bg-current text-cyan-300', delay: 0 },
  { className: 'left-[26%] top-[71%] h-2 w-2 bg-current text-emerald-300', delay: 0.8 },
  { className: 'left-[45%] top-[28%] h-1.5 w-1.5 bg-current text-sky-300', delay: 0.2 },
  { className: 'left-[58%] top-[18%] h-2.5 w-2.5 bg-current text-violet-300', delay: 1.2 },
  { className: 'left-[78%] top-[64%] h-2 w-2 bg-current text-cyan-200', delay: 0.4 },
  { className: 'left-[88%] top-[36%] h-2.5 w-2.5 bg-current text-rose-300', delay: 1.6 },
]

const traces = [
  'M110 210 C250 120, 380 270, 560 210',
  'M520 120 C660 70, 760 180, 920 140',
  'M820 520 C960 430, 1060 610, 1220 540',
  'M210 610 C360 530, 440 710, 620 650',
]

const beams = [
  {
    className: 'cyber-beam left-[-6%] top-[8%] h-[16rem] w-[28rem]',
    animate: { x: [0, 28, -10, 0], y: [0, 18, 42, 0], opacity: [0.16, 0.28, 0.12, 0.16] },
    duration: 18,
  },
  {
    className: 'cyber-beam cyber-beam-violet right-[-10%] top-[32%] h-[18rem] w-[30rem]',
    animate: { x: [0, -24, 16, 0], y: [0, -12, 34, 0], opacity: [0.1, 0.22, 0.08, 0.1] },
    duration: 22,
  },
  {
    className: 'cyber-beam cyber-beam-emerald left-[28%] bottom-[-10%] h-[15rem] w-[24rem]',
    animate: { x: [0, 18, -14, 0], y: [0, -20, 16, 0], opacity: [0.08, 0.16, 0.06, 0.08] },
    duration: 20,
  },
]

export default function AnimatedBackground() {
  const reduceMotion = useReducedMotion()

  return (
    <div aria-hidden="true" className="cyber-background">
      <div className="cyber-noise" />
      <div className="cyber-vignette" />
      <div className="cyber-grid" />
      <div className="cyber-grid-secondary" />
      <div className="cyber-aura" />

      {orbs.map((orb) => (
        <motion.div
          key={orb.className}
          className={orb.className}
          animate={reduceMotion ? undefined : orb.animate}
          transition={reduceMotion
            ? undefined
            : { duration: orb.duration, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}

      {beams.map((beam) => (
        <motion.div
          key={beam.className}
          className={beam.className}
          animate={reduceMotion ? undefined : beam.animate}
          transition={reduceMotion
            ? undefined
            : { duration: beam.duration, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}

      <svg
        className="cyber-network"
        viewBox="0 0 1440 900"
        preserveAspectRatio="none"
      >
        {traces.map((path, index) => (
          <motion.path
            key={path}
            d={path}
            fill="none"
            stroke={index % 2 === 0 ? 'rgba(88, 217, 255, 0.34)' : 'rgba(141, 107, 255, 0.28)'}
            strokeWidth="1.25"
            strokeLinecap="round"
            initial={{ pathLength: 0.1, opacity: 0.12 }}
            animate={reduceMotion
              ? { pathLength: 1, opacity: 0.18 }
              : { pathLength: [0.12, 1, 0.18], opacity: [0.12, 0.42, 0.12] }}
            transition={{
              duration: 9 + index * 2,
              delay: index * 0.6,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
        ))}
      </svg>

      <motion.div
        className="cyber-radar"
        animate={reduceMotion ? undefined : { rotate: 360 }}
        transition={reduceMotion ? undefined : { duration: 30, repeat: Infinity, ease: 'linear' }}
      />
      <motion.div
        className="cyber-radar-secondary"
        animate={reduceMotion ? undefined : { rotate: -360 }}
        transition={reduceMotion ? undefined : { duration: 22, repeat: Infinity, ease: 'linear' }}
      />
      <div className="cyber-core" />

      {nodes.map((node) => (
        <motion.span
          key={node.className}
          className={`cyber-node ${node.className}`}
          animate={reduceMotion
            ? { opacity: 0.5, scale: 1 }
            : { opacity: [0.22, 1, 0.22], scale: [0.75, 1.5, 0.75] }}
          transition={{
            duration: 4,
            delay: node.delay,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}

      <motion.div
        className="cyber-scanlines"
        animate={reduceMotion ? undefined : { opacity: [0.12, 0.2, 0.12], y: [0, 14, 0] }}
        transition={reduceMotion ? undefined : { duration: 8, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  )
}
