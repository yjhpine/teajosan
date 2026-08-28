import { useEffect, useState } from 'react'
import { isSameDay, parseISO } from 'date-fns'
import { CalendarBoard } from './components/CalendarBoard'
import { LoginScreen } from './components/LoginScreen'
import { MaintenanceScreen } from './components/MaintenanceScreen'
import { MobileApp } from './components/mobile/MobileApp'
import { PerformanceBoard } from './components/PerformanceBoard'
import { ProfilePage } from './components/ProfilePage'
import { RehearsalModal } from './components/RehearsalModal'
import { SessionSetupScreen } from './components/SessionSetupScreen'
import { SongListBoard } from './components/SongListBoard'
import { SongRequestBoard } from './components/SongRequestBoard'
import { WeekTimetable } from './components/WeekTimetable'
import { useMediaQuery } from './hooks/useMediaQuery'
import { supabaseConfigured } from './lib/supabase'
import {
  clearSession,
  createPerformance,
  createRehearsal,
  createSong,
  createSongRequest,
  claimSongRequestSlot,
  deletePerformance,
  deleteRehearsal,
  deleteSong,
  deleteSongRequest,
  fetchAppData,
  fetchAppStatus,
  fetchMemberProfiles,
  fetchPerformances,
  fetchSongRequests,
  fetchSongs,
  getMyProfile,
  loadSession,
  loginMember,
  resumeSession,
  setMySessions,
  changeMyPin,
  signupMember,
  subscribeAppDataChanges,
  subscribeAppStatusChanges,
  updatePerformance,
  updateRehearsal,
  updateSong,
} from './storage'
import type {
  AppData,
  InstrumentSession,
  Member,
  MemberProfile,
  Performance,
  Rehearsal,
  Session,
  Song,
  SongDraft,
  SongRequest,
} from './types'
import { isSameMember, memberLabel } from './types'
import './App.css'

const emptyData = (): AppData => ({ rehearsals: [], logs: [] })

