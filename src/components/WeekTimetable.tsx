import {
  addDays,
  eachDayOfInterval,
  format,
  isSameDay,
  isToday,
  startOfWeek,
} from 'date-fns'
import { ko } from 'date-fns/locale'
import type { MouseEvent } from 'react'
import type { Rehearsal } from '../types'

type Props = {
  anchorDate: Date
  rehearsals: Rehearsal[]
  onBackToMonth: () => void
  onCreate: (date: Date, startTime: string) => void
  onSelectRehearsal: (rehearsal: Rehearsal) => void
}

const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일']
const START_HOUR = 8
const END_HOUR = 23
const HOUR_WIDTH = 80
const ROW_HEIGHT = 78
const LABEL_WIDTH = 64

const BLOCK_COLORS = [
  '#E85A4F',
  '#2F9E94',
  '#3D8FD1',
  '#E07A45',
  '#C9A227',
  '#7BAF4B',
  '#9B5FB8',
  '#6B7C8A',
]

function timeToMinutes(value: string): number {
  const [h, m] = value.split(':').map(Number)
  return h * 60 + (m || 0)
}

function minutesToTime(total: number): string {
  const clamped = Math.max(START_HOUR * 60, Math.min(END_HOUR * 60, total))
  const h = Math.floor(clamped / 60)
  const m = clamped % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, '0')}`
}

function colorForId(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash + id.charCodeAt(i) * (i + 1)) % BLOCK_COLORS.length
  }
  return BLOCK_COLORS[hash]
}

function blockStyle(startTime: string, endTime: string, color: string) {
  const dayStart = START_HOUR * 60
  const dayEnd = END_HOUR * 60
  const start = Math.max(dayStart, Math.min(dayEnd, timeToMinutes(startTime)))
  const end = Math.max(start + 60, Math.min(dayEnd, timeToMinutes(endTime)))
  const left = ((start - dayStart) / 60) * HOUR_WIDTH
  const width = ((end - start) / 60) * HOUR_WIDTH
  return {
    left: `${left}px`,
    width: `${Math.max(width - 4, HOUR_WIDTH - 8)}px`,
    background: color,
  }
}

export function WeekTimetable({
  anchorDate,
  rehearsals,
  onBackToMonth,
  onCreate,
  onSelectRehearsal,
}: Props) {
  const weekStart = startOfWeek(anchorDate, { weekStartsOn: 1 })
  const weekEnd = addDays(weekStart, 6)
  const days = eachDayOfInterval({ start: weekStart, end: weekEnd })
  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i)
  const trackWidth = hours.length * HOUR_WIDTH

  function eventsFor(day: Date) {
    const key = format(day, 'yyyy-MM-dd')
    return rehearsals.filter((item) => item.date === key)
  }

  function handleRowClick(day: Date, event: MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement
    if (target.closest('.et-block')) return
    const rect = event.currentTarget.getBoundingClientRect()
    const x = event.clientX - rect.left
    const minutesFromStart = Math.floor((x / HOUR_WIDTH) * 60)
    const snapped = Math.floor(minutesFromStart / 60) * 60
    const startTime = minutesToTime(START_HOUR * 60 + snapped)
    onCreate(day, startTime)
  }

  return (
    <section className="et-timetable">
      <header className="et-toolbar">
        <div>
          <p className="et-kicker">합주 시간표</p>
          <h2 className="et-title">
            {format(weekStart, 'M/d', { locale: ko })} –{' '}
            {format(weekEnd, 'M/d', { locale: ko })}
          </h2>
          <p className="et-hint">요일마다 한 줄 · 1시간 칸 · 빈 칸 클릭 후 팀명 입력</p>
        </div>
        <div className="et-actions">
          <button type="button" className="et-btn-ghost" onClick={onBackToMonth}>
            월간
          </button>
          <button
            type="button"
            className="et-btn-add"
            aria-label="합주 잡기"
            onClick={() => onCreate(anchorDate, '19:00')}
          >
            +
          </button>
        </div>
      </header>

      <div className="et-card">
        <div className="et-scroll">
          <div
            className="et-matrix"
            style={{ width: LABEL_WIDTH + trackWidth }}
          >
            <div
              className="et-hour-head"
              style={{ gridTemplateColumns: `${LABEL_WIDTH}px ${trackWidth}px` }}
            >
              <div className="et-corner">
                <span>요일</span>
              </div>
              <div className="et-hour-track" style={{ width: trackWidth }}>
                {hours.map((hour) => (
                  <div
                    key={hour}
                    className="et-hour-cell"
                    style={{ width: HOUR_WIDTH }}
                  >
                    {hourLabel(hour)}
                  </div>
                ))}
              </div>
            </div>

            {days.map((day, index) => {
              const dayEvents = eventsFor(day)
              const weekend = index >= 5
              return (
                <div
                  key={day.toISOString()}
                  className={[
                    'et-day-row',
                    isToday(day) ? 'is-today' : '',
                    isSameDay(day, anchorDate) ? 'is-anchor' : '',
                    weekend ? 'is-weekend' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  style={{ gridTemplateColumns: `${LABEL_WIDTH}px ${trackWidth}px` }}
                >
                  <div className="et-day-label">
                    <strong>{WEEKDAYS[index]}</strong>
                    <span>{format(day, 'M/d')}</span>
                  </div>
                  <div
                    className="et-day-track"
                    style={{ width: trackWidth, height: ROW_HEIGHT }}
                    onClick={(event) => handleRowClick(day, event)}
                  >
                    {hours.map((hour) => (
                      <div
                        key={hour}
                        className="et-hour-slot"
                        style={{ width: HOUR_WIDTH, height: ROW_HEIGHT }}
                        aria-hidden="true"
                      />
                    ))}
                    {dayEvents.map((event) => (
                      <button
                        key={event.id}
                        type="button"
                        className="et-block"
                        style={blockStyle(
                          event.startTime,
                          event.endTime,
                          colorForId(event.id),
                        )}
                        onClick={(e) => {
                          e.stopPropagation()
                          onSelectRehearsal(event)
                        }}
                      >
                        <strong>{event.teamName || '합주'}</strong>
                        <span>
                          {event.startTime.slice(0, 5)}–{event.endTime.slice(0, 5)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}
