/**
 * Disallow inline string literals in runtime code.
 * Define wire/domain values once: enum members, module-level constants, or z.literal().
 */

const TYPEOF_RESULTS = new Set([
  'string',
  'number',
  'boolean',
  'undefined',
  'object',
  'function',
  'bigint',
  'symbol',
])

const DIRECTIVE_LITERALS = new Set([
  'use client',
  'use server',
  'use cache',
  'use cache: private',
  'use cache: remote',
])

const ALLOWED_FILE_PATTERNS = [
  /[/\\]Enums\.ts$/,
  /[/\\]enums\.ts$/,
  /-wire\.ts$/,
  /[/\\]constants[/\\]/,
  /[/\\]agent-schemas\.ts$/,
  // Zod schema modules are definitionally string-heavy (`.describe()` prompt
  // text) — generalized from the earlier per-file entries (beat-plan-schema,
  // critic-schema) which established the intent.
  /-schema\.ts$/,
  // Plural schema bundles (same artifact class as -schema.ts).
  /[/\\]schemas\.ts$/,
  // Scorer modules are judge-prompt definitions: instructions, rubric text,
  // and `.describe()` fields ARE the artifact (same class as schemas/wire).
  /-scorer\.ts$/,
  // Domain prompt folders: prompt-builder text is the artifact.
  /[/\\]domains[/\\][^/\\]+[/\\]prompts[/\\]/,
  /[/\\]domains[/\\][^/\\]+[/\\]ai[/\\]prompts[/\\]/,
  // Domain agent modules: system prompts, LangChain instructions, workflows.
  // (tools/ is a subset — kept as a separate comment for discoverability.)
  // The optional `ai/` matches the AI-layer migration (`domains/<x>/ai/agents/`).
  /[/\\]domains[/\\][^/\\]+[/\\](?:ai[/\\])?agents[/\\]/,
  // Agent tool modules at any depth (zod `.describe()`, tool ids, LangChain schemas).
  // Replaces the earlier filename-only `*-tools.ts` carve-out — market-analyst and
  // nested scorer tools use descriptive filenames, same artifact class.
  /[/\\]agents[/\\](?:[^/\\]+[/\\])*tools[/\\]/,
  // AI-layer tool modules (`domains/<x>/ai/tools/**`) — same artifact class after
  // the agents→ai relocation.
  /[/\\]ai[/\\]tools[/\\]/,
  /[/\\]mcp[/\\]domains[/\\][^/\\]+[/\\]tools\.ts$/,
  // Trigger.dev task modules: provider ids, status labels, and log copy
  // (including helpers extracted beside `.task.ts` files).
  /[/\\]domains[/\\][^/\\]+[/\\]tasks[/\\]/,
  // Drizzle schema: table/column names are the definition artifact.
  /[/\\]db[/\\]schema\.ts$/,
  /[/\\]db[/\\]schema-parts[/\\]/,
  /[/\\]db[/\\]schema-types\.ts$/,
  // Mastra Studio CLI tool stub bundles.
  /[/\\]shared[/\\]agent-kernel[/\\]mastra[/\\]tools[/\\]/,
  // Shared prompt registry modules.
  /[/\\]shared[/\\]agent-kernel[/\\]prompts[/\\]/,
  // Central model registry: provider/model id strings are the definition artifact.
  /[/\\]shared[/\\]agent-kernel[/\\]models\.ts$/,
  // RAG / context-assembly prompt modules.
  /[/\\]shared[/\\]ai[/\\]rag[/\\]/,
  /[/\\]shared[/\\]ai[/\\]contextAssembler/,
]

/** @param {import('eslint').Rule.RuleContext} context */
function filenameAllowed(context) {
  const normalized = context.filename.replace(/\\/g, '/')
  return ALLOWED_FILE_PATTERNS.some((pattern) => pattern.test(normalized))
}

/** @param {import('estree').Node | null | undefined} node */
function isModuleScope(node) {
  let current = node
  while (current) {
    if (
      current.type === 'FunctionDeclaration' ||
      current.type === 'FunctionExpression' ||
      current.type === 'ArrowFunctionExpression' ||
      current.type === 'MethodDefinition'
    ) {
      return false
    }
    if (current.type === 'Program') {
      return true
    }
    current = current.parent
  }
  return false
}

/**
 * @param {import('estree').Node} node
 * @param {import('eslint').Rule.RuleContext} context
 */
