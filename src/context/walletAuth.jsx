import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'

const WalletAuthContext = createContext(null)

function isMetaMaskProvider(provider, providerInfo) {
  if (!provider || typeof provider.request !== 'function') return false

  if (providerInfo?.rdns && providerInfo.rdns.includes('io.metamask')) {
    return true
  }

  // Strict fallback when EIP-6963 info is unavailable:
  // real MetaMask exposes _metamask API; many other wallets only spoof isMetaMask.
  return provider.isMetaMask === true && typeof provider?._metamask?.isUnlocked === 'function'
}

function getMetaMaskProviderFromInjected() {
  if (typeof window === 'undefined') return null
  const injected = window.ethereum
  if (!injected) return null

  const providers = Array.isArray(injected.providers) ? injected.providers : [injected]
  const withRequest = providers.filter((provider) => typeof provider?.request === 'function')

  const metaMaskProvider = withRequest.find((provider) => isMetaMaskProvider(provider))
  if (metaMaskProvider) return metaMaskProvider

  if (
    typeof injected?.request === 'function' &&
    injected?.isMetaMask &&
    typeof injected?._metamask?.isUnlocked === 'function'
  ) {
    return injected
  }

  return null
}

function discoverMetaMaskProviderViaEip6963(timeoutMs = 800) {
  if (typeof window === 'undefined') return Promise.resolve(null)

  return new Promise((resolve) => {
    let timer = null

    const onAnnounceProvider = (event) => {
      const detail = event?.detail
      const provider = detail?.provider
      const info = detail?.info

      if (!isMetaMaskProvider(provider, info)) return

      cleanup()
      resolve(provider)
    }

    const cleanup = () => {
      if (timer) window.clearTimeout(timer)
      window.removeEventListener('eip6963:announceProvider', onAnnounceProvider)
    }

    window.addEventListener('eip6963:announceProvider', onAnnounceProvider)
    window.dispatchEvent(new Event('eip6963:requestProvider'))

    timer = window.setTimeout(() => {
      cleanup()
      resolve(null)
    }, timeoutMs)
  })
}

function shortenAddress(address) {
  if (!address) return ''
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

async function clearWebsiteData() {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.clear()
  } catch {
    // Ignore storage clear errors.
  }

  try {
    window.sessionStorage.clear()
  } catch {
    // Ignore session clear errors.
  }

  try {
    if ('caches' in window) {
      const keys = await window.caches.keys()
      await Promise.all(keys.map((key) => window.caches.delete(key)))
    }
  } catch {
    // Ignore cache API errors.
  }

  try {
    if ('indexedDB' in window && typeof window.indexedDB.databases === 'function') {
      const databases = await window.indexedDB.databases()
      await Promise.all(
        (databases || [])
          .filter((db) => db?.name)
          .map(
            (db) =>
              new Promise((resolve) => {
                try {
                  const req = window.indexedDB.deleteDatabase(db.name)
                  req.onsuccess = () => resolve()
                  req.onerror = () => resolve()
                  req.onblocked = () => resolve()
                } catch {
                  resolve()
                }
              }),
          ),
      )
    }
  } catch {
    // Ignore indexedDB clear errors.
  }
}

