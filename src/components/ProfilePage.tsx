import { useEffect, useState } from 'react'
import {
  INSTRUMENT_SESSIONS,
  memberLabel,
  type InstrumentSession,
  type MemberProfile,
} from '../types'

type Props = {
  profile: MemberProfile
  busy?: boolean
  onSave: (sessions: InstrumentSession[]) => void | Promise<void>
}

export function ProfilePage({ profile, busy = false, onSave }: Props) {
  const [selected, setSelected] = useState<InstrumentSession[]>(profile.sessions)
  const [localError, setLocalError] = useState('')
  const [savedHint, setSavedHint] = useState(false)

  useEffect(() => {
    setSelected(profile.sessions)
  }, [profile.sessions])

  function toggle(id: InstrumentSession) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    )
    setSavedHint(false)
  }

  async function handleSave() {
    if (selected.length === 0) {
      setLocalError('세션을 하나 이상 선택해 주세요.')
      return
    }
    setLocalError('')
    await onSave(selected)
    setSavedHint(true)
  }

  return (
    <section className="profile-page">
      <header className="profile-header">
        <p className="section-kicker">My Page</p>
        <h2>마이페이지</h2>
        <p className="panel-lead">{memberLabel(profile)} · 담당 세션을 관리합니다.</p>
      </header>

      <div className="session-checks" role="group" aria-label="세션 선택">
        {INSTRUMENT_SESSIONS.map((item) => {
          const checked = selected.includes(item.id)
          return (
            <label
              key={item.id}
              className={['session-check', checked ? 'is-checked' : ''].filter(Boolean).join(' ')}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={busy}
                onChange={() => toggle(item.id)}
              />
              <span>{item.label}</span>
            </label>
          )
        })}
      </div>

      {localError ? <p className="form-error">{localError}</p> : null}
      {savedHint ? <p className="profile-saved">세션이 저장되었습니다.</p> : null}

      <button type="button" className="btn-primary" disabled={busy} onClick={() => void handleSave()}>
        {busy ? '저장 중…' : '세션 저장'}
      </button>
    </section>
  )
}
