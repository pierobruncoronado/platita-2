import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db } from '../db/db'
import { getLastExportAt, setLastExportAt } from '../db/seed'
import { buildExport, daysSinceExport, exportFileBase, exportReminderDue } from '../domain/export'
import type { AppSettings } from './App'

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

function lastLabel(days: number | null): string {
  if (days === null) return 'Nunca has exportado'
  if (days === 0) return 'Último respaldo: hoy'
  if (days === 1) return 'Último respaldo: ayer'
  return `Último respaldo: hace ${days} días`
}

async function buildFiles(settings: AppSettings) {
  const now = new Date().toISOString()
  const movements = await db.movements.toArray()
  const closes = await db.closes.toArray()
  const files = buildExport(movements, settings.tz, settings.opening, now, closes)
  return { now, base: exportFileBase(now, settings.tz), ...files }
}

// Card from the Mes board ("Exportar todo para tu LLM"); lives on Inicio until H6 builds Mes.
// `reminder` = the compact weekly nudge shown near the top when a backup is due.
export function ExportCard({ settings, now, reminder = false }: { settings: AppSettings; now: string; reminder?: boolean }) {
  const lastExportAt = useLiveQuery(() => getLastExportAt(db), [], undefined)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const canShareFiles = typeof navigator.canShare === 'function'

  if (lastExportAt === undefined) return null // still loading
  const days = daysSinceExport(lastExportAt, now, settings.tz)
  // Keep the reminder on screen while it shows the result of its own export.
  if (reminder && !exportReminderDue(lastExportAt, now, settings.tz) && !message) return null

  async function exportAll() {
    setBusy(true)
    setMessage(null)
    try {
      const f = await buildFiles(settings)
      download(`${f.base}.json`, f.json, 'application/json')
      await new Promise((r) => setTimeout(r, 400)) // two downloads back to back can be dropped
      download(`${f.base}.csv`, f.csv, 'text/csv;charset=utf-8')
      await setLastExportAt(db, f.now)
      setMessage(`Listo: ${f.movementCount} movimientos. Revisa Descargas: deben estar los 2 archivos (JSON y CSV); si Chrome pidió permiso para varias descargas, acéptalo y exporta otra vez.`)
    } catch (err) {
      console.error(JSON.stringify({ event: 'export_failed', message: String(err) }))
      setMessage('No se pudo exportar. Intenta otra vez.')
    } finally {
      setBusy(false)
    }
  }

  async function share() {
    setBusy(true)
    setMessage(null)
    try {
      const f = await buildFiles(settings)
      const files = [
        new File([f.json], `${f.base}.json`, { type: 'application/json' }),
        new File([f.csv], `${f.base}.csv`, { type: 'text/csv' }),
      ]
      if (!navigator.canShare?.({ files })) {
        setMessage('Tu navegador no permite compartir archivos; usa "Exportar todo".')
        return
      }
      await navigator.share({ files, title: 'Platita · export' })
      await setLastExportAt(db, f.now)
      setMessage('Compartido.')
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return // user closed the share sheet
      console.error(JSON.stringify({ event: 'export_share_failed', message: String(err) }))
      setMessage('No se pudo compartir. Intenta otra vez.')
    } finally {
      setBusy(false)
    }
  }

  if (reminder) {
    return (
      <section className="reminder-card" aria-label="Respaldo pendiente">
        <div className="row-main">
          <span className="row-title">Respalda tus datos</span>
          <span className="row-sub">{lastLabel(days)} · solo viven en este teléfono</span>
        </div>
        <button type="button" className="btn-green" disabled={busy} onClick={exportAll}>
          Exportar
        </button>
        {message && <p className="small reminder-msg">{message}</p>}
      </section>
    )
  }

  return (
    <section className="card export-card" aria-labelledby="export-title">
      <h2 id="export-title" className="row-title">
        Exportar todo para tu LLM
      </h2>
      <p className="muted small">Todos los movimientos con fecha, categoría, nota y estado, en un archivo (CSV y JSON).</p>
      <p className="muted small">{lastLabel(days)}</p>
      <button type="button" className="save export-btn" disabled={busy} onClick={exportAll}>
        Exportar todo
      </button>
      {canShareFiles && (
        <button type="button" className="btn-outline" disabled={busy} onClick={share}>
          Compartir (Drive, WhatsApp, tu LLM…)
        </button>
      )}
      {message && (
        <p className="small" role="status">
          {message}
        </p>
      )}
    </section>
  )
}
