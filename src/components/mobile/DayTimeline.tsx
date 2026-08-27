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
import { memberLabel } from '../../types'
import {
  END_HOUR,
  START_HOUR,
  blockStyleVertical,
  colorForId,
} from '../../lib/timetableUtils'

type Props = {
  date: Date
  rehearsals: Rehearsal[]
  onDateChange: (date: Date) => void
  onSelectRehearsal: (rehearsal: Rehearsal) => void
}

const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일']
const HOUR_HEIGHT = 52
const GUTTER_WIDTH = 52

function slotTimeLabel(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`
}

export function DayTimeline({
  date,
  rehearsals,
  onDateChange,
  onSelectRehearsal,
}: Props) {
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

      <p className="dt-hint">+ 버튼으로 추가 · 합주 블록 터치로 수정·삭제</p>

      <div className="dt-card">
        <div className="dt-scroll">
          <div
            className="dt-track-wrap"
            style={{ gridTemplateColumns: `${GUTTER_WIDTH}px 1fr` }}
          >
            <div className="dt-gutter" style={{ height: trackHeight }}>
              {hours.map((hour) => (
                <div key={hour} className="dt-hour-label" style={{ height: HOUR_HEIGHT }}>
                  {slotTimeLabel(hour)}
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
                <button
                  key={event.id}
                  type="button"
                  className="dt-block dt-block--interactive"
                  style={blockStyleVertical(
                    event.startTime,
                    event.endTime,
                    colorForId(event.id),
                    HOUR_HEIGHT,
                  )}
                  onClick={() => onSelectRehearsal(event)}
                >
                  <strong>
                    {event.teamName || '합주'} / {memberLabel(event.createdBy)}
                  </strong>
                  <span>
                    {event.startTime.slice(0, 5)}–{event.endTime.slice(0, 5)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <p className="dt-date-caption">
        {format(date, 'yyyy년 M월 d일 EEEE', { locale: ko })}
      </p>
    </section>
  )
}
