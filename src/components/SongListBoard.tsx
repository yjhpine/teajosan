import { useEffect, useMemo, useState } from 'react'
import { type InstrumentSession, type MemberProfile, type Session, type Song, type SongDraft } from '../types'

type SessionKey = keyof Omit<SongDraft, 'title'>

type Props = {
  session: Session
  songs: Song[]
  profiles: MemberProfile[]
  busy?: boolean
  onUpdate: (id: string, draft: Partial<SongDraft>) => void | Promise<void>
  onDelete: (id: string) => void | Promise<void>
  onReorder: (ids: string[]) => void | Promise<void>
}

const SESSION_COLS: { key: SessionKey | 'guitar'; label: string; className: string }[] = [
  { key: 'vocal', label: '보컬', className: 'song-col--vocal' },
  { key: 'guitar', label: '기타 1,2', className: 'song-col--guitar' },
  { key: 'bass', label: '베이스', className: 'song-col--bass' },
  { key: 'drums', label: '드럼', className: 'song-col--drums' },
  { key: 'keyboard', label: '키보드', className: 'song-col--keyboard' },
]

const SESSION_FIELDS: {
  key: SessionKey
  label: string
  rosterKey: InstrumentSession
  className: string
  colClass: string
}[] = [
  { key: 'vocal', label: '보컬', rosterKey: 'vocal', className: 'is-vocal', colClass: 'song-col--vocal' },
  { key: 'guitar1', label: '기타1', rosterKey: 'guitar', className: 'is-guitar', colClass: 'song-col--guitar' },
  { key: 'guitar2', label: '기타2', rosterKey: 'guitar', className: 'is-guitar', colClass: 'song-col--guitar' },
  { key: 'bass', label: '베이스', rosterKey: 'bass', className: 'is-bass', colClass: 'song-col--bass' },
  { key: 'drums', label: '드럼', rosterKey: 'drums', className: 'is-drums', colClass: 'song-col--drums' },
  {
    key: 'keyboard',
    label: '키보드',
    rosterKey: 'keyboard',
    className: 'is-keyboard',
    colClass: 'song-col--keyboard',
  },
]

type Rosters = Record<InstrumentSession, string[]>

function namesForSession(profiles: MemberProfile[], session: InstrumentSession): string[] {
  return profiles
    .filter((profile) => profile.sessions.includes(session))
    .map((profile) => profile.name)
}

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

function SongTitleInput({
  song,
  draftTitles,
  busy,
  onDraftChange,
  onCommit,
}: {
  song: Song
  draftTitles: Record<string, string>
  busy: boolean
  onDraftChange: (id: string, title: string) => void
  onCommit: (song: Song) => void
}) {
  return (
    <input
      className="song-title-input"
      value={draftTitles[song.id] ?? song.title}
      disabled={busy}
      placeholder="가수 / 곡 제목"
      onChange={(e) => onDraftChange(song.id, e.target.value)}
      onBlur={() => onCommit(song)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.currentTarget.blur()
        }
      }}
    />
  )
}

function OrderButtons({
  index,
  total,
  busy,
  onMove,
}: {
  index: number
  total: number
  busy: boolean
  onMove: (from: number, to: number) => void
}) {
  return (
    <div className="song-order-btns">
      <button
        type="button"
        className="btn-ghost song-order-btn"
        aria-label="위로"
        disabled={busy || index <= 0}
        onClick={() => onMove(index, index - 1)}
      >
        ↑
      </button>
      <button
        type="button"
        className="btn-ghost song-order-btn"
        aria-label="아래로"
        disabled={busy || index >= total - 1}
        onClick={() => onMove(index, index + 1)}
      >
        ↓
      </button>
    </div>
  )
}

function SessionSlot({
  label,
  value,
  roster,
  disabled,
  onChange,
  colClass,
}: {
  label: string
  value: string
  roster: string[]
  disabled?: boolean
  onChange: (next: string) => void
  colClass: string
}) {
  return (
    <div className={['song-mobile-slot', colClass].filter(Boolean).join(' ')}>
      <span className="song-mobile-slot-text">
        <span className="song-mobile-slot-label">{label}</span>
        <span className={['song-mobile-slot-name', value ? '' : 'is-empty'].filter(Boolean).join(' ')}>
          {value || '—'}
        </span>
      </span>
      <select
        className="song-mobile-slot-picker"
        value={value}
        disabled={disabled}
        aria-label={label}
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
    </div>
  )
}

function SongMobileCard({
  song,
  index,
  total,
  draftTitles,
  rosters,
  busy,
  onDraftChange,
  onCommitTitle,
  onUpdate,
  onDelete,
  onMove,
}: {
  song: Song
  index: number
  total: number
  draftTitles: Record<string, string>
  rosters: Rosters
  busy: boolean
  onDraftChange: (id: string, title: string) => void
  onCommitTitle: (song: Song) => void
  onUpdate: (id: string, draft: Partial<SongDraft>) => void | Promise<void>
  onDelete: (id: string) => void | Promise<void>
  onMove: (from: number, to: number) => void
}) {
  return (
    <article className="song-mobile-card">
      <div className="song-mobile-title-row">
        <OrderButtons index={index} total={total} busy={busy} onMove={onMove} />
        <SongTitleInput
          song={song}
          draftTitles={draftTitles}
          busy={busy}
          onDraftChange={onDraftChange}
          onCommit={onCommitTitle}
        />
        <button
          type="button"
          className="btn-ghost song-delete song-delete--inline"
          disabled={busy}
          onClick={() => {
            if (!window.confirm(`「${song.title || '이 곡'}」을 삭제할까요?`)) return
            void onDelete(song.id)
          }}
        >
          삭제
        </button>
      </div>

      <div className="song-mobile-sessions">
        {SESSION_FIELDS.map((field) => (
          <SessionSlot
            key={field.key}
            label={field.label}
            value={song[field.key]}
            roster={rosters[field.rosterKey]}
            disabled={busy}
            colClass={field.colClass}
            onChange={(next) => void onUpdate(song.id, { [field.key]: next })}
          />
        ))}
      </div>
    </article>
  )
}

