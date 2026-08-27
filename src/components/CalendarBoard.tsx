import {
  addDays,
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
const MOBILE_WEEK_COUNT = 4

function buildDayRange(month: Date, variant: 'desktop' | 'mobile') {
  const today = new Date()
  const monthStart = startOfMonth(month)

  if (variant === 'mobile') {
    const gridStart = isSameMonth(month, today)
      ? startOfWeek(today, { weekStartsOn: 0 })
      : startOfWeek(monthStart, { weekStartsOn: 0 })
    const gridEnd = addDays(gridStart, MOBILE_WEEK_COUNT * 7 - 1)
    return eachDayOfInterval({ start: gridStart, end: gridEnd })
  }

  return eachDayOfInterval({
    start: startOfWeek(monthStart, { weekStartsOn: 0 }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn: 0 }),
  })
}

export function CalendarBoard({
  month,
  rehearsals,
  variant = 'desktop',
  onMonthChange,
  onSelectDate,
  onSelectRehearsal,
}: Props) {
  const days = buildDayRange(month, variant)

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
            className="btn-ghost btn-ghost--compact"
            onClick={() => onMonthChange(subMonths(month, 1))}
            aria-label="이전 달"
          >
            ‹
          </button>
          <button
            type="button"
            className="btn-ghost btn-ghost--compact"
            onClick={() => onMonthChange(new Date())}
          >
            오늘
          </button>
          <button
            type="button"
            className="btn-ghost btn-ghost--compact"
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

          return variant === 'mobile' ? (
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
              aria-label={`${format(day, 'M월 d일', { locale: ko })} 일정 보기`}
            >
              <span className="day-number">{format(day, 'd')}</span>
              <div className="day-events">
                {dayEvents.slice(0, 3).map((event) => (
                  <span key={event.id} className="event-chip event-chip--readonly">
                    {event.teamName || event.startTime}
                  </span>
                ))}
                {dayEvents.length > 3 ? (
                  <span className="event-more">+{dayEvents.length - 3}</span>
                ) : null}
              </div>
            </button>
          ) : (
            <div
              key={day.toISOString()}
              className={[
                'day-cell',
                inMonth ? '' : 'is-outside',
                isToday(day) ? 'is-today' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <button
                type="button"
                className="day-cell-hit"
                onClick={() => onSelectDate(day)}
                aria-label={`${format(day, 'M월 d일', { locale: ko })} 일정 보기`}
              >
                <span className="day-number">{format(day, 'd')}</span>
              </button>
              <div className="day-events">
                {dayEvents.slice(0, 3).map((event) =>
                  onSelectRehearsal ? (
                    <button
                      key={event.id}
                      type="button"
                      className="event-chip"
                      onClick={() => onSelectRehearsal(event)}
                    >
                      {event.teamName || event.startTime}
                    </button>
                  ) : (
                    <span key={event.id} className="event-chip event-chip--readonly">
                      {event.teamName || event.startTime}
                    </span>
                  ),
                )}
                {dayEvents.length > 3 ? (
                  <span className="event-more">+{dayEvents.length - 3}</span>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
