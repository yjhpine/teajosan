import {
  eachDayOfInterval,
  endOfWeek,
  format,
  isSameDay,
  isToday,
  startOfWeek,
} from 'date-fns'
import { ko } from 'date-fns/locale'
import type { MouseEvent } from 'react'
import type { Rehearsal } from '../types'
import { memberLabel } from '../types'

type Props = {
  anchorDate: Date
  rehearsals: Rehearsal[]
  onBackToMonth: () => void
  onCreate: (date: Date, startTime: string) => void
  onSelectRehearsal: (rehearsal: Rehearsal) => void
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
const START_HOUR = 8
const END_HOUR = 23
const HOUR_HEIGHT = 56

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

function blockStyle(startTime: string, endTime: string) {
  const dayStart = START_HOUR * 60
  const dayEnd = END_HOUR * 60
  const start = Math.max(dayStart, Math.min(dayEnd, timeToMinutes(startTime)))
  const end = Math.max(start + 30, Math.min(dayEnd, timeToMinutes(endTime)))
  const top = ((start - dayStart) / 60) * HOUR_HEIGHT
  const height = ((end - start) / 60) * HOUR_HEIGHT
  return { top: `${top}px`, height: `${Math.max(height, 28)}px` }
}

export function WeekTimetable({
  anchorDate,
  rehearsals,
  onBackToMonth,
  onCreate,
  onSelectRehearsal,
}: Props) {
  const weekStart = startOfWeek(anchorDate, { weekStartsOn: 0 })
  const weekEnd = endOfWeek(anchorDate, { weekStartsOn: 0 })
  const days = eachDayOfInterval({ start: weekStart, end: weekEnd })
  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i)

  function eventsFor(day: Date) {
    const key = format(day, 'yyyy-MM-dd')
    return rehearsals.filter((item) => item.date === key)
  }

  function handleColumnClick(day: Date, event: MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement
    if (target.closest('.rehearsal-block')) return
    const rect = event.currentTarget.getBoundingClientRect()
    const y = event.clientY - rect.top
    const minutesFromStart = Math.floor((y / HOUR_HEIGHT) * 60)
    const snapped = Math.floor(minutesFromStart / 30) * 30
    const startTime = minutesToTime(START_HOUR * 60 + snapped)
    onCreate(day, startTime)
  }

  return (
    <section className="week-timetable">
      <header className="calendar-toolbar">
        <div>
          <p className="section-kicker">Weekly</p>
          <h2 className="calendar-title">
            {format(weekStart, 'M/d', { locale: ko })} –{' '}
            {format(weekEnd, 'M/d', { locale: ko })}
          </h2>
        </div>
        <div className="month-nav">
          <button type="button" className="btn-ghost" onClick={onBackToMonth}>
            월간으로
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => onCreate(anchorDate, '19:00')}
          >
            합주 잡기
          </button>
        </div>
      </header>

      <div className="week-scroll">
        <div className="week-header">
          <div className="hour-rail-spacer" />
          {days.map((day, index) => (
            <div
              key={day.toISOString()}
              className={[
                'week-day-head',
                isToday(day) ? 'is-today' : '',
                isSameDay(day, anchorDate) ? 'is-anchor' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <span>{WEEKDAYS[index]}</span>
              <strong>{format(day, 'd')}</strong>
            </div>
          ))}
        </div>

        <div className="week-body">
          <div className="hour-rail">
            {hours.map((hour) => (
              <div key={hour} className="hour-label" style={{ height: HOUR_HEIGHT }}>
                {String(hour).padStart(2, '0')}:00
              </div>
            ))}
          </div>

          <div className="week-grid">
            {days.map((day) => {
              const dayEvents = eventsFor(day)
              return (
                <div
                  key={day.toISOString()}
                  className={[
                    'week-day-col',
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
                      className="hour-line"
                      style={{ height: HOUR_HEIGHT }}
                    />
                  ))}
                  {dayEvents.map((event) => (
                    <button
                      key={event.id}
                      type="button"
                      className="rehearsal-block"
                      style={blockStyle(event.startTime, event.endTime)}
                      onClick={(e) => {
                        e.stopPropagation()
                        onSelectRehearsal(event)
                      }}
                    >
                      <strong>
                        {event.startTime}–{event.endTime}
                      </strong>
                      <span>{memberLabel(event.createdBy)}</span>
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
