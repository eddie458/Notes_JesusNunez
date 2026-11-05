// Formatted code must keep its marks when a note reopens. These schema rules decide
// which marks survive reading saved HTML back into the editor.
import assert from 'node:assert/strict'
import { getSchema } from '@tiptap/core'
import Highlight from '@tiptap/extension-highlight'
import { TextStyle } from '@tiptap/extension-text-style'
import StarterKit from '@tiptap/starter-kit'
import { FormattableCode, FormattableCodeBlock } from '../src/code-formatting.js'

let checks = 0
const check = (condition, message) => { assert.ok(condition, message); checks += 1 }

const schema = getSchema([StarterKit.configure({ code: false, codeBlock: false }), FormattableCode, FormattableCodeBlock, TextStyle, Highlight.configure({ multicolor: true })])
const { codeBlock, paragraph } = schema.nodes
const { code } = schema.marks

// Collect marks as the HTML parser does for text nested inside each named element.
const parsedMarks = (parent, ...names) => names
  .map(name => schema.marks[name].create())
  .filter(mark => parent.allowsMarkType(mark.type))
  .reduce((marks, mark) => mark.addToSet(marks), [])
  .map(mark => mark.type.name)

check(!codeBlock.allowsMarkType(code), 'A code block must not read its own <code> wrapper as inline code.')
for (const mark of Object.values(schema.marks).filter(item => item !== code)) {
  check(codeBlock.allowsMarkType(mark), `Code blocks must allow ${mark.name}.`)
  check(!code.excludes(mark) && !mark.excludes(code), `Inline code must combine with ${mark.name}.`)
  check(parsedMarks(codeBlock, 'code', mark.name).join() === mark.name, `A reopened code block must keep ${mark.name}.`)
  check(parsedMarks(paragraph, 'code', mark.name).sort().join() === ['code', mark.name].sort().join(), `Reopened inline code must keep ${mark.name}.`)
}
console.log(`Passed ${checks} code formatting checks.`)
