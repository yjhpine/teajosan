import { useState, type FormEvent } from 'react'
import type { Member } from '../types'

type Props = {
  onLogin: (member: Member) => void | Promise<void>
  busy?: boolean
  error?: string
}

export function LoginScreen({ onLogin, busy = false, error = '' }: Props) {
  const [cohort, setCohort] = useState('')
  const [name, setName] = useState('')
  const [localError, setLocalError] = useState('')

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const nextCohort = cohort.trim()
    const nextName = name.trim()
    if (!nextCohort || !nextName) {
      setLocalError('기수와 이름을 모두 입력해 주세요.')
      return
    }
    if (!/^\d+$/.test(nextCohort)) {
      setLocalError('기수는 숫자로 입력해 주세요. 예: 12')
      return
    }
    setLocalError('')
    void onLogin({ cohort: nextCohort, name: nextName })
  }

  const shownError = localError || error

  return (
    <div className="login-shell">
      <div className="login-atmosphere" aria-hidden="true" />
      <section className="login-panel">
        <p className="login-kicker">School Band Calendar</p>
        <h1 className="brand-mark">태조산</h1>
        <p className="login-lead">
          합주 일정을 한곳에서 잡고, 누가 올렸는지 로그로 남깁니다. 한 번 로그인하면
          이 기기에서는 다시 묻지 않습니다.
        </p>

        <form className="login-form" onSubmit={handleSubmit}>
          <label className="field">
            <span>기수</span>
            <input
              inputMode="numeric"
              placeholder="예: 12"
              value={cohort}
              onChange={(e) => setCohort(e.target.value)}
              autoFocus
              disabled={busy}
            />
          </label>
          <label className="field">
            <span>이름</span>
            <input
              placeholder="예: 김태조"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
            />
          </label>
          {shownError ? <p className="form-error">{shownError}</p> : null}
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? '입장 중…' : '입장하기'}
          </button>
        </form>
      </section>
    </div>
  )
}
