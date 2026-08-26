import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
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
  selectedDate: Date | null
  onMonthChange: (month: Date) => void
  onSelectDate: (date: Date) => void
  onSelectRehearsal: (rehearsal: Rehearsal) => void
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

export function CalendarBoard({
  month,
  rehearsals,
  selectedDate,
  onMonthChange,
  onSelectDate,
  onSelectRehearsal,
}: Props) {
  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(month), { weekStartsOn: 0 }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn: 0 }),
  })

  function eventsFor(day: Date) {
    const key = format(day, 'yyyy-MM-dd')
    return rehearsals
      .filter((item) => item.date === key)
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
  }

  return (
    <section className="calendar-board">
      <header className="calendar-toolbar">
        <div>
          <p className="section-kicker">Rehearsal</p>
          <h2 className="calendar-title">
            {format(month, 'yyyy년 M월', { locale: ko })}
          </h2>
        </div>
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
          const selected = selectedDate ? isSameDay(day, selectedDate) : false

          return (
            <button
              key={day.toISOString()}
              type="button"
              className={[
                'day-cell',
                inMonth ? '' : 'is-outside',
                isToday(day) ? 'is-today' : '',
                selected ? 'is-selected' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => onSelectDate(day)}
            >
              <span className="day-number">{format(day, 'd')}</span>
              <div className="day-events">
                {dayEvents.slice(0, 3).map((event) => (
                  <span
                    key={event.id}
                    className="event-chip"
                    onClick={(e) => {
                      e.stopPropagation()
                      onSelectRehearsal(event)
                    }}
                  >
                    {event.startTime} {event.place || '합주'}
                  </span>
                ))}
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