export function WalletAuthProvider({ children }) {
  const [walletAddress, setWalletAddress] = useState('')
  const [isAuthReady] = useState(true)
  const [isConnecting, setIsConnecting] = useState(false)
  const [authError, setAuthError] = useState('')
  const [activeProvider, setActiveProvider] = useState(() => getMetaMaskProviderFromInjected())

  const isConnected = Boolean(walletAddress)

  const emptyAccountsTimerRef = useRef(null)

  /**
   * After refresh / HMR, React state is empty but MetaMask still has permission.
   * eth_accounts does not open a popup — restores session so ProtectedRoute does not bounce to /access.
   */
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const p = getMetaMaskProviderFromInjected() || (await discoverMetaMaskProviderViaEip6963())
      if (!p || typeof p.request !== 'function') return
      try {
        const accounts = await p.request({ method: 'eth_accounts' })
        if (cancelled) return
        const addr = Array.isArray(accounts) ? accounts[0] || '' : ''
        if (addr) {
          setWalletAddress(addr)
          setAuthError('')
          setActiveProvider((prev) => prev || p)
        }
      } catch {
        // ignore
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const provider = activeProvider || getMetaMaskProviderFromInjected()
    if (!provider || typeof provider.on !== 'function') return

    const handleAccountsChanged = (accounts) => {
      const next = Array.isArray(accounts) ? accounts[0] || '' : ''
      if (next) {
        if (emptyAccountsTimerRef.current) {
          clearTimeout(emptyAccountsTimerRef.current)
          emptyAccountsTimerRef.current = null
        }
        setWalletAddress(next)
        setAuthError('')
        return
      }

      // MetaMask sometimes emits [] briefly — re-check before clearing session
      if (emptyAccountsTimerRef.current) clearTimeout(emptyAccountsTimerRef.current)
      emptyAccountsTimerRef.current = window.setTimeout(async () => {
        emptyAccountsTimerRef.current = null
        try {
          const acct = await provider.request({ method: 'eth_accounts' })
          const recovered = Array.isArray(acct) ? acct[0] || '' : ''
          if (recovered) {
            setWalletAddress(recovered)
            setAuthError('')
            return
          }
        } catch {
          // ignore
        }
        setWalletAddress('')
        setAuthError('Wallet disconnected.')
      }, 400)
    }

    provider.on('accountsChanged', handleAccountsChanged)
    return () => {
      provider.removeListener('accountsChanged', handleAccountsChanged)
      if (emptyAccountsTimerRef.current) {
        clearTimeout(emptyAccountsTimerRef.current)
        emptyAccountsTimerRef.current = null
      }
    }
  }, [activeProvider])

  const connectWallet = async (forceAccountPicker = false) => {
    setAuthError('')
    const injectedProvider = getMetaMaskProviderFromInjected()
    const discoveredProvider = injectedProvider || (await discoverMetaMaskProviderViaEip6963())
    const provider = discoveredProvider

    if (!provider) {
      setAuthError(
        'MetaMask provider not detected. Open MetaMask extension once, then retry.',
      )
      return null
    }

    try {
      setIsConnecting(true)
      setActiveProvider(provider)
      if (forceAccountPicker) {
        await provider.request({
          method: 'wallet_requestPermissions',
          params: [{ eth_accounts: {} }],
        })
      }
      const accounts = await provider.request({ method: 'eth_requestAccounts' })
      const first = Array.isArray(accounts) ? accounts[0] || '' : ''
      if (!first) {
        setAuthError('No wallet account was returned.')
        return null
      }

      const message = `Sign in to Sapience.fun\nWallet: ${first}\nTime: ${new Date().toISOString()}`
      await provider.request({
        method: 'personal_sign',
        params: [message, first],
      })

      setWalletAddress(first)
      return first
    } catch (error) {
      if (error?.code === 4001) {
        setAuthError('Signature/connection request was rejected.')
      } else {
        setAuthError(error?.message || 'Unable to connect wallet right now.')
      }
      return null
    } finally {
      setIsConnecting(false)
    }
  }

  const switchWallet = async () => {
    setWalletAddress('')
    return connectWallet(true)
  }

  const disconnectWallet = async () => {
    await clearWebsiteData()
    setWalletAddress('')
    setActiveProvider(null)
    setAuthError('')
  }

  const value = useMemo(
    () => ({
      walletAddress,
      walletShort: shortenAddress(walletAddress),
      isConnected,
      isAuthReady,
      isConnecting,
      authError,
      connectWallet,
      switchWallet,
      disconnectWallet,
      clearAuthError: () => setAuthError(''),
    }),
    [walletAddress, isConnected, isAuthReady, isConnecting, authError],
  )

  return <WalletAuthContext.Provider value={value}>{children}</WalletAuthContext.Provider>
}

export function useWalletAuth() {
  const context = useContext(WalletAuthContext)
  if (!context) {
    throw new Error('useWalletAuth must be used within WalletAuthProvider')
  }
  return context
}
