import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { AUTH_EVENT, clearClientAuth } from '../api/api'

const AuthContext = createContext(null)
const AUTH_STORAGE_KEY = 'auth'
const TOKEN_STORAGE_KEY = 'sv_token'
const USER_STORAGE_KEY = 'sv_user'

function readStoredAuth() {
  try {
    const auth = localStorage.getItem(AUTH_STORAGE_KEY) === 'true'
    const token = localStorage.getItem(TOKEN_STORAGE_KEY)
    if (!auth && !token) return { token: null, user: null }

    const rawUser = localStorage.getItem(USER_STORAGE_KEY)
    const user = rawUser ? JSON.parse(rawUser) : null

    return { token: token || 'authenticated', user }
  } catch {
    return { token: null, user: null }
  }
}

export function AuthProvider({ children }) {
  const [authState, setAuthState] = useState(() => readStoredAuth())
  const [sessionId, setSessionId] = useState(null)
  const [location,  setLocation]  = useState(null)
  const { token, user } = authState

  const syncAuthFromStorage = useCallback(() => {
    setAuthState(readStoredAuth())
  }, [])

  useEffect(() => {
    window.addEventListener('storage', syncAuthFromStorage)
    window.addEventListener(AUTH_EVENT, syncAuthFromStorage)
    return () => {
      window.removeEventListener('storage', syncAuthFromStorage)
      window.removeEventListener(AUTH_EVENT, syncAuthFromStorage)
    }
  }, [syncAuthFromStorage])

  const saveLogin = useCallback((tokenData) => {
    const u = { username: tokenData.username, email: tokenData.email }
    const nextToken = tokenData.access_token || 'authenticated'

    localStorage.setItem(AUTH_STORAGE_KEY, 'true')
    localStorage.setItem(TOKEN_STORAGE_KEY, nextToken)
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(u))
    setAuthState({ token: nextToken, user: u })
    setSessionId(null)
    if (tokenData.location) setLocation(tokenData.location)
    window.dispatchEvent(new Event(AUTH_EVENT))
  }, [])

  const logout = useCallback(() => {
    clearClientAuth()
    setAuthState({ token: null, user: null })
    setSessionId(null)
    setLocation(null)
  }, [])

  return (
    <AuthContext.Provider value={{
      user, token, sessionId, setSessionId,
      location, setLocation,
      saveLogin, logout,
      isAuthenticated: !!token,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
