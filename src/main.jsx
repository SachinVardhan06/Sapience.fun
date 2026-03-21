import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/access" element={<App />} />
        <Route path="/" element={<Navigate to="/access" replace />} />
        <Route path="*" element={<Navigate to="/access" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
