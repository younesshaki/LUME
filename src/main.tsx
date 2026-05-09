import React from 'react'
import ReactDOM from 'react-dom/client'
import { SpeedInsights } from '@vercel/speed-insights/react'
import { Analytics } from '@vercel/analytics/react'
import App from './App'
import { SoundProvider } from './lib/sound'
import './index.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <SoundProvider>
      <App />
    </SoundProvider>
    <SpeedInsights />
    <Analytics />
  </React.StrictMode>,
)
