import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import type { ActivityLog } from '../types'

type Props = {
  logs: ActivityLog[]
}

const ACTION_LABEL: Record<ActivityLog['action'], string> = {
  login: '로그인',
  create: '등록',
  update: '수정',
  delete: '삭제',
}

export function ActivityPanel({ logs }: Props) {
  return (
    <aside className="activity-panel">
      <header>
        <p className="section-kicker">Activity</p>
        <h2>활동 로그</h2>
        <p className="panel-lead">기수·이름·IP가 DB에 남습니다.</p>
      </header>

      {logs.length === 0 ? (
        <p className="empty-state">아직 기록이 없습니다.</p>
      ) : (
        <ul className="log-list">
          {logs.slice(0, 30).map((log) => (
            <li key={log.id} className="log-item">
              <div className="log-top">
                <span className={`log-badge is-${log.action}`}>
                  {ACTION_LABEL[log.action]}
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
    </aside>
  )
}
