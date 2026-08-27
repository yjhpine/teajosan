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
  onChangePin: (oldPin: string, newPin: string) => void | Promise<void>
}

export function ProfilePage({ profile, busy = false, onSave, onChangePin }: Props) {
  const [selected, setSelected] = useState<InstrumentSession[]>(profile.sessions)
  const [localError, setLocalError] = useState('')
  const [savedHint, setSavedHint] = useState(false)
  const [pinError, setPinError] = useState('')
  const [pinHint, setPinHint] = useState(false)
  const [oldPin, setOldPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [newPinConfirm, setNewPinConfirm] = useState('')
  const [pinBusy, setPinBusy] = useState(false)

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

  async function handleChangePin() {
    const nextOld = oldPin.trim()
    const nextNew = newPin.trim()
    if (!nextOld || !nextNew) {
      setPinError('현재 PIN과 새 PIN을 입력해 주세요.')
      return
    }
    if (nextNew.length < 4) {
      setPinError('새 PIN은 4자 이상이어야 합니다.')
      return
    }
    if (nextNew !== newPinConfirm.trim()) {
      setPinError('새 PIN 확인이 일치하지 않습니다.')
      return
    }
    setPinError('')
    setPinBusy(true)
    try {
      await onChangePin(nextOld, nextNew)
      setOldPin('')
      setNewPin('')
      setNewPinConfirm('')
      setPinHint(true)
    } catch (err) {
      setPinHint(false)
      setPinError(err instanceof Error ? err.message : 'PIN 변경에 실패했습니다.')
    } finally {
      setPinBusy(false)
    }
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

      <div className="profile-pin">
        <h3>PIN 변경</h3>
        <p className="panel-lead">PIN을 잊으면 관리자에게 재설정을 요청하세요.</p>
        <label className="field">
          <span>현재 PIN</span>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            value={oldPin}
            disabled={busy || pinBusy}
            onChange={(e) => {
              setOldPin(e.target.value)
              setPinHint(false)
            }}
          />
        </label>
        <label className="field">
          <span>새 PIN</span>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            value={newPin}
            disabled={busy || pinBusy}
            onChange={(e) => {
              setNewPin(e.target.value)
              setPinHint(false)
            }}
          />
        </label>
        <label className="field">
          <span>새 PIN 확인</span>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            value={newPinConfirm}
            disabled={busy || pinBusy}
            onChange={(e) => {
              setNewPinConfirm(e.target.value)
              setPinHint(false)
            }}
          />
        </label>
        {pinError ? <p className="form-error">{pinError}</p> : null}
        {pinHint ? <p className="profile-saved">PIN이 변경되었습니다.</p> : null}
        <button
          type="button"
          className="btn-primary"
          disabled={busy || pinBusy}
          onClick={() => void handleChangePin()}
        >
          {pinBusy ? '변경 중…' : 'PIN 변경'}
        </button>
      </div>
    </section>
  )
}
