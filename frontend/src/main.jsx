import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'

// Register the SW for the prod web/PWA build only. Staging/native builds set
// VITE_API_BASE and skip it (avoids stale caches while iterating).
if (!import.meta.env.VITE_API_BASE && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(import.meta.env.BASE_URL + 'service-worker.js').catch(() => {})
  })
  // Quand un nouveau SW prend le contrôle, recharger pour avoir le nouveau code
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload()
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
