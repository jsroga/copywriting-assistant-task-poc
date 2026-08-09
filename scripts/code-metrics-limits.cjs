/** Shared file-size and cyclomatic-complexity thresholds (ESLint + typecheck). */
module.exports = {
  fileLines: {
    warn: 400,
    error: 800,
    skipBlankLines: true,
    skipComments: true,
  },
  complexity: {
    warn: 15,
    error: 25,
  },
}
