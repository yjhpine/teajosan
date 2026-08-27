import { useState } from 'react'
import {
  INSTRUMENT_SESSIONS,
  memberLabel,
  type InstrumentSession,
  type Member,
} from '../types'

type Props = {
  member: Member
  busy?: boolean
  error?: string
  onSave: (sessions: InstrumentSession[]) => void | Promise<void>
}

export function SessionSetupScreen({ member, busy = false, error = '', onSave }: Props) {
  const [selected, setSelected] = useState<InstrumentSession[]>([])
  const [localError, setLocalError] = useState('')

  function toggle(id: InstrumentSession) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    )
  }

  function handleSubmit() {
    if (selected.length === 0) {
      setLocalError('세션을 하나 이상 선택해 주세요.')
      return
    }
    setLocalError('')
    void onSave(selected)
  }

  const shownError = localError || error

  return (
    <div className="login-shell">
      <div className="login-atmosphere" aria-hidden="true" />
      <section className="login-panel">
        <p className="login-kicker">Session Setup</p>
        <h1 className="brand-mark brand-mark--header">세션 선택</h1>
        <p className="login-lead">
          {memberLabel(member)}님, 담당 세션을 골라 주세요. 여러 개 선택할 수 있고 나중에
          마이페이지에서 바꿀 수 있습니다.
        </p>

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

        {shownError ? <p className="form-error">{shownError}</p> : null}

        <button type="button" className="btn-primary" disabled={busy} onClick={handleSubmit}>
          {busy ? '저장 중…' : '시작하기'}
        </button>
      </section>
    </div>
  )
}
