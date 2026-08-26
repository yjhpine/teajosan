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
const HOUR_HEIGHT = 64

const BLOCK_COLORS = [
  '#F0817B',
  '#4DB6AC',
  '#64B5F6',
  '#FF8A65',
  '#E0B23A',
  '#AED581',
  '#BA68C8',
  '#90A4AE',
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
  if (hour === 0 || hour === 12) return '12'
  if (hour < 12) return String(hour)
  return String(hour - 12)
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
  const end = Math.max(start + 30, Math.min(dayEnd, timeToMinutes(endTime)))
  const top = ((start - dayStart) / 60) * HOUR_HEIGHT
  const height = ((end - start) / 60) * HOUR_HEIGHT
  return {
    top: `${top}px`,
    height: `${Math.max(height, 24)}px`,
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

  function eventsFor(day: Date) {
    const key = format(day, 'yyyy-MM-dd')
    return rehearsals.filter((item) => item.date === key)
  }

  function handleColumnClick(day: Date, event: MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement
    if (target.closest('.et-block')) return
    const rect = event.currentTarget.getBoundingClientRect()
    const y = event.clientY - rect.top
    const minutesFromStart = Math.floor((y / HOUR_HEIGHT) * 60)
    const snapped = Math.floor(minutesFromStart / 30) * 30
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
        <div className="et-head">
          <div className="et-corner" />
          {days.map((day, index) => (
            <div
              key={day.toISOString()}
              className={[
                'et-day',
                isToday(day) ? 'is-today' : '',
                isSameDay(day, anchorDate) ? 'is-anchor' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {WEEKDAYS[index]}
            </div>
          ))}
        </div>

        <div className="et-body">
          <div className="et-hours">
            {hours.map((hour) => (
              <div key={hour} className="et-hour" style={{ height: HOUR_HEIGHT }}>
                <span>{hourLabel(hour)}</span>
              </div>
            ))}
          </div>

          <div className="et-grid">
            {days.map((day) => {
              const dayEvents = eventsFor(day)
              return (
                <div
                  key={day.toISOString()}
                  className={[
                    'et-col',
                    isToday(day) ? 'is-today' : '',
                    isSameDay(day, anchorDate) ? 'is-anchor' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  style={{ height: (END_HOUR - START_HOUR) * HOUR_HEIGHT }}
                  onClick={(event) => handleColumnClick(day, event)}
                >
                  {hours.map((hour) => (
                    <div
                      key={hour}
                      className="et-slot"
                      style={{ height: HOUR_HEIGHT }}
                    >
                      <div className="et-half" />
                    </div>
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
                      <strong>합주</strong>
                      <span>
                        {event.startTime}–{event.endTime}
                      </span>
                    </button>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}
