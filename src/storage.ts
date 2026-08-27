import {
  clearPersistedSession,
  fetchClientIp,
  getOrCreateDeviceId,
  loadPersistedSession,
  persistSession,
} from './lib/device'
import { supabase, supabaseConfigured } from './lib/supabase'
import type {
  ActivityLog,
  AppData,
  InstrumentSession,
  Member,
  MemberProfile,
  Performance,
  Rehearsal,
  Session,
  Song,
  SongDraft,
  SongRequest,
  SongRequestSlot,
} from './types'

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
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'songs' },
      () => onChange(),
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'members' },
      () => onChange(),
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'song_requests' },
      () => onChange(),
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'performances' },
      () => onChange(),
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'performance_songs' },
      () => onChange(),
    )
    .subscribe()

  return () => {
    void supabase.removeChannel(channel)
  }
}

export async function loginMember(name: string, pin: string): Promise<AppData> {
  assertConfigured()
  const deviceId = getOrCreateDeviceId()
  const clientIp = await fetchClientIp()
  const nextName = name.trim()

  const { data, error } = await supabase.rpc('login', {
    p_name: nextName,
    p_pin: pin,
    p_device_id: deviceId,
    p_client_ip: clientIp,
  })

  if (error) throw mapRpcError(error, '로그인에 실패했습니다.')
  if (!data) throw new Error('로그인에 실패했습니다.')

  const token = String(data)
  const profile = await getMyProfile({ cohort: '', name: nextName, token })
  const session: Session = {
    cohort: profile.cohort,
    name: profile.name,
    token,
    sessions: profile.sessions,
  }
  persistSession(session)
  return fetchAppData()
}

