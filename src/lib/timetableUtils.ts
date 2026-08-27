export const START_HOUR = 8
export const END_HOUR = 23

export const BLOCK_COLORS = [
  '#E85A4F',
  '#2F9E94',
  '#3D8FD1',
  '#E07A45',
  '#C9A227',
  '#7BAF4B',
  '#9B5FB8',
  '#6B7C8A',
]

export function timeToMinutes(value: string): number {
  const [h, m] = value.split(':').map(Number)
  return h * 60 + (m || 0)
}

export function minutesToTime(total: number): string {
  const clamped = Math.max(START_HOUR * 60, Math.min(END_HOUR * 60, total))
  const h = Math.floor(clamped / 60)
  const m = clamped % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function hourLabel(hour: number): string {
  return String(hour).padStart(2, '0')
}

export function colorForId(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash + id.charCodeAt(i) * (i + 1)) % BLOCK_COLORS.length
  }
  return BLOCK_COLORS[hash]
}

export function blockStyleVertical(
  startTime: string,
  endTime: string,
  color: string,
  hourHeight: number,
) {
  const dayStart = START_HOUR * 60
  const dayEnd = END_HOUR * 60
  const start = Math.max(dayStart, Math.min(dayEnd, timeToMinutes(startTime)))
  const end = Math.max(start + 60, Math.min(dayEnd, timeToMinutes(endTime)))
  const top = ((start - dayStart) / 60) * hourHeight
  const height = ((end - start) / 60) * hourHeight
  return {
    top: `${top + 2}px`,
    height: `${Math.max(height - 4, hourHeight - 8)}px`,
    background: color,
  }
}

export function blockStyleHorizontal(
  startTime: string,
  endTime: string,
  color: string,
  hourWidth: number,
) {
  const dayStart = START_HOUR * 60
  const dayEnd = END_HOUR * 60
  const start = Math.max(dayStart, Math.min(dayEnd, timeToMinutes(startTime)))
  const end = Math.max(start + 60, Math.min(dayEnd, timeToMinutes(endTime)))
  const left = ((start - dayStart) / 60) * hourWidth
  const width = ((end - start) / 60) * hourWidth
  return {
    left: `${left}px`,
    width: `${Math.max(width - 4, hourWidth - 8)}px`,
    background: color,
  }
}
