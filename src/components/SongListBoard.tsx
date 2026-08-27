import { useEffect, useState } from 'react'
import type { Session, Song, SongDraft } from '../types'

type SessionKey = keyof Omit<SongDraft, 'title'>

type Props = {
  session: Session
  songs: Song[]
  roster: string[]
  busy?: boolean
  onCreate: () => void | Promise<void>
  onUpdate: (id: string, draft: Partial<SongDraft>) => void | Promise<void>
  onDelete: (id: string) => void | Promise<void>
  onAddRoster?: (name: string) => void | Promise<void>
}

const SESSION_COLS: { key: SessionKey | 'guitar'; label: string; className: string }[] = [
  { key: 'vocal', label: '보컬', className: 'song-col--vocal' },
  { key: 'guitar', label: '기타 1,2', className: 'song-col--guitar' },
  { key: 'bass', label: '베이스', className: 'song-col--bass' },
  { key: 'drums', label: '드럼', className: 'song-col--drums' },
  { key: 'keyboard', label: '키보드', className: 'song-col--keyboard' },
]

function MemberSelect({
  value,
  roster,
  className,
  disabled,
  onChange,
}: {
  value: string
  roster: string[]
  className?: string
  disabled?: boolean
  onChange: (next: string) => void
}) {
  return (
    <select
      className={['song-select', className].filter(Boolean).join(' ')}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">—</option>
      {roster.map((name) => (
        <option key={name} value={name}>
          {name}
        </option>
      ))}
      {value && !roster.includes(value) ? <option value={value}>{value}</option> : null}
    </select>
  )
}

export function SongListBoard({
  session: _session,
  songs,
  roster,
  busy = false,
  onCreate,
  onUpdate,
  onDelete,
}: Props) {
  const [draftTitles, setDraftTitles] = useState<Record<string, string>>({})

  useEffect(() => {
    const next: Record<string, string> = {}
    for (const song of songs) next[song.id] = song.title
    setDraftTitles(next)
  }, [songs])

  function commitTitle(song: Song) {
    const next = (draftTitles[song.id] ?? '').trim()
    if (next === song.title) return
    void onUpdate(song.id, { title: next })
  }

  return (
    <section className="song-board">
      <header className="song-board-header">
        <div>
          <p className="section-kicker">Setlist</p>
          <h2>곡 리스트</h2>
          <p className="panel-lead">가수/곡을 적고, 세션별 멤버를 고르세요.</p>
        </div>
        <button type="button" className="btn-primary" disabled={busy} onClick={() => void onCreate()}>
          곡 추가
        </button>
      </header>

      <div className="song-table-wrap">
        <table className="song-table">
          <thead>
            <tr>
              <th className="song-col--title">가수/곡</th>
              {SESSION_COLS.map((col) => (
                <th key={col.key} className={col.className}>
                  {col.label}
                </th>
              ))}
              <th className="song-col--actions" aria-label="삭제" />
            </tr>
          </thead>
          <tbody>
            {songs.length === 0 ? (
              <tr>
                <td colSpan={7} className="song-empty">
                  아직 곡이 없습니다. 위에서 곡을 추가하세요.
                </td>
              </tr>
            ) : (
              songs.map((song) => (
                <tr key={song.id}>
                  <td className="song-col--title">
                    <input
                      className="song-title-input"
                      value={draftTitles[song.id] ?? song.title}
                      disabled={busy}
                      placeholder="가수 / 곡 제목"
                      onChange={(e) =>
                        setDraftTitles((prev) => ({ ...prev, [song.id]: e.target.value }))
                      }
                      onBlur={() => commitTitle(song)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.currentTarget.blur()
                        }
                      }}
                    />
                  </td>
                  <td className="song-col--vocal">
                    <MemberSelect
                      value={song.vocal}
                      roster={roster}
                      disabled={busy}
                      className="is-vocal"
                      onChange={(next) => void onUpdate(song.id, { vocal: next })}
                    />
                  </td>
                  <td className="song-col--guitar">
                    <div className="song-guitar-pair">
                      <MemberSelect
                        value={song.guitar1}
                        roster={roster}
                        disabled={busy}
                        className="is-guitar"
                        onChange={(next) => void onUpdate(song.id, { guitar1: next })}
                      />
                      <MemberSelect
                        value={song.guitar2}
                        roster={roster}
                        disabled={busy}
                        className="is-guitar"
                        onChange={(next) => void onUpdate(song.id, { guitar2: next })}
                      />
                    </div>
                  </td>
                  <td className="song-col--bass">
                    <MemberSelect
                      value={song.bass}
                      roster={roster}
                      disabled={busy}
                      className="is-bass"
                      onChange={(next) => void onUpdate(song.id, { bass: next })}
                    />
                  </td>
                  <td className="song-col--drums">
                    <MemberSelect
                      value={song.drums}
                      roster={roster}
                      disabled={busy}
                      className="is-drums"
                      onChange={(next) => void onUpdate(song.id, { drums: next })}
                    />
                  </td>
                  <td className="song-col--keyboard">
                    <MemberSelect
                      value={song.keyboard}
                      roster={roster}
                      disabled={busy}
                      className="is-keyboard"
                      onChange={(next) => void onUpdate(song.id, { keyboard: next })}
                    />
                  </td>
                  <td className="song-col--actions">
                    <button
                      type="button"
                      className="btn-ghost song-delete"
                      disabled={busy}
                      onClick={() => {
                        if (!window.confirm(`「${song.title || '이 곡'}」을 삭제할까요?`)) return
                        void onDelete(song.id)
                      }}
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
