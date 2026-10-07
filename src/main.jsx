import { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import DOMPurify from 'dompurify'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import CodeBlock from '@tiptap/extension-code-block'
import Color from '@tiptap/extension-color'
import { TextStyle } from '@tiptap/extension-text-style'
import FontFamily from '@tiptap/extension-font-family'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table'
import { findTable, TableMap } from '@tiptap/pm/tables'
import { Selection } from '@tiptap/pm/state'
import {
  Archive, ArchiveRestore, ArrowUpRight, Bold, Check, ChevronDown, Code2, Eraser, FileText, Grid2X2, ImagePlus, Italic,
  LayoutList, List, ListChecks, ListOrdered, LogOut, Menu, MoreHorizontal, Palette, Pencil, Pin, Plus, Quote, Search, Shield,
  Sparkles, Strikethrough, Table2, TextCursorInput, Trash2, Type, Underline, Undo2, Redo2, UserPlus, Users, X,
} from 'lucide-react'
import { adminApi, authApi, categoriesApi, notesApi } from './api'
import { AppearanceProvider, ColorPicker, ThemePicker } from './appearance'
import { FontSize, NoteImage, isImageSource, prepareNoteImage, readableNoteColor } from './editor-extensions'
import './styles.css'

const NOTE_COLORS = [
  { name: 'Paper', value: '#fffdf7' },
  { name: 'Butter', value: '#fff0b8' },
  { name: 'Mint', value: '#dff5e5' },
  { name: 'Sky', value: '#ddecff' },
  { name: 'Lavender', value: '#eee5ff' },
  { name: 'Blush', value: '#ffe2e7' },
  { name: 'Peach', value: '#ffe4cc' },
  { name: 'Tangerine cream', value: '#ffedcf' },
  { name: 'Lemonade', value: '#fff7bd' },
  { name: 'Pistachio', value: '#e7f3c8' },
  { name: 'Seafoam', value: '#ccefe2' },
  { name: 'Aqua', value: '#d4f4f3' },
  { name: 'Blueberry', value: '#d8e6ff' },
  { name: 'Lilac', value: '#e7ddff' },
  { name: 'Cotton candy', value: '#ffdbe8' },
  { name: 'Rose', value: '#ffd9d5' },
  { name: 'Cloud', value: '#edf0f6' },
  { name: 'Pebble', value: '#e9e5dd' },
]
const COLORS = NOTE_COLORS.map(color => color.value)
const TEXT_COLORS = [
  { name: 'Ink', value: '#252525' },
  { name: 'Slate', value: '#68645e' },
  { name: 'Cherry', value: '#d9485f' },
  { name: 'Coral', value: '#f06a5f' },
  { name: 'Tangerine', value: '#ed8a22' },
  { name: 'Sunshine', value: '#c99700' },
  { name: 'Lime', value: '#72942a' },
  { name: 'Emerald', value: '#248451' },
  { name: 'Teal', value: '#168b92' },
  { name: 'Sky', value: '#258fc2' },
  { name: 'Ocean', value: '#4169d8' },
  { name: 'Violet', value: '#7658d6' },
  { name: 'Grape', value: '#9b51cf' },
  { name: 'Fuchsia', value: '#d84eaa' },
]
const FONT_OPTIONS = [
  { label: 'Default', value: null },
  { label: 'Modern sans', value: 'Inter, Arial, sans-serif' },
  { label: 'Avenir', value: 'Avenir Next, Avenir, sans-serif' },
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Verdana', value: 'Verdana, sans-serif' },
  { label: 'Trebuchet', value: 'Trebuchet MS, sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Palatino', value: 'Palatino, Book Antiqua, serif' },
  { label: 'Times', value: 'Times New Roman, serif' },
  { label: 'Courier', value: 'Courier New, monospace' },
  { label: 'Monospace', value: 'Menlo, Consolas, monospace' },
  { label: 'Handwritten', value: 'Comic Sans MS, cursive' },
]
const SIZE_OPTIONS = [
  { label: 'Default', value: null },
  { label: 'Extra small', value: '12px' },
  { label: 'Small', value: '14px' },
  { label: 'Medium', value: '16px' },
  { label: 'Large', value: '20px' },
  { label: 'Extra large', value: '24px' },
  { label: 'Display', value: '32px' },
]

const FormattableCodeBlock = CodeBlock.extend({
  marks: '_',
})

function tableRowHeight(value) {
  const height = Number.parseInt(String(value), 10)
  return Number.isInteger(height) && height >= 32 && height <= 400 ? height : null
}

const SizedTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      rowHeight: {
        default: null,
        parseHTML: element => tableRowHeight(element.style.height),
        renderHTML: attributes => {
          const height = tableRowHeight(attributes.rowHeight)
          return height ? { style: `height: ${height}px` } : {}
        },
      },
    }
  },
})

const SizedTableHeader = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      rowHeight: {
        default: null,
        parseHTML: element => tableRowHeight(element.style.height),
        renderHTML: attributes => {
          const height = tableRowHeight(attributes.rowHeight)
          return height ? { style: `height: ${height}px` } : {}
        },
      },
    }
  },
})

function relativeDate(date) {
  if (!date) return 'Never'
  const parsed = new Date(String(date).includes('T') ? date : `${String(date).replace(' ', 'T')}Z`)
  if (Number.isNaN(parsed.getTime())) return 'Recently edited'
  const seconds = Math.max(0, (Date.now() - parsed.getTime()) / 1000)
  if (seconds < 60) return 'Edited just now'
  if (seconds < 3600) return `Edited ${Math.floor(seconds / 60)} min ago`
  if (seconds < 86400) return `Edited ${Math.floor(seconds / 3600)} hr ago`
  const days = Math.floor(seconds / 86400)
  return `Edited ${days} ${days === 1 ? 'day' : 'days'} ago`
}

function formatDate(date) {
  if (!date) return 'Never'
  const parsed = new Date(String(date).includes('T') ? date : `${date.replace(' ', 'T')}Z`)
  return Number.isNaN(parsed.getTime()) ? date : parsed.toLocaleString()
}

function Root() {
  const [user, setUser] = useState(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    authApi.me().then(setUser).catch(() => setUser(null)).finally(() => setChecking(false))
  }, [])

  async function logout() {
    try { await authApi.logout() } finally {
      setUser(null)
      window.history.replaceState({}, '', '/')
    }
  }

  if (checking) return <FullPageMessage title="Opening your notes…" />
  if (!user) return <LoginPage onLogin={setUser} />

  const adminPath = window.location.pathname === '/admin' || window.location.pathname.startsWith('/admin/')
  if (adminPath && !user.is_admin) {
    return <FullPageMessage title="Administrator access required" detail="Your account cannot open this page." action={<a className="primary-button" href="/">Back to notes</a>} />
  }
  if (adminPath) return <AdminPage user={user} onLogout={logout} />
  return <NotesApp user={user} onLogout={logout} />
}

