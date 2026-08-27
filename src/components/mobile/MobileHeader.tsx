import type { Member } from '../../types'
import { memberLabel } from '../../types'

type Props = {
  title: string
  subtitle?: string
  member: Member
  busy?: boolean
  showBack?: boolean
  onBack?: () => void
  onRefresh: () => void
  onLogout: () => void
}

export function MobileHeader({
  title,
  subtitle,
  member,
  busy = false,
  showBack = false,
  onBack,
  onRefresh,
  onLogout,
}: Props) {
  return (
    <header className="mobile-header">
      <div className="mobile-header-top">
        {showBack ? (
          <button type="button" className="mobile-icon-btn" onClick={onBack} aria-label="뒤로">
            ‹
          </button>
        ) : (
          <span className="mobile-header-brand">태조산</span>
        )}
        <div className="mobile-header-actions">
          <button
            type="button"
            className="mobile-icon-btn"
            onClick={onRefresh}
            disabled={busy}
            aria-label="새로고침"
          >
            ↻
          </button>
          <button
            type="button"
            className="mobile-icon-btn"
            onClick={onLogout}
            aria-label="나가기"
          >
            ⎋
          </button>
        </div>
      </div>
      <div className="mobile-header-main">
        <h1 className="mobile-header-title">{title}</h1>
        {subtitle ? <p className="mobile-header-subtitle">{subtitle}</p> : null}
      </div>
      <p className="mobile-member-line">{memberLabel(member)}</p>
    </header>
  )
}
