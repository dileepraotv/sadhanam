'use client'

import { useEffect, useState } from 'react'
import { Sun, Moon } from 'lucide-react'

export function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    const saved = localStorage.getItem('tt-theme')
    const initial = saved === 'dark' ? 'dark' : 'light'
    setTheme(initial)
    document.documentElement.className = initial
  }, [])

  const toggle = () => {
    const next = theme === 'light' ? 'dark' : 'light'
    setTheme(next)
    document.documentElement.className = next
    try { localStorage.setItem('tt-theme', next) } catch {}
  }

  return (
    <button
      onClick={toggle}
      aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
      className="flex items-center justify-center gap-1.5 h-10 w-10 sm:w-auto sm:px-2.5 rounded-full border border-white/30 text-white hover:bg-orange-700/40 transition-colors text-xs font-semibold whitespace-nowrap shrink-0"
    >
      {theme === 'light'
        ? <><Moon className="h-4 w-4 shrink-0" /><span className="hidden sm:inline">Dark Mode</span></>
        : <><Sun  className="h-4 w-4 shrink-0" /><span className="hidden sm:inline">Light Mode</span></>
      }
    </button>
  )
}
