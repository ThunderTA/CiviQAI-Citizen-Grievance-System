import { useEffect } from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

function Dialog({ open, onClose, children, className }) {
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className={cn("relative z-50 w-full max-w-lg rounded-xl bg-background shadow-xl border max-h-[90vh] overflow-y-auto", className)}>
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100 transition-opacity"
        >
          <X className="h-4 w-4" />
        </button>
        {children}
      </div>
    </div>
  )
}

function DialogHeader({ className, ...props }) {
  return <div className={cn("flex flex-col space-y-1.5 p-6 pb-0", className)} {...props} />
}

function DialogTitle({ className, ...props }) {
  return <h2 className={cn("text-lg font-semibold leading-none tracking-tight pr-6", className)} {...props} />
}

function DialogDescription({ className, ...props }) {
  return <p className={cn("text-sm text-muted-foreground mt-1", className)} {...props} />
}

function DialogContent({ className, ...props }) {
  return <div className={cn("p-6", className)} {...props} />
}

function DialogFooter({ className, ...props }) {
  return <div className={cn("flex items-center justify-end gap-2 p-6 pt-0", className)} {...props} />
}

export { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogContent, DialogFooter }
