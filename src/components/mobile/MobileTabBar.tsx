type Tab = 'schedule' | 'songs' | 'requests' | 'profile' | 'log'

type Props = {
  active: Tab
  onChange: (tab: Tab) => void
}

export function MobileTabBar({ active, onChange }: Props) {
  return (
    <nav className="mobile-tabbar" aria-label="주요 메뉴">
      <button
        type="button"
        className={['mobile-tab', active === 'schedule' ? 'is-active' : ''].filter(Boolean).join(' ')}
        onClick={() => onChange('schedule')}
      >
        <span className="mobile-tab-icon" aria-hidden="true">
          ◷
        </span>
        <span>일정</span>
      </button>
      <button
        type="button"
        className={['mobile-tab', active === 'songs' ? 'is-active' : ''].filter(Boolean).join(' ')}
        onClick={() => onChange('songs')}
      >
        <span className="mobile-tab-icon" aria-hidden="true">
          ♪
        </span>
        <span>곡</span>
      </button>
      <button
        type="button"
        className={['mobile-tab', active === 'requests' ? 'is-active' : ''].filter(Boolean).join(' ')}
        onClick={() => onChange('requests')}
      >
        <span className="mobile-tab-icon" aria-hidden="true">
          ✎
        </span>
        <span>신청</span>
      </button>
      <button
        type="button"
        className={['mobile-tab', active === 'profile' ? 'is-active' : ''].filter(Boolean).join(' ')}
        onClick={() => onChange('profile')}
      >
        <span className="mobile-tab-icon" aria-hidden="true">
          ◉
        </span>
        <span>마이</span>
      </button>
      <button
        type="button"
        className={['mobile-tab', active === 'log' ? 'is-active' : ''].filter(Boolean).join(' ')}
        onClick={() => onChange('log')}
      >
        <span className="mobile-tab-icon" aria-hidden="true">
          ☰
        </span>
        <span>로그</span>
      </button>
    </nav>
  )
}