function LoginPage({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const [submitting, setSubmitting] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      onLogin(await authApi.login(email, password))
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  return <main className="auth-page">
    <div className="auth-appearance"><ThemePicker compact/></div>
    <section className="auth-story" aria-label="About Paper Notes">
      <a className="brand" href="/"><div className="brand-mark"><FileText size={22}/></div><span>paper<span className="brand-period">.</span></span></a>
      <div className="auth-story-copy"><span className="intro-pill"><Sparkles size={14}/> A little clarity, every day</span><h1>Your thoughts.<br/>A beautiful home.</h1><p>Big ideas, small reminders, and everything in between. Keep it all in a space that feels like you.</p><div className="decorative-notes" aria-hidden="true"><div className="decorative-note"><span>MAKE ROOM FOR IDEAS</span><strong>Something good<br/>starts here.</strong><div className="decorative-lines"><i/><i/><i/></div></div><div className="decorative-note back"><Sparkles size={26}/><strong>Think freely.<br/>Write beautifully.</strong></div></div></div>
      <p className="auth-story-footer">A quieter place for your everyday ideas.</p>
    </section>
    <section className="auth-card">
      <p className="eyebrow">Your personal workspace</p>
      <h2>Welcome back.</h2>
      <p className="auth-intro">A fresh page is waiting for you.</p>
      {error && <div className="error-banner" role="alert">{error}</div>}
      <form onSubmit={submit} className="auth-form">
        <label>Email address<input type="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com"/></label>
        <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} placeholder="Enter your password"/></label>
        <button className="primary-button wide" disabled={submitting}>{submitting ? 'Signing in…' : 'Sign in to your space'}<ArrowUpRight size={17}/></button>
      </form>
      <p className="auth-footnote">Need an account? Contact your administrator.</p>
    </section>
  </main>
}

