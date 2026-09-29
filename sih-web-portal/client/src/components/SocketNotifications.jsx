import { useEffect } from 'react'
import { useUser, useAuth } from '@/lib/auth'
import socket from '@/lib/socket'
import { useNotifications } from '@/contexts/NotificationContext'

export function SocketNotifications() {
  const { user, isLoaded } = useUser()
  const { isSignedIn, role } = useAuth()
  const { addNotification } = useNotifications()

  const isAdmin = role === 'admin'

  useEffect(() => {
    if (!isLoaded || !isSignedIn || isAdmin || !user?.id) return

    socket.connect()
    socket.emit('join_user', user.id)

    socket.on('citizen_notification', (notif) => {
      addNotification(notif)
    })

    return () => {
      socket.off('citizen_notification')
      socket.disconnect()
    }
  }, [isLoaded, isSignedIn, isAdmin, user?.id, addNotification])

  return null
}