function isNamedConstantDefinition(node, context) {
  const parent = node.parent
  if (!parent) return false

  if (parent.type === 'TSEnumMember' && parent.initializer === node) {
    return true
  }

  if (parent.type === 'TSLiteralType' && parent.literal === node) {
    return true
  }

  if (parent.type === 'ImportDeclaration' && parent.source === node) {
    return true
  }

  if (parent.type === 'ImportExpression' && parent.source === node) {
    return true
  }

  if (parent.type === 'CallExpression' && parent.arguments[0] === node) {
    if (parent.callee?.type === 'Identifier' && parent.callee.name === 'require') {
      return true
    }
  }

  if (
    (parent.type === 'ExportNamedDeclaration' || parent.type === 'ExportAllDeclaration') &&
    parent.source === node
  ) {
    return true
  }

  if (parent.type === 'CallExpression' && parent.arguments[0] === node) {
    const callee = parent.callee
    if (
      callee?.type === 'MemberExpression' &&
      !callee.computed &&
      callee.property?.type === 'Identifier' &&
      (callee.property.name === 'literal' || callee.property.name === 'enum')
    ) {
      return true
    }
    if (callee?.type === 'Identifier' && callee.name === 'enum') {
      return true
    }
  }

  if (parent.type === 'VariableDeclarator' && parent.init === node && isModuleScope(parent)) {
    const id = parent.id
    if (id?.type === 'Identifier' && /^[A-Z][A-Z0-9_]*$/.test(id.name)) {
      return true
    }
  }

  if (parent.type === 'Property' && parent.key === node && !parent.computed) {
    return true
  }

  if (parent.type === 'TSPropertySignature' && parent.key === node && !parent.computed) {
    return true
  }

  if (parent.type === 'ArrayExpression') {
    const grand = parent.parent
    if (grand?.type === 'CallExpression') {
      const callee = grand.callee
      if (
        callee?.type === 'MemberExpression' &&
        !callee.computed &&
        callee.property?.type === 'Identifier' &&
        callee.property.name === 'enum'
      ) {
        return true
      }
      if (callee?.type === 'Identifier' && callee.name === 'enum') {
        return true
      }
    }
  }

  if (parent.type === 'TemplateLiteral' && parent.quasis?.includes(node)) {
    return false
  }

  return false
}

/** @param {import('estree').Node | null | undefined} node */
function isInsideJsx(node) {
  let current = node
  while (current) {
    if (
      current.type === 'JSXElement' ||
      current.type === 'JSXFragment' ||
      current.type === 'JSXAttribute'
    ) {
      return true
    }
    current = current.parent
  }
  return false
}

function isPathLikeString(value) {
  return (
    value.startsWith('@/') ||
    value.startsWith('./') ||
    value.startsWith('../') ||
    value.startsWith('/') ||
    value.includes('/')
  )
}

/** @param {import('estree').Literal} node */
function isDisplayNameAssignment(node) {
  const parent = node.parent
  if (!parent || parent.type !== 'AssignmentExpression' || parent.right !== node) return false
  const left = parent.left
  if (
    left?.type === 'MemberExpression' &&
    !left.computed &&
    left.property?.type === 'Identifier' &&
    left.property.name === 'displayName'
  ) {
    return true
  }
  return false
}

/** @param {import('estree').Literal} node */
function isTypeofGuardLiteral(node) {
  const parent = node.parent
  if (!parent || parent.type !== 'BinaryExpression') return false
  if (!['===', '!==', '==', '!='].includes(parent.operator)) return false
  const other = parent.left === node ? parent.right : parent.left
  if (other?.type !== 'UnaryExpression' || other.operator !== 'typeof') return false
  return TYPEOF_RESULTS.has(String(node.value))
}

/**
 * @param {import('estree').Literal} node
 */
function shouldIgnoreLiteral(node) {
  const value = node.value
  if (typeof value !== 'string') return true
  if (value.length <= 1) return true
  if (isTypeofGuardLiteral(node)) return true
  if (isDisplayNameAssignment(node)) return true
  if (DIRECTIVE_LITERALS.has(value)) return true
  if (isPathLikeString(value)) return true
  if (value.startsWith('http://') || value.startsWith('https://')) return true
  return false
}

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow magic strings. Use enums, named constants, or z.literal() definitions instead of inline string literals.',
    },
    messages: {
      magicString:
        'Magic string \'{{value}}\' is not allowed. Use an enum member, named constant, or import from a wire/schema module.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          allowJsx: {
            type: 'boolean',
            description: 'When true, string literals inside JSX are allowed (Tailwind, labels).',
          },
        },
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    const allowJsx = context.options[0]?.allowJsx ?? true

    if (filenameAllowed(context)) {
      return {}
    }

    /** @param {import('estree').Literal} node */
    function checkLiteral(node) {
      if (shouldIgnoreLiteral(node)) return
      if (isNamedConstantDefinition(node, context)) return
      if (allowJsx && isInsideJsx(node)) return

      context.report({
        node,
        messageId: 'magicString',
        data: { value: String(node.value) },
      })
    }

    return {
      Literal: checkLiteral,
    }
  },
}
