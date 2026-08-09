/**
 * Hard cyclomatic complexity limit (error tier).
 * Mirrors ESLint core `complexity` (classic variant) with a higher threshold.
 */

const LOGICAL_ASSIGNMENT_OPERATORS = new Set(['&&=', '||=', '??='])

/** @param {import('estree').Node} node */
function getFunctionLabel(node) {
  if (node.type === 'FunctionDeclaration' && node.id?.name) {
    return `function '${node.id.name}'`
  }
  if (node.type === 'FunctionExpression' && node.id?.name) {
    return `function '${node.id.name}'`
  }
  if (node.type === 'ArrowFunctionExpression') {
    return 'arrow function'
  }
  if (node.type === 'MethodDefinition' && node.key.type === 'Identifier') {
    return `method '${node.key.name}'`
  }
  return 'function'
}

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow functions with cyclomatic complexity above the hard limit.',
    },
    messages: {
      complex:
        '{{name}} has a complexity of {{complexity}}. Maximum allowed is {{max}}.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          max: { type: 'integer', minimum: 0 },
        },
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    const limits = require('../scripts/code-metrics-limits.cjs')
    const max = context.options[0]?.max ?? limits.complexity.error
    /** @type {number[]} */
    const complexities = []

    function increaseComplexity() {
      complexities[complexities.length - 1] += 1
    }

    return {
      onCodePathStart() {
        complexities.push(1)
      },

      CatchClause: increaseComplexity,
      ConditionalExpression: increaseComplexity,
      LogicalExpression: increaseComplexity,
      ForStatement: increaseComplexity,
      ForInStatement: increaseComplexity,
      ForOfStatement: increaseComplexity,
      IfStatement: increaseComplexity,
      WhileStatement: increaseComplexity,
      DoWhileStatement: increaseComplexity,
      AssignmentPattern: increaseComplexity,
      'SwitchCase[test]': increaseComplexity,

      AssignmentExpression(node) {
        if (LOGICAL_ASSIGNMENT_OPERATORS.has(node.operator)) {
          increaseComplexity()
        }
      },

      MemberExpression(node) {
        if (node.optional === true) {
          increaseComplexity()
        }
      },

      CallExpression(node) {
        if (node.optional === true) {
          increaseComplexity()
        }
      },

      onCodePathEnd(codePath, node) {
        const complexity = complexities.pop()

        if (
          codePath.origin !== 'function' &&
          codePath.origin !== 'class-field-initializer' &&
          codePath.origin !== 'class-static-block'
        ) {
          return
        }

        if (complexity > max) {
          context.report({
            node,
            messageId: 'complex',
            data: {
              name: getFunctionLabel(node),
              complexity: String(complexity),
              max: String(max),
            },
          })
        }
      },
    }
  },
}
