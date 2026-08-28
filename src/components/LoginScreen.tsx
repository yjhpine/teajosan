import { useState, type FormEvent } from 'react'
import {
  INSTRUMENT_SESSIONS,
  type InstrumentSession,
  type Member,
} from '../types'

type Props = {
  onLogin: (name: string, pin: string) => void | Promise<void>
  onSignup: (
    member: Member,
    pin: string,
    sessions: InstrumentSession[],
  ) => void | Promise<void>
  busy?: boolean
  error?: string
  maintenanceMode?: boolean
}

type Mode = 'login' | 'signup'

export function LoginScreen({
  onLogin,
  onSignup,
  busy = false,
  error = '',
  maintenanceMode = false,
}: Props) {
  const [mode, setMode] = useState<Mode>('login')
  const [cohort, setCohort] = useState('')
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [pinConfirm, setPinConfirm] = useState('')
  const [sessions, setSessions] = useState<InstrumentSession[]>([])
  const [localError, setLocalError] = useState('')

  function switchMode(next: Mode) {
    setMode(next)
    setLocalError('')
    setPin('')
    setPinConfirm('')
  }

  function toggleSession(id: InstrumentSession) {
    setSessions((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    )
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const nextName = name.trim()
    const nextPin = pin.trim()

    if (!nextName || !nextPin) {
      setLocalError(mode === 'login' ? '이름과 PIN을 입력해 주세요.' : '필수 항목을 모두 입력해 주세요.')
      return
    }
    if (nextPin.length < 4) {
      setLocalError('PIN은 4자 이상 입력해 주세요.')
      return
    }

    if (mode === 'login') {
      setLocalError('')
      void onLogin(nextName, nextPin)
      return
    }

    const nextCohort = cohort.trim()
    if (!nextCohort) {
      setLocalError('기수를 입력해 주세요.')
      return
    }
    if (!/^\d+$/.test(nextCohort)) {
      setLocalError('기수는 숫자로 입력해 주세요. 예: 12')
      return
    }
    if (nextPin !== pinConfirm.trim()) {
      setLocalError('PIN 확인이 일치하지 않습니다.')
      return
    }
    if (sessions.length === 0) {
      setLocalError('세션을 하나 이상 선택해 주세요.')
      return
    }

    setLocalError('')
    void onSignup({ cohort: nextCohort, name: nextName }, nextPin, sessions)
  }

  const shownError = localError || error

  return (
    <div className="login-shell">
      <div className="login-atmosphere" aria-hidden="true" />
      <section className="login-panel">
        <p className="login-kicker">School Band Calendar</p>
        <h1 className="brand-mark">태조산</h1>

        {maintenanceMode ? (
          <p className="login-lead maintenance-login-notice">점검 중입니다. 관리자만 로그인할 수 있습니다.</p>
        ) : null}

        <div className="auth-tabs" role="tablist" aria-label="인증">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'login'}
            className={['auth-tab', mode === 'login' ? 'is-active' : ''].filter(Boolean).join(' ')}
            onClick={() => switchMode('login')}
            disabled={busy}
          >
            로그인
          </button>
          {!maintenanceMode ? (
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'signup'}
              className={['auth-tab', mode === 'signup' ? 'is-active' : ''].filter(Boolean).join(' ')}
              onClick={() => switchMode('signup')}
              disabled={busy}
            >
              가입
            </button>
          ) : null}
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          {mode === 'signup' ? (
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
          ) : null}

          <label className="field">
            <span>이름</span>
            <input
              placeholder="예: 김태조"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus={mode === 'login'}
              disabled={busy}
            />
          </label>

          <label className="field">
            <span>PIN</span>
            <input
              type="password"
              inputMode="numeric"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              placeholder="개인 PIN (4자 이상)"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              disabled={busy}
            />
          </label>

          {mode === 'signup' ? (
            <>
              <label className="field">
                <span>PIN 확인</span>
                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  placeholder="PIN 다시 입력"
                  value={pinConfirm}
                  onChange={(e) => setPinConfirm(e.target.value)}
                  disabled={busy}
                />
              </label>

              <div className="session-checks" role="group" aria-label="세션 선택">
                {INSTRUMENT_SESSIONS.map((item) => {
                  const checked = sessions.includes(item.id)
                  return (
                    <label
                      key={item.id}
                      className={['session-check', checked ? 'is-checked' : '']
                        .filter(Boolean)
                        .join(' ')}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={busy}
                        onChange={() => toggleSession(item.id)}
                      />
                      <span>{item.label}</span>
                    </label>
                  )
                })}
              </div>
            </>
          ) : null}

          {shownError ? <p className="form-error">{shownError}</p> : null}
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? '처리 중…' : mode === 'login' ? '입장하기' : '가입하고 시작하기'}
          </button>
        </form>
      </section>
    </div>
  )
}