function SongMobileList({
  songs,
  draftTitles,
  rosters,
  busy,
  onDraftChange,
  onCommitTitle,
  onUpdate,
  onDelete,
  onMove,
}: {
  songs: Song[]
  draftTitles: Record<string, string>
  rosters: Rosters
  busy: boolean
  onDraftChange: (id: string, title: string) => void
  onCommitTitle: (song: Song) => void
  onUpdate: (id: string, draft: Partial<SongDraft>) => void | Promise<void>
  onDelete: (id: string) => void | Promise<void>
  onMove: (from: number, to: number) => void
}) {
  if (songs.length === 0) {
    return <p className="song-empty song-empty--mobile">아직 곡이 없습니다. 곡 신청에서 팀을 모으면 여기에 추가됩니다.</p>
  }

  return (
    <div className="song-mobile-cards">
      {songs.map((song, index) => (
        <SongMobileCard
          key={song.id}
          song={song}
          index={index}
          total={songs.length}
          draftTitles={draftTitles}
          rosters={rosters}
          busy={busy}
          onDraftChange={onDraftChange}
          onCommitTitle={onCommitTitle}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onMove={onMove}
        />
      ))}
    </div>
  )
}

export function SongListBoard({
  session: _session,
  songs,
  profiles,
  busy = false,
  onUpdate,
  onDelete,
  onReorder,
}: Props) {
  const [draftTitles, setDraftTitles] = useState<Record<string, string>>({})

  const rosters = useMemo<Rosters>(
    () => ({
      vocal: namesForSession(profiles, 'vocal'),
      guitar: namesForSession(profiles, 'guitar'),
      bass: namesForSession(profiles, 'bass'),
      drums: namesForSession(profiles, 'drums'),
      keyboard: namesForSession(profiles, 'keyboard'),
    }),
    [profiles],
  )

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

  function handleDraftChange(id: string, title: string) {
    setDraftTitles((prev) => ({ ...prev, [id]: title }))
  }

  function moveSong(from: number, to: number) {
    if (to < 0 || to >= songs.length || from === to) return
    const ids = songs.map((song) => song.id)
    const [moved] = ids.splice(from, 1)
    ids.splice(to, 0, moved)
    void onReorder(ids)
  }

  return (
    <section className="song-board">
      <header className="song-board-header">
        <div>
          <p className="section-kicker">Setlist</p>
          <h2>곡 리스트</h2>
        </div>
      </header>

      <div className="song-table-wrap">
        <table className="song-table">
          <thead>
            <tr>
              <th className="song-col--order" aria-label="순서" />
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
                <td colSpan={8} className="song-empty">
                  아직 곡이 없습니다. 곡 신청에서 팀을 모으면 여기에 추가됩니다.
                </td>
              </tr>
            ) : (
              songs.map((song, index) => (
                <tr key={song.id}>
                  <td className="song-col--order">
                    <OrderButtons
                      index={index}
                      total={songs.length}
                      busy={busy}
                      onMove={moveSong}
                    />
                  </td>
                  <td className="song-col--title">
                    <SongTitleInput
                      song={song}
                      draftTitles={draftTitles}
                      busy={busy}
                      onDraftChange={handleDraftChange}
                      onCommit={commitTitle}
                    />
                  </td>
                  <td className="song-col--vocal">
                    <MemberSelect
                      value={song.vocal}
                      roster={rosters.vocal}
                      disabled={busy}
                      className="is-vocal"
                      onChange={(next) => void onUpdate(song.id, { vocal: next })}
                    />
                  </td>
                  <td className="song-col--guitar">
                    <div className="song-guitar-pair">
                      <MemberSelect
                        value={song.guitar1}
                        roster={rosters.guitar}
                        disabled={busy}
                        className="is-guitar"
                        onChange={(next) => void onUpdate(song.id, { guitar1: next })}
                      />
                      <MemberSelect
                        value={song.guitar2}
                        roster={rosters.guitar}
                        disabled={busy}
                        className="is-guitar"
                        onChange={(next) => void onUpdate(song.id, { guitar2: next })}
                      />
                    </div>
                  </td>
                  <td className="song-col--bass">
                    <MemberSelect
                      value={song.bass}
                      roster={rosters.bass}
                      disabled={busy}
                      className="is-bass"
                      onChange={(next) => void onUpdate(song.id, { bass: next })}
                    />
                  </td>
                  <td className="song-col--drums">
                    <MemberSelect
                      value={song.drums}
                      roster={rosters.drums}
                      disabled={busy}
                      className="is-drums"
                      onChange={(next) => void onUpdate(song.id, { drums: next })}
                    />
                  </td>
                  <td className="song-col--keyboard">
                    <MemberSelect
                      value={song.keyboard}
                      roster={rosters.keyboard}
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

      <div className="song-mobile-list">
        <SongMobileList
          songs={songs}
          draftTitles={draftTitles}
          rosters={rosters}
          busy={busy}
          onDraftChange={handleDraftChange}
          onCommitTitle={commitTitle}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onMove={moveSong}
        />
      </div>
    </section>
  )
}
