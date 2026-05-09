const clean = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length ? trimmed : null
}

const configuredApiUrl = import.meta.env.DEV
  ? clean(import.meta.env.VITE_COKE_ZERO_API_URL)
  : clean(import.meta.env.VITE_COKE_ZERO_PUBLIC_API_URL)

const configuredWsUrl = import.meta.env.DEV
  ? clean(import.meta.env.VITE_COKE_ZERO_WS_URL)
  : clean(import.meta.env.VITE_COKE_ZERO_PUBLIC_WS_URL)

export const COKE_ZERO_API_URL =
  configuredApiUrl ?? (import.meta.env.DEV ? 'http://localhost:8000' : null)

export const COKE_ZERO_WS_URL =
  configuredWsUrl ??
  (COKE_ZERO_API_URL
    ? `${COKE_ZERO_API_URL.replace(/^http/, 'ws').replace(/\/$/, '')}/ws`
    : null)

export const STATIC_DEMO_ENABLED =
  clean(import.meta.env.VITE_COKE_ZERO_STATIC_DEMO) !== '0'
