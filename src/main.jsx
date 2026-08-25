import { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import DOMPurify from 'dompurify'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Color from '@tiptap/extension-color'
import { TextStyle } from '@tiptap/extension-text-style'
import FontFamily from '@tiptap/extension-font-family'
import UnderlineExtension from '@tiptap/extension-underline'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table'
import { findTable, TableMap } from '@tiptap/pm/tables'
import { Selection } from '@tiptap/pm/state'
import {
  Archive, ArchiveRestore, Bold, Check, ChevronDown, Code2, Eraser, FileText, Grid2X2, Italic,
  LayoutList, ListChecks, LogOut, MoreHorizontal, Palette, Pencil, Pin, Plus, Quote, Search, Shield,
  Strikethrough, Table2, TextCursorInput, Trash2, Type, Underline, UserPlus, Users, X,
} from 'lucide-react'
import { adminApi, authApi, categoriesApi, notesApi } from './api'
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
  { label: 'Sans', value: 'Inter' },
  { label: 'Serif', value: 'Georgia' },
  { label: 'Mono', value: 'monospace' },
]
const SIZE_OPTIONS = [
  { label: 'Default', value: null },
  { label: 'Small', value: '14px' },
  { label: 'Medium', value: '16px' },
  { label: 'Large', value: '20px' },
]

const FontSize = TextStyle.extend({
  addAttributes() {
    return {
      fontSize: {
        default: null,
        parseHTML: element => element.style.fontSize,
        renderHTML: attributes => attributes.fontSize ? { style: `font-size: ${attributes.fontSize}` } : {},
      },
    }
  },
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
  const seconds = Math.max(0, (Date.now() - new Date(date).getTime()) / 1000)
  if (seconds < 60) return 'Edited just now'
  if (seconds < 3600) return `Edited ${Math.floor(seconds / 60)} min ago`
  if (seconds < 86400) return `Edited ${Math.floor(seconds / 3600)} hr ago`
  return `Edited ${Math.floor(seconds / 86400)} days ago`
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
    <section className="auth-card">
      <div className="brand-mark"><FileText size={22}/></div>
      <p className="eyebrow">Paper Notes</p>
      <h1>Welcome back</h1>
      <p className="auth-intro">Sign in to open your private notes.</p>
      {error && <div className="error-banner" role="alert">{error}</div>}
      <form onSubmit={submit} className="auth-form">
        <label>Email address<input type="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com"/></label>
        <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} placeholder="Your password"/></label>
        <button className="primary-button wide" disabled={submitting}>{submitting ? 'Signing in…' : 'Sign in'}</button>
      </form>
      <p className="auth-footnote">Accounts are created by an administrator.</p>
    </section>
  </main>
}

