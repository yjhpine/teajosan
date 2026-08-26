import { useEffect, useMemo, useState } from 'react'
import { format, isSameDay, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { ActivityPanel } from './components/ActivityPanel'
import { CalendarBoard } from './components/CalendarBoard'
import { LoginScreen } from './components/LoginScreen'
import { RehearsalModal } from './components/RehearsalModal'
import { supabaseConfigured } from './lib/supabase'
import {
  clearSession,
  createRehearsal,
  deleteRehearsal,
  fetchAppData,
  loadSession,
  loginMember,
  resumeSession,
  updateRehearsal,
} from './storage'
import type { AppData, Member, Rehearsal } from './types'
import { memberLabel } from './types'
import './App.css'

const emptyData = (): AppData => ({ rehearsals: [], logs: [] })

function App() {
  const [member, setMember] = useState<Member | null>(null)
  const [data, setData] = useState<AppData>(emptyData)
  const [booting, setBooting] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [month, setMonth] = useState(() => new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date())
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Rehearsal | null>(null)

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

  const selectedRehearsals = useMemo(() => {
    if (!selectedDate) return []
    const key = format(selectedDate, 'yyyy-MM-dd')
    return data.rehearsals
      .filter((item) => item.date === key)
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
  }, [data.rehearsals, selectedDate])

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
  }

  async function handleRefresh() {
    await runAction(() => fetchAppData())
  }

  function openCreate(date: Date) {
    setSelectedDate(date)
    setMonth(date)
    setEditing(null)
    setModalOpen(true)
  }

  function openEdit(rehearsal: Rehearsal) {
    setEditing(rehearsal)
    setSelectedDate(parseISO(rehearsal.date))
    setModalOpen(true)
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
          <CalendarBoard
            month={month}
            rehearsals={data.rehearsals}
            selectedDate={selectedDate}
            onMonthChange={setMonth}
            onSelectDate={(date) => {
              setSelectedDate(date)
              setMonth(date)
            }}
            onSelectRehearsal={openEdit}
          />

          <section className="day-detail">
            <header className="day-detail-header">
              <div>
                <p className="section-kicker">선택한 날</p>
                <h2>
                  {selectedDate
                    ? format(selectedDate, 'M월 d일 (EEE)', { locale: ko })
                    : '날짜를 선택하세요'}
                </h2>
              </div>
              <button
                type="button"
                className="btn-primary"
                disabled={!selectedDate || busy}
                onClick={() => selectedDate && openCreate(selectedDate)}
              >
                합주 잡기
              </button>
            </header>

            {selectedRehearsals.length === 0 ? (
              <p className="empty-state">이 날 등록된 합주가 없습니다.</p>
            ) : (
              <ul className="rehearsal-list">
                {selectedRehearsals.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className="rehearsal-card"
                      onClick={() => openEdit(item)}
                    >
                      <div className="rehearsal-time">
                        {item.startTime} – {item.endTime}
                      </div>
                      <div className="rehearsal-body">
                        <strong>{item.place || '장소 미정'}</strong>
                        {item.note ? <p>{item.note}</p> : null}
                        <span className="rehearsal-by">
                          {memberLabel(item.createdBy)}
                          {item.updatedBy
                            ? ` · 수정 ${memberLabel(item.updatedBy)}`
                            : ''}
                        </span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <ActivityPanel logs={data.logs} />
      </main>

      <RehearsalModal
        open={modalOpen}
        member={member}
        initialDate={selectedDate ?? new Date()}
        editing={editing}
        busy={busy}
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
            if (!editing) {
              setSelectedDate(parseISO(draft.date))
              if (!selectedDate || !isSameDay(selectedDate, parseISO(draft.date))) {
                setMonth(parseISO(draft.date))
              }
            }
            setModalOpen(false)
            setEditing(null)
          })()
        }}
        onDelete={
          editing
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
    </div>
  )
}

export default App
