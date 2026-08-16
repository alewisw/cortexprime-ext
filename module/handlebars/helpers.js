import { getLength, objectFindValue } from '../../lib/helpers.js'
import { getBorderWidth } from '../scripts/foundryHelpers.js'

// Every helper body is pure, so the table is defined here and registered below — that way the
// behaviour can be unit tested without a Handlebars runtime.
export const HANDLEBAR_HELPERS = {
  borderPosition: (borderPosition, borderWidth) => getBorderWidth(borderPosition, borderWidth),

  // Handlebars appends an options object as the final argument to every helper call; the
  // typeof check is what drops it (and any other non-primitive) from the concatenation.
  concat: (...args) => args.reduce((acc, current) => {
    return typeof current !== 'object'
      ? `${acc}${current}`
      : acc
  }, ''),

  listHasLess: (value, max = -1) => {
    const parsedMax = parseInt(max)
    if (parsedMax < 0) return true

    const length = getLength(value)

    return length > -1 && length < parsedMax
  },

  listHasMore: (value, min = -1) => {
    const parsedMin = parseInt(min)
    if (parsedMin < 0) return true

    const length = getLength(value)

    return length > -1 && length > parsedMin
  },

  viewClasses: (value, breadcrumbs = {}) => {
    const activeBreadcrumb = objectFindValue(breadcrumbs, breadcrumb => breadcrumb.active)

    return (activeBreadcrumb?.target || null) === value ? 'view' : 'view hide'
  },

  '??': (a, b) => a ?? b,
  and: (a, b) => a && b,
  eq: (a, b) => a === b,
  gt: (a, b) => a > b,
  gte: (a, b) => a >= b,
  lt: (a, b) => a < b,
  lte: (a, b) => a <= b,
  mod: (a, b) => a % b,
  minus: (a, b) => (+a) - (+b),
  ne: (a, b) => a !== b,
  not: a => !a,
  or: (a, b) => a || b,
  plus: (a, b) => +a + b,
  ternary: (conditional, a, b) => conditional ? a : b
}

export const registerHandlebarHelpers = () => {
  Handlebars.registerHelper(HANDLEBAR_HELPERS)
}
