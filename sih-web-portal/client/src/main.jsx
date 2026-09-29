import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthProvider } from '@/lib/auth'
import { NotificationProvider } from '@/contexts/NotificationContext'
import { RoleProvider } from '@/contexts/RoleContext'
import 'leaflet/dist/leaflet.css'
import './index.css'
import App from './App.jsx'

// No third-party auth key is required to boot any more — accounts live in this
// project's own database, so the portal runs standalone.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <NotificationProvider>
        <RoleProvider>
          <App />
        </RoleProvider>
      </NotificationProvider>
    </AuthProvider>
  </StrictMode>,
)
