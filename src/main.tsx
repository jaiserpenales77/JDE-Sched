import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/barlow-semi-condensed/700.css'
// Roboto, built in for the Line boxes printout, the Washroom Prep List and the
// QA sheets, so they print the same on every computer (Latin letters only).
import '@fontsource/roboto/latin-400.css'
import '@fontsource/roboto/latin-400-italic.css'
import '@fontsource/roboto/latin-500.css'
import '@fontsource/roboto/latin-600.css'
import '@fontsource/roboto/latin-700.css'
import '@fontsource/roboto/latin-700-italic.css'
import '@fontsource/roboto/latin-800-italic.css'
import './index.css'
import App from './App.tsx'
import IntroSplash from './components/IntroSplash.tsx'

// The browser only downloads a font when something uses it: fetch Roboto as
// soon as the app opens, so a printout never measures or prints before it
// has arrived.
for (const face of ['400 10px Roboto', 'italic 400 10px Roboto', '500 10px Roboto', '600 10px Roboto', '700 10px Roboto', 'italic 700 10px Roboto', 'italic 800 10px Roboto']) {
  document.fonts?.load(face).catch(() => {})
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <IntroSplash />
  </StrictMode>,
)
