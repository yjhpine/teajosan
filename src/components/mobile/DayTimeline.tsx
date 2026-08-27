import {
  addDays,
  eachDayOfInterval,
  format,
  isSameDay,
  isToday,
  startOfWeek,
} from 'date-fns'
import { ko } from 'date-fns/locale'
import type { Rehearsal } from '../../types'
import {
  END_HOUR,
  START_HOUR,
  blockStyleVertical,
  colorForId,
  hourLabel,
} from '../../lib/timetableUtils'

type Props = {
  date: Date
  rehearsals: Rehearsal[]
  onDateChange: (date: Date) => void
}

const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일']
const HOUR_HEIGHT = 52
const GUTTER_WIDTH = 44

export function DayTimeline({ date, rehearsals, onDateChange }: Props) {
  const weekStart = startOfWeek(date, { weekStartsOn: 1 })
  const weekDays = eachDayOfInterval({ start: weekStart, end: addDays(weekStart, 6) })
  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i)
  const trackHeight = hours.length * HOUR_HEIGHT
  const dayKey = format(date, 'yyyy-MM-dd')
  const dayEvents = rehearsals.filter((item) => item.date === dayKey)

  return (
    <section className="day-timeline">
      <div className="dt-week-strip" role="tablist" aria-label="요일 선택">
        {weekDays.map((day, index) => {
          const selected = isSameDay(day, date)
          const today = isToday(day)
          return (
            <button
              key={day.toISOString()}
              type="button"
              role="tab"
              aria-selected={selected}
              className={[
                'dt-day-pill',
                selected ? 'is-selected' : '',
                today ? 'is-today' : '',
                index >= 5 ? 'is-weekend' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => onDateChange(day)}
            >
              <strong>{WEEKDAYS[index]}</strong>
              <span>{format(day, 'd')}</span>
            </button>
          )
        })}
      </div>

      <p className="dt-hint">합주 추가는 아래 + 버튼만 사용하세요</p>

      <div className="dt-card">
        <div
          className="dt-track-wrap"
          style={{ gridTemplateColumns: `${GUTTER_WIDTH}px 1fr` }}
        >
          <div className="dt-gutter" style={{ height: trackHeight }}>
            {hours.map((hour) => (
              <div key={hour} className="dt-hour-label" style={{ height: HOUR_HEIGHT }}>
                {hourLabel(hour)}
              </div>
            ))}
          </div>
          <div className="dt-track dt-track--readonly" style={{ height: trackHeight }}>
            {hours.map((hour) => (
              <div
                key={hour}
                className="dt-hour-slot"
                style={{ height: HOUR_HEIGHT }}
                aria-hidden="true"
              />
            ))}
            {dayEvents.map((event) => (
              <div
                key={event.id}
                className="dt-block dt-block--readonly"
                style={blockStyleVertical(
                  event.startTime,
                  event.endTime,
                  colorForId(event.id),
                  HOUR_HEIGHT,
                )}
              >
                <strong>{event.teamName || '합주'}</strong>
                <span>
                  {event.startTime.slice(0, 5)}–{event.endTime.slice(0, 5)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="dt-date-caption">
        {format(date, 'yyyy년 M월 d일 EEEE', { locale: ko })}
      </p>
    </section>
  )
}
