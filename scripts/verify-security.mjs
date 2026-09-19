/**
 * 보안 강화 검증 스크립트
 * 사용: node scripts/verify-security.mjs
 *
 * 사전:
 * 1) Edge Function 배포: supabase functions deploy gateway
 * 2) RPC 잠금 SQL: supabase/ops/apply_gateway_rpc_lockdown.sql
 * 3) 테스트 멤버: SELECT admin_set_member_pin('99','테스트','test1234');
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const i = line.indexOf('=')
      return [line.slice(0, i), line.slice(i + 1)]
    }),
)

const url = env.VITE_SUPABASE_URL
const key = env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(url, key)
const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
}

const results = []

function pass(name) {
  results.push({ name, ok: true })
  console.log(`✓ ${name}`)
}

function fail(name, detail) {
  results.push({ name, ok: false, detail })
  console.error(`✗ ${name}: ${detail}`)
}

async function rest(method, path, body) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = text
  }
  return { status: res.status, json }
}

async function gateway(action, args = {}) {
  const res = await fetch(`${url}/functions/v1/gateway`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action, args }),
  })
  const payload = await res.json().catch(() => ({}))
  return {
    status: res.status,
    data: payload?.data,
    error: res.ok ? null : { message: payload?.error || `HTTP ${res.status}` },
  }
}

const testDeviceId = `verify-${Date.now()}`
let sessionToken = null
let rehearsalId = null
let songId = null
let otherToken = null

// 1. anon direct login must be blocked (after lockdown)
const loginDirect = await supabase.rpc('login', {
  p_name: '테스트',
  p_pin: 'test1234',
  p_device_id: testDeviceId,
  p_client_ip: '127.0.0.1',
})
if (
  loginDirect.error &&
  /permission denied|not granted|42501|PGRST202|Could not find the function/i.test(
    loginDirect.error.message,
  )
) {
  pass('anon cannot call login RPC directly')
} else if (!loginDirect.error) {
  fail('anon cannot call login RPC directly', 'login RPC still callable by anon — run apply_gateway_rpc_lockdown.sql')
} else {
  fail('anon cannot call login RPC directly', loginDirect.error.message)
}

// 2. Gateway login rejects wrong PIN
const loginBad = await gateway('login', {
  p_name: '테스트',
  p_pin: 'wrong-pin',
  p_device_id: testDeviceId,
  p_client_ip: '127.0.0.1',
})
if (loginBad.error && /PIN|이름/i.test(loginBad.error.message)) {
  pass('gateway login rejects wrong PIN')
} else {
  fail('gateway login rejects wrong PIN', loginBad.error?.message ?? 'unexpected success')
}

const loginOk = await gateway('login', {
  p_name: '테스트',
  p_pin: 'test1234',
  p_device_id: testDeviceId,
  p_client_ip: '127.0.0.1',
})
if (loginOk.error) {
  fail(
    'gateway login accepts test member',
    `${loginOk.error.message} (deploy gateway + admin_set_member_pin('99','테스트','test1234'))`,
  )
} else {
  pass('gateway login accepts test member')
  sessionToken = loginOk.data
}

// 3. Direct writes blocked
const delDirect = await rest('DELETE', 'rehearsals?id=eq.00000000-0000-0000-0000-000000000001')
if (delDirect.status === 401 || delDirect.status === 403 || delDirect.json?.length === 0) {
  pass('direct DELETE rehearsals blocked')
} else {
  fail('direct DELETE rehearsals blocked', `status ${delDirect.status}`)
}

const logInsert = await rest('POST', 'activity_logs', {
  actor_cohort: '99',
  actor_name: '해커',
  action: 'create',
  summary: 'forged',
})
if (logInsert.status === 401 || logInsert.status === 403) {
  pass('direct INSERT activity_logs blocked')
} else {
  fail('direct INSERT activity_logs blocked', `status ${logInsert.status}`)
}

const devicesRead = await rest('GET', 'devices?select=device_id&limit=1')
if (devicesRead.status === 401 || devicesRead.status === 403 || devicesRead.json?.length === 0) {
  pass('devices table not readable by anon')
} else {
  fail('devices table not readable by anon', `got ${devicesRead.status}`)
}

if (sessionToken) {
  const createRes = await gateway('create_rehearsal', {
    p_session_token: sessionToken,
    p_date: '2099-01-15',
    p_start_time: '10:00',
    p_end_time: '11:00',
    p_team_name: 'security-verify',
  })
  if (createRes.error) {
    fail('gateway create_rehearsal', createRes.error.message)
  } else {
    pass('gateway create_rehearsal')
    rehearsalId = createRes.data
  }

  // anon direct create_rehearsal must fail
  const createDirect = await supabase.rpc('create_rehearsal', {
    p_session_token: sessionToken,
    p_date: '2099-01-16',
    p_start_time: '10:00',
    p_end_time: '11:00',
    p_team_name: 'should-fail',
  })
  if (createDirect.error) {
    pass('anon cannot call create_rehearsal directly')
  } else {
    fail('anon cannot call create_rehearsal directly', 'RPC still open to anon')
  }
}

if (sessionToken && rehearsalId) {
  const delRes = await gateway('delete_rehearsal', {
    p_session_token: sessionToken,
    p_id: rehearsalId,
  })
  if (delRes.error) fail('gateway delete_rehearsal', delRes.error.message)
  else pass('gateway delete_rehearsal')
}

if (sessionToken) {
  const songRes = await gateway('create_song', {
    p_session_token: sessionToken,
    p_title: 'security-verify-song',
    p_vocal: '',
    p_guitar1: '',
    p_guitar2: '',
    p_bass: '',
    p_drums: '',
    p_keyboard: '',
    p_youtube_url: '',
  })
  if (songRes.error) fail('gateway create_song', songRes.error.message)
  else {
    pass('gateway create_song')
    songId = songRes.data
  }
}

if (sessionToken && songId) {
  const delSong = await gateway('delete_song', {
    p_session_token: sessionToken,
    p_id: songId,
  })
  if (delSong.error) fail('gateway delete_song', delSong.error.message)
  else pass('gateway delete_song')
}

const profileList = await supabase.rpc('list_member_profiles')
if (profileList.error) fail('list_member_profiles still public-read', profileList.error.message)
else pass('list_member_profiles still public-read')

console.log('\nSummary:', {
  passed: results.filter((r) => r.ok).length,
  failed: results.filter((r) => !r.ok).length,
})
process.exit(results.some((r) => !r.ok) ? 1 : 0)