function messageFromError(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

function isMaintenanceMessage(message: string): boolean {
  return message.includes('점검')
}

type AppPage = 'calendar' | 'songs' | 'requests' | 'performances' | 'profile'

async function loadExtras(session: Session) {
  const [nextSongs, nextProfiles, nextProfile, nextRequests, nextPerformances] = await Promise.all([
    fetchSongs(),
    fetchMemberProfiles(),
    getMyProfile(session),
    fetchSongRequests(),
    fetchPerformances(),
  ])
  return { nextSongs, nextProfiles, nextProfile, nextRequests, nextPerformances }
}

function App() {
  const isMobile = useMediaQuery('(max-width: 768px)')
  const [member, setMember] = useState<Session | null>(null)
  const [profile, setProfile] = useState<MemberProfile | null>(null)
  const [data, setData] = useState<AppData>(emptyData)
  const [songs, setSongs] = useState<Song[]>([])
  const [songRequests, setSongRequests] = useState<SongRequest[]>([])
  const [performances, setPerformances] = useState<Performance[]>([])
  const [profiles, setProfiles] = useState<MemberProfile[]>([])
  const [page, setPage] = useState<AppPage>('calendar')
  const [booting, setBooting] = useState(true)
  const [maintenanceEnabled, setMaintenanceEnabled] = useState(false)
  const [maintenanceMessage, setMaintenanceMessage] = useState('')
  const [adminLoginMode, setAdminLoginMode] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [month, setMonth] = useState(() => new Date())
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date())
  const [viewMode, setViewMode] = useState<'month' | 'week' | 'day'>('month')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Rehearsal | null>(null)
  const [createStartTime, setCreateStartTime] = useState('19:00')

  useEffect(() => {
    if (!isMobile && viewMode === 'day') {
      setViewMode('week')
    }
    if (isMobile && viewMode === 'week') {
      setViewMode('day')
    }
  }, [isMobile, viewMode])

  useEffect(() => {
    let cancelled = false

    async function boot() {
      if (!supabaseConfigured) {
        setError('서버 연결 정보가 없습니다. 배포/환경변수를 확인해 주세요.')
        setBooting(false)
        return
      }

      try {
        const status = await fetchAppStatus()
        if (cancelled) return
        setMaintenanceEnabled(status.maintenanceEnabled)
        setMaintenanceMessage(status.maintenanceMessage)

        const saved = loadSession()
        if (!saved) {
          setBooting(false)
          return
        }

        const next = await resumeSession(saved)
        if (cancelled) return
        const extras = await loadExtras(saved)
        if (cancelled) return

        if (status.maintenanceEnabled && !extras.nextProfile.isAdmin) {
          await clearSession()
          setBooting(false)
          return
        }

        setMember({ ...saved, sessions: extras.nextProfile.sessions, isAdmin: extras.nextProfile.isAdmin })
        setData(next)
        setSongs(extras.nextSongs)
        setProfiles(extras.nextProfiles)
        setProfile(extras.nextProfile)
        setSongRequests(extras.nextRequests)
        setPerformances(extras.nextPerformances)
      } catch (err) {
        if (cancelled) return
        console.error(err)
        const message = err instanceof Error ? err.message : '세션이 만료되었습니다. 다시 로그인해 주세요.'
        if (message.includes('점검')) {
          setMaintenanceEnabled(true)
          setMaintenanceMessage(message)
        } else {
          setError(message)
          void clearSession()
        }
      } finally {
        if (!cancelled) setBooting(false)
      }
    }

    void boot()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!supabaseConfigured) return

    let cancelled = false

    return subscribeAppStatusChanges(() => {
      void (async () => {
        try {
          const status = await fetchAppStatus()
          if (cancelled) return
          setMaintenanceEnabled(status.maintenanceEnabled)
          setMaintenanceMessage(status.maintenanceMessage)

          if (!status.maintenanceEnabled) {
            setAdminLoginMode(false)
            return
          }

          const saved = loadSession()
          if (!saved) return

          const profile = await getMyProfile(saved)
          if (cancelled) return
          if (profile.isAdmin) return

          setMember(null)
          setProfile(null)
          setData(emptyData())
          setSongs([])
          setSongRequests([])
          setPerformances([])
          setProfiles([])
          setError('')
          setAdminLoginMode(false)
          await clearSession()
        } catch (err) {
          console.error(err)
        }
      })()
    })
  }, [])

  useEffect(() => {
    if (!member || !supabaseConfigured) return

    let cancelled = false
    let debounceTimer: ReturnType<typeof setTimeout> | undefined

    const silentRefresh = () => {
      window.clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        void (async () => {
          try {
            const [nextData, nextSongs, nextProfiles, nextProfile, nextRequests, nextPerformances] =
              await Promise.all([
                fetchAppData(),
                fetchSongs(),
                fetchMemberProfiles(),
                getMyProfile(member),
                fetchSongRequests(),
                fetchPerformances(),
              ])
            if (!cancelled) {
              setData(nextData)
              setSongs(nextSongs)
              setProfiles(nextProfiles)
              setProfile(nextProfile)
              setSongRequests(nextRequests)
              setPerformances(nextPerformances)
              setMember((prev) =>
                prev ? { ...prev, sessions: nextProfile.sessions } : prev,
              )
            }
          } catch (err) {
            console.error(err)
          }
        })()
      }, 400)
    }

    const unsubscribe = subscribeAppDataChanges(silentRefresh)

    const onVisible = () => {
      if (document.visibilityState === 'visible') silentRefresh()
    }
    window.addEventListener('focus', silentRefresh)
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      window.clearTimeout(debounceTimer)
      unsubscribe()
      window.removeEventListener('focus', silentRefresh)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [member])

  async function enterMaintenance(message: string) {
    if (profile?.isAdmin || member?.isAdmin) return
    setMaintenanceEnabled(true)
    setMaintenanceMessage(message)
    setMember(null)
    setProfile(null)
    setData(emptyData())
    setSongs([])
    setSongRequests([])
    setPerformances([])
    setProfiles([])
    setError('')
    await clearSession()
  }

  async function handleActionError(err: unknown, fallback: string): Promise<boolean> {
    console.error(err)
    const message = messageFromError(err, fallback)
    if (isMaintenanceMessage(message)) {
      await enterMaintenance(message)
      return true
    }
    setError(message)
    return false
  }

  async function runAction(action: () => Promise<AppData>) {
    setBusy(true)
    setError('')
    try {
      const next = await action()
      setData(next)
      return true
    } catch (err) {
      await handleActionError(err, '요청에 실패했습니다.')
      return false
    } finally {
      setBusy(false)
    }
  }

  async function runSongAction(action: () => Promise<Song[]>) {
    setBusy(true)
    setError('')
    try {
      const next = await action()
      setSongs(next)
      // 곡 삭제 시 이관된 신청도 같이 지워질 수 있어 목록 갱신
      setSongRequests(await fetchSongRequests())
      return true
    } catch (err) {
      await handleActionError(err, '요청에 실패했습니다.')
      return false
    } finally {
      setBusy(false)
    }
  }

  async function runRequestAction(action: () => Promise<SongRequest[]>) {
    setBusy(true)
    setError('')
    try {
      const next = await action()
      setSongRequests(next)
      // 팀 완성 자동 이관 시 곡 리스트도 갱신
      setSongs(await fetchSongs())
      return true
    } catch (err) {
      await handleActionError(err, '요청에 실패했습니다.')
      return false
    } finally {
      setBusy(false)
    }
  }

  async function runPerformanceAction(action: () => Promise<Performance[]>) {
    setBusy(true)
    setError('')
    try {
      setPerformances(await action())
      return true
    } catch (err) {
      await handleActionError(err, '공연 저장에 실패했습니다.')
      return false
    } finally {
      setBusy(false)
    }
  }

  function applyExtras(extras: Awaited<ReturnType<typeof loadExtras>>, saved: Session) {
    setSongs(extras.nextSongs)
    setProfiles(extras.nextProfiles)
    setProfile(extras.nextProfile)
    setSongRequests(extras.nextRequests)
    setPerformances(extras.nextPerformances)
    setMember({ ...saved, sessions: extras.nextProfile.sessions, isAdmin: extras.nextProfile.isAdmin })
  }

  async function handleLogin(name: string, pin: string) {
    const ok = await runAction(() => loginMember(name, pin))
    if (!ok) return
    const saved = loadSession()
    if (!saved) return
    setAdminLoginMode(false)
    setMember(saved)
    try {
      applyExtras(await loadExtras(saved), saved)
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : '프로필을 불러오지 못했습니다.')
    }
  }

  async function handleSignup(next: Member, pin: string, sessions: InstrumentSession[]) {
    const ok = await runAction(() => signupMember(next, pin, sessions))
    if (!ok) return
    const saved = loadSession()
    if (!saved) return
    setMember({ ...saved, sessions })
    setProfile({ cohort: next.cohort, name: next.name, sessions })
    try {
      applyExtras(await loadExtras(saved), saved)
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : '프로필을 불러오지 못했습니다.')
    }
  }

  async function handleSaveSessions(sessions: InstrumentSession[]) {
    if (!member) return
    setBusy(true)
    setError('')
    try {
      const nextProfile = await setMySessions(member, sessions)
      setProfile({ ...nextProfile, isAdmin: profile?.isAdmin ?? member.isAdmin })
      setMember({ ...member, sessions: nextProfile.sessions })
      const nextProfiles = await fetchMemberProfiles()
      setProfiles(nextProfiles)
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : '세션 저장에 실패했습니다.')
    } finally {
      setBusy(false)
    }
  }

  async function handleChangePin(oldPin: string, newPin: string) {
    if (!member) return
    await changeMyPin(member, oldPin, newPin)
  }

  async function handleLogout() {
    await clearSession()
    setMember(null)
    setProfile(null)
    setData(emptyData)
    setSongs([])
    setSongRequests([])
    setPerformances([])
    setProfiles([])
    setPage('calendar')
    setViewMode('month')
  }

  async function handleRefresh() {
    if (!member) return
    await runAction(() => fetchAppData())
    try {
      applyExtras(await loadExtras(member), member)
    } catch (err) {
      console.error(err)
    }
  }

  function openCreate(date: Date, startTime = '19:00') {
    setSelectedDate(date)
    setMonth(date)
    setCreateStartTime(startTime)
    setEditing(null)
    setModalOpen(true)
  }

  function openEdit(rehearsal: Rehearsal) {
    const date = parseISO(rehearsal.date)
    setEditing(rehearsal)
    setSelectedDate(date)
    setMonth(date)
    setViewMode(isMobile ? 'day' : 'week')
    setModalOpen(true)
  }

  function openScheduleDetail(date: Date) {
    setSelectedDate(date)
    setMonth(date)
    setViewMode(isMobile ? 'day' : 'week')
  }

  const isAdminUser = Boolean(profile?.isAdmin ?? member?.isAdmin)
  const showMaintenanceGate = maintenanceEnabled && !isAdminUser

  if (booting) {
    return (
      <div className="login-shell">
        <div className="login-atmosphere" aria-hidden="true" />
        <section className="login-panel">
          <p className="login-kicker">School Band Calendar</p>
          <h1 className="brand-mark">태조산</h1>
          <p className="login-lead">기기 정보를 확인하고 있습니다…</p>
        </section>
      </div>
    )
  }

  if (showMaintenanceGate && !member) {
    if (adminLoginMode) {
      return (
        <LoginScreen
          onLogin={handleLogin}
          onSignup={handleSignup}
          busy={busy}
          error={error}
          maintenanceMode
        />
      )
    }

    return (
      <MaintenanceScreen
        message={maintenanceMessage}
        onAdminLogin={() => {
          setAdminLoginMode(true)
          setError('')
        }}
      />
    )
  }

  if (!supabaseConfigured) {
    return (
      <div className="login-shell">
        <div className="login-atmosphere" aria-hidden="true" />
        <section className="login-panel">
          <p className="login-kicker">School Band Calendar</p>
          <h1 className="brand-mark">태조산</h1>
          <p className="login-lead">{error || '서버 연결 정보가 없습니다. 배포/환경변수를 확인해 주세요.'}</p>
        </section>
      </div>
    )
  }

  if (!member) {
    return (
      <LoginScreen
        onLogin={handleLogin}
        onSignup={handleSignup}
        busy={busy}
        error={error}
      />
    )
  }

  if (!profile || profile.sessions.length === 0) {
    return (
      <SessionSetupScreen
        member={member}
        busy={busy}
        error={error}
        onSave={handleSaveSessions}
      />
    )
  }

  const songBoard = (
    <SongListBoard
      session={member}
      songs={songs}
      profiles={profiles}
      busy={busy}
      onCreate={(draft) => void runSongAction(() => createSong(member, draft))}
      onUpdate={(id, draft: Partial<SongDraft>) =>
        void runSongAction(() => updateSong(member, id, draft))
      }
      onDelete={(id) => void runSongAction(() => deleteSong(member, id))}
    />
  )

  const modal = (
    <RehearsalModal
      open={modalOpen}
      member={member}
      rehearsals={data.rehearsals}
      songs={songs}
      initialDate={selectedDate}
      initialStartTime={createStartTime}
      editing={editing}
      busy={busy}
      mobile={isMobile}
      onClose={() => {
        setModalOpen(false)
        setEditing(null)
      }}
      onSave={(draft) => {
        void (async () => {
          const ok = await runAction(() =>
            editing
              ? updateRehearsal(member, editing.id, draft)
              : createRehearsal(member, draft),
          )
          if (!ok) return
          const nextDate = parseISO(draft.date)
          setSelectedDate(nextDate)
          setMonth(nextDate)
          if (!editing && (!selectedDate || !isSameDay(selectedDate, nextDate))) {
            setViewMode(isMobile ? 'day' : 'week')
          }
          setModalOpen(false)
          setEditing(null)
        })()
      }}
      onDelete={
        editing && isSameMember(member, editing.createdBy)
          ? () => {
              if (!window.confirm('이 합주 일정을 삭제할까요?')) return
              void (async () => {
                const ok = await runAction(() => deleteRehearsal(member, editing.id))
                if (!ok) return
                setModalOpen(false)
                setEditing(null)
              })()
            }
          : undefined
      }
    />
  )

  const maintenanceBanner = maintenanceEnabled && isAdminUser ? (
    <p className="banner-maintenance-admin">점검 모드 — 관리자로 접속 중입니다.</p>
  ) : null

  if (isMobile) {
    return (
      <>
        {maintenanceBanner}
        <MobileApp
          member={member}
          profile={profile}
          data={data}
          songs={songs}
          songRequests={songRequests}
          performances={performances}
          profiles={profiles}
          busy={busy}
          error={error}
          month={month}
          selectedDate={selectedDate}
          scheduleView={viewMode === 'day' ? 'day' : 'month'}
          page={page}
          onPageChange={setPage}
          onMonthChange={setMonth}
          onSelectDate={setSelectedDate}
          onScheduleViewChange={(next) => setViewMode(next === 'day' ? 'day' : 'month')}
          onRefresh={handleRefresh}
          onLogout={handleLogout}
          onCreate={openCreate}
          onSelectRehearsal={openEdit}
          onUpdateSong={(id, draft) => void runSongAction(() => updateSong(member, id, draft))}
          onCreateSong={(draft) => void runSongAction(() => createSong(member, draft))}
          onDeleteSong={(id) => void runSongAction(() => deleteSong(member, id))}
          onCreateRequest={(title, needed, mine, youtubeUrl) =>
            void runRequestAction(() =>
              createSongRequest(member, title, needed, mine, youtubeUrl),
            )
          }
          onClaimRequest={(id, slot) =>
            void runRequestAction(() => claimSongRequestSlot(member, id, slot))
          }
          onDeleteRequest={(id) => void runRequestAction(() => deleteSongRequest(member, id))}
          onCreatePerformance={(draft) =>
            void runPerformanceAction(() => createPerformance(member, draft))
          }
          onUpdatePerformance={(id, draft) =>
            void runPerformanceAction(() => updatePerformance(member, id, draft))
          }
          onDeletePerformance={(id) =>
            void runPerformanceAction(() => deletePerformance(member, id))
          }
          onSaveSessions={handleSaveSessions}
          onChangePin={handleChangePin}
        />
        {modal}
      </>
    )
  }

  return (
    <div className="app-shell">
      <div className="app-atmosphere" aria-hidden="true" />

      {maintenanceBanner}

      <header className="topbar">
        <div className="brand-block">
          <p className="section-kicker">School Band</p>
          <h1 className="brand-mark brand-mark--header">태조산</h1>
        </div>
        <div className="topbar-actions">
          <nav className="page-tabs" aria-label="페이지">
            <button
              type="button"
              className={['page-tab', page === 'calendar' ? 'is-active' : ''].filter(Boolean).join(' ')}
              onClick={() => setPage('calendar')}
            >
              일정
            </button>
            <button
              type="button"
              className={['page-tab', page === 'songs' ? 'is-active' : ''].filter(Boolean).join(' ')}
              onClick={() => setPage('songs')}
            >
              곡 리스트
            </button>
            <button
              type="button"
              className={['page-tab', page === 'requests' ? 'is-active' : ''].filter(Boolean).join(' ')}
              onClick={() => setPage('requests')}
            >
              곡 신청
            </button>
            <button
              type="button"
              className={['page-tab', page === 'performances' ? 'is-active' : ''].filter(Boolean).join(' ')}
              onClick={() => setPage('performances')}
            >
              공연
            </button>
            <button
              type="button"
              className={['page-tab', page === 'profile' ? 'is-active' : ''].filter(Boolean).join(' ')}
              onClick={() => setPage('profile')}
            >
              마이
            </button>
          </nav>
          <span className="member-pill">{memberLabel(member)}</span>
          <button type="button" className="btn-ghost" onClick={() => void handleRefresh()} disabled={busy}>
            새로고침
          </button>
          <button type="button" className="btn-ghost" onClick={() => void handleLogout()}>
            나가기
          </button>
        </div>
      </header>

      {error ? <p className="banner-error">{error}</p> : null}
      {busy ? <p className="banner-busy">동기화 중…</p> : null}

      {page === 'songs' ? (
        <main className="layout layout--songs">{songBoard}</main>
      ) : page === 'requests' ? (
        <main className="layout layout--songs">
          <SongRequestBoard
            session={member}
            requests={songRequests}
            busy={busy}
            onCreate={(title, needed, mine, youtubeUrl) =>
              void runRequestAction(() =>
                createSongRequest(member, title, needed, mine, youtubeUrl),
              )
            }
            onClaim={(id, slot) =>
              void runRequestAction(() => claimSongRequestSlot(member, id, slot))
            }
            onDelete={(id) => void runRequestAction(() => deleteSongRequest(member, id))}
          />
        </main>
      ) : page === 'profile' ? (
        <main className="layout layout--songs">
          <ProfilePage
            profile={profile}
            busy={busy}
            onSave={handleSaveSessions}
            onChangePin={handleChangePin}
          />
        </main>
      ) : page === 'performances' ? (
        <main className="layout layout--songs">
          <PerformanceBoard
            session={member}
            performances={performances}
            songs={songs}
            busy={busy}
            onCreate={(draft) => void runPerformanceAction(() => createPerformance(member, draft))}
            onUpdate={(id, draft) =>
              void runPerformanceAction(() => updatePerformance(member, id, draft))
            }
            onDelete={(id) => void runPerformanceAction(() => deletePerformance(member, id))}
          />
        </main>
      ) : (
        <main className="layout layout--calendar-only">
          <div className="main-column">
            {viewMode === 'month' ? (
              <CalendarBoard
                month={month}
                rehearsals={data.rehearsals}
                onMonthChange={setMonth}
                onSelectDate={openScheduleDetail}
                onSelectRehearsal={openEdit}
              />
            ) : (
              <WeekTimetable
                anchorDate={selectedDate}
                rehearsals={data.rehearsals}
                onBackToMonth={() => setViewMode('month')}
                onCreate={openCreate}
                onSelectRehearsal={openEdit}
              />
            )}
          </div>
        </main>
      )}

      {modal}
    </div>
  )
}

export default App
