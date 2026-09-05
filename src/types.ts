export type Member = {
  cohort: string
  name: string
}

export type InstrumentSession = 'vocal' | 'guitar' | 'bass' | 'drums' | 'keyboard'

export const INSTRUMENT_SESSIONS: { id: InstrumentSession; label: string }[] = [
  { id: 'vocal', label: '보컬' },
  { id: 'guitar', label: '기타' },
  { id: 'bass', label: '베이스' },
  { id: 'drums', label: '드럼' },
  { id: 'keyboard', label: '키보드' },
]

export type MemberProfile = Member & {
  sessions: InstrumentSession[]
  isAdmin?: boolean
}

export type Session = Member & {
  token: string
  sessions?: InstrumentSession[]
  isAdmin?: boolean
}

export type Rehearsal = {
  id: string
  date: string
  startTime: string
  endTime: string
  teamName: string
  createdBy: Member
  createdAt: string
  updatedBy?: Member
  updatedAt?: string
}

export type ActivityAction = 'login' | 'create' | 'update' | 'delete'

export type ActivityLog = {
  id: string
  at: string
  actor: Member
  action: ActivityAction
  summary: string
  rehearsalId?: string
  ip?: string
}

export type AppData = {
  rehearsals: Rehearsal[]
  logs: ActivityLog[]
}

export type Performance = {
  id: string
  title: string
  date: string
  startTime: string
  place: string
  note: string
  songIds: string[]
  createdBy: Member
  createdAt: string
  updatedAt?: string
}

export type AppStatus = {
  maintenanceEnabled: boolean
  maintenanceMessage: string
}

export type SongExtraSlot = {
  id: string
  label: string
  name: string
}

export type Song = {
  id: string
  title: string
  vocal: string
  guitar1: string
  guitar2: string
  bass: string
  drums: string
  keyboard: string
  youtubeUrl: string
  memo: string
  extraSlots: SongExtraSlot[]
  sortOrder: number
  createdBy: Member
  createdAt: string
  updatedAt?: string
}

export type SongDraft = {
  title: string
  vocal: string
  guitar1: string
  guitar2: string
  bass: string
  drums: string
  keyboard: string
  memo?: string
  extraSlots?: SongExtraSlot[]
}

export type SongRequestSlot =
  | 'vocal'
  | 'guitar1'
  | 'guitar2'
  | 'bass'
  | 'drums'
  | 'keyboard'

export const SONG_REQUEST_SLOTS: { id: SongRequestSlot; label: string }[] = [
  { id: 'vocal', label: '보컬' },
  { id: 'guitar1', label: '기타1' },
  { id: 'guitar2', label: '기타2' },
  { id: 'bass', label: '베이스' },
  { id: 'drums', label: '드럼' },
  { id: 'keyboard', label: '키보드' },
]

export function isFixedSongRequestSlot(slot: string): slot is SongRequestSlot {
  return SONG_REQUEST_SLOTS.some((item) => item.id === slot)
}

export function makeExtraSlotId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `x_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`
  }
  return `x_${Date.now().toString(36)}`
}

export type SongRequest = {
  id: string
  title: string
  vocal: string
  guitar1: string
  guitar2: string
  bass: string
  drums: string
  keyboard: string
  youtubeUrl: string
  memo: string
  extraSlots: SongExtraSlot[]
  neededSlots: SongRequestSlot[]
  createdBy: Member
  createdAt: string
  updatedAt?: string
}

export function memberLabel(member: Member): string {
  return `${normalizeMemberField(member.cohort)}기 ${normalizeMemberField(member.name)}`
}

export function normalizeMemberField(value: string): string {
  return value.normalize('NFC').trim()
}

export function isSameMember(a: Member, b: Member): boolean {
  return (
    normalizeMemberField(a.cohort) === normalizeMemberField(b.cohort) &&
    normalizeMemberField(a.name) === normalizeMemberField(b.name)
  )
}
