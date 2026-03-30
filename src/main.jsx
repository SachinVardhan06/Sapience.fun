import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import './index.css'

// Avoid light/dark flash: apply saved theme before first paint (ThemeProvider syncs after)
try {
  const saved = localStorage.getItem('sapience_theme')
  document.documentElement.setAttribute('data-theme', saved === 'light' ? 'light' : 'dark')
} catch {
  document.documentElement.setAttribute('data-theme', 'dark')
}
import App from './App.jsx'
import HomePage from './pages/home/HomePage.jsx'
import BuySapienceCoin from './pages/buy/market.jsx'
import Btc5MinMarket from './pages/buy/5minmarket.jsx'
import LeaderboardPage from './pages/leaderboard/leaderboard.jsx'
import ProfilePage from './pages/profile/profile.jsx'
import PrivateArena from './pages/private/PrivateArena.jsx'
import AdminPanel from './pages/admin/AdminPanel.jsx'
import { WalletAuthProvider, useWalletAuth } from './context/walletAuth.jsx'
import { ThemeProvider } from './context/themeContext.jsx'
import BetaBanner from './components/BetaBanner.jsx'
import BetSprinkleLayer from './components/BetSprinkleLayer.jsx'

function ProtectedRoute({ children }) {
  const { isConnected, isAuthReady } = useWalletAuth()
  const location = useLocation()
  if (!isAuthReady) {
    return (
      <main
        id="main-content"
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
    return <Navigate to="/access" replace state={{ from: location }} />
  }
  return children
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
    <WalletAuthProvider>
      <BrowserRouter>
        <BetaBanner />
        <BetSprinkleLayer />
        <a href="#main-content" className="skip-to-main">
          Skip to main content
        </a>
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
          <Route
            path="/btc-5m"
            element={
              <ProtectedRoute>
                <Btc5MinMarket />
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
          <Route
            path="/private-arena"
            element={
              <ProtectedRoute>
                <PrivateArena />
              </ProtectedRoute>
            }
          />
          <Route path="/" element={<HomePage />} />
          <Route path="/admin" element={<AdminPanel />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </WalletAuthProvider>
    </ThemeProvider>
  </StrictMode>,
)
