/** Beta signup code (6 characters, case-insensitive). */
export const BETA_ACCESS_CODE = 'SAP123'

const WALLETS_KEY = 'sapience_beta_access_wallets'
const LEGACY_GLOBAL_KEY = 'sapience_beta_access_v1'

export function normalizeAccessInput(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

export function verifyAccessCode(rawInput) {
  const entered = normalizeAccessInput(rawInput)
  return entered.length === 6 && entered === BETA_ACCESS_CODE
}

function readWalletSet() {
  try {
    const raw = window.localStorage.getItem(WALLETS_KEY)
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? new Set(list.map((a) => String(a).toLowerCase())) : new Set()
  } catch {
    return new Set()
  }
}

function writeWalletSet(set) {
  try {
    window.localStorage.setItem(WALLETS_KEY, JSON.stringify([...set]))
  } catch {
    /* ignore */
  }
}

/** One-time: old global "access ok" flag grants the current wallet, then clears legacy key. */
export function migrateLegacyAccessForWallet(address) {
  if (!address) return
  const key = address.toLowerCase()
  try {
    if (window.localStorage.getItem(LEGACY_GLOBAL_KEY) === '1') {
      const set = readWalletSet()
      set.add(key)
      writeWalletSet(set)
      window.localStorage.removeItem(LEGACY_GLOBAL_KEY)
    }
  } catch {
    /* ignore */
  }
}

export function hasWalletAccess(address) {
  if (!address) return false
  migrateLegacyAccessForWallet(address)
  return readWalletSet().has(address.toLowerCase())
}

export function grantWalletAccess(address) {
  if (!address) return
  const set = readWalletSet()
  set.add(address.toLowerCase())
  writeWalletSet(set)
}
