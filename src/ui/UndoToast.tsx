import { useEffect } from 'react'

export const UNDO_MS = 5000 // spec AC1

export interface Toast {
  movementId: string
  message: string
  undoTo: boolean // value of `undone` that Deshacer restores: true after a create, false after a delete
  key: number // restarts the timer when a new toast replaces this one
}

export type ToastInput = Omit<Toast, 'key'>

export function UndoToast({ toast, onUndo, onDone }: { toast: Toast; onUndo: (t: Toast) => void; onDone: () => void }) {
  useEffect(() => {
    const id = setTimeout(onDone, UNDO_MS)
    return () => clearTimeout(id)
  }, [toast.key, onDone])

  return (
    <div className="toast" role="status" aria-live="polite" key={toast.key}>
      <span className="toast-msg">{toast.message}</span>
      <button type="button" className="toast-undo" onClick={() => onUndo(toast)}>
        Deshacer
      </button>
      <span className="toast-timer" style={{ animationDuration: `${UNDO_MS}ms` }} aria-hidden="true" />
    </div>
  )
}
