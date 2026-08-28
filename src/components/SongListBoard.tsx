import { useMemo, useState } from 'react'
import { fetchYoutubeTitle, parseYoutubeId, youtubeEmbedUrl, youtubeWatchUrl } from '../lib/youtube'
import { SongYoutubeMedia } from './SongYoutubeMedia'
import {
  SONG_REQUEST_SLOTS,
  memberLabel,
  type InstrumentSession,
  type MemberProfile,
  type Session,
  type Song,
  type SongDraft,
  type SongRequestSlot,
} from '../types'

type SessionKey = keyof Omit<SongDraft, 'title'>

type Props = {
  session: Session
  songs: Song[]
  profiles: MemberProfile[]
  busy?: boolean
  onCreate: (draft: Partial<SongDraft> & { youtubeUrl?: string }) => void | Promise<void>
  onUpdate: (id: string, draft: Partial<SongDraft>) => void | Promise<void>
  onDelete: (id: string) => void | Promise<void>
}

const SESSION_FIELDS: {
  key: SessionKey
  label: string
  rosterKey: InstrumentSession
  className: string
}[] = [
  { key: 'vocal', label: '보컬', rosterKey: 'vocal', className: 'is-vocal' },
  { key: 'guitar1', label: '기타1', rosterKey: 'guitar', className: 'is-guitar' },
  { key: 'guitar2', label: '기타2', rosterKey: 'guitar', className: 'is-guitar' },
  { key: 'bass', label: '베이스', rosterKey: 'bass', className: 'is-bass' },
  { key: 'drums', label: '드럼', rosterKey: 'drums', className: 'is-drums' },
  { key: 'keyboard', label: '키보드', rosterKey: 'keyboard', className: 'is-keyboard' },
]

type Rosters = Record<InstrumentSession, string[]>

function namesForSession(profiles: MemberProfile[], session: InstrumentSession): string[] {
  return profiles
    .filter((profile) => profile.sessions.includes(session))
    .map((profile) => profile.name)
}

function rosterForSlot(slot: SongRequestSlot, rosters: Rosters): string[] {
  if (slot === 'guitar1' || slot === 'guitar2') return rosters.guitar
  if (slot === 'vocal') return rosters.vocal
  if (slot === 'bass') return rosters.bass
  if (slot === 'drums') return rosters.drums
  return rosters.keyboard
}

function filledCount(song: Song): number {
  return SONG_REQUEST_SLOTS.filter((slot) => Boolean(song[slot.id]?.trim())).length
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

function ListSlot({
  slot,
  label,
  value,
  roster,
  disabled,
  onChange,
}: {
  slot: SongRequestSlot
  label: string
  value: string
  roster: string[]
  disabled?: boolean
  onChange: (next: string) => void
}) {
  const filled = Boolean(value.trim())
  return (
    <label
      className={[
        'song-request-slot',
        `is-${slot}`,
        filled ? 'is-filled' : 'is-open',
        'song-list-slot',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span className="song-request-slot-label">{label}</span>
      <span className="song-request-slot-name">{filled ? value : '배정'}</span>
      <select
        className="song-list-slot-picker"
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
    </label>
  )
}

function SongListCard({
  song,
  rosters,
  busy,
  playing,
  onTogglePlay,
  onUpdate,
  onDelete,
}: {
  song: Song
  rosters: Rosters
  busy: boolean
  playing: boolean
  onTogglePlay: (playing: boolean) => void
  onUpdate: (id: string, draft: Partial<SongDraft>) => void | Promise<void>
  onDelete: (id: string) => void | Promise<void>
}) {
  const filled = filledCount(song)
  const videoId = parseYoutubeId(song.youtubeUrl)

  return (
    <article className="song-request-card">
      <div className="song-request-meta-row">
        <p className="song-request-meta">
          <span className="song-request-meta-title">{song.title || '제목 없음'}</span>
          <span className="song-request-meta-rest">
            · {memberLabel(song.createdBy)} · {filled}/6
          </span>
        </p>
        <div className="song-list-card-actions">
          <button
            type="button"
            className="btn-ghost song-delete song-delete--inline song-request-delete"
            disabled={busy}
            onClick={() => {
              if (!window.confirm(`「${song.title || '이 곡'}」을 삭제할까요?`)) return
              void onDelete(song.id)
            }}
          >
            삭제
          </button>
        </div>
      </div>

      <div className="song-request-card-row">
        <SongYoutubeMedia
          youtubeUrl={song.youtubeUrl}
          title={song.title}
          playing={playing}
          onPlay={() => onTogglePlay(true)}
          onClose={() => onTogglePlay(false)}
          fallbackText={song.title || '곡'}
          variant="cover"
          className="song-request-cover"
        />

        <div className="song-request-slots">
          {SONG_REQUEST_SLOTS.map((slot) => (
            <ListSlot
              key={slot.id}
              slot={slot.id}
              label={slot.label}
              value={song[slot.id]}
              roster={rosterForSlot(slot.id, rosters)}
              disabled={busy}
              onChange={(next) => void onUpdate(song.id, { [slot.id]: next })}
            />
          ))}
        </div>
      </div>

      {playing && videoId ? (
        <div className="song-request-player">
          <div className="song-youtube-player">
            <iframe
              title={`${song.title || 'YouTube'} player`}
              src={youtubeEmbedUrl(videoId, true)}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
          <button type="button" className="btn-ghost song-youtube-close" onClick={() => onTogglePlay(false)}>
            닫기
          </button>
        </div>
      ) : null}
    </article>
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
}: Props) {
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [composing, setComposing] = useState(false)
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
        memberLabel(song.createdBy),
        song.createdBy.name,
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
    const nextYoutube = youtubeUrl.trim()
    const videoId = parseYoutubeId(nextYoutube)
    if (!videoId) {
      setLocalError('유튜브 링크를 입력해 주세요.')
      return
    }

    setLocalError('')
    const fetched = await fetchYoutubeTitle(videoId)
    const nextTitle = fetched || '유튜브 곡'
    await onCreate({
      title: nextTitle,
      vocal: draft.vocal,
      guitar1: draft.guitar1,
      guitar2: draft.guitar2,
      bass: draft.bass,
      drums: draft.drums,
      keyboard: draft.keyboard,
      youtubeUrl: youtubeWatchUrl(videoId),
    })
    closeCompose()
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
            <span>유튜브 링크</span>
            <input
              type="url"
              value={youtubeUrl}
              disabled={busy}
              placeholder="https://youtu.be/… 또는 youtube.com/watch?v=…"
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
                title=""
                playing={previewPlaying}
                onPlay={() => setPreviewPlaying(true)}
                onClose={() => setPreviewPlaying(false)}
              />
              <p className="song-request-preview-hint">썸네일을 누르면 바로 재생됩니다. 곡 제목은 유튜브에서 가져옵니다.</p>
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
              placeholder="곡·등록자·세션 멤버 검색"
              aria-label="곡 리스트 검색"
              maxLength={80}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </label>

          <div className="song-request-list">
            {visibleSongs.length === 0 ? (
              <p className="song-request-empty">{emptyLabel}</p>
            ) : (
              visibleSongs.map((song) => (
                <SongListCard
                  key={song.id}
                  song={song}
                  rosters={rosters}
                  busy={busy}
                  playing={playingId === song.id}
                  onTogglePlay={(next) => setPlayingId(next ? song.id : null)}
                  onUpdate={onUpdate}
                  onDelete={onDelete}
                />
              ))
            )}
          </div>
        </>
      )}
    </section>
  )
}