export async function signupMember(
  member: Member,
  pin: string,
  sessions: InstrumentSession[],
): Promise<AppData> {
  assertConfigured()
  const deviceId = getOrCreateDeviceId()
  const clientIp = await fetchClientIp()

  const { data, error } = await supabase.rpc('signup', {
    p_cohort: member.cohort,
    p_name: member.name,
    p_pin: pin,
    p_sessions: sessions,
    p_device_id: deviceId,
    p_client_ip: clientIp,
  })

  if (error) throw mapRpcError(error, '가입에 실패했습니다.')
  if (!data) throw new Error('가입에 실패했습니다.')

  const token = String(data)
  const session: Session = {
    cohort: member.cohort,
    name: member.name.trim(),
    token,
    sessions,
  }
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

type SongRow = {
  id: string
  title: string
  vocal: string
  guitar1: string
  guitar2: string
  bass: string
  drums: string
  keyboard: string
  youtube_url?: string | null
  sort_order: number
  created_by_cohort: string
  created_by_name: string
  created_at: string
  updated_at: string | null
}

function mapSong(row: SongRow): Song {
  return {
    id: row.id,
    title: row.title ?? '',
    vocal: row.vocal ?? '',
    guitar1: row.guitar1 ?? '',
    guitar2: row.guitar2 ?? '',
    bass: row.bass ?? '',
    drums: row.drums ?? '',
    keyboard: row.keyboard ?? '',
    youtubeUrl: row.youtube_url ?? '',
    sortOrder: row.sort_order,
    createdBy: { cohort: row.created_by_cohort, name: row.created_by_name },
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? undefined,
  }
}

export async function fetchSongs(): Promise<Song[]> {
  assertConfigured()
  const { data, error } = await supabase
    .from('songs')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw error
  return ((data ?? []) as SongRow[]).map(mapSong)
}

export async function fetchRoster(): Promise<string[]> {
  assertConfigured()
  const { data, error } = await supabase
    .from('band_roster')
    .select('name')
    .order('name', { ascending: true })
  if (error) throw error
  return (data ?? []).map((row) => String((row as { name: string }).name))
}

const SESSION_IDS = new Set<InstrumentSession>([
  'vocal',
  'guitar',
  'bass',
  'drums',
  'keyboard',
])

function mapSessions(raw: unknown): InstrumentSession[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((value) => String(value))
    .filter((value): value is InstrumentSession => SESSION_IDS.has(value as InstrumentSession))
}

export async function getMyProfile(session: Session): Promise<MemberProfile> {
  assertConfigured()
  const token = requireSessionToken(session)
  const { data, error } = await supabase.rpc('get_my_profile', { p_token: token })
  if (error) throw mapRpcError(error, '프로필을 불러오지 못했습니다.')
  const row = Array.isArray(data) ? data[0] : data
  if (!row?.cohort || !row?.name) {
    throw new Error('프로필을 불러오지 못했습니다.')
  }
  return {
    cohort: String(row.cohort),
    name: String(row.name),
    sessions: mapSessions(row.sessions),
  }
}

export async function setMySessions(
  session: Session,
  sessions: InstrumentSession[],
): Promise<MemberProfile> {
  assertConfigured()
  const token = requireSessionToken(session)
  const { data, error } = await supabase.rpc('set_my_sessions', {
    p_token: token,
    p_sessions: sessions,
  })
  if (error) throw mapRpcError(error, '세션 저장에 실패했습니다.')
  const row = Array.isArray(data) ? data[0] : data
  if (!row?.cohort || !row?.name) {
    throw new Error('세션 저장에 실패했습니다.')
  }
  return {
    cohort: String(row.cohort),
    name: String(row.name),
    sessions: mapSessions(row.sessions),
  }
}

export async function changeMyPin(
  session: Session,
  oldPin: string,
  newPin: string,
): Promise<void> {
  assertConfigured()
  const token = requireSessionToken(session)
  const { error } = await supabase.rpc('change_my_pin', {
    p_token: token,
    p_old_pin: oldPin,
    p_new_pin: newPin,
  })
  if (error) throw mapRpcError(error, 'PIN 변경에 실패했습니다.')
}

export async function fetchMemberProfiles(): Promise<MemberProfile[]> {
  assertConfigured()
  const { data, error } = await supabase.rpc('list_member_profiles')
  if (error) throw mapRpcError(error, '멤버 목록을 불러오지 못했습니다.')
  const rows = Array.isArray(data) ? data : data ? [data] : []
  return rows
    .filter((row) => row?.name)
    .map((row) => ({
      cohort: '',
      name: String(row.name),
      sessions: mapSessions(row.sessions),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
}

export async function createSong(session: Session, draft: Partial<SongDraft> = {}): Promise<Song[]> {
  assertConfigured()
  const token = requireSessionToken(session)
  const { error } = await supabase.rpc('create_song', {
    p_session_token: token,
    p_title: draft.title ?? '',
    p_vocal: draft.vocal ?? '',
    p_guitar1: draft.guitar1 ?? '',
    p_guitar2: draft.guitar2 ?? '',
    p_bass: draft.bass ?? '',
    p_drums: draft.drums ?? '',
    p_keyboard: draft.keyboard ?? '',
  })
  if (error) throw mapRpcError(error, '곡 추가에 실패했습니다.')
  return fetchSongs()
}

export async function updateSong(
  session: Session,
  id: string,
  draft: Partial<SongDraft>,
): Promise<Song[]> {
  assertConfigured()
  const token = requireSessionToken(session)
  const { error } = await supabase.rpc('update_song', {
    p_session_token: token,
    p_id: id,
    p_title: draft.title ?? null,
    p_vocal: draft.vocal ?? null,
    p_guitar1: draft.guitar1 ?? null,
    p_guitar2: draft.guitar2 ?? null,
    p_bass: draft.bass ?? null,
    p_drums: draft.drums ?? null,
    p_keyboard: draft.keyboard ?? null,
  })
  if (error) throw mapRpcError(error, '곡 수정에 실패했습니다.')
  return fetchSongs()
}

export async function deleteSong(session: Session, id: string): Promise<Song[]> {
  assertConfigured()
  const token = requireSessionToken(session)
  const { error } = await supabase.rpc('delete_song', {
    p_session_token: token,
    p_id: id,
  })
  if (error) throw mapRpcError(error, '곡 삭제에 실패했습니다.')
  return fetchSongs()
}

export async function reorderSongs(session: Session, ids: string[]): Promise<Song[]> {
  assertConfigured()
  const token = requireSessionToken(session)
  const { error } = await supabase.rpc('reorder_songs', {
    p_session_token: token,
    p_ids: ids,
  })
  if (error) throw mapRpcError(error, '곡 순서 변경에 실패했습니다.')
  return fetchSongs()
}

type SongRequestRow = {
  id: string
  title: string
  vocal: string
  guitar1: string
  guitar2: string
  bass: string
  drums: string
  keyboard: string
  youtube_url?: string | null
  needed_slots: string[] | null
  created_by_cohort: string
  created_by_name: string
  created_at: string
  updated_at: string | null
}

const SLOT_SET = new Set<SongRequestSlot>([
  'vocal',
  'guitar1',
  'guitar2',
  'bass',
  'drums',
  'keyboard',
])

function mapNeededSlots(raw: string[] | null | undefined): SongRequestSlot[] {
  if (!raw?.length) {
    return ['vocal', 'guitar1', 'guitar2', 'bass', 'drums', 'keyboard']
  }
  const seen = new Set<SongRequestSlot>()
  const next: SongRequestSlot[] = []
  for (const item of raw) {
    if (!SLOT_SET.has(item as SongRequestSlot) || seen.has(item as SongRequestSlot)) continue
    seen.add(item as SongRequestSlot)
    next.push(item as SongRequestSlot)
  }
  return next
}

function mapSongRequest(row: SongRequestRow): SongRequest {
  return {
    id: row.id,
    title: row.title ?? '',
    vocal: row.vocal ?? '',
    guitar1: row.guitar1 ?? '',
    guitar2: row.guitar2 ?? '',
    bass: row.bass ?? '',
    drums: row.drums ?? '',
    keyboard: row.keyboard ?? '',
    youtubeUrl: row.youtube_url ?? '',
    neededSlots: mapNeededSlots(row.needed_slots),
    createdBy: { cohort: row.created_by_cohort, name: row.created_by_name },
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? undefined,
  }
}

export async function fetchSongRequests(): Promise<SongRequest[]> {
  assertConfigured()
  const { data, error } = await supabase
    .from('song_requests')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return ((data ?? []) as SongRequestRow[]).map(mapSongRequest)
}

export async function createSongRequest(
  session: Session,
  title: string,
  neededSlots: SongRequestSlot[],
  mySlots: SongRequestSlot[] = [],
  youtubeUrl = '',
): Promise<SongRequest[]> {
  assertConfigured()
  const token = requireSessionToken(session)
  const { error } = await supabase.rpc('create_song_request', {
    p_session_token: token,
    p_title: title,
    p_needed_slots: neededSlots,
    p_my_slots: mySlots,
    p_youtube_url: youtubeUrl,
  })
  if (error) throw mapRpcError(error, '곡 신청에 실패했습니다.')
  return fetchSongRequests()
}

export async function claimSongRequestSlot(
  session: Session,
  id: string,
  slot: SongRequestSlot,
): Promise<SongRequest[]> {
  assertConfigured()
  const token = requireSessionToken(session)
  const { error } = await supabase.rpc('claim_song_request_slot', {
    p_session_token: token,
    p_id: id,
    p_slot: slot,
  })
  if (error) throw mapRpcError(error, '세션 신청에 실패했습니다.')
  return fetchSongRequests()
}

export async function promoteSongRequest(
  session: Session,
  id: string,
): Promise<{ songs: Song[]; requests: SongRequest[] }> {
  assertConfigured()
  const token = requireSessionToken(session)
  const { error } = await supabase.rpc('promote_song_request', {
    p_session_token: token,
    p_id: id,
  })
  if (error) throw mapRpcError(error, '곡 리스트로 옮기지 못했습니다.')
  const [songs, requests] = await Promise.all([fetchSongs(), fetchSongRequests()])
  return { songs, requests }
}

export async function deleteSongRequest(session: Session, id: string): Promise<SongRequest[]> {
  assertConfigured()
  const token = requireSessionToken(session)
  const { error } = await supabase.rpc('delete_song_request', {
    p_session_token: token,
    p_id: id,
  })
  if (error) throw mapRpcError(error, '신청 삭제에 실패했습니다.')
  return fetchSongRequests()
}

type PerformanceRow = {
  id: string
  title: string
  performance_date: string
  place: string | null
  note: string | null
  created_by_cohort: string
  created_by_name: string
  created_at: string
  updated_at: string | null
}

type PerformanceSongRow = {
  performance_id: string
  song_id: string
  sort_order: number
}

export async function fetchPerformances(): Promise<Performance[]> {
  assertConfigured()
  const [perfRes, linkRes] = await Promise.all([
    supabase
      .from('performances')
      .select('*')
      .order('performance_date', { ascending: false })
      .order('created_at', { ascending: false }),
    supabase
      .from('performance_songs')
      .select('performance_id,song_id,sort_order')
      .order('sort_order', { ascending: true }),
  ])
  if (perfRes.error) throw perfRes.error
  if (linkRes.error) throw linkRes.error

  const songIdsByPerf = new Map<string, string[]>()
  for (const row of (linkRes.data ?? []) as PerformanceSongRow[]) {
    const list = songIdsByPerf.get(row.performance_id) ?? []
    list.push(row.song_id)
    songIdsByPerf.set(row.performance_id, list)
  }

  return ((perfRes.data ?? []) as PerformanceRow[]).map((row) => ({
    id: row.id,
    title: row.title ?? '',
    date: row.performance_date,
    place: row.place ?? '',
    note: row.note ?? '',
    songIds: songIdsByPerf.get(row.id) ?? [],
    createdBy: { cohort: row.created_by_cohort, name: row.created_by_name },
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? undefined,
  }))
}

export async function createPerformance(
  session: Session,
  draft: { title: string; date: string; place: string; note: string; songIds: string[] },
): Promise<Performance[]> {
  assertConfigured()
  const token = requireSessionToken(session)
  const { error } = await supabase.rpc('create_performance', {
    p_session_token: token,
    p_title: draft.title,
    p_performance_date: draft.date,
    p_place: draft.place,
    p_note: draft.note,
    p_song_ids: draft.songIds,
  })
  if (error) throw mapRpcError(error, '공연 등록에 실패했습니다.')
  return fetchPerformances()
}

export async function updatePerformance(
  session: Session,
  id: string,
  draft: { title: string; date: string; place: string; note: string; songIds: string[] },
): Promise<Performance[]> {
  assertConfigured()
  const token = requireSessionToken(session)
  const { error } = await supabase.rpc('update_performance', {
    p_session_token: token,
    p_id: id,
    p_title: draft.title,
    p_performance_date: draft.date,
    p_place: draft.place,
    p_note: draft.note,
    p_song_ids: draft.songIds,
  })
  if (error) throw mapRpcError(error, '공연 수정에 실패했습니다.')
  return fetchPerformances()
}

export async function deletePerformance(session: Session, id: string): Promise<Performance[]> {
  assertConfigured()
  const token = requireSessionToken(session)
  const { error } = await supabase.rpc('delete_performance', {
    p_session_token: token,
    p_id: id,
  })
  if (error) throw mapRpcError(error, '공연 삭제에 실패했습니다.')
  return fetchPerformances()
}

export async function addRosterMember(session: Session, name: string): Promise<string[]> {
  assertConfigured()
  const token = requireSessionToken(session)
  const { error } = await supabase.rpc('add_roster_member', {
    p_session_token: token,
    p_name: name,
  })
  if (error) throw mapRpcError(error, '명단 추가에 실패했습니다.')
  return fetchRoster()
}
