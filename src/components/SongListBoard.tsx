import { useMemo, useState } from 'react'
import { fetchYoutubeTitle, parseYoutubeId, youtubeWatchUrl } from '../lib/youtube'
import { SongYoutubeMedia } from './SongYoutubeMedia'
import { type InstrumentSession, type MemberProfile, type Session, type Song, type SongDraft } from '../types'

type SessionKey = keyof Omit<SongDraft, 'title'>

type Props = {
  session: Session
  songs: Song[]
  profiles: MemberProfile[]
  busy?: boolean
  onCreate: (draft: Partial<SongDraft> & { youtubeUrl?: string }) => void | Promise<void>
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

function SongMedia({
  song,
  playing,
  onPlay,
  onClose,
}: {
  song: Song
  playing: boolean
  onPlay: () => void
  onClose: () => void
}) {
  return (
    <SongYoutubeMedia
      youtubeUrl={song.youtubeUrl}
      title={song.title}
      playing={playing}
      onPlay={onPlay}
      onClose={onClose}
    />
  )
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
  rosters,
  busy,
  playingId,
  onTogglePlay,
  onUpdate,
  onDelete,
  onMove,
}: {
  song: Song
  index: number
  total: number
  rosters: Rosters
  busy: boolean
  playingId: string | null
  onTogglePlay: (id: string | null) => void
  onUpdate: (id: string, draft: Partial<SongDraft>) => void | Promise<void>
  onDelete: (id: string) => void | Promise<void>
  onMove: (from: number, to: number) => void
}) {
  const playing = playingId === song.id
  return (
    <article className="song-mobile-card">
      <div className="song-mobile-title-row">
        <OrderButtons index={index} total={total} busy={busy} onMove={onMove} />
        <div className="song-mobile-media">
          <SongMedia
            song={song}
            playing={playing}
            onPlay={() => onTogglePlay(song.id)}
            onClose={() => onTogglePlay(null)}
          />
        </div>
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
  emptyLabel,
  rosters,
  busy,
  playingId,
  onTogglePlay,
  onUpdate,
  onDelete,
  onMove,
}: {
  songs: Song[]
  emptyLabel: string
  rosters: Rosters
  busy: boolean
  playingId: string | null
  onTogglePlay: (id: string | null) => void
  onUpdate: (id: string, draft: Partial<SongDraft>) => void | Promise<void>
  onDelete: (id: string) => void | Promise<void>
  onMove: (from: number, to: number) => void
}) {
  if (songs.length === 0) {
    return <p className="song-empty song-empty--mobile">{emptyLabel}</p>
  }

  return (
    <div className="song-mobile-cards">
      {songs.map((song, index) => (
        <SongMobileCard
          key={song.id}
          song={song}
          index={index}
          total={songs.length}
          rosters={rosters}
          busy={busy}
          playingId={playingId}
          onTogglePlay={onTogglePlay}
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
  onCreate,
  onUpdate,
  onDelete,
  onReorder,
}: Props) {
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [composing, setComposing] = useState(false)
  const [title, setTitle] = useState('')
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [draft, setDraft] = useState<SongDraft>({
    title: '',
    vocal: '',
    guitar1: '',
    guitar2: '',
    bass: '',
    drums: '',
    keyboard: '',
  })
  const [localError, setLocalError] = useState('')
  const [previewPlaying, setPreviewPlaying] = useState(false)

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

  const visibleSongs = useMemo(() => {
    const q = searchQuery.trim().toLocaleLowerCase('ko-KR')
    if (!q) return songs
    return songs.filter((song) => {
      const haystack = [
        song.title,
        song.vocal,
        song.guitar1,
        song.guitar2,
        song.bass,
        song.drums,
        song.keyboard,
      ]
        .join(' ')
        .toLocaleLowerCase('ko-KR')
      return haystack.includes(q)
    })
  }, [songs, searchQuery])

  const previewId = parseYoutubeId(youtubeUrl)

  function resetCompose() {
    setTitle('')
    setYoutubeUrl('')
    setDraft({
      title: '',
      vocal: '',
      guitar1: '',
      guitar2: '',
      bass: '',
      drums: '',
      keyboard: '',
    })
    setLocalError('')
    setPreviewPlaying(false)
  }

  function openCompose() {
    resetCompose()
    setComposing(true)
  }

  function closeCompose() {
    resetCompose()
    setComposing(false)
  }

  function setDraftField(key: SessionKey, value: string) {
    setDraft((prev) => ({ ...prev, [key]: value }))
    setLocalError('')
  }

  async function handleCreate() {
    const manualTitle = title.trim()
    const nextYoutube = youtubeUrl.trim()
    const videoId = parseYoutubeId(nextYoutube)
    let nextTitle = manualTitle

    if (videoId && !nextTitle) {
      const fetched = await fetchYoutubeTitle(videoId)
      nextTitle = fetched || '유튜브 곡'
    }

    if (!nextTitle) {
      setLocalError('곡 제목을 입력하거나 유튜브 링크를 넣어 주세요.')
      return
    }

    setLocalError('')
    await onCreate({
      title: nextTitle,
      vocal: draft.vocal,
      guitar1: draft.guitar1,
      guitar2: draft.guitar2,
      bass: draft.bass,
      drums: draft.drums,
      keyboard: draft.keyboard,
      youtubeUrl: videoId ? youtubeWatchUrl(videoId) : '',
    })
    closeCompose()
  }

  function moveSong(from: number, to: number) {
    if (to < 0 || to >= visibleSongs.length || from === to) return
    const fromId = visibleSongs[from]?.id
    const toId = visibleSongs[to]?.id
    if (!fromId || !toId) return
    const fromIdx = songs.findIndex((song) => song.id === fromId)
    const toIdx = songs.findIndex((song) => song.id === toId)
    if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return
    const ids = songs.map((song) => song.id)
    const [moved] = ids.splice(fromIdx, 1)
    ids.splice(toIdx, 0, moved)
    void onReorder(ids)
  }

  const emptyLabel =
    songs.length === 0
      ? '아직 곡이 없습니다. + 버튼으로 팀을 만들거나, 곡 신청에서 팀을 모으면 여기에 추가됩니다.'
      : '검색 결과가 없습니다.'

  return (
    <section className="song-board">
      <header className="song-board-header">
        <div>
          <p className="section-kicker">Setlist</p>
          <h2>{composing ? '팀 만들기' : '곡 리스트'}</h2>
          {composing ? (
            <p className="panel-lead">구두로 정한 팀도 바로 곡 리스트에 추가할 수 있습니다.</p>
          ) : null}
        </div>
        {!composing ? (
          <button
            type="button"
            className="song-board-add"
            aria-label="팀 만들기"
            disabled={busy}
            onClick={openCompose}
          >
            +
          </button>
        ) : null}
      </header>

      {composing ? (
        <div className="song-list-compose">
          <div className="song-list-compose-toolbar">
            <button type="button" className="btn-ghost" disabled={busy} onClick={closeCompose}>
              ← 목록으로
            </button>
          </div>

          <label className="field">
            <span>곡 제목</span>
            <input
              type="text"
              value={title}
              disabled={busy}
              maxLength={120}
              placeholder="예: Spring Day"
              onChange={(e) => {
                setTitle(e.target.value)
                setLocalError('')
              }}
            />
          </label>

          <label className="field">
            <span>유튜브 링크 (선택)</span>
            <input
              type="url"
              value={youtubeUrl}
              disabled={busy}
              placeholder="https://youtu.be/…"
              maxLength={300}
              onChange={(e) => {
                setYoutubeUrl(e.target.value)
                setPreviewPlaying(false)
                setLocalError('')
              }}
            />
          </label>

          {previewId ? (
            <div className="song-list-compose-preview">
              <SongYoutubeMedia
                youtubeUrl={youtubeWatchUrl(previewId)}
                title={title}
                playing={previewPlaying}
                onPlay={() => setPreviewPlaying(true)}
                onClose={() => setPreviewPlaying(false)}
              />
            </div>
          ) : null}

          <div className="song-list-compose-sessions" role="group" aria-label="팀 세션">
            <span className="song-list-compose-sessions-label">팀 세션</span>
            <div className="song-list-compose-sessions-grid">
              {SESSION_FIELDS.map((field) => (
                <label key={field.key} className="field song-list-compose-session">
                  <span>{field.label}</span>
                  <MemberSelect
                    value={draft[field.key]}
                    roster={rosters[field.rosterKey]}
                    disabled={busy}
                    className={field.className}
                    onChange={(next) => setDraftField(field.key, next)}
                  />
                </label>
              ))}
            </div>
          </div>

          {localError ? <p className="form-error">{localError}</p> : null}

          <button type="button" className="btn-primary" disabled={busy} onClick={() => void handleCreate()}>
            {busy ? '등록 중…' : '팀 만들기'}
          </button>
        </div>
      ) : (
        <>
      <label className="field song-list-search">
        <input
          type="search"
          value={searchQuery}
          disabled={busy}
          placeholder="곡·세션 멤버 검색"
          aria-label="곡 리스트 검색"
          maxLength={80}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </label>

      <div className="song-table-wrap">
        <table className="song-table">
          <thead>
            <tr>
              <th className="song-col--order" aria-label="순서" />
              <th className="song-col--title">곡</th>
              {SESSION_COLS.map((col) => (
                <th key={col.key} className={col.className}>
                  {col.label}
                </th>
              ))}
              <th className="song-col--actions" aria-label="삭제" />
            </tr>
          </thead>
          <tbody>
            {visibleSongs.length === 0 ? (
              <tr>
                <td colSpan={8} className="song-empty">
                  {emptyLabel}
                </td>
              </tr>
            ) : (
              visibleSongs.map((song, index) => (
                <tr key={song.id}>
                  <td className="song-col--order">
                    <OrderButtons
                      index={index}
                      total={visibleSongs.length}
                      busy={busy}
                      onMove={moveSong}
                    />
                  </td>
                  <td className="song-col--title">
                    <SongMedia
                      song={song}
                      playing={playingId === song.id}
                      onPlay={() => setPlayingId(song.id)}
                      onClose={() => setPlayingId(null)}
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
          songs={visibleSongs}
          emptyLabel={emptyLabel}
          rosters={rosters}
          busy={busy}
          playingId={playingId}
          onTogglePlay={setPlayingId}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onMove={moveSong}
        />
      </div>
        </>
      )}
    </section>
  )
}
