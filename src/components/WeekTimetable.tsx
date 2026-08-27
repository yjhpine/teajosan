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
import {
  END_HOUR,
  START_HOUR,
  blockStyleVertical,
  colorForId,
  hourLabel,
  minutesToTime,
} from '../lib/timetableUtils'

type Props = {
  anchorDate: Date
  rehearsals: Rehearsal[]
  onBackToMonth: () => void
  onCreate: (date: Date, startTime: string) => void
  onSelectRehearsal: (rehearsal: Rehearsal) => void
}

const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일']
const HOUR_HEIGHT = 56
const COL_MIN_WIDTH = 88
const GUTTER_WIDTH = 52

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
                        style={blockStyleVertical(
                          event.startTime,
                          event.endTime,
                          colorForId(event.id),
                          HOUR_HEIGHT,
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
