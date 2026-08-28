import { useEffect, useState } from 'react'
import { fetchAppStatus } from '../storage'

type Props = {
  message?: string
  onAdminLogin?: () => void
}

export function MaintenanceScreen({ message, onAdminLogin }: Props) {
  const [checking, setChecking] = useState(false)

  async function retry() {
    setChecking(true)
    try {
      const status = await fetchAppStatus()
      if (!status.maintenanceEnabled) {
        window.location.reload()
      }
    } finally {
      setChecking(false)
    }
  }

  useEffect(() => {
    const timer = window.setInterval(() => {
      void retry()
    }, 30000)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <div className="login-shell">
      <div className="login-atmosphere" aria-hidden="true" />
      <section className="login-panel maintenance-panel">
        <p className="login-kicker">Maintenance</p>
        <h1 className="brand-mark">태조산</h1>
        <p className="login-lead maintenance-message">
          {message?.trim() || '지금은 점검 중입니다. 잠시 후 다시 접속해 주세요.'}
        </p>
        <button type="button" className="btn-primary maintenance-retry" disabled={checking} onClick={() => void retry()}>
          {checking ? '확인 중…' : '다시 확인'}
        </button>
        {onAdminLogin ? (
          <button type="button" className="btn-ghost maintenance-admin-login" onClick={onAdminLogin}>
            관리자 로그인
          </button>
        ) : null}
      </section>
    </div>
  )
}
