import { createRoot } from 'react-dom/client'
// Полные CSS @fontsource включают подмножества latin + cyrillic (через unicode-range)
import '@fontsource/onest/400.css'
import '@fontsource/onest/500.css'
import '@fontsource/onest/600.css'
import '@fontsource/onest/700.css'
import '@fontsource/jetbrains-mono/500.css'
import '@fontsource/jetbrains-mono/700.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@fontsource/ibm-plex-mono/700.css'
import '@fontsource/fira-mono/500.css'
import '@fontsource/fira-mono/700.css'
import '@xterm/xterm/css/xterm.css'
import './styles.css'
import App from './App'
import { SettingsProvider } from './settings'

createRoot(document.getElementById('root')!).render(<SettingsProvider><App /></SettingsProvider>)
