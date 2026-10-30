import { createContext, useContext, useEffect, useId, useRef, useState } from 'react'
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

export function ThemePicker() {
  const { theme, setTheme } = useContext(AppearanceContext)
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const triggerRef = useRef(null)
  const menuId = useId()
  useOutsideDismiss(ref, () => setOpen(false))
  useEffect(() => {
    if (open) ref.current?.querySelector('[role="menuitemradio"][aria-checked="true"]')?.focus()
  }, [open])
  const selected = THEMES.find(item => item.id === theme)
  const closeMenu = () => { setOpen(false); triggerRef.current?.focus() }
  const menuKeys = event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeMenu(); return }
    if (event.key === 'Tab') { setOpen(false); return }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const items = [...ref.current.querySelectorAll('[role="menuitemradio"]')]
    const index = items.indexOf(document.activeElement)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
    items[next]?.focus()
  }
  const options = <div className="theme-options">{THEMES.map(item => <button key={item.id} type="button" role="menuitemradio" tabIndex={-1} className={`theme-option ${theme === item.id ? 'active' : ''}`} aria-label={`${item.name} theme`} aria-checked={theme === item.id} onClick={() => { setTheme(item.id); closeMenu() }}>
    <span className="theme-preview" style={{ background: item.colors[0] }}><i style={{ background: item.colors[1] }}/><i style={{ background: item.colors[2] }}/></span>
    <span><strong>{item.name}</strong><small>{item.description}</small></span>{theme === item.id && <Check size={18}/>}
  </button>)}</div>
  return <div className="theme-picker" ref={ref}>
    <button ref={triggerRef} type="button" className="header-action" aria-label="Change color palette" aria-haspopup="menu" aria-controls={open ? menuId : undefined} aria-expanded={open} onClick={() => setOpen(value => !value)} onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true) } }}>
      <Palette size={20}/><span>{selected.name}</span><ChevronDown size={16}/>
    </button>
    {open && <div id={menuId} role="menu" aria-label="Workspace color palettes" className="theme-popover" onKeyDown={menuKeys}><strong role="presentation">Choose your palette</strong>{options}</div>}
  </div>
}

export function ColorPicker({ label, colors, value, onChange, onPreset }) {
  const rgb = /^rgba?\(\s*(\d+)[, ]+\s*(\d+)[, ]+\s*(\d+)/i.exec(value || '')
  const normalized = rgb ? `#${rgb.slice(1, 4).map(channel => Math.min(255, Number(channel)).toString(16).padStart(2, '0')).join('')}` : value || '#252525'
  const [hex, setHex] = useState(normalized)
  useEffect(() => { setHex(normalized) }, [normalized])
  return <div className="color-picker-content">
    <strong>{label}</strong>
    <div className="color-swatch-grid">{colors.map(color => <button key={color.value} type="button" aria-label={`${color.name} ${label.replace(/ color$/i, '').toLowerCase()}`} title={color.name} aria-pressed={normalized.toLowerCase() === color.value} className={`color-swatch ${normalized.toLowerCase() === color.value ? 'active' : ''}`} style={{ background: color.value }} onMouseDown={event => event.preventDefault()} onClick={() => { onChange(color.value); onPreset?.() }}>{normalized.toLowerCase() === color.value && <Check size={12}/>}</button>)}</div>
    <div className="custom-color"><label className="native-color-label"><input type="color" aria-label={`Custom ${label.toLowerCase()}`} value={/^#[0-9a-f]{6}$/i.test(normalized) ? normalized : '#252525'} onChange={event => onChange(event.target.value)}/><span>Custom color</span></label><input className="hex-input" aria-label={`${label} hex code`} maxLength={7} spellCheck={false} value={hex} onChange={event => { const next = event.target.value; setHex(next); if (/^#[0-9a-f]{6}$/i.test(next)) onChange(next) }} onBlur={() => setHex(normalized)}/></div>
  </div>
}
