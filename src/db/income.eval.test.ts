// Behavioral evals for income (H4), told the way Piero lives them. Run: npm run test:evals
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { RECURRING_TEMPLATES } from '../domain/catalog'
import { generateExpected, openExpected, type ExpectedItem } from '../domain/expected'
import { balanceAt } from '../domain/flow'
import { PlatitaDB } from './db'
import { confirmIncome, createIncome, setUndone } from './movements'
import { getOpening, seedDefaults } from './seed'

const TZ = 'America/Lima'
const THU_1730 = '2026-10-15T22:30:00.000Z'
const FRI_0800 = '2026-10-16T13:00:00.000Z'
const SAT_1100 = '2026-10-17T16:00:00.000Z'

let n = 0
const dbs: PlatitaDB[] = []
async function piero(): Promise<PlatitaDB> {
  const db = new PlatitaDB(`income-eval-${n++}`)
  dbs.push(db)
  await seedDefaults(db)
  return db
}
afterEach(async () => {
  for (const db of dbs.splice(0)) await db.delete()
})

function item(now: string, id: string): ExpectedItem {
  const found = generateExpected(RECURRING_TEMPLATES, now, TZ).find((i) => i.id === id)
  if (!found) throw new Error(`no expected item ${id}`)
  return found
}

async function snapshot(db: PlatitaDB, now: string) {
  const movements = await db.movements.toArray()
  const balance = balanceAt(movements, now, TZ, await getOpening(db))
  const open = openExpected(generateExpected(RECURRING_TEMPLATES, now, TZ), movements, now)
  const owed = open.reduce((s, x) => s + x.status.remainingCents, 0)
  return { enCuenta: balance.enCuentaCents, owed, ifArrives: balance.enCuentaCents + owed, open }
}

describe('H4 behavioral evals (real language)', () => {
  it('"Hoy jueves a las 5:30 papá me dio la mesada y me pasaron 50 de Claude, aunque solo me debían 30"', async () => {
    const db = await piero()
    const before = await snapshot(db, THU_1730)
    expect(before).toMatchObject({ enCuenta: 23084, owed: 13000, ifArrives: 36084 })

    await confirmIncome(db, item(THU_1730, 'mesada-papa:2026-W42'), 10000, '', THU_1730, THU_1730, TZ)
    await confirmIncome(db, item(THU_1730, 'reposicion-claude:2026-10'), 5000, 'me dio 20 de más', THU_1730, THU_1730, TZ)

    const after = await snapshot(db, THU_1730)
    expect(after.enCuenta).toBe(38084) // 230.84 + 100 + 50
    expect(after.owed).toBe(0) // nothing left por cobrar; the extra 20 is just income
  })

  it('"Me confundí y quise confirmar la mesada dos veces" → the second is refused', async () => {
    const db = await piero()
    const mesada = item(THU_1730, 'mesada-papa:2026-W42')
    await confirmIncome(db, mesada, 10000, '', THU_1730, THU_1730, TZ)
    await expect(confirmIncome(db, mesada, 10000, '', THU_1730, THU_1730, TZ)).rejects.toThrow(/settled/)
    expect((await snapshot(db, THU_1730)).enCuenta).toBe(33084)
  })

  it('"Es viernes en la mañana y papá todavía no me da la mesada" → atrasada, only in "si llega lo esperado"', async () => {
    const db = await piero()
    const s = await snapshot(db, FRI_0800)
    const mesada = s.open.find((x) => x.item.templateId === 'mesada-papa')!
    expect(mesada.status.state).toBe('overdue')
    expect(s.enCuenta).toBe(23084)
    expect(s.ifArrives).toBe(23084 + 10000 + 3000)
  })

  it('"El sábado vino el abuelo y me dio 60" → ingreso suelto, counts this week', async () => {
    const db = await piero()
    await createIncome(db, { amountCents: 6000, source: 'Abuelo', note: '', occurredAt: SAT_1100 }, SAT_1100, TZ)
    expect((await snapshot(db, SAT_1100)).enCuenta).toBe(29084)
  })

  it('"Deshice la confirmación de Claude porque fue sin querer" → vuelve a faltar S/30', async () => {
    const db = await piero()
    const paid = await confirmIncome(db, item(THU_1730, 'reposicion-claude:2026-10'), 5000, '', THU_1730, THU_1730, TZ)
    await setUndone(db, paid.id, true)
    const s = await snapshot(db, THU_1730)
    expect(s.enCuenta).toBe(23084)
    expect(s.open.find((x) => x.item.templateId === 'reposicion-claude')?.status.remainingCents).toBe(3000)
  })
})
