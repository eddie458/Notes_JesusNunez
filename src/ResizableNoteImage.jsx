import { useEffect, useRef, useState } from 'react'
import { NodeViewWrapper } from '@tiptap/react'
import { MoveDiagonal2 } from 'lucide-react'

const MIN_WIDTH = 64
const MAX_WIDTH = 1600
const clampWidth = width => Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.round(width)))

export default function ResizableNoteImage({ node, selected, updateAttributes, editor, getPos }) {
  const wrapperRef = useRef(null)
  const frameRef = useRef(null)
  const dragRef = useRef(null)
  const [dragWidth, setDragWidth] = useState(null)
  const [displayWidth, setDisplayWidth] = useState(node.attrs.width || MIN_WIDTH)
  const [availableWidth, setAvailableWidth] = useState(MAX_WIDTH)
  const [widthInput, setWidthInput] = useState(String(node.attrs.width || MIN_WIDTH))

  const measure = () => {
    if (!frameRef.current || !wrapperRef.current) return
    const width = Math.round(frameRef.current.getBoundingClientRect().width)
    setDisplayWidth(width)
    setWidthInput(String(node.attrs.width || width))
    setAvailableWidth(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.floor(wrapperRef.current.clientWidth))))
  }
  useEffect(() => {
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(wrapperRef.current)
    return () => observer.disconnect()
  }, [node.attrs.width])

  const selectImage = () => {
    const position = getPos()
    if (typeof position === 'number') editor.commands.setNodeSelection(position)
  }
  const setWidth = width => {
    updateAttributes({ width: clampWidth(width) })
    setWidthInput(String(clampWidth(width)))
  }
  const commitInput = () => {
    const width = Number(widthInput)
    if (widthInput.trim() && Number.isFinite(width)) setWidth(width)
    else setWidthInput(String(node.attrs.width || displayWidth))
  }
  const beginResize = event => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    selectImage()
    event.currentTarget.focus()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { x: event.clientX, width: frameRef.current.getBoundingClientRect().width, pointerId: event.pointerId }
  }
  const moveResize = event => {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) return
    const width = Math.min(availableWidth, clampWidth(dragRef.current.width + event.clientX - dragRef.current.x))
    setDragWidth(width)
    setDisplayWidth(width)
    setWidthInput(String(width))
  }
  const finishResize = (event, cancel = false) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    if (!cancel) setWidth(Math.min(availableWidth, clampWidth(drag.width + event.clientX - drag.x)))
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    setDragWidth(null)
    if (cancel) {
      setDisplayWidth(Math.round(drag.width))
      setWidthInput(String(node.attrs.width || Math.round(drag.width)))
    }
  }
  const resizeWithKeyboard = event => {
    if (event.key === 'Escape' && dragRef.current) {
      event.preventDefault()
      event.stopPropagation()
      finishResize({ ...event, pointerId: dragRef.current.pointerId, currentTarget: event.currentTarget }, true)
      return
    }
    const step = event.shiftKey ? 40 : 10
    const next = { ArrowLeft: displayWidth - step, ArrowRight: displayWidth + step, Home: MIN_WIDTH, End: availableWidth }[event.key]
    if (next === undefined) return
    event.preventDefault()
    event.stopPropagation()
    setWidth(Math.min(availableWidth, next))
  }

  return <NodeViewWrapper className={`resizable-note-image ${selected ? 'is-selected' : ''}`} contentEditable={false}>
    <div ref={wrapperRef} className="note-image-container">
      <div ref={frameRef} className="note-image-frame" style={{ width: dragWidth || node.attrs.width ? `${dragWidth || node.attrs.width}px` : undefined }}>
        <img src={node.attrs.src} alt={node.attrs.alt || ''} draggable data-drag-handle onLoad={measure}/>
        {selected && <button type="button" className="image-resize-handle" role="slider" aria-label="Resize image" aria-orientation="horizontal" aria-valuemin={MIN_WIDTH} aria-valuemax={availableWidth} aria-valuenow={displayWidth} aria-valuetext={`${displayWidth} pixels wide`} title="Drag to resize · Arrow keys adjust width" onPointerDown={beginResize} onPointerMove={moveResize} onPointerUp={finishResize} onPointerCancel={event => finishResize(event, true)} onLostPointerCapture={event => finishResize(event, true)} onKeyDown={resizeWithKeyboard}><MoveDiagonal2 size={18}/></button>}
      </div>
    </div>
    {selected && <div className="image-size-controls" onMouseDown={event => { if (event.target.tagName !== 'INPUT') event.preventDefault() }}>
      <label>Width <input type="number" aria-label="Image width in pixels" min={MIN_WIDTH} max={MAX_WIDTH} step={1} value={widthInput} onChange={event => setWidthInput(event.target.value)} onBlur={commitInput} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); commitInput() } }}/><span>px</span></label>
      <div className="image-size-presets">{[{ label: 'Small', width: 240 }, { label: 'Medium', width: 400 }, { label: 'Large', width: 640 }].map(size => <button key={size.label} type="button" aria-label={`${size.label} image (${size.width} pixels)`} aria-pressed={node.attrs.width === size.width} onClick={() => setWidth(size.width)}>{size.label}</button>)}<button type="button" onClick={() => setWidth(availableWidth)}>Fit to note</button></div>
      <span className="image-resize-help">Drag the corner to resize. Proportions stay the same.</span>
    </div>}
  </NodeViewWrapper>
}
