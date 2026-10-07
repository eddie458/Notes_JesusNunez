import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Palette } from 'lucide-react'

export const THEMES = [
  { id: 'linen', name: 'Linen', description: 'Warm paper & sage', colors: ['#f7f8f2', '#45715b', '#dcccb5'] },
  { id: 'ocean', name: 'Ocean', description: 'Airy blue & slate', colors: ['#f3f7fc', '#3667a3', '#a7c7e9'] },
  { id: 'rose', name: 'Rose', description: 'Soft blush & plum', colors: ['#fcf5f6', '#93566b', '#dfb8c5'] },
  { id: 'midnight', name: 'Midnight', description: 'Deep ink & lavender', colors: ['#1c202b', '#b6a5ed', '#56617b'] },
]
const AppearanceContext = createContext(null)

export function AppearanceProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    try {
      const saved = localStorage.getItem('paper-notes-theme')
      return THEMES.some(item => item.id === saved) ? saved : 'linen'
    } catch { return 'linen' }
  })
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try { localStorage.setItem('paper-notes-theme', theme) } catch { /* Preferences are optional. */ }
  }, [theme])
  return <AppearanceContext.Provider value={{ theme, setTheme }}>{children}</AppearanceContext.Provider>
}

export function useOutsideDismiss(ref, onDismiss) {
  useEffect(() => {
    const pointer = event => { if (ref.current && !ref.current.contains(event.target)) onDismiss() }
    const key = event => { if (event.key === 'Escape') onDismiss() }
    document.addEventListener('pointerdown', pointer)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('pointerdown', pointer)
      document.removeEventListener('keydown', key)
    }
  }, [ref, onDismiss])
}

export function ThemePicker({ compact = false }) {
  const { theme, setTheme } = useContext(AppearanceContext)
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useOutsideDismiss(ref, () => setOpen(false))
  const selected = THEMES.find(item => item.id === theme)
  const options = <div className="theme-options">{THEMES.map(item => <button key={item.id} type="button" className={`theme-option ${theme === item.id ? 'active' : ''}`} aria-label={`${item.name} theme`} aria-pressed={theme === item.id} onClick={() => { setTheme(item.id); setOpen(false) }}>
    <span className="theme-preview" style={{ background: item.colors[0] }}><i style={{ background: item.colors[1] }}/><i style={{ background: item.colors[2] }}/></span>
    <span><strong>{item.name}</strong>{!compact && <small>{item.description}</small>}</span>{theme === item.id && <Check size={14}/>}
  </button>)}</div>
  if (!compact) return <section className="appearance-card"><div className="appearance-heading"><Palette size={15}/><span>Make it yours</span></div><p>A fresh mood for your space.</p>{options}</section>
  return <div className="theme-picker" ref={ref}><button type="button" className="header-action" aria-label="Change color palette" aria-expanded={open} onClick={() => setOpen(value => !value)}><Palette size={17}/><span>{selected.name}</span><ChevronDown size={13}/></button>{open && <div className="theme-popover"><strong>Choose your palette</strong>{options}</div>}</div>
}

export function ColorPicker({ label, colors, value, onChange, onPreset }) {
  const rgb = /^rgba?\(\s*(\d+)[, ]+\s*(\d+)[, ]+\s*(\d+)/i.exec(value || '')
  const normalized = rgb ? `#${rgb.slice(1, 4).map(channel => Math.min(255, Number(channel)).toString(16).padStart(2, '0')).join('')}` : value || '#252525'
  const [hex, setHex] = useState(normalized)
  useEffect(() => { setHex(normalized) }, [normalized])
  return <div className="color-picker-content">
    <strong>{label}</strong>
    <div className="color-swatch-grid">{colors.map(color => <button key={color.value} type="button" aria-label={`${color.name} ${label === 'Text color' ? 'text' : 'note'}`} title={color.name} aria-pressed={normalized.toLowerCase() === color.value} className={`color-swatch ${normalized.toLowerCase() === color.value ? 'active' : ''}`} style={{ background: color.value }} onMouseDown={event => event.preventDefault()} onClick={() => { onChange(color.value); onPreset?.() }}>{normalized.toLowerCase() === color.value && <Check size={12}/>}</button>)}</div>
    <div className="custom-color"><label className="native-color-label"><input type="color" aria-label={`Custom ${label.toLowerCase()}`} value={/^#[0-9a-f]{6}$/i.test(normalized) ? normalized : '#252525'} onChange={event => onChange(event.target.value)}/><span>Custom color</span></label><input className="hex-input" aria-label={`${label} hex code`} maxLength={7} spellCheck={false} value={hex} onChange={event => { const next = event.target.value; setHex(next); if (/^#[0-9a-f]{6}$/i.test(next)) onChange(next) }} onBlur={() => setHex(normalized)}/></div>
  </div>
}
