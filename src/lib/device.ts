const DEVICE_KEY = 'teajosan-device-id-v1'
const SESSION_KEY = 'teajosan-session-v1'

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

export function loadPersistedMember(): { cohort: string; name: string } | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { cohort?: string; name?: string }
    if (!parsed.cohort?.trim() || !parsed.name?.trim()) return null
    return { cohort: parsed.cohort.trim(), name: parsed.name.trim() }
  } catch {
    return null
  }
}

export function persistMember(member: { cohort: string; name: string }) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(member))
}

export function clearPersistedMember() {
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
