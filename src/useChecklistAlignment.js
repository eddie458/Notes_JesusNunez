import { useLayoutEffect } from 'react'

// Inline font sizes can change a line's height without changing the list's font.
// Measure its text so checkboxes follow that first line, even when it wraps.
export function useChecklistAlignment(ref) {
  useLayoutEffect(() => {
    const container = ref.current
    if (!container) return
    let frame
    const align = () => {
      for (const item of container.querySelectorAll('ul[data-type="taskList"] > li')) {
        const label = item.querySelector(':scope > label')
        const paragraph = item.querySelector(':scope > div > :first-child')
        if (!label || !paragraph) continue
        const range = document.createRange()
        range.selectNodeContents(paragraph)
        const rects = [...range.getClientRects()].filter(rect => rect.width && rect.height)
        if (!rects.length) { label.removeAttribute('style'); continue }
        const first = rects[0]
        const line = rects.filter(rect => rect.top < first.bottom && rect.bottom > first.top)
        const center = (Math.min(...line.map(rect => rect.top)) + Math.max(...line.map(rect => rect.bottom))) / 2
        const offset = center - item.getBoundingClientRect().top - label.getBoundingClientRect().height / 2
        const style = `transform: translateY(${offset.toFixed(2)}px)`
        if (label.getAttribute('style') !== style) label.setAttribute('style', style)
      }
    }
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(align) }
    align()
    const observer = new ResizeObserver(schedule)
    observer.observe(container)
    document.fonts?.addEventListener('loadingdone', schedule)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      document.fonts?.removeEventListener('loadingdone', schedule)
    }
  })
}
