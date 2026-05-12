import React from 'react'
import ReactDOM from 'react-dom/client'
import { SpeedInsights } from '@vercel/speed-insights/react'
import { Analytics } from '@vercel/analytics/react'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './app-shell/AuthProvider'
import { NavigationProvider } from './app-shell/NavigationProvider'
import { SoundProvider } from './lib/sound'
import './index.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <SoundProvider>
      <BrowserRouter>
        <AuthProvider>
          {/* BrowserRouter owns the URL; NavigationProvider exposes our typed app navigation API. */}
          <NavigationProvider>
            <App />
          </NavigationProvider>
        </AuthProvider>
      </BrowserRouter>
    </SoundProvider>
    <SpeedInsights />
    <Analytics />
  </React.StrictMode>,
)
