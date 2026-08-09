/**
 * Disallow multiple .filter() calls on the same array in one scope — use one reduce/pass instead.
 */

/** @param {import('estree').CallExpression} node */
function getFilterReceiverName(node) {
  const callee = node.callee
  if (callee.type !== 'MemberExpression') return null
  if (callee.property.type !== 'Identifier' || callee.property.name !== 'filter') return null
  if (callee.object.type === 'Identifier') return callee.object.name
  return null
}

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow multiple .filter() calls on the same array in one scope; prefer a single reduce/pass.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          minFilters: { type: 'number', minimum: 2 },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      repeatedFilter:
        'Another `.filter()` on "{{name}}" in this scope — combine into one `.reduce()` or single pass.',
    },
  },

  create(context) {
    const minFilters = context.options[0]?.minFilters ?? 2
    /** @type {WeakMap<import('eslint').Scope.Scope, Map<string, number>>} */
    const filterCounts = new WeakMap()

    function getCounts(scope) {
      let counts = filterCounts.get(scope)
      if (!counts) {
        counts = new Map()
        filterCounts.set(scope, counts)
      }
      return counts
    }

    return {
      CallExpression(node) {
        const receiver = getFilterReceiverName(node)
        if (!receiver) return

        const scope = context.sourceCode.getScope(node)
        const counts = getCounts(scope)
        const nextCount = (counts.get(receiver) ?? 0) + 1
        counts.set(receiver, nextCount)

        if (nextCount >= minFilters) {
          context.report({
            node,
            messageId: 'repeatedFilter',
            data: { name: receiver },
          })
        }
      },
    }
  },
}
