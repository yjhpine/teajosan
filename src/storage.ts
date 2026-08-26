import {
  clearPersistedMember,
  fetchClientIp,
  getOrCreateDeviceId,
  loadPersistedMember,
  persistMember,
} from './lib/device'
import { supabase, supabaseConfigured } from './lib/supabase'
import type { ActivityLog, AppData, Member, Rehearsal } from './types'
import { memberLabel } from './types'

type RehearsalRow = {
  id: string
  date: string
  start_time: string
  end_time: string
  team_name: string | null
  created_by_cohort: string
  created_by_name: string
  created_at: string
  updated_by_cohort: string | null
  updated_by_name: string | null
  updated_at: string | null
}

type LogRow = {
  id: string
  at: string
  actor_cohort: string
  actor_name: string
  action: ActivityLog['action']
  summary: string
  rehearsal_id: string | null
  ip: string | null
  device_id: string | null
}

function assertConfigured() {
  if (!supabaseConfigured) {
    throw new Error(
      'Supabase가 아직 연결되지 않았습니다. 환경변수 VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY 를 확인하세요.',
    )
  }
}

function mapRehearsal(row: RehearsalRow): Rehearsal {
  return {
    id: row.id,
    date: row.date,
    startTime: row.start_time,
    endTime: row.end_time,
    teamName: row.team_name ?? '',
    createdBy: {
      cohort: row.created_by_cohort,
      name: row.created_by_name,
    },
    createdAt: row.created_at,
    updatedBy:
      row.updated_by_cohort && row.updated_by_name
        ? { cohort: row.updated_by_cohort, name: row.updated_by_name }
        : undefined,
    updatedAt: row.updated_at ?? undefined,
  }
}

function mapLog(row: LogRow): ActivityLog {
  return {
    id: row.id,
    at: row.at,
    actor: { cohort: row.actor_cohort, name: row.actor_name },
    action: row.action,
    summary: row.summary,
    rehearsalId: row.rehearsal_id ?? undefined,
    ip: row.ip ?? undefined,
  }
}

async function insertLog(input: {
  actor: Member
  action: ActivityLog['action']
  summary: string
  rehearsalId?: string
  ip?: string | null
}) {
  const deviceId = getOrCreateDeviceId()
  const { error } = await supabase.from('activity_logs').insert({
    actor_cohort: input.actor.cohort,
    actor_name: input.actor.name,
    action: input.action,
    summary: input.summary,
    rehearsal_id: input.rehearsalId ?? null,
    ip: input.ip ?? null,
    device_id: deviceId,
  })
  if (error) throw error
}

async function upsertDevice(member: Member, ip: string | null) {
  const deviceId = getOrCreateDeviceId()
  const { error } = await supabase.from('devices').upsert(
    {
      device_id: deviceId,
      cohort: member.cohort,
      name: member.name,
      last_ip: ip,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'device_id' },
  )
  if (error) throw error
}

export function loadSession(): Member | null {
  return loadPersistedMember()
}

export function clearSession() {
  clearPersistedMember()
}

const REHEARSAL_SELECT =
  'id,date,start_time,end_time,team_name,created_by_cohort,created_by_name,created_at,updated_by_cohort,updated_by_name,updated_at'

export async function fetchAppData(): Promise<AppData> {
  assertConfigured()

  const [rehearsalRes, logRes] = await Promise.all([
    supabase
      .from('rehearsals')
      .select(REHEARSAL_SELECT)
      .order('date', { ascending: true }),
    supabase
      .from('activity_logs')
      .select('*')
      .order('at', { ascending: false })
      .limit(100),
  ])

  if (rehearsalRes.error) throw rehearsalRes.error
  if (logRes.error) throw logRes.error

  return {
    rehearsals: ((rehearsalRes.data ?? []) as RehearsalRow[]).map(mapRehearsal),
    logs: ((logRes.data ?? []) as LogRow[]).map(mapLog),
  }
}

export async function loginMember(member: Member): Promise<AppData> {
  assertConfigured()
  persistMember(member)
  const ip = await fetchClientIp()
  await upsertDevice(member, ip)

  const ipNote = ip ? ` · IP ${ip}` : ''
  await insertLog({
    actor: member,
    action: 'login',
    summary: `${memberLabel(member)} 로그인${ipNote}`,
    ip,
  })

  return fetchAppData()
}

/** 저장된 기기로 자동 입장 — 기기/IP만 갱신하고 로그인 로그는 남기지 않음 */
export async function resumeSession(member: Member): Promise<AppData> {
  assertConfigured()
  persistMember(member)
  const ip = await fetchClientIp()
  await upsertDevice(member, ip)
  return fetchAppData()
}

export async function createRehearsal(
  actor: Member,
  input: Omit<Rehearsal, 'id' | 'createdBy' | 'createdAt' | 'updatedBy' | 'updatedAt'>,
): Promise<AppData> {
  assertConfigured()
  const ip = await fetchClientIp()

  const { data, error } = await supabase
    .from('rehearsals')
    .insert({
      date: input.date,
      start_time: input.startTime,
      end_time: input.endTime,
      team_name: input.teamName,
      created_by_cohort: actor.cohort,
      created_by_name: actor.name,
    })
    .select(REHEARSAL_SELECT)
    .single()

  if (error) throw error

  const row = data as RehearsalRow
  await insertLog({
    actor,
    action: 'create',
    summary: `${memberLabel(actor)} · ${row.date} ${input.teamName || '합주'} 등록`,
    rehearsalId: row.id,
    ip,
  })
  await upsertDevice(actor, ip)
  return fetchAppData()
}

export async function updateRehearsal(
  actor: Member,
  id: string,
  input: Omit<Rehearsal, 'id' | 'createdBy' | 'createdAt' | 'updatedBy' | 'updatedAt'>,
): Promise<AppData> {
  assertConfigured()
  const ip = await fetchClientIp()

  const { error } = await supabase
    .from('rehearsals')
    .update({
      date: input.date,
      start_time: input.startTime,
      end_time: input.endTime,
      team_name: input.teamName,
      updated_by_cohort: actor.cohort,
      updated_by_name: actor.name,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) throw error

  await insertLog({
    actor,
    action: 'update',
    summary: `${memberLabel(actor)} · ${input.date} ${input.teamName || '합주'} 수정`,
    rehearsalId: id,
    ip,
  })
  await upsertDevice(actor, ip)
  return fetchAppData()
}

export async function deleteRehearsal(actor: Member, id: string): Promise<AppData> {
  assertConfigured()
  const ip = await fetchClientIp()

  const { data: existing } = await supabase
    .from('rehearsals')
    .select('date')
    .eq('id', id)
    .maybeSingle()

  const { error } = await supabase.from('rehearsals').delete().eq('id', id)
  if (error) throw error

  await insertLog({
    actor,
    action: 'delete',
    summary: `${memberLabel(actor)} · ${(existing as { date?: string } | null)?.date ?? '일정'} 합주 삭제`,
    ip,
  })
  await upsertDevice(actor, ip)
  return fetchAppData()
}
