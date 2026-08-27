import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { useState } from 'react'
import { ActivityPanel } from '../ActivityPanel'
import { CalendarBoard } from '../CalendarBoard'
import type { AppData, Member } from '../../types'
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
}: Props) {
  const [tab, setTab] = useState<MobileTab>('schedule')
  const isMonthHome = tab === 'schedule' && scheduleView === 'month'

  function openDay(date: Date) {
    onSelectDate(date)
    onScheduleViewChange('day')
    setTab('schedule')
  }

  const headerTitle =
    tab === 'log'
      ? '활동 로그'
      : scheduleView === 'day'
        ? format(selectedDate, 'M월 d일 EEEE', { locale: ko })
        : ''

  const headerSubtitle =
    tab === 'log'
      ? '합주 등록·삭제 기록'
      : scheduleView === 'day'
        ? '+ 버튼으로만 합주를 추가할 수 있습니다'
        : undefined

  return (
    <div className="mobile-shell">
      <div className="app-atmosphere" aria-hidden="true" />

      <MobileHeader
        title={headerTitle}
        subtitle={headerSubtitle}
        member={member}
        busy={busy}
        compact={isMonthHome}
        showBack={tab === 'schedule' && scheduleView === 'day'}
        onBack={() => onScheduleViewChange('month')}
        onRefresh={() => void onRefresh()}
        onLogout={onLogout}
      />

      {error ? <p className="banner-error mobile-banner">{error}</p> : null}
      {busy ? <p className="banner-busy mobile-banner">동기화 중…</p> : null}

      <main
        className={[
          'mobile-main',
          isMonthHome ? 'mobile-main--month' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {tab === 'schedule' ? (
          scheduleView === 'month' ? (
            <CalendarBoard
              month={month}
              rehearsals={data.rehearsals}
              variant="mobile"
              onMonthChange={onMonthChange}
              onSelectDate={openDay}
            />
          ) : (
            <DayTimeline
              date={selectedDate}
              rehearsals={data.rehearsals}
              onDateChange={onSelectDate}
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
