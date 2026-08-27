/**
 * 보안 강화 검증 스크립트
 * 사용: node scripts/verify-security.mjs
 * 사전: Supabase SQL Editor에서 migrations/20260827_security_hardening.sql 실행
 *       + admin_set_member_pin('99', '테스트', 'test1234') 로 테스트 멤버 등록
 *       + migrations/20260827_signup_name_login.sql (이름+PIN login)
 *       + migrations/20260827_song_list.sql + song_owner_delete.sql
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

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)
const url = env.VITE_SUPABASE_URL
const key = env.VITE_SUPABASE_ANON_KEY
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

const testDeviceId = `verify-${Date.now()}`
let sessionToken = null
let rehearsalId = null
let songId = null
let otherToken = null

// 1. RPC login exists
const loginBad = await supabase.rpc('login', {
  p_name: '테스트',
  p_pin: 'wrong-pin',
  p_device_id: testDeviceId,
  p_client_ip: '127.0.0.1',
})
if (loginBad.error?.message?.includes('Could not find the function')) {
  fail('migration applied', 'login RPC not found — run signup_name_login.sql first')
  console.log('\nSummary:', results)
  process.exit(1)
} else if (loginBad.error && /PIN|이름/i.test(loginBad.error.message)) {
  pass('login RPC rejects wrong PIN')
} else {
  fail('login RPC rejects wrong PIN', loginBad.error?.message ?? 'unexpected success')
}

const loginOk = await supabase.rpc('login', {
  p_name: '테스트',
  p_pin: 'test1234',
  p_device_id: testDeviceId,
  p_client_ip: '127.0.0.1',
})
if (loginOk.error) {
  fail(
    'login RPC accepts test member',
    `${loginOk.error.message} (run: SELECT admin_set_member_pin('99','테스트','test1234');)`,
  )
} else {
  pass('login RPC accepts test member')
  sessionToken = loginOk.data
}

// 2. Direct writes blocked
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
  const createRes = await supabase.rpc('create_rehearsal', {
    p_session_token: sessionToken,
    p_date: '2099-01-15',
    p_start_time: '10:00',
    p_end_time: '11:00',
    p_team_name: 'security-verify',
  })
  if (createRes.error) {
    fail('create_rehearsal RPC', createRes.error.message)
  } else {
    pass('create_rehearsal RPC')
    rehearsalId = createRes.data
  }

  const delRpc = await supabase.rpc('delete_rehearsal', {
    p_session_token: sessionToken,
    p_id: '00000000-0000-0000-0000-000000000001',
  })
  if (delRpc.error && /본인|삭제/i.test(delRpc.error.message)) {
    pass('delete_rehearsal RPC rejects non-owned row')
  } else {
    fail('delete_rehearsal RPC rejects non-owned row', delRpc.error?.message ?? 'no error')
  }

  if (rehearsalId) {
    await supabase.rpc('delete_rehearsal', {
      p_session_token: sessionToken,
      p_id: rehearsalId,
    })
  }

  // Song ACL: A creates, B can update and delete
  const createSong = await supabase.rpc('create_song', {
    p_session_token: sessionToken,
    p_title: `verify-song-${Date.now()}`,
  })
  if (createSong.error) {
    fail('create_song RPC', `${createSong.error.message} (run song_list.sql)`)
  } else {
    pass('create_song RPC')
    songId = createSong.data
  }

  const otherDevice = `${testDeviceId}-b`
  const signupB = await supabase.rpc('signup', {
    p_cohort: '98',
    p_name: `검증B${Date.now().toString().slice(-6)}`,
    p_pin: 'test1234',
    p_sessions: ['vocal'],
    p_device_id: otherDevice,
    p_client_ip: '127.0.0.2',
  })
  if (signupB.error) {
    fail('signup second member for song ACL', signupB.error.message)
  } else {
    pass('signup second member for song ACL')
    otherToken = signupB.data
  }

  if (songId && otherToken) {
    const updateByB = await supabase.rpc('update_song', {
      p_session_token: otherToken,
      p_id: songId,
      p_vocal: '검증보컬',
    })
    if (updateByB.error) {
      fail('update_song allows any logged-in member', updateByB.error.message)
    } else {
      pass('update_song allows any logged-in member')
    }

    const deleteByB = await supabase.rpc('delete_song', {
      p_session_token: otherToken,
      p_id: songId,
    })
    if (deleteByB.error) {
      fail(
        'delete_song allows any logged-in member',
        `${deleteByB.error.message} — run song_delete_any_member.sql`,
      )
    } else {
      pass('delete_song allows any logged-in member')
      songId = null
    }
  }

  if (songId) {
    await supabase.rpc('delete_song', {
      p_session_token: sessionToken,
      p_id: songId,
    })
  }

  if (otherToken) {
    await supabase.rpc('logout', { p_token: otherToken })
  }
  await supabase.rpc('logout', { p_token: sessionToken })
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
