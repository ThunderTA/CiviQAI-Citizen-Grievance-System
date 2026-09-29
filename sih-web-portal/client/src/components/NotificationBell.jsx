import { useState, useRef, useEffect } from 'react'
import { useNotifications } from '@/contexts/NotificationContext'
import { Bell } from 'lucide-react'

/**
 * Notification dropdown. Extracted from the old top navbar so the sidebar
 * shell can reuse it without pulling in the rest of that component.
 */
export function NotificationBell() {
  const { notifications, unread, markAllRead } = useNotifications()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const toggle = () => {
    setOpen(v => !v)
    // Opening the panel is the read receipt.
    if (!open && unread > 0) markAllRead()
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={toggle}
        className="relative p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        aria-label={unread > 0 ? `Notifications (${unread} unread)` : 'Notifications'}
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-0.5 leading-none">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 w-72 bg-popover border rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="px-3 py-2.5 border-b">
            <p className="text-sm font-semibold">Notifications</p>
          </div>
          {notifications.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No notifications yet</p>
          ) : (
            <div className="max-h-64 overflow-y-auto divide-y">
              {notifications.slice(0, 10).map(n => (
                <div key={n.id} className={`px-3 py-3 text-sm ${!n.read ? 'bg-primary/5' : ''}`}>
                  <p className="leading-snug">{n.message}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(n.createdAt).toLocaleString('en-IN', {
                      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                    })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default NotificationBell
