import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { useEffect, useState } from 'react'
import { ActivityPanel } from '../ActivityPanel'
import { CalendarBoard } from '../CalendarBoard'
import { ProfilePage } from '../ProfilePage'
import { SongListBoard } from '../SongListBoard'
import { SongRequestBoard } from '../SongRequestBoard'
import type {
  AppData,
  InstrumentSession,
  Member,
  MemberProfile,
  Rehearsal,
  Session,
  Song,
  SongDraft,
  SongRequest,
  SongRequestSlot,
} from '../../types'
import { DayTimeline } from './DayTimeline'
import { MobileHeader } from './MobileHeader'
import { MobileTabBar } from './MobileTabBar'

type ScheduleView = 'month' | 'day'
type MobileTab = 'schedule' | 'songs' | 'requests' | 'profile' | 'log'
type AppPage = 'calendar' | 'songs' | 'requests' | 'profile'

type Props = {
  member: Member
  profile: MemberProfile
  data: AppData
  songs: Song[]
  songRequests: SongRequest[]
  profiles: MemberProfile[]
  busy: boolean
  error: string
  month: Date
  selectedDate: Date
  scheduleView: ScheduleView
  page: AppPage
  onPageChange: (page: AppPage) => void
  onMonthChange: (month: Date) => void
  onSelectDate: (date: Date) => void
  onScheduleViewChange: (view: ScheduleView) => void
  onRefresh: () => void
  onLogout: () => void
  onCreate: (date: Date, startTime?: string) => void
  onSelectRehearsal: (rehearsal: Rehearsal) => void
  onCreateSong: () => void
  onUpdateSong: (id: string, draft: Partial<SongDraft>) => void
  onDeleteSong: (id: string) => void
  onReorderSongs: (ids: string[]) => void
  onCreateRequest: (
    title: string,
    neededSlots: SongRequestSlot[],
    mySlots: SongRequestSlot[],
  ) => void
  onClaimRequest: (id: string, slot: SongRequestSlot) => void
  onPromoteRequest: (id: string) => void
  onDeleteRequest: (id: string) => void
  onSaveSessions: (sessions: InstrumentSession[]) => void | Promise<void>
  onChangePin: (oldPin: string, newPin: string) => void | Promise<void>
}

export function MobileApp({
  member,
  profile,
  data,
  songs,
  songRequests,
  profiles,
  busy,
  error,
  month,
  selectedDate,
  scheduleView,
  page,
  onPageChange,
  onMonthChange,
  onSelectDate,
  onScheduleViewChange,
  onRefresh,
  onLogout,
  onCreate,
  onSelectRehearsal,
  onCreateSong,
  onUpdateSong,
  onDeleteSong,
  onReorderSongs,
  onCreateRequest,
  onClaimRequest,
  onPromoteRequest,
  onDeleteRequest,
  onSaveSessions,
  onChangePin,
}: Props) {
  const [tab, setTab] = useState<MobileTab>(
    page === 'songs'
      ? 'songs'
      : page === 'requests'
        ? 'requests'
        : page === 'profile'
          ? 'profile'
          : 'schedule',
  )
  const isMonthHome = tab === 'schedule' && scheduleView === 'month'

  useEffect(() => {
    if (page === 'songs') setTab('songs')
    else if (page === 'requests') setTab('requests')
    else if (page === 'profile') setTab('profile')
    else if (tab === 'songs' || tab === 'requests' || tab === 'profile') setTab('schedule')
  }, [page])

  function handleTabChange(next: MobileTab) {
    setTab(next)
    if (next === 'songs') onPageChange('songs')
    else if (next === 'requests') onPageChange('requests')
    else if (next === 'profile') onPageChange('profile')
    else if (next === 'schedule') onPageChange('calendar')
  }

  function openDay(date: Date) {
    onSelectDate(date)
    onScheduleViewChange('day')
    setTab('schedule')
    onPageChange('calendar')
  }

  const headerTitle =
    tab === 'log'
      ? '활동 로그'
      : tab === 'songs'
        ? '곡 리스트'
        : tab === 'requests'
          ? '곡 신청'
          : tab === 'profile'
            ? '마이페이지'
            : scheduleView === 'day'
              ? format(selectedDate, 'M월 d일 EEEE', { locale: ko })
              : ''

  const headerSubtitle =
    tab === 'log'
      ? '합주 등록·삭제 기록'
      : tab === 'songs'
        ? '가수/곡 · 세션 멤버'
        : tab === 'requests'
          ? '하고 싶은 곡 신청'
          : tab === 'profile'
            ? '담당 세션 관리'
            : scheduleView === 'day'
              ? '시간표 블록을 눌러 수정·삭제 · +로 추가'
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
          tab === 'log' ? 'mobile-main--log' : '',
          tab === 'songs' ? 'mobile-main--songs' : '',
          tab === 'requests' ? 'mobile-main--requests' : '',
          tab === 'profile' ? 'mobile-main--profile' : '',
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
              onSelectRehearsal={onSelectRehearsal}
            />
          )
        ) : tab === 'songs' ? (
          <SongListBoard
            session={member as Session}
            songs={songs}
            profiles={profiles}
            busy={busy}
            onCreate={onCreateSong}
            onUpdate={onUpdateSong}
            onDelete={onDeleteSong}
            onReorder={onReorderSongs}
          />
        ) : tab === 'requests' ? (
          <SongRequestBoard
            session={member as Session}
            requests={songRequests}
            busy={busy}
            onCreate={onCreateRequest}
            onClaim={onClaimRequest}
            onPromote={onPromoteRequest}
            onDelete={onDeleteRequest}
          />
        ) : tab === 'profile' ? (
          <ProfilePage
            profile={profile}
            busy={busy}
            onSave={onSaveSessions}
            onChangePin={onChangePin}
          />
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

      <MobileTabBar active={tab} onChange={handleTabChange} />
    </div>
  )
}
