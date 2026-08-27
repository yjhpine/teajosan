export type Member = {
  cohort: string
  name: string
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

export function memberLabel(member: Member): string {
  return `${member.cohort}기 ${member.name}`
}

export function isSameMember(a: Member, b: Member): boolean {
  return a.cohort === b.cohort && a.name === b.name
}
