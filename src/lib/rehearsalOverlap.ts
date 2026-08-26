import type { Rehearsal } from '../types'

function toMinutes(value: string): number {
  const [h, m] = value.split(':').map(Number)
  return h * 60 + (m || 0)
}

/** 같은 날짜에서 [start, end) 구간이 겹치면 true */
export function rangesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  return toMinutes(aStart) < toMinutes(bEnd) && toMinutes(bStart) < toMinutes(aEnd)
}

export function findOverlappingRehearsal(
  rehearsals: Rehearsal[],
  draft: { date: string; startTime: string; endTime: string },
  excludeId?: string,
): Rehearsal | undefined {
  return rehearsals.find(
    (item) =>
      item.id !== excludeId &&
      item.date === draft.date &&
      rangesOverlap(item.startTime, item.endTime, draft.startTime, draft.endTime),
  )
}
