import { Extension, Node, mergeAttributes } from '@tiptap/core'

export const FontSize = Extension.create({
  name: 'fontSize',
  addGlobalAttributes() {
    return [{ types: ['textStyle'], attributes: { fontSize: {
      default: null,
      parseHTML: element => element.style.fontSize || null,
      renderHTML: attributes => attributes.fontSize ? { style: `font-size: ${attributes.fontSize}` } : {},
    } } }]
  },
})

export function isImageSource(src) {
  return /^data:image\/(png|jpeg|webp);base64,[a-z0-9+/]+=*$/i.test(src || '') || /^https:\/\/[^\s]+$/i.test(src || '')
}

export const NoteImage = Node.create({
  name: 'image',
  group: 'block',
  draggable: true,
  atom: true,
  addAttributes() { return { src: { default: null }, alt: { default: '' } } },
  parseHTML() { return [{ tag: 'img[src]', getAttrs: element => isImageSource(element.getAttribute('src')) ? null : false }] },
  renderHTML({ HTMLAttributes }) { return ['img', mergeAttributes(HTMLAttributes, { loading: 'lazy' })] },
})

export function readableNoteColor(color) {
  const hex = (color || '#fffdf7').replace('#', '')
  const normalized = hex.length === 3 ? hex.split('').map(letter => letter + letter).join('') : hex.slice(0, 6)
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return '#292d29'
  const [r, g, b] = [0, 2, 4].map(index => parseInt(normalized.slice(index, index + 2), 16) / 255).map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.179 ? '#292d29' : '#f5f5ef'
}

export async function prepareNoteImage(file) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Choose a PNG, JPG, or WebP image.')
  if (file.size > 10 * 1024 * 1024) throw new Error('Please choose an image smaller than 10 MB.')
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)
    const src = canvas.toDataURL('image/webp', 0.85)
    if (src.length > 2 * 1024 * 1024) throw new Error('This image is too large to include. Try a smaller image.')
    return { src, alt: file.name.replace(/\.[^.]+$/, '') }
  } finally { URL.revokeObjectURL(url) }
}
