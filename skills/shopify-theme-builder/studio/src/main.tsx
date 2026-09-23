import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PrototypeStudioEditor } from './prototype-studio-editor'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PrototypeStudioEditor />
  </StrictMode>,
)
