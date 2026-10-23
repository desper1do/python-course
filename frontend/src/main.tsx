import { createRoot } from 'react-dom/client'
import '@fontsource/inter/400.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/jetbrains-mono/500.css'
import '@fontsource/jetbrains-mono/700.css'
import '@xterm/xterm/css/xterm.css'
import './styles.css'
import App from './App'
import { SettingsProvider } from './settings'

createRoot(document.getElementById('root')!).render(<SettingsProvider><App /></SettingsProvider>)
