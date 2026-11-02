import { useEffect, useSyncExternalStore } from 'react'
import { AUTH_ERROR_TEXT, AuthError, checkSession, signIn, signOut, type AuthErrorCode } from '../authFlow'
import { getActiveProvider } from './wallet'

export type AuthStatus = 'checking' | 'signed_out' | 'signing' | 'signed_in' | 'signing_out' | 'unavailable'

export interface AuthState {
  status: AuthStatus
  address: string | null
  error: string | null
}

let state: AuthState = { status: 'checking', address: null, error: null }
const listeners = new Set<() => void>()
let errorTimer: ReturnType<typeof setTimeout> | undefined

function set(patch: Partial<AuthState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
  if (patch.error) {
    clearTimeout(errorTimer)
    errorTimer = setTimeout(() => set({ error: null }), 8000)
  }
}

const deps = () => ({ fetch: window.fetch.bind(window), ethereum: getActiveProvider(), location: window.location })

// Signed-in state comes only from the server (/api/auth/me), never from the wallet or browser storage.
export async function refreshSession() {
  const r = await checkSession(deps())
  if (r.status === 'signed_in') set({ status: 'signed_in', address: r.address.toLowerCase() })
  else set({ status: r.status, address: null })
}

export async function signInWithWallet(address: string | null) {
  if (state.status === 'signing') return
  set({ status: 'signing', error: null })
  try {
    const signed = await signIn(deps(), address)
    set({ status: 'signed_in', address: signed.toLowerCase(), error: null })
  } catch (e) {
    const code: AuthErrorCode = e instanceof AuthError ? e.code : 'failed'
    set({ error: AUTH_ERROR_TEXT[code] })
    await refreshSession()
  }
}

export async function signOutSession() {
  set({ status: 'signing_out', error: null })
  try {
    await signOut(deps())
  } catch {
    set({ error: 'Sign-out failed. Please try again.' })
  }
  await refreshSession()
}

let initialised = false

export function useAuth(): AuthState {
  useEffect(() => {
    if (initialised) return
    initialised = true
    void refreshSession()
  }, [])
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
}
