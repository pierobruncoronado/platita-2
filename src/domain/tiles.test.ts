import { describe, expect, it } from 'vitest'
import { QUICK_TILES } from './catalog'
import { isValidTileAmount, parseTileAmounts, resolveTiles } from './tiles'

describe('isValidTileAmount', () => {
  it('accepts positive integer cents up to S/99999.99 and nothing else', () => {
    for (const ok of [1, 250, 9_999_999]) expect(isValidTileAmount(ok)).toBe(true)
    for (const bad of [0, -5, 2.5, NaN, Infinity, 10_000_000, '200', null, undefined]) expect(isValidTileAmount(bad)).toBe(false)
  })
})

describe('parseTileAmounts', () => {
  it('keeps valid edits of known tiles only', () => {
    expect(parseTileAmounts('{"pasaje":250,"snack":900,"nope":100}')).toEqual({ pasaje: 250, snack: 900 })
  })

  it('drops invalid values so a damaged setting never creates a wrong expense', () => {
    expect(parseTileAmounts('{"pasaje":0,"bebida":-3,"snack":"7","taxi":2.5,"alcohol":null}')).toEqual({})
  })

  it('falls back to {} for non-JSON, arrays, non-objects and missing values', () => {
    for (const bad of [undefined, 5, '', '{', '[1,2]', '"x"', 'null']) expect(parseTileAmounts(bad as string | number | undefined)).toEqual({})
  })
})

describe('resolveTiles', () => {
  it('overrides only the amount and keeps category, name and order', () => {
    const tiles = resolveTiles({ pasaje: 250 })
    expect(tiles.map((t) => t.id)).toEqual(QUICK_TILES.map((t) => t.id))
    expect(tiles[0]).toMatchObject({ id: 'pasaje', amountCents: 250, category: 'transporte', subtype: 'Pasaje', label: 'Pasaje' })
    expect(tiles.slice(1).map((t) => t.amountCents)).toEqual(QUICK_TILES.slice(1).map((t) => t.amountCents))
  })
})
