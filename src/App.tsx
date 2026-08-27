import { useEffect, useState } from 'react'
import { isSameDay, parseISO } from 'date-fns'
import { ActivityPanel } from './components/ActivityPanel'
import { CalendarBoard } from './components/CalendarBoard'
import { LoginScreen } from './components/LoginScreen'
import { MobileApp } from './components/mobile/MobileApp'
import { RehearsalModal } from './components/RehearsalModal'
import { WeekTimetable } from './components/WeekTimetable'
import { useMediaQuery } from './hooks/useMediaQuery'
import { supabaseConfigured } from './lib/supabase'
import {
  clearSession,
  createRehearsal,
  deleteRehearsal,
  fetchAppData,
  loadSession,
  loginMember,
  resumeSession,
  subscribeAppDataChanges,
  updateRehearsal,
} from './storage'
import type { AppData, Member, Rehearsal } from './types'
import { isSameMember, memberLabel } from './types'
import './App.css'

const emptyData = (): AppData => ({ rehearsals: [], logs: [] })

function App() {
  const isMobile = useMediaQuery('(max-width: 768px)')
  const [member, setMember] = useState<Member | null>(null)
  const [data, setData] = useState<AppData>(emptyData)
  const [booting, setBooting] = useState(true)
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

      const saved = loadSession()
      if (!saved) {
        setBooting(false)
        return
      }

      try {
        const next = await resumeSession(saved)
        if (cancelled) return
        setMember(saved)
        setData(next)
      } catch (err) {
        if (cancelled) return
        console.error(err)
        setError('자동 로그인에 실패했습니다. 다시 로그인해 주세요.')
        clearSession()
      } finally {
        if (!cancelled) setBooting(false)
      }
    }

    void boot()
    return () => {
      cancelled = true
    }
  }, [])

  // Realtime + 탭 복귀 시 자동 동기화 (수동 새로고침 불필요)
  useEffect(() => {
    if (!member || !supabaseConfigured) return

    let cancelled = false
    let debounceTimer: ReturnType<typeof setTimeout> | undefined

    const silentRefresh = () => {
      window.clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        void (async () => {
          try {
            const next = await fetchAppData()
            if (!cancelled) setData(next)
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

  async function runAction(action: () => Promise<AppData>) {
    setBusy(true)
    setError('')
    try {
      const next = await action()
      setData(next)
      return true
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : '요청에 실패했습니다.')
      return false
    } finally {
      setBusy(false)
    }
  }

  async function handleLogin(next: Member) {
    const ok = await runAction(() => loginMember(next))
    if (ok) setMember(next)
  }

  function handleLogout() {
    clearSession()
    setMember(null)
    setData(emptyData)
    setViewMode('month')
  }

  async function handleRefresh() {
    await runAction(() => fetchAppData())
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

  if (!member) {
    return (
      <LoginScreen
        onLogin={handleLogin}
        busy={busy}
        error={error}
      />
    )
  }

  const modal = (
    <RehearsalModal
      open={modalOpen}
      member={member}
      rehearsals={data.rehearsals}
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

  if (isMobile) {
    return (
      <>
        <MobileApp
          member={member}
          data={data}
          busy={busy}
          error={error}
          month={month}
          selectedDate={selectedDate}
          scheduleView={viewMode === 'day' ? 'day' : 'month'}
          onMonthChange={setMonth}
          onSelectDate={setSelectedDate}
          onScheduleViewChange={(next) => setViewMode(next === 'day' ? 'day' : 'month')}
          onRefresh={handleRefresh}
          onLogout={handleLogout}
          onCreate={openCreate}
          onSelectRehearsal={openEdit}
        />
        {modal}
      </>
    )
  }

  return (
    <div className="app-shell">
      <div className="app-atmosphere" aria-hidden="true" />

      <header className="topbar">
        <div className="brand-block">
          <p className="section-kicker">School Band</p>
          <h1 className="brand-mark brand-mark--header">태조산</h1>
        </div>
        <div className="topbar-actions">
          <span className="member-pill">{memberLabel(member)}</span>
          <button type="button" className="btn-ghost" onClick={() => void handleRefresh()} disabled={busy}>
            새로고침
          </button>
          <button type="button" className="btn-ghost" onClick={handleLogout}>
            나가기
          </button>
        </div>
      </header>

      {error ? <p className="banner-error">{error}</p> : null}
      {busy ? <p className="banner-busy">동기화 중…</p> : null}

      <main className="layout">
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

        <ActivityPanel logs={data.logs} />
      </main>

      {modal}
    </div>
  )
}

export default App