function NotesApp({ user, onLogout }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [notes, setNotes] = useState([])
  const [categories, setCategories] = useState([])
  const [selectedView, setSelectedView] = useState('all')
  const [search, setSearch] = useState('')
  const [layout, setLayout] = useState('grid')
  const [editing, setEditing] = useState(null)
  const [menu, setMenu] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const dismiss = event => { if (!event.target.closest('.note-actions-menu, .note-card-actions')) setMenu(null) }
    const key = event => { if (event.key === 'Escape') { setMenu(null); setSidebarOpen(false) } }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', key) }
  }, [])

  useEffect(() => {
    Promise.all([notesApi.list(), categoriesApi.list()])
      .then(([loadedNotes, loadedCategories]) => {
        setNotes(loadedNotes)
        setCategories(loadedCategories)
      })
      .catch(requestError => setError(requestError.message))
      .finally(() => setLoading(false))
  }, [])

  const visibleNotes = useMemo(() => notes.filter(note => {
    const archived = Boolean(Number(note.is_archived))
    const matchesView = selectedView === 'archive'
      ? archived
      : !archived && (selectedView === 'all' || (selectedView === 'pinned' ? Boolean(Number(note.is_pinned)) : String(note.category_id) === String(selectedView)))
    const text = `${note.title || ''} ${DOMPurify.sanitize(note.content || '', { ALLOWED_TAGS: [] })}`.toLowerCase()
    return matchesView && text.includes(search.toLowerCase())
  }), [notes, selectedView, search])

  const pinned = selectedView === 'archive' ? [] : visibleNotes.filter(note => Boolean(Number(note.is_pinned)))
  const regular = selectedView === 'archive' ? visibleNotes : visibleNotes.filter(note => !Boolean(Number(note.is_pinned)))
  const archiveCount = notes.filter(note => Boolean(Number(note.is_archived))).length
  const activeCount = notes.length - archiveCount
  const title = selectedView === 'archive'
    ? 'Archive'
    : selectedView === 'pinned' ? 'Pinned notes' : selectedView === 'all' ? 'All notes' : categories.find(category => String(category.id) === String(selectedView))?.name || 'Notes'

  async function saveNote(note) {
    setError('')
    const payload = {
      ...note,
      title: (note.title || '').trim(),
      is_pinned: Boolean(Number(note.is_pinned)),
      is_archived: Boolean(Number(note.is_archived)),
    }
    try {
      const saved = payload.id ? await notesApi.update(payload.id, payload) : await notesApi.create(payload)
      setNotes(current => payload.id ? current.map(item => String(item.id) === String(saved.id) ? saved : item) : [saved, ...current])
      setEditing(null)
      setMenu(null)
      return true
    } catch (requestError) {
      setError(requestError.message)
      return false
    }
  }

  async function deleteNote(id) {
    if (!window.confirm('Delete this note permanently?')) return
    setError('')
    try {
      await notesApi.remove(id)
      setNotes(current => current.filter(note => String(note.id) !== String(id)))
      setMenu(null)
    } catch (requestError) { setError(requestError.message) }
  }

  function togglePin(note) { saveNote({ ...note, is_pinned: !Boolean(Number(note.is_pinned)) }) }
  function toggleArchive(note) { saveNote({ ...note, is_archived: !Boolean(Number(note.is_archived)) }) }

  async function addCategory() {
    const name = window.prompt('Name this category')?.trim()
    if (!name) return
    setError('')
    try {
      const created = await categoriesApi.create(name)
      setCategories(current => [...current, created].sort((a, b) => a.name.localeCompare(b.name)))
    } catch (requestError) { setError(requestError.message) }
  }

  async function deleteCategory(category) {
    if (!window.confirm(`Delete the “${category.name}” category? Its notes will be kept without a category.`)) return false
    setError('')
    try {
      await categoriesApi.remove(category.id)
      setCategories(current => current.filter(item => String(item.id) !== String(category.id)))
      setNotes(current => current.map(note => String(note.category_id) === String(category.id) ? { ...note, category_id: null } : note))
      if (String(selectedView) === String(category.id)) setSelectedView('all')
      return true
    } catch (requestError) {
      setError(requestError.message)
      return false
    }
  }

  const newNote = {
    title: '', content: '', color: COLORS[0], is_pinned: false, is_archived: false,
    category_id: !['all', 'archive', 'pinned'].includes(selectedView) ? selectedView : null,
  }
  const listClass = layout === 'grid' ? 'notes-grid' : 'notes-list'
  function navigate(view) { setSelectedView(view); setSidebarOpen(false); setMenu(null) }
  const pinnedCount = notes.filter(note => !Boolean(Number(note.is_archived)) && Boolean(Number(note.is_pinned))).length
  const date = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
  const collection = items => <NoteCollection notes={items} listClass={listClass} categories={categories} onEdit={setEditing} onPin={togglePin} onArchive={toggleArchive} onDelete={deleteNote} menu={menu} setMenu={setMenu}/>

  return <div className="notes-app">
    {sidebarOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setSidebarOpen(false)}/>}
    <aside className={`app-sidebar ${sidebarOpen ? 'open' : ''}`}>
      <a className="brand" href="/"><div className="brand-mark"><FileText size={21}/></div><span>paper<span className="brand-period">.</span></span></a>
      <button className="sidebar-close icon-square" aria-label="Close navigation" onClick={() => setSidebarOpen(false)}><X size={19}/></button>
      <div className="workspace-label"><span className="workspace-dot"/> Personal workspace</div>
      <p className="nav-label">Your library</p>
      <nav className="sidebar-nav" aria-label="Note library">
        <button onClick={() => navigate('all')} className={`sidebar-link ${selectedView === 'all' ? 'active' : ''}`}><Grid2X2 size={18}/><span>All notes</span><small>{activeCount}</small></button>
        <button onClick={() => navigate('pinned')} className={`sidebar-link ${selectedView === 'pinned' ? 'active' : ''}`}><Pin size={18}/><span>Pinned notes</span><small>{pinnedCount}</small></button>
        <button onClick={() => navigate('archive')} className={`sidebar-link ${selectedView === 'archive' ? 'active' : ''}`}><Archive size={18}/><span>Archive</span><small>{archiveCount}</small></button>
      </nav>
      <div className="category-heading"><p className="nav-label">Categories</p><button onClick={addCategory} className="icon-square" title="Add category" aria-label="Add category"><Plus size={16}/></button></div>
      <nav className="sidebar-categories" aria-label="Categories">{categories.map((category, index) => <div key={category.id} className="category-nav-row"><button onClick={() => navigate(category.id)} className={`sidebar-link ${String(selectedView) === String(category.id) ? 'active' : ''}`}><span className={`category-dot dot-${index % 4}`}/><span>{category.name}</span><small>{notes.filter(note => !Boolean(Number(note.is_archived)) && String(note.category_id) === String(category.id)).length}</small></button><button type="button" onClick={() => deleteCategory(category)} className="category-delete" title={`Delete ${category.name}`} aria-label={`Delete ${category.name}`}><Trash2 size={13}/></button></div>)}{!categories.length && <button className="add-category-link" onClick={addCategory}><Plus size={14}/> Create your first category</button>}</nav>
      <div className="sidebar-bottom"><ThemePicker/><AccountPanel user={user} onLogout={onLogout}/></div>
    </aside>

    <main className="app-main">
      <header className="app-header">
        <div className="header-breadcrumb"><button className="mobile-menu icon-square" aria-label="Open navigation" onClick={() => setSidebarOpen(true)}><Menu size={20}/></button><span>My workspace</span><span className="breadcrumb-slash">/</span><strong>{title}</strong></div>
        <div className="header-tools"><ThemePicker compact/><span className="header-avatar" title={user.display_name}>{(user.display_name || user.email).charAt(0).toUpperCase()}</span></div>
      </header>
      <div className="workspace-content">
        <section className="workspace-intro"><div><p className="eyebrow"><span className="tiny-accent"/>{date}</p><h1>{title}<span className="title-dot">.</span></h1><p className="workspace-subtitle">{selectedView === 'archive' ? 'Tucked away, ready whenever you need them.' : selectedView === 'pinned' ? 'Keep your most important thoughts close.' : 'A little space for your ideas, plans, and everyday inspiration.'}</p></div><button onClick={() => setEditing(newNote)} className="primary-button new-note-button"><Plus size={18}/><span>Create a note</span></button></section>
        {error && <div className="error-banner" role="alert">{error}<button aria-label="Dismiss error" onClick={() => setError('')}><X size={16}/></button></div>}
        <div className="collection-toolbar"><label className="search-field"><Search size={18}/><input aria-label="Search notes" value={search} onChange={event => setSearch(event.target.value)} placeholder="Find a little inspiration…"/>{search && <button type="button" aria-label="Clear search" onClick={() => setSearch('')}><X size={15}/></button>}</label><div className="collection-tools"><span className="note-count">{loading ? 'Opening your library…' : `${visibleNotes.length} ${visibleNotes.length === 1 ? 'note' : 'notes'}`}</span><div className="layout-switch" aria-label="Note layout"><button onClick={() => setLayout('grid')} className={`icon-button ${layout === 'grid' ? 'selected' : ''}`} aria-label="Grid view" aria-pressed={layout === 'grid'}><Grid2X2 size={17}/></button><button onClick={() => setLayout('list')} className={`icon-button ${layout === 'list' ? 'selected' : ''}`} aria-label="List view" aria-pressed={layout === 'list'}><LayoutList size={18}/></button></div></div></div>
        {loading ? <div className="notes-grid" aria-label="Loading notes">{[1, 2, 3].map(item => <div key={item} className="note-skeleton"><i/><i/><i/></div>)}</div> : <>
          {pinned.length > 0 && <section className="note-section"><div className="section-heading"><Pin size={14}/><h2>Pinned notes</h2><span>{pinned.length}</span><i/></div>{collection(pinned)}</section>}
          {(regular.length > 0 || !pinned.length) && <section className="note-section"><div className="section-heading"><FileText size={14}/><h2>{selectedView === 'archive' ? 'Archived notes' : pinned.length ? 'Everything else' : 'Your notes'}</h2><span>{regular.length}</span><i/></div>{regular.length ? collection(regular) : <div className="empty-state"><div className="empty-illustration"><FileText size={30}/><Sparkles size={16}/></div><h2>{search ? 'No matching notes' : selectedView === 'archive' ? 'A clean slate.' : selectedView === 'pinned' ? 'Keep something close.' : 'Every idea starts somewhere.'}</h2><p>{search ? 'Try another word or clear your search.' : selectedView === 'archive' ? 'Notes you archive will be waiting here.' : selectedView === 'pinned' ? 'Pin a note to give it a place here.' : 'Capture a thought, make a list, or save a little inspiration.'}</p>{search ? <button className="secondary-button" onClick={() => setSearch('')}>Clear search</button> : !['archive', 'pinned'].includes(selectedView) && <button className="primary-button" onClick={() => setEditing(newNote)}><Plus size={16}/> Write your first note</button>}</div>}</section>}
        </>}
        <footer className="workspace-footer"><span>Made for a clearer mind.</span><span><span className="tiny-accent"/> Your own little corner.</span></footer>
      </div>
    </main>
    {editing && <NoteEditor key={editing.id || 'new'} note={editing} categories={categories} onClose={() => setEditing(null)} onSave={saveNote} onDeleteCategory={deleteCategory} saveError={error}/>}
  </div>
}