function NotesApp({ user, onLogout }) {
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
      : !archived && (selectedView === 'all' || String(note.category_id) === String(selectedView))
    const text = `${note.title || ''} ${note.content || ''}`.replace(/<[^>]+>/g, ' ').toLowerCase()
    return matchesView && text.includes(search.toLowerCase())
  }), [notes, selectedView, search])

  const pinned = selectedView === 'archive' ? [] : visibleNotes.filter(note => Boolean(Number(note.is_pinned)))
  const regular = selectedView === 'archive' ? visibleNotes : visibleNotes.filter(note => !Boolean(Number(note.is_pinned)))
  const archiveCount = notes.filter(note => Boolean(Number(note.is_archived))).length
  const activeCount = notes.length - archiveCount
  const title = selectedView === 'archive'
    ? 'Archive'
    : selectedView === 'all' ? 'All notes' : categories.find(category => String(category.id) === String(selectedView))?.name || 'Notes'

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
    category_id: selectedView !== 'all' && selectedView !== 'archive' ? selectedView : null,
  }
  const listClass = layout === 'grid' ? 'columns-1 gap-5 sm:columns-2 xl:columns-3' : 'grid grid-cols-1 gap-4'

  return <div className="min-h-screen bg-[#fbfaf8] text-[#252525]">
    <aside className="fixed inset-y-0 left-0 hidden w-[252px] border-r border-[#e9e7e1] bg-[#f6f5f2] px-5 py-7 lg:block">
      <div className="mb-12 flex items-center gap-3 px-2"><div className="grid h-9 w-9 place-items-center rounded-xl bg-[#272727] text-white"><FileText size={18}/></div><span className="text-lg font-semibold tracking-tight">Notes</span></div>
      <nav className="space-y-1">
        <button onClick={() => setSelectedView('all')} className={`sidebar-link ${selectedView === 'all' ? 'active' : ''}`}><Grid2X2 size={17}/><span>All notes</span><small>{activeCount}</small></button>
        <button onClick={() => setSelectedView('archive')} className={`sidebar-link ${selectedView === 'archive' ? 'active' : ''}`}><Archive size={17}/><span>Archive</span><small>{archiveCount}</small></button>
      </nav>
      <div className="mt-9"><div className="mb-3 flex items-center justify-between px-3 text-[11px] font-semibold uppercase tracking-[.14em] text-[#989792]"><span>Categories</span><button onClick={addCategory} className="rounded p-1 text-[#6d6b66] hover:bg-white" title="Add category"><Plus size={16}/></button></div>
        <nav className="space-y-1">{categories.map(category => <div key={category.id} className="group flex items-center gap-1"><button onClick={() => setSelectedView(category.id)} className={`sidebar-link min-w-0 flex-1 ${String(selectedView) === String(category.id) ? 'active' : ''}`}><span className="h-2 w-2 rounded-full bg-[#b9b5ae]"/><span>{category.name}</span><small>{notes.filter(note => !Boolean(Number(note.is_archived)) && String(note.category_id) === String(category.id)).length}</small></button><button type="button" onClick={() => deleteCategory(category)} className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-[#9a968e] opacity-0 transition hover:bg-[#f5e9e6] hover:text-[#9b5547] focus:opacity-100 group-hover:opacity-100" title={`Delete ${category.name}`} aria-label={`Delete ${category.name}`}><Trash2 size={14}/></button></div>)}</nav>
      </div>
      <AccountPanel user={user} onLogout={onLogout}/>
    </aside>

    <main className="lg:ml-[252px]">
      <header className="sticky top-0 z-10 flex min-h-[82px] items-center justify-between gap-3 border-b border-[#eceae5] bg-[#fbfaf8]/90 px-4 py-3 backdrop-blur md:px-10">
        <div><p className="text-[11px] font-semibold uppercase tracking-[.16em] text-[#97948e]">{selectedView === 'archive' ? 'Stored away' : 'My space'}</p><h1 className="mt-1 text-xl font-semibold tracking-tight">{title}</h1></div>
        <div className="flex items-center gap-2 md:gap-3"><label className="hidden w-56 items-center gap-2 rounded-xl border border-[#e6e3dd] bg-white px-3 py-2 text-sm text-[#8d8982] md:flex"><Search size={16}/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search notes" className="w-full bg-transparent outline-none"/></label><button onClick={() => setSelectedView(selectedView === 'archive' ? 'all' : 'archive')} className={`header-action ${selectedView === 'archive' ? 'selected' : ''}`} title={selectedView === 'archive' ? 'Show all notes' : 'Open archive'}><Archive size={17}/><span className="hidden sm:inline">Archive</span></button><div className="hidden rounded-lg border border-[#e6e3dd] bg-white p-1 sm:flex"><button onClick={() => setLayout('grid')} className={`icon-button ${layout === 'grid' ? 'selected' : ''}`} title="Grid"><Grid2X2 size={16}/></button><button onClick={() => setLayout('list')} className={`icon-button ${layout === 'list' ? 'selected' : ''}`} title="List"><LayoutList size={17}/></button></div><button onClick={() => setEditing(newNote)} className="flex items-center gap-2 rounded-xl bg-[#282828] px-3 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-black md:px-4"><Plus size={17}/> <span className="hidden sm:inline">New note</span></button></div>
      </header>

      <div className="px-4 py-7 md:px-10 md:py-9">
        <div className="mb-5 flex items-center justify-between lg:hidden"><div className="text-sm text-[#77736c]">{user.display_name}</div><div className="flex gap-1">{user.is_admin && <a href="/admin/" className="mobile-account-button" title="Administration"><Shield size={16}/></a>}<button onClick={onLogout} className="mobile-account-button" title="Sign out"><LogOut size={16}/></button></div></div>
        <section className="mb-5 lg:hidden" aria-label="Categories"><div className="mb-2 flex items-center justify-between"><span className="text-[11px] font-semibold uppercase tracking-[.14em] text-[#989792]">Categories</span><button type="button" onClick={addCategory} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-[#5e5a54] hover:bg-[#efede8]"><Plus size={15}/> New</button></div><div className="flex gap-2 overflow-x-auto pb-1"><button type="button" aria-pressed={selectedView === 'all'} onClick={() => setSelectedView('all')} className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition ${selectedView === 'all' ? 'border-[#282828] bg-[#282828] text-white' : 'border-[#dedbd4] bg-white text-[#69655e]'}`}>All notes</button>{categories.map(category => <div key={category.id} className={`flex shrink-0 overflow-hidden rounded-full border text-xs font-medium transition ${String(selectedView) === String(category.id) ? 'border-[#282828] bg-[#282828] text-white' : 'border-[#dedbd4] bg-white text-[#69655e]'}`}><button type="button" aria-pressed={String(selectedView) === String(category.id)} onClick={() => setSelectedView(category.id)} className="px-3 py-1.5">{category.name}</button><button type="button" onClick={() => deleteCategory(category)} className="border-l border-black/10 px-2 hover:bg-black/10" title={`Delete ${category.name}`} aria-label={`Delete ${category.name}`}><Trash2 size={13}/></button></div>)}{!categories.length && <span className="self-center text-xs text-[#938f87]">No categories yet</span>}</div></section>
        {error && <div className="error-banner mb-5" role="alert">{error}<button onClick={() => setError('')}><X size={15}/></button></div>}
        <div className="mb-7 flex items-center justify-between"><p className="text-sm text-[#86837d]">{loading ? 'Loading notes…' : `${visibleNotes.length} ${visibleNotes.length === 1 ? 'note' : 'notes'}`}</p><label className="mobile-search-field md:hidden"><Search size={16}/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search"/></label></div>
        {!loading && pinned.length > 0 && <section className="mb-10"><h2 className="section-heading"><Pin size={13} fill="currentColor"/> Pinned</h2><NoteCollection notes={pinned} listClass={listClass} categories={categories} onEdit={setEditing} onPin={togglePin} onArchive={toggleArchive} onDelete={deleteNote} menu={menu} setMenu={setMenu}/></section>}
        {!loading && <section><h2 className="section-heading">{selectedView === 'archive' ? 'Archived notes' : pinned.length ? 'Others' : 'Notes'}</h2>{regular.length ? <NoteCollection notes={regular} listClass={listClass} categories={categories} onEdit={setEditing} onPin={togglePin} onArchive={toggleArchive} onDelete={deleteNote} menu={menu} setMenu={setMenu}/> : <div className="empty-state">{selectedView === 'archive' ? 'Your archive is empty.' : 'Nothing here yet. Make room for a new thought.'}</div>}</section>}
      </div>
    </main>
    {editing && <NoteEditor note={editing} categories={categories} onClose={() => setEditing(null)} onSave={saveNote} onDeleteCategory={deleteCategory}/>}
  </div>
}

function AccountPanel({ user, onLogout }) {
  return <div className="account-panel">
    <div className="account-avatar">{(user.display_name || user.email).charAt(0).toUpperCase()}</div>
    <div className="min-w-0 flex-1"><strong>{user.display_name}</strong><span>{user.email}</span></div>
    {user.is_admin && <a href="/admin/" title="Administration"><Shield size={16}/></a>}
    <button onClick={onLogout} title="Sign out"><LogOut size={16}/></button>
  </div>
}

function NoteCollection({ notes, listClass, categories, onEdit, onPin, onArchive, onDelete, menu, setMenu }) {
  return <div className={listClass}>{notes.map(note => <NoteCard key={note.id} note={note} category={categories.find(category => String(category.id) === String(note.category_id))} onEdit={() => onEdit(note)} onPin={() => onPin(note)} onArchive={() => onArchive(note)} onDelete={() => onDelete(note.id)} menu={menu} setMenu={setMenu}/>)}</div>
}

function NoteCard({ note, category, onEdit, onPin, onArchive, onDelete, menu, setMenu }) {
  const archived = Boolean(Number(note.is_archived))
  return <article onClick={onEdit} style={{ backgroundColor: note.color, '--note-color': note.color }} className="note-card group relative mb-5 break-inside-avoid cursor-pointer rounded-2xl p-5 transition hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(50,44,33,.09)]">
    <div className="mb-3 flex items-start gap-2"><h3 className="flex-1 text-[15px] font-semibold leading-5 tracking-[-.01em]">{note.title || 'Untitled note'}</h3>{!archived && <button onClick={event => { event.stopPropagation(); onPin() }} className={`card-icon ${Boolean(Number(note.is_pinned)) ? 'opacity-100 text-[#4a4842]' : ''}`} title="Pin note"><Pin size={15} fill={Boolean(Number(note.is_pinned)) ? 'currentColor' : 'none'}/></button>}<button onClick={event => { event.stopPropagation(); setMenu(menu === note.id ? null : note.id) }} className="card-icon" title="More actions"><MoreHorizontal size={17}/></button></div>
    {menu === note.id && <div onClick={event => event.stopPropagation()} className="absolute right-4 top-12 z-10 w-40 rounded-xl border border-[#e5e1da] bg-white p-1.5 shadow-xl"><button onClick={onEdit} className="menu-item"><Palette size={14}/> Edit note</button><button onClick={onArchive} className="menu-item">{archived ? <ArchiveRestore size={14}/> : <Archive size={14}/>} {archived ? 'Restore' : 'Archive'}</button><button onClick={onDelete} className="menu-item text-[#bd4b4b]"><Trash2 size={14}/> Delete</button></div>}
    <div className="note-card-preview rich-content text-[13px] leading-5 text-[#4e4c47]" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(note.content || '') }}/>
    <footer className="mt-5 flex items-center justify-between border-t border-black/[.07] pt-3"><span className="text-[11px] text-[#89867e]">{relativeDate(note.updated_at)}</span>{category && <span className="rounded-md bg-black/[.055] px-2 py-1 text-[10px] font-medium text-[#69665f]">{category.name}</span>}</footer>
  </article>
}

function NoteEditor({ note, categories, onClose, onSave, onDeleteCategory }) {
  const formattingSelectionRef = useRef(null)
  const [draft, setDraft] = useState(note)
  const [saving, setSaving] = useState(false)
  const [noteColorMenuOpen, setNoteColorMenuOpen] = useState(false)
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false)
  const [colorMenuOpen, setColorMenuOpen] = useState(false)
  const [fontMenuOpen, setFontMenuOpen] = useState(false)
  const [sizeMenuOpen, setSizeMenuOpen] = useState(false)
  const [tableMenuOpen, setTableMenuOpen] = useState(false)
  const [tableRows, setTableRows] = useState(3)
  const [tableColumns, setTableColumns] = useState(3)
  const [tableColumnWidth, setTableColumnWidth] = useState(160)
  const [tableRowHeight, setTableRowHeight] = useState(56)
  const editor = useEditor({ extensions: [StarterKit, TaskList, TaskItem.configure({ nested: true }), Table.configure({ resizable: true, cellMinWidth: 84 }), TableRow, SizedTableHeader, SizedTableCell, TextStyle, FontSize, Color, FontFamily, UnderlineExtension], content: note.content, editorProps: { attributes: { class: 'editor-prose' } }, onUpdate: ({ editor: activeEditor }) => setDraft(value => ({ ...value, content: activeEditor.getHTML() })) })
  const formatting = useEditorState({
    editor,
    selector: ({ editor: activeEditor }) => ({
      bold: activeEditor.isActive('bold'),
      italic: activeEditor.isActive('italic'),
      underline: activeEditor.isActive('underline'),
      strike: activeEditor.isActive('strike'),
      inTable: activeEditor.isActive('table'),
    }),
  })
  useEffect(() => () => editor?.destroy(), [editor])
  if (!editor) return null
  const isBlankLineSelection = selection => {
    const cursor = selection.$cursor
    return Boolean(cursor && cursor.parent.isTextblock && cursor.parent.textContent.trim() === '')
  }
  const isFormattableSelection = selection => !selection.empty || isBlankLineSelection(selection)
  const rememberFormattingSelection = () => {
    const { selection } = editor.state
    formattingSelectionRef.current = editor.isFocused && isFormattableSelection(selection) ? selection.toJSON() : null
  }
  const formattingSelection = () => {
    const current = editor.state.selection
    if (editor.isFocused && isFormattableSelection(current)) return current
    if (!formattingSelectionRef.current) return null
    try {
      const restored = Selection.fromJSON(editor.state.doc, formattingSelectionRef.current)
      return isFormattableSelection(restored) ? restored : null
    } catch {
      formattingSelectionRef.current = null
      return null
    }
  }
  const applyInlineFormatting = transform => {
    const selection = formattingSelection()
    if (!selection) return false
    let chain = editor.chain()
    if (!editor.state.selection.eq(selection)) {
      chain = chain.command(({ tr }) => {
        tr.setSelection(selection)
        return true
      })
    }
    return transform(chain.focus(), selection).run()
  }
  const clearFormatting = (chain, selection) => {
    if (selection.empty) {
      return chain.command(({ tr }) => {
        tr.setStoredMarks([])
        return true
      }).clearNodes()
    }
    return formatting?.inTable ? chain.unsetAllMarks() : chain.unsetAllMarks().clearNodes()
  }
  const command = transform => () => applyInlineFormatting(transform)
  const button = (label, icon, action, active, extraClass = '') => <button type="button" aria-label={label} title={label} onMouseDown={event => { event.preventDefault(); rememberFormattingSelection() }} onClick={action} className={`format-button ${active ? 'active' : ''} ${extraClass}`}>{icon}</button>
  async function submit() { setSaving(true); const saved = await onSave(draft); if (!saved) setSaving(false) }
  function tableDimension(value) { return Math.min(12, Math.max(1, Number.parseInt(value, 10) || 1)) }
  function tablePixels(value, minimum, maximum) { return Math.min(maximum, Math.max(minimum, Number.parseInt(value, 10) || minimum)) }
  function insertTable() {
    editor.chain().focus().insertTable({ rows: tableDimension(tableRows), cols: tableDimension(tableColumns), withHeaderRow: true }).run()
    setTableMenuOpen(false)
  }
  function runTableAction(action) {
    if (editor.can()[action]()) editor.chain().focus()[action]().run()
    setTableMenuOpen(false)
  }
  function getCurrentTableCell() {
    const table = findTable(editor.state.selection)
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
    setTableMenuOpen(false)
  }
  function setCurrentRowHeight() {
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
    setTableMenuOpen(false)
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

  return <div className="fixed inset-0 z-30 grid place-items-center bg-[#24211d]/35 p-4 backdrop-blur-[2px]" role="dialog" aria-modal="true"><div className="note-editor-shell modal-shell flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
    <div className="flex shrink-0 items-center justify-between border-b border-[#eeeae4] px-5 py-4"><span className="text-xs font-semibold uppercase tracking-[.13em] text-[#99958d]">{note.id ? 'Edit note' : 'New note'}</span><button onClick={onClose} className="rounded-lg p-1.5 text-[#77736c] hover:bg-[#f4f2ee]"><X size={18}/></button></div>
    <div className="note-editor-body overflow-y-auto p-6" style={{ backgroundColor: draft.color || COLORS[0], '--note-color': draft.color || COLORS[0] }}><input autoFocus value={draft.title || ''} onChange={event => setDraft({ ...draft, title: event.target.value })} placeholder="Title" className="note-title-input mb-4 w-full bg-transparent text-xl tracking-tight outline-none placeholder:text-[#bbb8b1]"/>
      <div className="mb-3 flex flex-wrap items-center gap-1 rounded-xl border border-[#e9e6e0] bg-[#faf9f6] p-1.5">
        {button('Bold', <Bold size={16}/>, () => applyInlineFormatting(chain => chain.toggleBold()), formatting?.bold)}{button('Italic', <Italic size={16}/>, () => applyInlineFormatting(chain => chain.toggleItalic()), formatting?.italic)}{button('Underline', <Underline size={16}/>, () => applyInlineFormatting(chain => chain.toggleUnderline()), formatting?.underline)}{button('Strikethrough', <Strikethrough size={16}/>, () => applyInlineFormatting(chain => chain.toggleStrike()), formatting?.strike)}
        <span className="toolbar-divider"/>{button('Bullet list', <span className="text-xs font-bold">• List</span>, command(chain => chain.toggleBulletList()), editor.isActive('bulletList'), 'list-format-button')}{button('Checklist', <ListChecks size={16}/>, command(chain => chain.toggleTaskList()), editor.isActive('taskList'))}{button('Quote block', <Quote size={16}/>, command(chain => chain.toggleBlockquote()), editor.isActive('blockquote'))}{button('Code block', <Code2 size={16}/>, command(chain => chain.toggleCodeBlock()), editor.isActive('codeBlock'))}<div className="relative"><button type="button" aria-label="Table options" title="Table options" aria-expanded={tableMenuOpen} onMouseDown={event => event.preventDefault()} onClick={() => setTableMenuOpen(open => !open)} className={`format-button ${tableMenuOpen ? 'active' : ''}`}><Table2 size={16}/></button>{tableMenuOpen && <div className="table-menu">{tableActions.length > 0 && <><strong>Edit table</strong><div className="table-action-grid">{tableActions.map(item => <button key={item.action} type="button" className="table-action" disabled={!editor.can()[item.action]()} onMouseDown={event => event.preventDefault()} onClick={() => runTableAction(item.action)}>{item.label}</button>)}</div><strong>Resize current</strong><label>Column px<input type="number" min="84" max="600" value={tableColumnWidth} onChange={event => setTableColumnWidth(tablePixels(event.target.value, 84, 600))}/></label><button type="button" className="table-action" onMouseDown={event => event.preventDefault()} onClick={setCurrentColumnWidth}>Set column width</button><label>Row px<input type="number" min="32" max="400" value={tableRowHeight} onChange={event => setTableRowHeight(tablePixels(event.target.value, 32, 400))}/></label><button type="button" className="table-action" onMouseDown={event => event.preventDefault()} onClick={setCurrentRowHeight}>Set row height</button><small>Drag a column border for quick resizing.</small><button type="button" className="table-action danger" disabled={!editor.can().deleteTable()} onMouseDown={event => event.preventDefault()} onClick={() => runTableAction('deleteTable')}>Delete table</button><span className="table-menu-divider"/></>}<strong>{tableActions.length > 0 ? 'Insert another table' : 'Insert table'}</strong><label>Rows<input type="number" min="1" max="12" value={tableRows} onChange={event => setTableRows(tableDimension(event.target.value))}/></label><label>Columns<input type="number" min="1" max="12" value={tableColumns} onChange={event => setTableColumns(tableDimension(event.target.value))}/></label><button type="button" onMouseDown={event => event.preventDefault()} onClick={insertTable}>Add {tableRows} × {tableColumns} table</button></div>}</div>
        <span className="toolbar-divider"/><div className="relative"><button type="button" aria-label="Font" title="Font" aria-expanded={fontMenuOpen} onMouseDown={event => { event.preventDefault(); rememberFormattingSelection() }} onClick={() => { setFontMenuOpen(open => !open); setSizeMenuOpen(false) }} className={`format-menu-trigger ${fontMenuOpen ? 'active' : ''}`}><Type size={16}/><ChevronDown size={12}/></button>{fontMenuOpen && <div className="format-menu" aria-label="Font options">{FONT_OPTIONS.map(option => <button key={option.label} type="button" onMouseDown={event => event.preventDefault()} onClick={() => { applyInlineFormatting(chain => option.value ? chain.setFontFamily(option.value) : chain.unsetFontFamily()); setFontMenuOpen(false) }}>{option.label}</button>)}</div>}</div><div className="relative"><button type="button" aria-label="Text size" title="Text size" aria-expanded={sizeMenuOpen} onMouseDown={event => { event.preventDefault(); rememberFormattingSelection() }} onClick={() => { setSizeMenuOpen(open => !open); setFontMenuOpen(false) }} className={`format-menu-trigger ${sizeMenuOpen ? 'active' : ''}`}><TextCursorInput size={16}/><ChevronDown size={12}/></button>{sizeMenuOpen && <div className="format-menu" aria-label="Text size options">{SIZE_OPTIONS.map(option => <button key={option.label} type="button" onMouseDown={event => event.preventDefault()} onClick={() => { applyInlineFormatting(chain => option.value ? chain.setMark('textStyle', { fontSize: option.value }) : chain.setMark('textStyle', { fontSize: null }).removeEmptyTextStyle()); setSizeMenuOpen(false) }}>{option.label}</button>)}</div>}</div><span className="toolbar-divider"/><div className="relative"><button type="button" aria-label="Text color" title="Text color" aria-expanded={colorMenuOpen} onMouseDown={event => { event.preventDefault(); rememberFormattingSelection() }} onClick={() => setColorMenuOpen(open => !open)} className={`color-menu-trigger ${colorMenuOpen ? 'active' : ''}`}><Palette size={16}/><ChevronDown size={12}/></button>{colorMenuOpen && <div className="text-color-menu" aria-label="Text color options">{TEXT_COLORS.map(color => <button key={color.value} type="button" aria-label={`${color.name} text`} title={color.name} onMouseDown={event => event.preventDefault()} onClick={() => { applyInlineFormatting(chain => chain.setColor(color.value)); setColorMenuOpen(false) }} style={{ backgroundColor: color.value }} className={`text-color-swatch ${editor.isActive('textStyle', { color: color.value }) ? 'active' : ''}`}/>)}</div>}</div>{button('Clear formatting', <Eraser size={16}/>, () => applyInlineFormatting(clearFormatting))}
      </div><div className="note-editor-content"><EditorContent editor={editor}/></div>
      <div className="note-editor-footer mt-5 flex flex-wrap items-center justify-between gap-3 pt-5"><div className="flex flex-wrap items-center gap-3"><div className="relative"><button type="button" aria-label="Note background color" title="Note background color" aria-expanded={noteColorMenuOpen} onMouseDown={event => event.preventDefault()} onClick={() => setNoteColorMenuOpen(open => !open)} className={`note-editor-control note-color-menu-trigger ${noteColorMenuOpen ? 'active' : ''}`}><Palette size={15}/><span className="note-color-preview" style={{ backgroundColor: draft.color || COLORS[0] }}/><span>Color</span><ChevronDown size={12}/></button>{noteColorMenuOpen && <div className="note-color-menu" aria-label="Note background color options"><strong>Note color</strong><div className="note-color-grid">{NOTE_COLORS.map(color => <button key={color.value} type="button" aria-label={color.name} title={color.name} onMouseDown={event => event.preventDefault()} onClick={() => { setDraft(value => ({ ...value, color: color.value })); setNoteColorMenuOpen(false) }} style={{ backgroundColor: color.value }} className={`note-color-swatch ${draft.color === color.value ? 'active' : ''}`}>{draft.color === color.value && <Check size={12}/>}</button>)}</div></div>}</div><div className="relative"><button type="button" aria-label="Category" title="Category" aria-expanded={categoryMenuOpen} onMouseDown={event => event.preventDefault()} onClick={() => setCategoryMenuOpen(open => !open)} className={`note-editor-control note-category-menu-trigger ${categoryMenuOpen ? 'active' : ''}`}><Grid2X2 size={14}/><span>{selectedCategory?.name || 'No category'}</span><ChevronDown size={12}/></button>{categoryMenuOpen && <div className="note-category-menu" aria-label="Category options"><strong>Category</strong><button type="button" onMouseDown={event => event.preventDefault()} onClick={() => { setDraft(value => ({ ...value, category_id: null })); setCategoryMenuOpen(false) }} className={`note-category-option ${!selectedCategory ? 'active' : ''}`}>No category{!selectedCategory && <Check size={13}/>}</button>{categories.map(category => <div key={category.id} className="note-category-option-row"><button type="button" onMouseDown={event => event.preventDefault()} onClick={() => { setDraft(value => ({ ...value, category_id: category.id })); setCategoryMenuOpen(false) }} className={`note-category-option ${selectedCategory?.id === category.id ? 'active' : ''}`}>{category.name}{selectedCategory?.id === category.id && <Check size={13}/>}</button><button type="button" onMouseDown={event => event.preventDefault()} onClick={async () => { if (await onDeleteCategory(category)) { setDraft(value => String(value.category_id) === String(category.id) ? { ...value, category_id: null } : value); setCategoryMenuOpen(false) } }} className="note-category-delete-button" title={`Delete ${category.name}`} aria-label={`Delete ${category.name}`}><Trash2 size={13}/></button></div>)}</div>}</div><button onClick={() => setDraft({ ...draft, is_archived: !archived })} className={`note-editor-control archive-editor-button ${archived ? 'active' : ''}`}>{archived ? <ArchiveRestore size={14}/> : <Archive size={14}/>} {archived ? 'Restore' : 'Archive'}</button></div><div className="flex gap-2"><button onClick={onClose} className="rounded-lg px-3 py-2 text-sm text-[#77736c] hover:bg-[#f4f2ee]">Cancel</button><button onClick={submit} disabled={saving} className="rounded-lg bg-[#282828] px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-60">{saving ? 'Saving…' : 'Save note'}</button></div></div>
    </div>
  </div></div>
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
    <header className="admin-header"><div className="flex items-center gap-3"><div className="brand-mark small"><Shield size={18}/></div><div><p className="eyebrow">Paper Notes</p><h1>Administration</h1></div></div><div className="flex items-center gap-2"><a href="/" className="secondary-button">Back to notes</a><button onClick={onLogout} className="icon-square" title="Sign out"><LogOut size={17}/></button></div></header>
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

createRoot(document.getElementById('root')).render(<Root />)
