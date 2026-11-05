import { Code } from '@tiptap/extension-code'
import CodeBlock from '@tiptap/extension-code-block'

// Inline code normally rejects every other mark, so bold or color could not be applied to it.
export const FormattableCode = Code.extend({ excludes: 'code' })

// Every mark except inline code: a code block saves as <pre><code>, and allowing the mark
// here turns that <code> into inline code on reopen, which used to erase other formatting.
export const FormattableCodeBlock = CodeBlock.extend({
  marks: 'bold italic underline strike textStyle highlight link',
})