function AccountPanel({ user, onLogout }) {
  return <div className="account-panel">
    <div className="account-avatar">{(user.display_name || user.email).charAt(0).toUpperCase()}</div>
    <div className="account-identity"><strong>{user.display_name}</strong><span>{user.email}</span></div>
    {user.is_admin && <a href="/admin/" title="Administration" aria-label="Administration"><Shield size={16}/></a>}
    <button onClick={onLogout} title="Sign out" aria-label="Sign out"><LogOut size={16}/></button>
  </div>
}

function NoteCollection({ notes, listClass, categories, onEdit, onPin, onArchive, onDelete, menu, setMenu }) {
  return <div className={listClass}>{notes.map(note => <NoteCard key={note.id} note={note} category={categories.find(category => String(category.id) === String(note.category_id))} onEdit={() => onEdit(note)} onPin={() => onPin(note)} onArchive={() => onArchive(note)} onDelete={() => onDelete(note.id)} menu={menu} setMenu={setMenu}/>)}</div>
}

function NoteCard({ note, category, onEdit, onPin, onArchive, onDelete, menu, setMenu }) {
  const archived = Boolean(Number(note.is_archived))
  const pinned = Boolean(Number(note.is_pinned))
  const color = note.color || COLORS[0]
  return <article style={{ backgroundColor: color, '--note-color': color, '--note-ink': readableNoteColor(color) }} className="note-card">
    <div className="note-card-top"><span className="note-category">{category ? <><span className="category-dot"/>{category.name}</> : <><FileText size={12}/> Personal note</>}</span><div className="note-card-actions">{!archived && <button onClick={onPin} className={`card-icon ${pinned ? 'is-pinned' : ''}`} title={pinned ? 'Unpin note' : 'Pin note'} aria-label={pinned ? 'Unpin note' : 'Pin note'} aria-pressed={pinned}><Pin size={15} fill={pinned ? 'currentColor' : 'none'}/></button>}<button onClick={() => setMenu(menu === note.id ? null : note.id)} className="card-icon" aria-label={`Actions for ${note.title || 'Untitled note'}`} aria-expanded={menu === note.id}><MoreHorizontal size={18}/></button></div></div>
    {menu === note.id && <div className="note-actions-menu"><button onClick={onEdit} className="menu-item"><Pencil size={14}/> Edit note</button><button onClick={onArchive} className="menu-item">{archived ? <ArchiveRestore size={14}/> : <Archive size={14}/>} {archived ? 'Restore note' : 'Archive note'}</button><button onClick={onDelete} className="menu-item danger"><Trash2 size={14}/> Delete note</button></div>}
    <div className="note-card-open" role="button" tabIndex={0} aria-label={`Edit ${note.title || 'Untitled note'}`} onClick={onEdit} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onEdit() } }}><h3>{note.title || 'Untitled note'}</h3><div className="note-card-preview rich-content" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(note.content || '').replace(/<input\b/g, '<input disabled tabindex="-1"').replace(/<a\b/g, '<a tabindex="-1"') }}/>{!note.content && <p className="blank-note">A thought waiting to happen…</p>}</div>
    <footer><span>{relativeDate(note.updated_at)}</span><button className="card-open-button" title="Open note" aria-label={`Open ${note.title || 'Untitled note'}`} onClick={onEdit}><ArrowUpRight size={16}/></button></footer>
  </article>
}

