import { supabaseConfigured } from './supabase'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

type GatewaySuccess<T> = { data: T; error?: undefined }
type GatewayFailure = { data?: undefined; error: { message: string; code?: string | null } }

/**
 * 인증·쓰기 RPC는 Edge gateway 경유.
 * anon 직접 호출은 DB에서 revoke 됨.
 */
export async function gatewayRpc<T = unknown>(
  action: string,
  args: Record<string, unknown> = {},
): Promise<GatewaySuccess<T> | GatewayFailure> {
  if (!supabaseConfigured || !url || !anonKey) {
    return { error: { message: 'Supabase가 아직 연결되지 않았습니다.' } }
  }

  try {
    const res = await fetch(`${url}/functions/v1/gateway`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify({ action, args }),
    })

    const payload = (await res.json().catch(() => null)) as
      | { data?: T; error?: string; code?: string | null }
      | null

    if (!res.ok) {
      return {
        error: {
          message: payload?.error || `Gateway error (${res.status})`,
          code: payload?.code ?? null,
        },
      }
    }

    return { data: payload?.data as T }
  } catch (err) {
    return {
      error: {
        message: err instanceof Error ? err.message : 'Gateway request failed',
      },
    }
  }
}
