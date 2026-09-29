import { createContext, useContext, useState } from 'react'

const NotificationContext = createContext()

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cc_notifications') || '[]') }
    catch { return [] }
  })
  const [unread, setUnread] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('cc_notifications') || '[]')
      return stored.filter(n => !n.read).length
    } catch { return 0 }
  })

  const addNotification = (notif) => {
    const entry = { ...notif, id: Date.now(), read: false, createdAt: new Date().toISOString() }
    setNotifications(prev => {
      const next = [entry, ...prev].slice(0, 20)
      localStorage.setItem('cc_notifications', JSON.stringify(next))
      return next
    })
    setUnread(prev => prev + 1)
  }

  const markAllRead = () => {
    setUnread(0)
    setNotifications(prev => {
      const next = prev.map(n => ({ ...n, read: true }))
      localStorage.setItem('cc_notifications', JSON.stringify(next))
      return next
    })
  }

  return (
    <NotificationContext.Provider value={{ notifications, unread, addNotification, markAllRead }}>
      {children}
    </NotificationContext.Provider>
  )
}

export const useNotifications = () => useContext(NotificationContext)
