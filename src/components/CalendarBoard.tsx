import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns'
import { ko } from 'date-fns/locale'
import type { Rehearsal } from '../types'

type Props = {
  month: Date
  rehearsals: Rehearsal[]
  variant?: 'desktop' | 'mobile'
  onMonthChange: (month: Date) => void
  onSelectDate: (date: Date) => void
  onSelectRehearsal?: (rehearsal: Rehearsal) => void
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

export function CalendarBoard({
  month,
  rehearsals,
  variant = 'desktop',
  onMonthChange,
  onSelectDate,
  onSelectRehearsal,
}: Props) {
  const today = new Date()
  const monthStart = startOfMonth(month)
  const gridStart =
    variant === 'mobile' && isSameMonth(month, today)
      ? startOfWeek(today, { weekStartsOn: 0 })
      : startOfWeek(monthStart, { weekStartsOn: 0 })

  const days = eachDayOfInterval({
    start: gridStart,
    end: endOfWeek(endOfMonth(month), { weekStartsOn: 0 }),
  })

  function eventsFor(day: Date) {
    const key = format(day, 'yyyy-MM-dd')
    return rehearsals
      .filter((item) => item.date === key)
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
  }

  return (
    <section className={['calendar-board', variant === 'mobile' ? 'calendar-board--mobile' : ''].filter(Boolean).join(' ')}>
      <header className="calendar-toolbar">
        {variant === 'desktop' ? (
          <div>
            <p className="section-kicker">Rehearsal</p>
            <h2 className="calendar-title">
              {format(month, 'yyyy년 M월', { locale: ko })}
            </h2>
          </div>
        ) : (
          <h2 className="calendar-title calendar-title--mobile">
            {format(month, 'yyyy년 M월', { locale: ko })}
          </h2>
        )}
        <div className="month-nav">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => onMonthChange(subMonths(month, 1))}
            aria-label="이전 달"
          >
            ‹
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => onMonthChange(new Date())}
          >
            오늘
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => onMonthChange(addMonths(month, 1))}
            aria-label="다음 달"
          >
            ›
          </button>
        </div>
      </header>

      <div className="weekday-row">
        {WEEKDAYS.map((day) => (
          <div key={day} className="weekday-cell">
            {day}
          </div>
        ))}
      </div>

      <div className="day-grid" key={format(month, 'yyyy-MM')}>
        {days.map((day) => {
          const dayEvents = eventsFor(day)
          const inMonth = isSameMonth(day, month)

          return (
            <button
              key={day.toISOString()}
              type="button"
              className={[
                'day-cell',
                inMonth ? '' : 'is-outside',
                isToday(day) ? 'is-today' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => onSelectDate(day)}
            >
              <span className="day-number">{format(day, 'd')}</span>
              <div className="day-events">
                {dayEvents.slice(0, 3).map((event) =>
                  variant === 'mobile' ? (
                    <span key={event.id} className="event-chip event-chip--readonly">
                      {event.teamName || event.startTime}
                    </span>
                  ) : (
                    <span
                      key={event.id}
                      className="event-chip"
                      onClick={(e) => {
                        e.stopPropagation()
                        onSelectRehearsal?.(event)
                      }}
                    >
                      {event.teamName || event.startTime}
                    </span>
                  ),
                )}
                {dayEvents.length > 3 ? (
                  <span className="event-more">+{dayEvents.length - 3}</span>
                ) : null}
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}
