import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { useState } from 'react'
import { ActivityPanel } from '../ActivityPanel'
import { CalendarBoard } from '../CalendarBoard'
import type { AppData, Member, Rehearsal } from '../../types'
import { DayTimeline } from './DayTimeline'
import { MobileHeader } from './MobileHeader'
import { MobileTabBar } from './MobileTabBar'

type ScheduleView = 'month' | 'day'
type MobileTab = 'schedule' | 'log'

type Props = {
  member: Member
  data: AppData
  busy: boolean
  error: string
  month: Date
  selectedDate: Date
  scheduleView: ScheduleView
  onMonthChange: (month: Date) => void
  onSelectDate: (date: Date) => void
  onScheduleViewChange: (view: ScheduleView) => void
  onRefresh: () => void
  onLogout: () => void
  onCreate: (date: Date, startTime?: string) => void
  onSelectRehearsal: (rehearsal: Rehearsal) => void
}

export function MobileApp({
  member,
  data,
  busy,
  error,
  month,
  selectedDate,
  scheduleView,
  onMonthChange,
  onSelectDate,
  onScheduleViewChange,
  onRefresh,
  onLogout,
  onCreate,
  onSelectRehearsal,
}: Props) {
  const [tab, setTab] = useState<MobileTab>('schedule')

  function openDay(date: Date) {
    onSelectDate(date)
    onScheduleViewChange('day')
    setTab('schedule')
  }

  const headerTitle =
    tab === 'log'
      ? '활동 로그'
      : scheduleView === 'month'
        ? format(month, 'yyyy년 M월', { locale: ko })
        : format(selectedDate, 'M월 d일 EEEE', { locale: ko })

  const headerSubtitle =
    tab === 'log'
      ? '합주 등록·삭제 기록'
      : scheduleView === 'month'
        ? '날짜를 눌러 하루 일정 보기'
        : '요일 탭 · 빈 칸 터치로 등록'

  return (
    <div className="mobile-shell">
      <div className="app-atmosphere" aria-hidden="true" />

      <MobileHeader
        title={headerTitle}
        subtitle={headerSubtitle}
        member={member}
        busy={busy}
        showBack={tab === 'schedule' && scheduleView === 'day'}
        onBack={() => onScheduleViewChange('month')}
        onRefresh={() => void onRefresh()}
        onLogout={onLogout}
      />

      {error ? <p className="banner-error mobile-banner">{error}</p> : null}
      {busy ? <p className="banner-busy mobile-banner">동기화 중…</p> : null}

      <main className="mobile-main">
        {tab === 'schedule' ? (
          scheduleView === 'month' ? (
            <CalendarBoard
              month={month}
              rehearsals={data.rehearsals}
              onMonthChange={onMonthChange}
              onSelectDate={openDay}
              onSelectRehearsal={onSelectRehearsal}
            />
          ) : (
            <DayTimeline
              date={selectedDate}
              rehearsals={data.rehearsals}
              onDateChange={onSelectDate}
              onCreate={onCreate}
              onSelectRehearsal={onSelectRehearsal}
            />
          )
        ) : (
          <ActivityPanel logs={data.logs} variant="mobile" />
        )}
      </main>

      {tab === 'schedule' && scheduleView === 'day' ? (
        <button
          type="button"
          className="mobile-fab"
          aria-label="합주 잡기"
          onClick={() => onCreate(selectedDate, '19:00')}
        >
          +
        </button>
      ) : null}

      <MobileTabBar active={tab} onChange={setTab} />
    </div>
  )
}
