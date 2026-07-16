import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './app-shell/AuthProvider'
import { NavigationProvider } from './app-shell/NavigationProvider'
import { DualModeProvider } from './lib/DualModeContext'
import { SoundProvider } from './lib/sound'
import { getLeadAttribution } from './lib/leadAttribution'
import './index.css'

// Capture first-touch query/referrer data before BrowserRouter can replace the URL.
getLeadAttribution()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <DualModeProvider>
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
    </DualModeProvider>
  </React.StrictMode>,
)
