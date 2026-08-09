/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow files longer than the hard line limit.',
    },
    messages: {
      tooManyLines: 'File has {{count}} lines (limit {{max}}). Split into smaller modules.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          max: { type: 'number' },
          skipBlankLines: { type: 'boolean' },
          skipComments: { type: 'boolean' },
        },
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    const options = context.options[0] ?? {}
    const limits = require('../scripts/code-metrics-limits.cjs')
    const max = options.max ?? limits.fileLines.error
    const skipBlankLines = options.skipBlankLines ?? limits.fileLines.skipBlankLines
    const skipComments = options.skipComments ?? limits.fileLines.skipComments

    return {
      Program(node) {
        const lines = context.sourceCode.getText().split('\n')
        let count = lines.length

        if (skipBlankLines || skipComments) {
          count = 0
          for (const line of lines) {
            const trimmed = line.trim()
            if (skipBlankLines && trimmed.length === 0) continue
            if (skipComments && (trimmed.startsWith('//') || trimmed.startsWith('/*'))) continue
            count += 1
          }
        }

        if (count > max) {
          context.report({
            node,
            messageId: 'tooManyLines',
            data: { max: String(max), count: String(count) },
          })
        }
      },
    }
  },
}
