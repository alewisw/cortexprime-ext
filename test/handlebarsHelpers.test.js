import { describe, expect, it } from 'vitest'
import { HANDLEBAR_HELPERS } from '../module/handlebars/helpers.js'

const {
  '??': nullish,
  and, borderPosition, concat, eq, gt, gte, listHasLess, listHasMore,
  lt, lte, minus, mod, ne, not, or, plus, ternary, viewClasses
} = HANDLEBAR_HELPERS

describe('the helper table', () => {
  it('registers every helper the templates use', () => {
    expect(Object.keys(HANDLEBAR_HELPERS).sort()).toEqual([
      '??', 'and', 'borderPosition', 'concat', 'eq', 'gt', 'gte', 'listHasLess', 'listHasMore',
      'lt', 'lte', 'minus', 'mod', 'ne', 'not', 'or', 'plus', 'ternary', 'viewClasses'
    ])
  })
})

describe('arithmetic helpers', () => {
  it('minus coerces both operands', () => {
    expect(minus(5, 2)).toBe(3)
    expect(minus('5', '2')).toBe(3)
    expect(minus('5', 2)).toBe(3)
  })

  it('plus adds two numbers', () => {
    expect(plus(2, 3)).toBe(5)
    expect(plus('2', 3)).toBe(5)
  })

  // BUG, pinned rather than fixed so the change is a deliberate one. `plus` is
  // `(a, b) => +a + b` - it coerces only the FIRST operand, so a string second operand turns
  // the whole thing into string concatenation. `minus` right next to it coerces both. Any
  // template calling {{plus x "1"}}, or passing a value that arrives as a string (dice faces
  // are stored as strings throughout this system), silently gets "51" instead of 6.
  it('plus concatenates instead of adding when the SECOND operand is a string', () => {
    expect(plus(2, '3')).toBe('23')
    expect(plus('2', '3')).toBe('23')
    expect(plus(5, '1')).toBe('51')
  })

  it('mod takes the remainder, and is NaN on divide by zero', () => {
    expect(mod(7, 3)).toBe(1)
    expect(mod(6, 3)).toBe(0)
    expect(mod(5, 0)).toBeNaN()
  })
})

describe('comparison helpers', () => {
  // Strict equality, and dice faces live as strings across this system, so '8' and 8 are not
  // the same thing to a template.
  it('eq and ne compare strictly, without type coercion', () => {
    expect(eq(2, 2)).toBe(true)
    expect(eq('2', 2)).toBe(false)
    expect(ne('2', 2)).toBe(true)
    expect(ne(2, 2)).toBe(false)
  })

  it('gt/gte/lt/lte order numbers', () => {
    expect(gt(3, 2)).toBe(true)
    expect(gt(2, 2)).toBe(false)
    expect(gte(2, 2)).toBe(true)
    expect(lt(2, 3)).toBe(true)
    expect(lt(2, 2)).toBe(false)
    expect(lte(2, 2)).toBe(true)
  })
})

describe('logical helpers', () => {
  // These return the operand, not a boolean - fine for {{#if}}, but a template that renders the
  // result directly prints the value.
  it('and/or return an operand rather than a boolean', () => {
    expect(and(0, 5)).toBe(0)
    expect(and(1, 5)).toBe(5)
    expect(or(0, 5)).toBe(5)
    expect(or(1, 5)).toBe(1)
  })

  it('not is a real boolean', () => {
    expect(not(0)).toBe(true)
    expect(not('')).toBe(true)
    expect(not('x')).toBe(false)
  })

  // Nullish, not falsy: a stored 0 or '' is a real value and must survive.
  it('?? falls back only for null and undefined', () => {
    expect(nullish(null, 7)).toBe(7)
    expect(nullish(undefined, 7)).toBe(7)
    expect(nullish(0, 7)).toBe(0)
    expect(nullish('', 7)).toBe('')
  })

  it('ternary picks by truthiness', () => {
    expect(ternary(true, 'a', 'b')).toBe('a')
    expect(ternary(0, 'a', 'b')).toBe('b')
  })
})

describe('concat', () => {
  it('joins primitives into one string', () => {
    expect(concat('a', 'b', 'c')).toBe('abc')
    expect(concat('trait-', 0)).toBe('trait-0')
  })

  // Handlebars always appends an options object; dropping non-primitives is what keeps it out
  // of the output.
  it('drops the trailing Handlebars options object, and any other object', () => {
    expect(concat('a', 1, { hash: {}, data: {} })).toBe('a1')
    expect(concat({ hash: {} })).toBe('')
  })

  it('returns an empty string when called with nothing', () => {
    expect(concat()).toBe('')
  })
})

describe('listHasLess / listHasMore', () => {
  // A negative bound means "no limit configured" - the template should render the control.
  it('are permissive when no bound is configured', () => {
    expect(listHasLess({ 0: 'a' }, -1)).toBe(true)
    expect(listHasLess({ 0: 'a' })).toBe(true)
    expect(listHasMore({ 0: 'a' }, -1)).toBe(true)
    expect(listHasMore({ 0: 'a' })).toBe(true)
  })

  it('listHasLess is true only below the maximum', () => {
    expect(listHasLess({ 0: 'a', 1: 'b' }, 3)).toBe(true)
    expect(listHasLess({ 0: 'a', 1: 'b' }, 2)).toBe(false)
    expect(listHasLess({ 0: 'a', 1: 'b' }, 1)).toBe(false)
  })

  it('listHasMore is true only above the minimum', () => {
    expect(listHasMore({ 0: 'a', 1: 'b' }, 1)).toBe(true)
    expect(listHasMore({ 0: 'a', 1: 'b' }, 2)).toBe(false)
  })

  it('count arrays and empty collections', () => {
    expect(listHasLess(['a'], 2)).toBe(true)
    expect(listHasMore(['a', 'b'], 1)).toBe(true)
    expect(listHasMore({}, 0)).toBe(false)
    expect(listHasLess({}, 1)).toBe(true)
  })

  // getLength returns -1 for anything that isn't a list, and the `length > -1` guard turns that
  // into false - a malformed value renders no control rather than throwing.
  it('are false for values that are not lists', () => {
    expect(listHasLess(5, 3)).toBe(false)
    expect(listHasMore('abc', 1)).toBe(false)
  })

  it('accept the bound as a string, as templates pass it', () => {
    expect(listHasLess({ 0: 'a' }, '3')).toBe(true)
    expect(listHasMore({ 0: 'a', 1: 'b' }, '1')).toBe(true)
  })
})

describe('viewClasses', () => {
  const breadcrumbs = { 0: { active: false, target: 'actorTypes' }, 1: { active: true, target: 'traitSets' } }

  it('shows only the view the active breadcrumb points at', () => {
    expect(viewClasses('traitSets', breadcrumbs)).toBe('view')
    expect(viewClasses('actorTypes', breadcrumbs)).toBe('view hide')
  })

  it('hides everything when no breadcrumb is active', () => {
    expect(viewClasses('traitSets', { 0: { active: false, target: 'traitSets' } })).toBe('view hide')
    expect(viewClasses('traitSets', {})).toBe('view hide')
    expect(viewClasses('traitSets')).toBe('view hide')
  })
})

describe('borderPosition', () => {
  it('delegates to getBorderWidth', () => {
    expect(borderPosition('t', 2)).toBe('2px 0 0 0')
    expect(borderPosition('a', 1)).toBe('1px 1px 1px 1px')
  })
})
