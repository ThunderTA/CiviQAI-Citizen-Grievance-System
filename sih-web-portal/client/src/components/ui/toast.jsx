import { useEffect, useState } from 'react'
import { X, CheckCircle2, Info, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

const icons = {
  success: <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />,
  info: <Info className="h-4 w-4 text-blue-500 shrink-0" />,
  error: <AlertCircle className="h-4 w-4 text-destructive shrink-0" />,
}

export function Toast({ id, message, type = 'info', onClose }) {
  useEffect(() => {
    const t = setTimeout(() => onClose(id), 4000)
    return () => clearTimeout(t)
  }, [id, onClose])

  return (
    <div className={cn(
      "flex items-center gap-3 rounded-lg border bg-background shadow-lg px-4 py-3 text-sm w-80 animate-in slide-in-from-right-5"
    )}>
      {icons[type]}
      <span className="flex-1">{message}</span>
      <button onClick={() => onClose(id)} className="opacity-50 hover:opacity-100">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

export function ToastContainer({ toasts, onClose }) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map(t => (
        <Toast key={t.id} {...t} onClose={onClose} />
      ))}
    </div>
  )
}
