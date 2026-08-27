export type Member = {
  cohort: string
  name: string
}

export type Session = Member & {
  token: string
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

export type Song = {
  id: string
  title: string
  vocal: string
  guitar1: string
  guitar2: string
  bass: string
  drums: string
  keyboard: string
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
