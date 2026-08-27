import {
  clearPersistedSession,
  fetchClientIp,
  getOrCreateDeviceId,
  loadPersistedSession,
  persistSession,
} from './lib/device'
import { supabase, supabaseConfigured } from './lib/supabase'
import type { ActivityLog, AppData, Member, Rehearsal, Session } from './types'

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

function mapRpcError(error: { message?: string; code?: string }, fallback: string) {
  const message = error.message ?? fallback
  if (error.code === '23P01' || /overlap|rehearsals_no_overlap/i.test(message)) {
    return new Error('같은 시간대에 이미 다른 합주가 있어 등록할 수 없습니다.')
  }
  return new Error(message)
}

function requireSessionToken(session: Session): string {
  if (!session.token) {
    throw new Error('세션이 없습니다. 다시 로그인해 주세요.')
  }
  return session.token
}

export function loadSession(): Session | null {
  return loadPersistedSession()
}

export async function clearSession() {
  const saved = loadPersistedSession()
  if (saved?.token && supabaseConfigured) {
    await supabase.rpc('logout', { p_token: saved.token })
  }
  clearPersistedSession()
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

export function subscribeAppDataChanges(onChange: () => void): () => void {
  assertConfigured()

  const channel = supabase
    .channel('teajosan-app-data')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'rehearsals' },
      () => onChange(),
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'activity_logs' },
      () => onChange(),
    )
    .subscribe()

  return () => {
    void supabase.removeChannel(channel)
  }
}

export async function loginMember(member: Member, pin: string): Promise<AppData> {
  assertConfigured()
  const deviceId = getOrCreateDeviceId()
  const clientIp = await fetchClientIp()

  const { data, error } = await supabase.rpc('login', {
    p_cohort: member.cohort,
    p_name: member.name,
    p_pin: pin,
    p_device_id: deviceId,
    p_client_ip: clientIp,
  })

  if (error) throw mapRpcError(error, '로그인에 실패했습니다.')
  if (!data) throw new Error('로그인에 실패했습니다.')

  const session: Session = { ...member, token: String(data) }
  persistSession(session)
  return fetchAppData()
}

export async function resumeSession(session: Session): Promise<AppData> {
  assertConfigured()
  const token = requireSessionToken(session)

  const { data, error } = await supabase.rpc('validate_session', { p_token: token })
  if (error) throw mapRpcError(error, '세션이 만료되었습니다. 다시 로그인해 주세요.')

  const row = Array.isArray(data) ? data[0] : data
  if (!row?.cohort || !row?.name) {
    throw new Error('세션이 만료되었습니다. 다시 로그인해 주세요.')
  }

  const nextSession: Session = {
    cohort: String(row.cohort),
    name: String(row.name),
    token,
  }
  persistSession(nextSession)

  const clientIp = await fetchClientIp()
  const { error: touchError } = await supabase.rpc('touch_device', {
    p_token: token,
    p_client_ip: clientIp,
    p_user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
  })
  if (touchError) console.warn(touchError)

  return fetchAppData()
}

export async function createRehearsal(
  session: Session,
  input: Omit<Rehearsal, 'id' | 'createdBy' | 'createdAt' | 'updatedBy' | 'updatedAt'>,
): Promise<AppData> {
  assertConfigured()
  const token = requireSessionToken(session)

  const { error } = await supabase.rpc('create_rehearsal', {
    p_session_token: token,
    p_date: input.date,
    p_start_time: input.startTime,
    p_end_time: input.endTime,
    p_team_name: input.teamName,
  })

  if (error) throw mapRpcError(error, '합주 등록에 실패했습니다.')
  return fetchAppData()
}

export async function updateRehearsal(
  session: Session,
  id: string,
  input: Omit<Rehearsal, 'id' | 'createdBy' | 'createdAt' | 'updatedBy' | 'updatedAt'>,
): Promise<AppData> {
  assertConfigured()
  const token = requireSessionToken(session)

  const { error } = await supabase.rpc('update_rehearsal', {
    p_session_token: token,
    p_id: id,
    p_date: input.date,
    p_start_time: input.startTime,
    p_end_time: input.endTime,
    p_team_name: input.teamName,
  })

  if (error) throw mapRpcError(error, '합주 수정에 실패했습니다.')
  return fetchAppData()
}

export async function deleteRehearsal(session: Session, id: string): Promise<AppData> {
  assertConfigured()
  const token = requireSessionToken(session)

  const { error } = await supabase.rpc('delete_rehearsal', {
    p_session_token: token,
    p_id: id,
  })

  if (error) throw mapRpcError(error, '합주 삭제에 실패했습니다.')
  return fetchAppData()
}
