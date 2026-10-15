/// <reference types="node" />
import { describe, expect, it } from 'vitest'
import { dayHeader, fromDateTimeInput, isSameLocalDay, toDateTimeInput, weekHeader, whenLabel } from './labels'
import { zonedLocalToIso } from './time'

const TZ = 'America/Lima'
const NOW = '2026-10-15T18:34:00.000Z' // Thu 13:34 Lima

describe('labels', () => {
  it('headers match the Inicio board', () => {
    expect(dayHeader(NOW, TZ)).toBe('Jueves 15 oct')
    expect(weekHeader(NOW, TZ)).toBe('Semana 12–18 oct')
    expect(weekHeader('2026-10-28T15:00:00.000Z', TZ)).toBe('Semana 26 oct–1 nov')
  })

  it('date chip says Hoy / Ayer / date in Lima time', () => {
    expect(whenLabel(NOW, NOW, TZ)).toBe('Hoy · 13:34')
    expect(whenLabel('2026-10-15T01:05:00.000Z', NOW, TZ)).toBe('Ayer · 20:05')
    expect(whenLabel('2026-10-12T14:00:00.000Z', NOW, TZ)).toBe('12 oct · 09:00')
  })

  it('isSameLocalDay uses Lima, not UTC', () => {
    // 01:05Z on the 15th is still the 14th in Lima.
    expect(isSameLocalDay('2026-10-15T01:05:00.000Z', NOW, TZ)).toBe(false)
    expect(isSameLocalDay('2026-10-15T05:00:00.000Z', NOW, TZ)).toBe(true)
  })
})

describe('datetime-local round trip', () => {
  it('a picked wall-clock time is read in Lima even with the device in New York', () => {
    const prev = process.env.TZ
    process.env.TZ = 'America/New_York'
    try {
      expect(zonedLocalToIso({ y: 2026, m: 10, d: 14, h: 20, mi: 5 }, TZ)).toBe('2026-10-15T01:05:00.000Z')
      expect(toDateTimeInput('2026-10-15T01:05:00.000Z', TZ)).toBe('2026-10-14T20:05')
      expect(fromDateTimeInput('2026-10-14T20:05', TZ)).toBe('2026-10-15T01:05:00.000Z')
      expect(fromDateTimeInput(toDateTimeInput(NOW, TZ), TZ)).toBe(NOW)
      expect(fromDateTimeInput('', TZ)).toBeNull()
      expect(fromDateTimeInput('2026-10-14 20:05', TZ)).toBeNull()
    } finally {
      if (prev === undefined) delete process.env.TZ
      else process.env.TZ = prev
    }
  })
})
