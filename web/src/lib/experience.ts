// How much the app explains. DeVig is for anyone, so it asks once ("How do you bet?") and remembers the answer on
// this device: 'new' = every number in plain words, 'sometimes' = the short version, 'numbers' = inputs and prices.
import { useCallback, useSyncExternalStore } from 'react'

export type Level = 'new' | 'sometimes' | 'numbers'
const KEY = 'devig_level'
const listeners = new Set<() => void>()
function read(): Level | null {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'experienced') return 'sometimes'          // answer saved by the first version of the question
    return v === 'new' || v === 'sometimes' || v === 'numbers' ? v : null
  } catch {
    return null
  }
}

export function useExperience() {
  const level = useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => read() ?? fallback,
    () => null
  )
  const setLevel = useCallback((next: Level) => {
    try {
      localStorage.setItem(KEY, next)
    } catch {
      /* private mode: the choice lasts for this visit only */
    }
    fallback = next
    listeners.forEach((l) => l())
  }, [])
  return { level, asked: level != null, setLevel }
}

// used when storage is blocked, so the choice still sticks until the page reloads
let fallback: Level | null = null
