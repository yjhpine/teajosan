import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import type { ActivityLog } from '../types'

type Props = {
  logs: ActivityLog[]
  variant?: 'desktop' | 'mobile'
}

const ACTION_LABEL: Partial<Record<ActivityLog['action'], string>> = {
  create: '등록',
  delete: '삭제',
}

const VISIBLE_ACTIONS = new Set<ActivityLog['action']>(['create', 'delete'])

export function ActivityPanel({ logs, variant = 'desktop' }: Props) {
  const visible = logs.filter((log) => VISIBLE_ACTIONS.has(log.action)).slice(0, 30)
  const Root = variant === 'mobile' ? 'div' : 'aside'

  return (
    <Root
      className={[
        'activity-panel',
        variant === 'mobile' ? 'activity-panel--mobile' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {variant === 'desktop' ? (
        <header>
          <p className="section-kicker">Activity</p>
          <h2>활동 로그</h2>
          <p className="panel-lead">합주 등록·삭제만 표시합니다.</p>
        </header>
      ) : null}

      {visible.length === 0 ? (
        <p className="empty-state">아직 기록이 없습니다.</p>
      ) : (
        <ul className="log-list">
          {visible.map((log) => (
            <li key={log.id} className="log-item">
              <div className="log-top">
                <span className={`log-badge is-${log.action}`}>
                  {ACTION_LABEL[log.action] ?? log.action}
                </span>
                <time dateTime={log.at}>
                  {format(new Date(log.at), 'M/d HH:mm', { locale: ko })}
                </time>
              </div>
              <p>{log.summary}</p>
              {log.ip ? <p className="log-ip">IP {log.ip}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </Root>
  )
}
