import { useEffect, useId, useRef, useState } from 'react'
import { ChevronDown, FolderOpen, Pencil, Plus, X } from 'lucide-react'

export function WorkspaceSwitcher({ workspaces, value, onChange, onCreate, onRename }) {
  return <div className="workspace-switcher">
    <label><span className="workspace-switcher-label">Workspace</span><div className="workspace-choice"><FolderOpen size={19}/><select aria-label="Workspace" value={value ?? ''} disabled={!workspaces.length} onChange={event => onChange(event.target.value)}>
      {!value && <option value="">Opening workspaces…</option>}
      {workspaces.map(workspace => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
    </select><ChevronDown size={16}/></div></label>
    <div className="workspace-switcher-actions"><button type="button" disabled={!value} onClick={onCreate}><Plus size={15}/> New workspace</button><button type="button" disabled={!value} onClick={onRename} aria-label="Rename workspace" title="Rename workspace"><Pencil size={15}/></button></div>
  </div>
}

function WorkspaceModal({ title, subtitle, busy, onClose, children }) {
  const ref = useRef(null)
  const latest = useRef({ busy, onClose })
  latest.current = { busy, onClose }
  const titleId = useId()
  useEffect(() => {
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const field = ref.current.querySelector('[data-autofocus]')
    field?.focus()
    if (field?.tagName === 'INPUT') field.select()
    const key = event => {
      if (event.key === 'Escape' && !latest.current.busy) { event.preventDefault(); latest.current.onClose() }
      if (event.key === 'Tab') {
        const controls = [...ref.current.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled)')].filter(element => element.getClientRects().length)
        if (!controls.length) { event.preventDefault(); ref.current.focus(); return }
        const first = controls[0], last = controls[controls.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
    }
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('keydown', key); document.body.style.overflow = previousOverflow; previousFocus?.focus() }
  }, [])
  return <div className="editor-backdrop workspace-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <section ref={ref} tabIndex={-1} className="workspace-modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <header><div className="editor-heading-icon"><FolderOpen size={20}/></div><div><h2 id={titleId}>{title}</h2><p>{subtitle}</p></div><button type="button" className="icon-square" disabled={busy} aria-label="Close workspace dialog" onClick={onClose}><X size={20}/></button></header>
      {children}
    </section>
  </div>
}

function NameDialog({ title, subtitle, label, initialName = '', maxLength, placeholder, submitLabel, onClose, onSubmit }) {
  const [name, setName] = useState(initialName)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event) {
    event.preventDefault()
    if (busy) return
    if (!name.trim()) { setError('Enter a name.'); return }
    setBusy(true); setError('')
    try { await onSubmit(name.trim()) }
    catch (requestError) { setError(requestError.message); setBusy(false) }
  }
  return <WorkspaceModal title={title} subtitle={subtitle} busy={busy} onClose={onClose}>
    <form onSubmit={submit}><label className="workspace-form-field">{label}<input data-autofocus aria-label={label} maxLength={maxLength} required value={name} disabled={busy} placeholder={placeholder} onChange={event => setName(event.target.value)}/></label>
      {error && <p className="error-banner" role="alert">{error}</p>}
      <div className="workspace-dialog-actions"><button type="button" className="secondary-button" disabled={busy} onClick={onClose}>Cancel</button><button className="primary-button" disabled={busy || !name.trim()}>{busy ? 'Saving…' : submitLabel}</button></div>
    </form>
  </WorkspaceModal>
}

export function WorkspaceDialog({ workspace, onClose, onSubmit }) {
  return <NameDialog title={workspace ? 'Rename workspace' : 'A space of its own'} subtitle={workspace ? 'Give this collection a new name.' : 'Keep a different part of your life in its own space.'} label="Workspace name" initialName={workspace?.name || ''} maxLength={60} placeholder="Work, Reference, a new project…" submitLabel={workspace ? 'Save name' : 'Create workspace'} onClose={onClose} onSubmit={onSubmit}/>
}

export function CategoryDialog({ workspaceName, onClose, onSubmit }) {
  return <NameDialog title="New category" subtitle={`Organize related notes inside ${workspaceName}.`} label="Category name" maxLength={100} placeholder="Projects, meetings, ideas…" submitLabel="Create category" onClose={onClose} onSubmit={onSubmit}/>
}

export function MoveNoteDialog({ note, workspaces, onClose, onMove }) {
  const destinations = workspaces.filter(workspace => String(workspace.id) !== String(note.workspace_id))
  const [destination, setDestination] = useState(destinations[0]?.id || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event) {
    event.preventDefault()
    if (busy || !destination) return
    setBusy(true); setError('')
    try { await onMove(destination) }
    catch (requestError) { setError(requestError.message); setBusy(false) }
  }
  return <WorkspaceModal title="Move note" subtitle={note.title || 'Untitled note'} busy={busy} onClose={onClose}>
    <form onSubmit={submit}>{destinations.length ? <><label className="workspace-form-field">Destination workspace<select data-autofocus aria-label="Destination workspace" disabled={busy} value={destination} onChange={event => setDestination(event.target.value)}>{destinations.map(workspace => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select></label><p className="workspace-dialog-hint">Your note keeps its content, color, and pinned or archived status.{note.category_id ? ' Choose a new category after moving it.' : ''}</p></> : <p className="workspace-dialog-hint">Create another workspace from the sidebar first.</p>}
      {error && <p className="error-banner" role="alert">{error}</p>}
      <div className="workspace-dialog-actions"><button type="button" className="secondary-button" disabled={busy} onClick={onClose}>Cancel</button>{destinations.length > 0 && <button className="primary-button" disabled={busy || !destination}>{busy ? 'Moving…' : 'Move note'}</button>}</div>
    </form>
  </WorkspaceModal>
}
