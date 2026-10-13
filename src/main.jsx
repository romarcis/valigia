import { createRoot } from 'react-dom/client'
import '@fontsource-variable/hanken-grotesk'
import '@fontsource/big-shoulders-display/600'
import '@fontsource/big-shoulders-display/800'
import 'maplibre-gl/dist/maplibre-gl.css'
import './styles.css'
import App from './App.jsx'
import { openExternal } from './net.js'

// External links open in the system browser, never inside the app webview.
document.addEventListener('click', e => {
  const a = e.target.closest?.('a[target=_blank]')
  if (a) { e.preventDefault(); openExternal(a.href) }
})

createRoot(document.getElementById('root')).render(<App />)
