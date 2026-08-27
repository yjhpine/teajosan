import {
  clearPersistedMember,
  fetchClientIp,
  getOrCreateDeviceId,
  loadPersistedMember,
  persistMember,
} from './lib/device'
import { findOverlappingRehearsal } from './lib/rehearsalOverlap'
import { supabase, supabaseConfigured } from './lib/supabase'
import type { ActivityLog, AppData, Member, Rehearsal } from './types'
import { isSameMember, memberLabel } from './types'

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


async function assertNoTimeOverlap(
  input: { date: string; startTime: string; endTime: string },
  excludeId?: string,
) {
  if (input.startTime >= input.endTime) {
    throw new Error('종료 시간은 시작 시간보다 뒤여야 합니다.')
  }

  const { data, error } = await supabase
    .from('rehearsals')
    .select(REHEARSAL_SELECT)
    .eq('date', input.date)

  if (error) throw error

  const conflict = findOverlappingRehearsal(
    ((data ?? []) as RehearsalRow[]).map(mapRehearsal),
    input,
    excludeId,
  )
  if (conflict) {
    throw new Error(
      `이미 ${conflict.teamName || '합주'} (${conflict.startTime.slice(0, 5)}–${conflict.endTime.slice(0, 5)})가 있어 등록할 수 없습니다.`,
    )
  }
}

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
      .in('action', ['create', 'delete'])
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

function mapWriteError(error: { code?: string; message?: string }, fallback: string) {
  if (error.code === '23P01' || /rehearsals_no_overlap|overlap/i.test(error.message ?? '')) {
    return new Error('같은 시간대에 이미 다른 합주가 있어 등록할 수 없습니다.')
  }
  return new Error(error.message || fallback)
}

export async function createRehearsal(
  actor: Member,
  input: Omit<Rehearsal, 'id' | 'createdBy' | 'createdAt' | 'updatedBy' | 'updatedAt'>,
): Promise<AppData> {
  assertConfigured()
  const ip = await fetchClientIp()
  await assertNoTimeOverlap(input)

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

  if (error) throw mapWriteError(error, '합주 등록에 실패했습니다.')

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
  await assertNoTimeOverlap(input, id)

  const { data, error } = await supabase
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
    .eq('created_by_cohort', actor.cohort)
    .eq('created_by_name', actor.name)
    .select('id')

  if (error) throw mapWriteError(error, '합주 수정에 실패했습니다.')
  if (!data?.length) {
    throw new Error('본인이 등록한 합주만 수정할 수 있습니다.')
  }

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

  const { data: existing, error: existingError } = await supabase
    .from('rehearsals')
    .select('date,created_by_cohort,created_by_name,team_name')
    .eq('id', id)
    .maybeSingle()
  if (existingError) throw existingError
  if (!existing) throw new Error('합주를 찾을 수 없습니다.')

  const owner = {
    cohort: String((existing as { created_by_cohort: string }).created_by_cohort ?? ''),
    name: String((existing as { created_by_name: string }).created_by_name ?? ''),
  }
  if (!isSameMember(actor, owner)) {
    throw new Error('본인이 등록한 합주만 삭제할 수 있습니다.')
  }

  const { data: deleted, error } = await supabase
    .from('rehearsals')
    .delete()
    .eq('id', id)
    .eq('created_by_cohort', actor.cohort)
    .eq('created_by_name', actor.name)
    .select('id')

  if (error) throw error
  if (!deleted?.length) {
    throw new Error('본인이 등록한 합주만 삭제할 수 있습니다.')
  }

  const row = existing as { date?: string; team_name?: string }
  await insertLog({
    actor,
    action: 'delete',
    summary: `${memberLabel(actor)} · ${row.date ?? '일정'} ${row.team_name || '합주'} 삭제`,
    ip,
  })
  await upsertDevice(actor, ip)
  return fetchAppData()
}
