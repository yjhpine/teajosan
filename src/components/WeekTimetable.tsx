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
const HOUR_HEIGHT = 56
const COL_MIN_WIDTH = 88
const GUTTER_WIDTH = 52

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
  return String(hour).padStart(2, '0')
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
  const top = ((start - dayStart) / 60) * HOUR_HEIGHT
  const height = ((end - start) / 60) * HOUR_HEIGHT
  return {
    top: `${top + 2}px`,
    height: `${Math.max(height - 4, HOUR_HEIGHT - 8)}px`,
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
  const trackHeight = hours.length * HOUR_HEIGHT

  function eventsFor(day: Date) {
    const key = format(day, 'yyyy-MM-dd')
    return rehearsals.filter((item) => item.date === key)
  }

  function handleColClick(day: Date, event: MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement
    if (target.closest('.et-block')) return
    const rect = event.currentTarget.getBoundingClientRect()
    const y = event.clientY - rect.top
    const minutesFromStart = Math.floor((y / HOUR_HEIGHT) * 60)
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
          <p className="et-hint">시간은 위→아래 · 요일은 열 · 빈 칸 클릭 후 팀명 입력</p>
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
          <div className="et-matrix">
            <div
              className="et-day-head"
              style={{ gridTemplateColumns: `${GUTTER_WIDTH}px repeat(7, minmax(${COL_MIN_WIDTH}px, 1fr))` }}
            >
              <div className="et-corner">
                <span>시간</span>
              </div>
              {days.map((day, index) => (
                <div
                  key={`head-${day.toISOString()}`}
                  className={[
                    'et-day-head-cell',
                    isToday(day) ? 'is-today' : '',
                    isSameDay(day, anchorDate) ? 'is-anchor' : '',
                    index >= 5 ? 'is-weekend' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <strong>{WEEKDAYS[index]}</strong>
                  <span>{format(day, 'M/d')}</span>
                </div>
              ))}
            </div>

            <div
              className="et-body"
              style={{ gridTemplateColumns: `${GUTTER_WIDTH}px repeat(7, minmax(${COL_MIN_WIDTH}px, 1fr))` }}
            >
              <div className="et-time-gutter" style={{ height: trackHeight }}>
                {hours.map((hour) => (
                  <div
                    key={hour}
                    className="et-time-label"
                    style={{ height: HOUR_HEIGHT }}
                  >
                    {hourLabel(hour)}
                  </div>
                ))}
              </div>

              {days.map((day, index) => {
                const dayEvents = eventsFor(day)
                return (
                  <div
                    key={day.toISOString()}
                    className={[
                      'et-day-col',
                      isToday(day) ? 'is-today' : '',
                      isSameDay(day, anchorDate) ? 'is-anchor' : '',
                      index >= 5 ? 'is-weekend' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    style={{ height: trackHeight }}
                    onClick={(event) => handleColClick(day, event)}
                  >
                    {hours.map((hour) => (
                      <div
                        key={hour}
                        className="et-hour-slot"
                        style={{ height: HOUR_HEIGHT }}
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
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
