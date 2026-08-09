const noMagicString = require('./no-magic-string')
const maxLinesStrict = require('./max-lines-strict')
const complexityStrict = require('./complexity-strict')
const noRepeatedArrayFilter = require('./no-repeated-array-filter')

module.exports = {
  rules: {
    'no-magic-string': noMagicString,
    'max-lines-strict': maxLinesStrict,
    'complexity-strict': complexityStrict,
    'no-repeated-array-filter': noRepeatedArrayFilter,
  },
}
