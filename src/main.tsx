import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/barlow-semi-condensed/700.css'
import './index.css'
import App from './App.tsx'
import IntroSplash from './components/IntroSplash.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <IntroSplash />
  </StrictMode>,
)
