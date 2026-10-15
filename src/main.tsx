import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import '@fontsource/sora/600.css'
import '@fontsource/sora/700.css'
import '@fontsource/figtree/400.css'
import '@fontsource/figtree/600.css'
import './ui/styles.css'
import { App } from './ui/App'

registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
