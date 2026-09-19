// 태조산 API 게이트웨이
// 브라우저 → Edge Function → (service_role) SECURITY DEFINER RPC
// 로그인·세션·쓰기만 경유. 공개 SELECT/Realtime은 프론트 직행.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const ALLOWED_ACTIONS = new Set([
  'login',
  'signup',
  'validate_session',
  'logout',
  'touch_device',
  'get_my_profile',
  'set_my_sessions',
  'change_my_pin',
  'create_rehearsal',
  'update_rehearsal',
  'delete_rehearsal',
  'create_song',
  'update_song',
  'delete_song',
  'reorder_songs',
  'add_roster_member',
  'create_song_request',
  'claim_song_request_slot',
  'promote_song_request',
  'delete_song_request',
  'create_performance',
  'update_performance',
  'delete_performance',
])

const AUTH_ACTIONS = new Set(['login', 'signup'])
const IP_OVERRIDE_ACTIONS = new Set(['login', 'signup', 'touch_device'])

const ALLOWED_ORIGINS = new Set([
  'https://yjhpine.github.io',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
])

type RateBucket = { count: number; resetAt: number }
const rateBuckets = new Map<string, RateBucket>()

function corsHeaders(origin: string | null): HeadersInit {
  const allowOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : 'https://yjhpine.github.io'
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}

function json(status: number, body: unknown, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(origin),
      'Content-Type': 'application/json',
    },
  })
}

function clientIp(req: Request): string {
  const cf = req.headers.get('cf-connecting-ip')
  if (cf?.trim()) return cf.trim()
  const real = req.headers.get('x-real-ip')
  if (real?.trim()) return real.trim()
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }
  return '0.0.0.0'
}

function assertRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now()
  const bucket = rateBuckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs })
    return
  }
  bucket.count += 1
  if (bucket.count > limit) {
    throw new Error('요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.')
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(origin) })
  }

  if (req.method !== 'POST') {
    return json(405, { error: 'Method not allowed' }, origin)
  }

  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return json(403, { error: 'Origin not allowed' }, origin)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return json(500, { error: 'Gateway misconfigured' }, origin)
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return json(400, { error: 'Invalid JSON' }, origin)
  }

  if (!isPlainObject(body)) {
    return json(400, { error: 'Invalid body' }, origin)
  }

  const action = String(body.action ?? '').trim()
  const args = isPlainObject(body.args) ? { ...body.args } : {}

  if (!ALLOWED_ACTIONS.has(action)) {
    return json(400, { error: 'Unknown action' }, origin)
  }

  const ip = clientIp(req)
  try {
    if (AUTH_ACTIONS.has(action)) {
      assertRateLimit(`auth:${ip}`, 20, 60_000)
    } else {
      assertRateLimit(`write:${ip}`, 120, 60_000)
    }
  } catch (err) {
    return json(429, { error: err instanceof Error ? err.message : 'Too many requests' }, origin)
  }

  if (IP_OVERRIDE_ACTIONS.has(action)) {
    args.p_client_ip = ip
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data, error } = await admin.rpc(action, args)
  if (error) {
    return json(400, { error: error.message || 'RPC failed', code: error.code ?? null }, origin)
  }

  return json(200, { data }, origin)
})