function NoteEditor({ note, categories, onClose, onSave, onDeleteCategory, saveError }) {
  const formattingSelectionRef = useRef(null)
  const shellRef = useRef(null)
  const fileRef = useRef(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const [draft, setDraft] = useState(note)
  const [saving, setSaving] = useState(false)
  const [menu, setMenu] = useState(null)
  const [imageBusy, setImageBusy] = useState(false)
  const [imageError, setImageError] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [tableRows, setTableRows] = useState(3)
  const [tableColumns, setTableColumns] = useState(3)
  const [tableColumnWidth, setTableColumnWidth] = useState(160)
  const [tableRowHeight, setTableRowHeight] = useState(56)
  const editor = useEditor({
    extensions: [StarterKit.configure({ codeBlock: false }), FormattableCodeBlock, TaskList, TaskItem.configure({ nested: true }), Table.configure({ resizable: true, cellMinWidth: 84 }), TableRow, SizedTableHeader, SizedTableCell, TextStyle, FontSize, Color, FontFamily, NoteImage],
    content: note.content,
    editorProps: { attributes: { class: 'editor-prose', 'aria-label': 'Note text', role: 'textbox', 'aria-multiline': 'true' } },
    onUpdate: ({ editor: activeEditor }) => setDraft(value => ({ ...value, content: activeEditor.getHTML() })),
    onSelectionUpdate: ({ editor: activeEditor }) => { if (activeEditor.isFocused) formattingSelectionRef.current = activeEditor.state.selection.toJSON() },
  })
  const formatting = useEditorState({ editor, selector: ({ editor: activeEditor }) => ({
    bold: activeEditor.isActive('bold'), italic: activeEditor.isActive('italic'), underline: activeEditor.isActive('underline'), strike: activeEditor.isActive('strike'),
    inTable: activeEditor.isActive('table'), inCodeBlock: activeEditor.isActive('codeBlock'), inBlockquote: activeEditor.isActive('blockquote'),
    bulletList: activeEditor.isActive('bulletList'), orderedList: activeEditor.isActive('orderedList'), taskList: activeEditor.isActive('taskList'),
    color: activeEditor.getAttributes('textStyle').color || null, font: activeEditor.getAttributes('textStyle').fontFamily || null,
    size: activeEditor.getAttributes('textStyle').fontSize || null, canUndo: activeEditor.can().undo(), canRedo: activeEditor.can().redo(), image: activeEditor.isActive('image'),
  }) })
  useEffect(() => {
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previousOverflow; previousFocus?.focus() }
  }, [])
  useEffect(() => {
    const key = event => {
      if (event.key === 'Escape') { event.preventDefault(); if (menu) setMenu(null); else if (!saving && !imageBusy) closeRef.current() }
      if (event.key === 'Tab') {
        const controls = [...shellRef.current.querySelectorAll('button:not(:disabled), input:not(:disabled):not([tabindex="-1"]), a[href], [tabindex="0"], [contenteditable="true"]')].filter(element => element.getClientRects().length)
        const first = controls[0], last = controls[controls.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && !saving && !imageBusy) { event.preventDefault(); shellRef.current.querySelector('[data-save-note]')?.click() }
    }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [menu, saving, imageBusy])
  if (!editor) return null

  const rememberFormattingSelection = () => { formattingSelectionRef.current = editor.state.selection.toJSON() }
  const selectedChain = () => {
    let chain = editor.chain()
    if (!editor.isFocused && formattingSelectionRef.current) {
      try {
        const selection = Selection.fromJSON(editor.state.doc, formattingSelectionRef.current)
        chain = chain.command(({ tr }) => { tr.setSelection(selection); return true })
      } catch { formattingSelectionRef.current = null }
    }
    return chain.focus()
  }
  const applyInlineFormatting = transform => transform(selectedChain()).run()
  const clearFormatting = chain => {
    const preserveBlock = formatting?.inTable || formatting?.inCodeBlock || formatting?.inBlockquote
    return preserveBlock ? chain.unsetAllMarks() : chain.unsetAllMarks().clearNodes()
  }
  const command = transform => () => applyInlineFormatting(transform)
  const button = (label, icon, action, active = false, disabled = false) => <button type="button" aria-label={label} title={label} aria-pressed={active} disabled={disabled} onMouseDown={event => { event.preventDefault(); rememberFormattingSelection() }} onClick={() => { action(); setMenu(null) }} className={`format-button ${active ? 'active' : ''}`}>{icon}</button>
  const toggleMenu = name => { rememberFormattingSelection(); setMenu(current => current === name ? null : name) }
  const trigger = (name, label, icon, text) => <button type="button" data-menu-trigger aria-label={label} title={label} aria-expanded={menu === name} onMouseDown={event => { event.preventDefault(); rememberFormattingSelection() }} onClick={() => toggleMenu(name)} className={`format-menu-trigger ${menu === name ? 'active' : ''}`}>{icon}{text && <span>{text}</span>}<ChevronDown size={12}/></button>
  async function submit() {
    if (saving || imageBusy) return
    setSaving(true)
    const saved = await onSave({ ...draft, content: editor.getHTML() })
    if (!saved) setSaving(false)
  }
  function insertImage(attributes) {
    const content = editor.getHTML()
    if (content.length + attributes.src.length > 4 * 1024 * 1024) { setImageError('This note is getting large. Use a smaller image or put it in a new note.'); return }
    const chain = selectedChain()
    if (formatting?.inCodeBlock) chain.toggleCodeBlock()
    chain.insertContent([{ type: 'image', attrs: attributes }, { type: 'paragraph' }]).run()
    setMenu(null)
    setImageError('')
    setImageUrl('')
  }
  async function uploadImage(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setImageBusy(true); setImageError('')
    try { insertImage(await prepareNoteImage(file)) }
    catch (error) { setImageError(error.message || 'This image could not be opened. Please choose another.') }
    finally { setImageBusy(false) }
  }
  function addImageUrl(event) {
    event.preventDefault()
    const src = imageUrl.trim()
    if (!src.startsWith('https://') || !isImageSource(src)) { setImageError('Enter a complete image URL beginning with https://.'); return }
    try { const url = new URL(src); if (url.username || url.password) throw new Error() }
    catch { setImageError('Enter a valid HTTPS image URL.'); return }
    insertImage({ src, alt: 'Note image' })
  }
  function tableDimension(value) { return Math.min(12, Math.max(1, Number.parseInt(value, 10) || 1)) }
  function tablePixels(value, minimum, maximum) { return Math.min(maximum, Math.max(minimum, Number.parseInt(value, 10) || minimum)) }
  function insertTable() {
    selectedChain().insertTable({ rows: tableDimension(tableRows), cols: tableDimension(tableColumns), withHeaderRow: true }).run()
    setMenu(null)
  }
  function runTableAction(action) {
    selectedChain().run()
    if (editor.can()[action]()) editor.chain().focus()[action]().run()
    setMenu(null)
  }
  function getCurrentTableCell() {
    const table = findTable(editor.state.selection.$from)
    if (!table) return null
    const map = TableMap.get(table.node)
    const selection = editor.state.selection
    let cellPosition = selection.$anchorCell?.pos
    if (cellPosition === undefined) {
      for (let depth = selection.$from.depth; depth > 0; depth -= 1) {
        const node = selection.$from.node(depth)
        if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
          cellPosition = selection.$from.before(depth)
          break
        }
      }
    }
    if (cellPosition === undefined) return null
    const relativePosition = cellPosition - table.start
    return { table, map, rect: map.findCell(relativePosition) }
  }
  function setCurrentColumnWidth() {
    selectedChain().run()
    const context = getCurrentTableCell()
    if (!context) return
    const width = tablePixels(tableColumnWidth, 84, 600)
    setTableColumnWidth(width)
    const { table, map, rect } = context
    const transaction = editor.state.tr
    const seenCells = new Set()
    for (let row = 0; row < map.height; row += 1) {
      const cellPosition = map.map[row * map.width + rect.left]
      if (seenCells.has(cellPosition)) continue
      seenCells.add(cellPosition)
      const cell = transaction.doc.nodeAt(table.start + cellPosition)
      if (!cell) continue
      const cellRect = map.findCell(cellPosition)
      const colwidth = Array.from({ length: cell.attrs.colspan }, (_, index) => cell.attrs.colwidth?.[index] || 0)
      colwidth[rect.left - cellRect.left] = width
      transaction.setNodeMarkup(table.start + cellPosition, undefined, { ...cell.attrs, colwidth })
    }
    editor.view.dispatch(transaction)
    setMenu(null)
  }
  function setCurrentRowHeight() {
    selectedChain().run()
    const context = getCurrentTableCell()
    if (!context) return
    const height = tablePixels(tableRowHeight, 32, 400)
    setTableRowHeight(height)
    const { table, map, rect } = context
    const transaction = editor.state.tr
    const seenCells = new Set()
    for (let column = 0; column < map.width; column += 1) {
      const cellPosition = map.map[rect.top * map.width + column]
      if (seenCells.has(cellPosition)) continue
      seenCells.add(cellPosition)
      const cell = transaction.doc.nodeAt(table.start + cellPosition)
      if (cell) transaction.setNodeMarkup(table.start + cellPosition, undefined, { ...cell.attrs, rowHeight: height })
    }
    editor.view.dispatch(transaction)
    setMenu(null)
  }
  const tableActions = formatting?.inTable ? [
    { label: 'Add row above', action: 'addRowBefore' },
    { label: 'Add row below', action: 'addRowAfter' },
    { label: 'Remove row', action: 'deleteRow' },
    { label: 'Add column left', action: 'addColumnBefore' },
    { label: 'Add column right', action: 'addColumnAfter' },
    { label: 'Remove column', action: 'deleteColumn' },
  ] : []
  const archived = Boolean(Number(draft.is_archived))
  const selectedCategory = categories.find(category => String(category.id) === String(draft.category_id))
  const normalizedFont = value => (value || '').replace(/["']/g, '').replace(/\s*,\s*/g, ',').toLowerCase().trim()
  const currentFont = FONT_OPTIONS.find(option => normalizedFont(option.value) === normalizedFont(formatting?.font))?.label || 'Font'
  const ink = readableNoteColor(draft.color)

  return <div className="editor-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !saving && !imageBusy) onClose() }}><section ref={shellRef} className="note-editor-shell" role="dialog" aria-modal="true" aria-labelledby="note-dialog-title" onMouseDown={event => { if (!event.target.closest('.editor-popover, [data-menu-trigger]')) setMenu(null) }}>
    <header className="note-editor-header"><div className="editor-heading-icon"><Pencil size={18}/></div><div><h2 id="note-dialog-title">{note.id ? 'A little editing space' : 'A fresh page'}</h2><p>{note.id ? 'Give your thoughts a little polish.' : 'Let your thoughts take shape.'}</p></div><button onClick={onClose} className="icon-square" disabled={saving || imageBusy} aria-label="Close note"><X size={20}/></button></header>
    <div className="format-toolbar" role="toolbar" aria-label="Note formatting">
      <div className="toolbar-group">
        <div className="toolbar-menu">{trigger('font', 'Font', <Type size={16}/>, currentFont)}{menu === 'font' && <div className="editor-popover format-menu font-menu" aria-label="Font options">{FONT_OPTIONS.map(option => <button key={option.label} type="button" style={{ fontFamily: option.value || undefined }} aria-pressed={normalizedFont(formatting?.font) === normalizedFont(option.value)} onMouseDown={event => event.preventDefault()} onClick={() => { applyInlineFormatting(chain => option.value ? chain.setFontFamily(option.value) : chain.unsetFontFamily()); setMenu(null) }}><span>{option.label}</span>{normalizedFont(formatting?.font) === normalizedFont(option.value) && <Check size={13}/>}</button>)}</div>}</div>
        <div className="toolbar-menu">{trigger('size', 'Text size', <TextCursorInput size={16}/>)}{menu === 'size' && <div className="editor-popover format-menu" aria-label="Text size options">{SIZE_OPTIONS.map(option => <button key={option.label} type="button" aria-pressed={formatting?.size === option.value} onMouseDown={event => event.preventDefault()} onClick={() => { applyInlineFormatting(chain => option.value ? chain.setMark('textStyle', { fontSize: option.value }) : chain.setMark('textStyle', { fontSize: null }).removeEmptyTextStyle()); setMenu(null) }}>{option.label}{formatting?.size === option.value && <Check size={13}/>}</button>)}</div>}</div>
      </div><span className="toolbar-divider"/>
      <div className="toolbar-group">{button('Bold', <Bold size={16}/>, command(chain => chain.toggleBold()), formatting?.bold)}{button('Italic', <Italic size={16}/>, command(chain => chain.toggleItalic()), formatting?.italic)}{button('Underline', <Underline size={16}/>, command(chain => chain.toggleUnderline()), formatting?.underline)}{button('Strikethrough', <Strikethrough size={16}/>, command(chain => chain.toggleStrike()), formatting?.strike)}<div className="toolbar-menu">{trigger('textColor', 'Text color', <span className="text-color-icon"><Type size={16}/><i style={{ background: formatting?.color || ink }}/></span>)}{menu === 'textColor' && <div className="editor-popover text-color-menu"><ColorPicker label="Text color" colors={TEXT_COLORS} value={formatting?.color || ink} onChange={color => applyInlineFormatting(chain => chain.setColor(color))} onPreset={() => setMenu(null)}/><button className="reset-text-color" onMouseDown={event => event.preventDefault()} onClick={() => { applyInlineFormatting(chain => chain.unsetColor()); setMenu(null) }}>Reset text color</button></div>}</div></div>
      <span className="toolbar-divider"/><div className="toolbar-group">{button('Bullet list', <List size={17}/>, command(chain => chain.toggleBulletList()), formatting?.bulletList)}{button('Numbered list', <ListOrdered size={17}/>, command(chain => chain.toggleOrderedList()), formatting?.orderedList)}{button('Checklist', <ListChecks size={17}/>, command(chain => chain.toggleTaskList()), formatting?.taskList)}{button('Quote block', <Quote size={16}/>, command(chain => chain.toggleBlockquote()), formatting?.inBlockquote)}{button('Code block', <Code2 size={17}/>, command(chain => chain.toggleCodeBlock()), formatting?.inCodeBlock)}</div>
      <span className="toolbar-divider"/><div className="toolbar-group">
        <div className="toolbar-menu">{trigger('table', 'Table options', <Table2 size={16}/>)}{menu === 'table' && <div className="editor-popover table-menu">{tableActions.length > 0 && <><strong>Edit table</strong><div className="table-action-grid">{tableActions.map(item => <button key={item.action} type="button" className="table-action" disabled={!editor.can()[item.action]()} onMouseDown={event => event.preventDefault()} onClick={() => runTableAction(item.action)}>{item.label}</button>)}</div><strong>Resize current</strong><label>Column px<input type="number" min="84" max="600" value={tableColumnWidth} onChange={event => setTableColumnWidth(event.target.value)}/></label><button type="button" className="table-action" onMouseDown={event => event.preventDefault()} onClick={setCurrentColumnWidth}>Set column width</button><label>Row px<input type="number" min="32" max="400" value={tableRowHeight} onChange={event => setTableRowHeight(event.target.value)}/></label><button type="button" className="table-action" onMouseDown={event => event.preventDefault()} onClick={setCurrentRowHeight}>Set row height</button><small>Drag a column border to resize it.</small><button type="button" className="table-action danger" disabled={!editor.can().deleteTable()} onMouseDown={event => event.preventDefault()} onClick={() => runTableAction('deleteTable')}>Delete table</button><span className="table-menu-divider"/></>}<strong>{tableActions.length ? 'Insert another table' : 'Insert table'}</strong><div className="table-insert-dimensions"><label>Rows<input type="number" min="1" max="12" value={tableRows} onChange={event => setTableRows(event.target.value)}/></label><label>Columns<input type="number" min="1" max="12" value={tableColumns} onChange={event => setTableColumns(event.target.value)}/></label></div><button type="button" onMouseDown={event => event.preventDefault()} onClick={insertTable}>Insert table</button></div>}</div>
        <div className="toolbar-menu">{trigger('image', 'Add image', <ImagePlus size={17}/>)}{menu === 'image' && <div className="editor-popover image-menu"><strong>A picture belongs here.</strong><p>Add an image from your device or a link.</p><button className="primary-button wide" disabled={imageBusy} onClick={() => fileRef.current.click()}><ImagePlus size={16}/>{imageBusy ? 'Preparing image…' : 'Choose an image'}</button><small>PNG, JPG, WebP · up to 10 MB</small><div className="popover-divider"/><form onSubmit={addImageUrl}><label>Or paste an image link<input type="url" aria-label="Image URL" placeholder="https://…" value={imageUrl} onChange={event => setImageUrl(event.target.value)} required/></label><button className="secondary-button wide" disabled={!imageUrl.trim() || imageBusy}>Insert image</button></form></div>}</div>
        {button('Clear formatting', <Eraser size={16}/>, command(clearFormatting))}
      </div><div className="toolbar-history">{button('Undo', <Undo2 size={16}/>, () => editor.chain().focus().undo().run(), false, !formatting?.canUndo)}{button('Redo', <Redo2 size={16}/>, () => editor.chain().focus().redo().run(), false, !formatting?.canRedo)}</div>
    </div>
    <input ref={fileRef} type="file" tabIndex={-1} accept="image/png,image/jpeg,image/webp" aria-label="Upload note image" className="visually-hidden" onChange={uploadImage}/>
    {(imageError || saveError) && <div className="editor-error error-banner" role="alert">{imageError || saveError}{imageError && <button aria-label="Dismiss image error" onClick={() => setImageError('')}><X size={15}/></button>}</div>}
    {imageBusy && <p className="image-status" role="status">Preparing your image…</p>}
    <div className="note-editor-body" style={{ background: draft.color || COLORS[0], '--note-color': draft.color || COLORS[0], '--note-ink': ink }}><input autoFocus aria-label="Note title" maxLength={255} value={draft.title || ''} onChange={event => setDraft(value => ({ ...value, title: event.target.value }))} placeholder="Give this thought a title…" className="note-title-input"/><div className={`note-editor-content ${editor.isEmpty ? 'is-empty' : ''}`}><EditorContent editor={editor}/></div>{formatting?.image && <div className="selected-image-actions"><span>Image selected</span><button type="button" onMouseDown={event => event.preventDefault()} onClick={() => editor.chain().focus().deleteSelection().run()}><Trash2 size={14}/> Remove image</button></div>}</div>
    <footer className="note-editor-footer"><div className="editor-note-options">
      <div className="toolbar-menu"> <button type="button" data-menu-trigger aria-label="Note background color" aria-expanded={menu === 'noteColor'} onClick={() => toggleMenu('noteColor')} className="note-editor-control"><span className="note-color-preview" style={{ background: draft.color || COLORS[0] }}/><span>Note color</span><ChevronDown size={12}/></button>{menu === 'noteColor' && <div className="editor-popover note-color-menu"><ColorPicker label="Note color" colors={NOTE_COLORS} value={draft.color || COLORS[0]} onChange={color => setDraft(value => ({ ...value, color }))} onPreset={() => setMenu(null)}/></div>}</div>
      <div className="toolbar-menu"><button type="button" data-menu-trigger aria-label="Category" aria-expanded={menu === 'category'} onClick={() => toggleMenu('category')} className="note-editor-control"><Grid2X2 size={14}/><span>{selectedCategory?.name || 'No category'}</span><ChevronDown size={12}/></button>{menu === 'category' && <div className="editor-popover note-category-menu"><strong>Organize this thought</strong><button type="button" onClick={() => { setDraft(value => ({ ...value, category_id: null })); setMenu(null) }} className={`note-category-option ${!selectedCategory ? 'active' : ''}`}>No category{!selectedCategory && <Check size={13}/>}</button>{categories.map(category => <div key={category.id} className="note-category-option-row"><button type="button" onClick={() => { setDraft(value => ({ ...value, category_id: category.id })); setMenu(null) }} className={`note-category-option ${String(selectedCategory?.id) === String(category.id) ? 'active' : ''}`}>{category.name}{String(selectedCategory?.id) === String(category.id) && <Check size={13}/>}</button><button type="button" onClick={async () => { if (await onDeleteCategory(category)) { setDraft(value => String(value.category_id) === String(category.id) ? { ...value, category_id: null } : value); setMenu(null) } }} className="note-category-delete-button" title={`Delete ${category.name}`} aria-label={`Delete ${category.name}`}><Trash2 size={13}/></button></div>)}</div>}</div>
      <button type="button" aria-label={archived ? 'Restore note' : 'Archive note'} aria-pressed={archived} onClick={() => setDraft(value => ({ ...value, is_archived: !archived }))} className={`note-editor-control archive-editor-button ${archived ? 'active' : ''}`}>{archived ? <ArchiveRestore size={15}/> : <Archive size={15}/>}</button>
    </div><div className="editor-save-options"><button onClick={onClose} disabled={saving || imageBusy} className="secondary-button">Cancel</button><button data-save-note onClick={submit} disabled={saving || imageBusy} className="primary-button"><Check size={16}/>{saving ? 'Saving…' : 'Save note'}</button></div></footer>
    <div className="editor-hint"><span>{editor.state.doc.textContent.trim() ? editor.state.doc.textContent.trim().split(/\s+/).length : 0} words</span><span>Make it yours. One thought at a time.</span><span>⌘ / Ctrl + Enter to save</span></div>
  </section></div>
}

function AdminPage({ user, onLogout }) {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [form, setForm] = useState({ display_name: '', email: '', password: '', is_admin: false })
  const [creating, setCreating] = useState(false)
  const [editingUser, setEditingUser] = useState(null)

  async function loadUsers() {
    setLoading(true)
    try { setUsers(await adminApi.users()); setError('') }
    catch (requestError) { setError(requestError.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { loadUsers() }, [])

  async function createUser(event) {
    event.preventDefault()
    setCreating(true); setError(''); setMessage('')
    try {
      await adminApi.createUser(form)
      setForm({ display_name: '', email: '', password: '', is_admin: false })
      setMessage('User account created.')
      await loadUsers()
    } catch (requestError) { setError(requestError.message) }
    finally { setCreating(false) }
  }

  async function deleteData(target) {
    if (!window.confirm(`Permanently delete every note and category owned by ${target.display_name}? The account will remain.`)) return
    setError(''); setMessage('')
    try { await adminApi.deleteUserData(target.id); setMessage(`All stored information for ${target.display_name} was deleted.`); await loadUsers() }
    catch (requestError) { setError(requestError.message) }
  }

  async function updateUser(changes) {
    setError(''); setMessage('')
    try {
      const updated = await adminApi.updateUser(editingUser.id, changes)
      setEditingUser(null)
      setMessage(`${updated.display_name}'s account was updated.`)
      await loadUsers()
      return true
    } catch (requestError) {
      setError(requestError.message)
      return false
    }
  }

  async function deleteUser(target) {
    if (!window.confirm(`Permanently remove ${target.display_name} and all of their notes?`)) return
    setError(''); setMessage('')
    try { await adminApi.deleteUser(target.id); setMessage(`${target.display_name} was removed.`); await loadUsers() }
    catch (requestError) { setError(requestError.message) }
  }

  return <div className="admin-page">
    <header className="admin-header"><div className="flex items-center gap-3"><div className="brand-mark small"><Shield size={18}/></div><div><p className="eyebrow">Paper Notes</p><h1>Administration</h1></div></div><div className="flex items-center gap-2"><ThemePicker compact/><a href="/" className="secondary-button">Back to notes</a><button onClick={onLogout} className="icon-square" title="Sign out"><LogOut size={17}/></button></div></header>
    <main className="admin-content">
      <section className="admin-title"><div><p className="eyebrow">User access</p><h2>Manage users</h2><p>Create accounts, review sign-ins, or permanently remove user data.</p></div><div className="admin-stat"><Users size={18}/><strong>{users.length}</strong><span>users</span></div></section>
      {error && <div className="error-banner" role="alert">{error}</div>}
      {message && <div className="success-banner" role="status">{message}</div>}
      <div className="admin-grid">
        <section className="admin-card"><div className="card-heading"><UserPlus size={18}/><div><h3>Add a user</h3><p>Only administrators can create accounts.</p></div></div><form onSubmit={createUser} className="admin-form"><label>Display name<input required maxLength="100" value={form.display_name} onChange={event => setForm({ ...form, display_name: event.target.value })}/></label><label>Email address<input required type="email" autoComplete="off" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })}/></label><label>Temporary password<input required type="password" minLength="8" autoComplete="new-password" value={form.password} onChange={event => setForm({ ...form, password: event.target.value })}/><small>At least 8 characters.</small></label><label className="check-label"><input type="checkbox" checked={form.is_admin} onChange={event => setForm({ ...form, is_admin: event.target.checked })}/> Give this user administrator access</label><button className="primary-button wide" disabled={creating}>{creating ? 'Creating…' : 'Create account'}</button></form></section>
        <section className="admin-card users-card">
          <div className="card-heading"><Users size={18}/><div><h3>Existing users</h3><p>Last login times are displayed in your local timezone.</p></div></div>
          {loading ? <p className="table-message">Loading users…</p> : <div className="user-list">{users.map(target => <article className="user-row" key={target.id}>
            <div className="user-avatar">{(target.display_name || target.email).charAt(0).toUpperCase()}</div>
            <div className="user-identity"><div><strong>{target.display_name}</strong>{Boolean(target.is_admin) && <span className="admin-badge">Admin</span>}{String(target.id) === String(user.id) && <span className="you-badge">You</span>}</div><span>{target.email}</span><small>Last login: {formatDate(target.last_login_at)} · {target.note_count} notes · {target.category_count} categories</small></div>
            <div className="user-actions"><button onClick={() => setEditingUser(target)} className="edit-user-button" title="Edit user information"><Pencil size={14}/> Edit</button><button onClick={() => deleteData(target)} className="danger-secondary" title="Delete notes and categories"><Trash2 size={14}/> Delete data</button><button onClick={() => deleteUser(target)} disabled={String(target.id) === String(user.id)} className="danger-button" title="Remove user account"><X size={14}/> Remove</button></div>
          </article>)}</div>}
        </section>
      </div>
    </main>
    {editingUser && <EditUserDialog target={editingUser} currentUser={user} onClose={() => setEditingUser(null)} onSave={updateUser}/>} 
  </div>
}

function EditUserDialog({ target, currentUser, onClose, onSave }) {
  const [form, setForm] = useState({ display_name: target.display_name, email: target.email, password: '', is_admin: Boolean(target.is_admin) })
  const [saving, setSaving] = useState(false)
  const editingSelf = String(target.id) === String(currentUser.id)

  async function submit(event) {
    event.preventDefault()
    setSaving(true)
    if (!await onSave(form)) setSaving(false)
  }

  return <div className="fixed inset-0 z-30 grid place-items-center bg-[#24211d]/35 p-4 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-labelledby="edit-user-title">
    <section className="modal-shell w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
      <header className="flex items-center justify-between border-b border-[#eeeae4] px-5 py-4"><div><p className="eyebrow">User account</p><h2 id="edit-user-title" className="mt-1 text-base font-semibold">Edit {target.display_name}</h2></div><button onClick={onClose} className="rounded-lg p-1.5 text-[#77736c] hover:bg-[#f4f2ee]" title="Close"><X size={18}/></button></header>
      <form onSubmit={submit} className="admin-form p-6">
        <label>Display name<input required maxLength="100" value={form.display_name} onChange={event => setForm({ ...form, display_name: event.target.value })}/></label>
        <label>Email address<input required type="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })}/></label>
        <label>New password<input type="password" minLength="8" autoComplete="new-password" value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} placeholder="Leave blank to keep current password"/><small>Optional; at least 8 characters when changed.</small></label>
        <label className="check-label"><input type="checkbox" disabled={editingSelf} checked={form.is_admin} onChange={event => setForm({ ...form, is_admin: event.target.checked })}/> Administrator access</label>
        {editingSelf && <p className="self-admin-note">You cannot remove administrator access from your own account.</p>}
        <div className="flex justify-end gap-2 border-t border-[#eeeae4] pt-4"><button type="button" onClick={onClose} className="secondary-button">Cancel</button><button className="primary-button" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button></div>
      </form>
    </section>
  </div>
}

function FullPageMessage({ title, detail, action }) {
  return <main className="full-page-message"><div className="brand-mark"><FileText size={20}/></div><h1>{title}</h1>{detail && <p>{detail}</p>}{action}</main>
}

const root = import.meta.hot?.data.root || createRoot(document.getElementById('root'))
if (import.meta.hot) import.meta.hot.data.root = root
root.render(<AppearanceProvider><Root /></AppearanceProvider>)
