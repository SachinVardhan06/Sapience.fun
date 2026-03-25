import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import './index.css'

// Avoid light/dark flash: apply saved theme before first paint (ThemeProvider syncs after)
try {
  const saved = localStorage.getItem('sapience_theme')
  document.documentElement.setAttribute('data-theme', saved === 'light' ? 'light' : 'dark')
} catch {
  document.documentElement.setAttribute('data-theme', 'dark')
}
import App from './App.jsx'
import BuySapienceCoin from './pages/buy/market.jsx'
import LeaderboardPage from './pages/leaderboard/leaderboard.jsx'
import ProfilePage from './pages/profile/profile.jsx'
import { WalletAuthProvider, useWalletAuth } from './context/walletAuth.jsx'
import { ThemeProvider } from './context/themeContext.jsx'
import BetaBanner from './components/BetaBanner.jsx'

function ProtectedRoute({ children }) {
  const { isConnected, isAuthReady } = useWalletAuth()
  if (!isAuthReady) {
    return (
      <main
        className="grid place-items-center antialiased"
        style={{
          boxSizing: 'border-box',
          background: 'var(--bg-page)',
          color: 'var(--text-muted)',
          minHeight: '100dvh',
          paddingTop: 'var(--beta-banner-height, 0px)',
        }}
      >
        <p className="text-sm">Checking wallet session…</p>
      </main>
    )
  }
  if (!isConnected) {
    return <Navigate to="/access" replace />
  }
  return children
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
    <WalletAuthProvider>
      <BrowserRouter>
        <BetaBanner />
        <Routes>
          <Route path="/access" element={<App />} />
          <Route
            path="/prediction"
            element={
              <ProtectedRoute>
                <BuySapienceCoin />
              </ProtectedRoute>
            }
          />
          <Route path="/buy" element={<Navigate to="/prediction" replace />} />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <ProfilePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/leaderboard"
            element={
              <ProtectedRoute>
                <LeaderboardPage />
              </ProtectedRoute>
            }
          />
          <Route path="/" element={<Navigate to="/access" replace />} />
          <Route path="*" element={<Navigate to="/access" replace />} />
        </Routes>
      </BrowserRouter>
    </WalletAuthProvider>
    </ThemeProvider>
  </StrictMode>,
)
