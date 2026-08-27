const DEVICE_KEY = 'teajosan-device-id-v1'
const SESSION_KEY = 'teajosan-session-v1'

export type PersistedSession = {
  cohort: string
  name: string
  token: string
}

export function getOrCreateDeviceId(): string {
  const existing = localStorage.getItem(DEVICE_KEY)
  if (existing) return existing
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  localStorage.setItem(DEVICE_KEY, id)
  return id
}

export function loadPersistedSession(): PersistedSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { cohort?: string; name?: string; token?: string }
    if (!parsed.cohort?.trim() || !parsed.name?.trim() || !parsed.token?.trim()) return null
    return {
      cohort: parsed.cohort.trim(),
      name: parsed.name.trim(),
      token: parsed.token.trim(),
    }
  } catch {
    return null
  }
}

export function persistSession(session: PersistedSession) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

export function clearPersistedSession() {
  localStorage.removeItem(SESSION_KEY)
}

export async function fetchClientIp(): Promise<string | null> {
  try {
    const res = await fetch('https://api.ipify.org?format=json', {
      signal: AbortSignal.timeout(4000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { ip?: string }
    return data.ip ?? null
  } catch {
    return null
  }
}
