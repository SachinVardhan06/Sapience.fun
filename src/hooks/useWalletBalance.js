import { useCallback, useEffect, useState } from 'react'
import { fetchWallet } from '../utils/graphqlClient'
import {
  BONUS_POINTS,
  POINTS_CHANGED_EVENT,
  ensureWalletBonus,
  getWalletAccount,
  mergeWalletRecords,
} from '../utils/pointsLedger'

export function useWalletBalance(walletAddress) {
  const [balance, setBalance] = useState(BONUS_POINTS)

  const refresh = useCallback(() => {
    if (!walletAddress) {
      setBalance(BONUS_POINTS)
      return
    }
    const local = ensureWalletBonus(walletAddress) || getWalletAccount(walletAddress)
    setBalance(Number(local?.balance) || BONUS_POINTS)
    fetchWallet(walletAddress)
      .then((w) => {
        if (!w) return
        const m = mergeWalletRecords(w, local)
        if (m) setBalance(Number(m.balance) || BONUS_POINTS)
      })
      .catch(() => {})
  }, [walletAddress])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    const on = () => refresh()
    window.addEventListener(POINTS_CHANGED_EVENT, on)
    return () => window.removeEventListener(POINTS_CHANGED_EVENT, on)
  }, [refresh])

  return balance
}
