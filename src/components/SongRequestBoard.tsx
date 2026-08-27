import { useMemo, useState } from 'react'
import { fetchYoutubeTitle, parseYoutubeId, youtubeEmbedUrl, youtubeWatchUrl } from '../lib/youtube'
import { SongYoutubeMedia } from './SongYoutubeMedia'
import {
  SONG_REQUEST_SLOTS,
  isSameMember,
  memberLabel,
  type Member,
  type Session,
  type SongRequest,
  type SongRequestSlot,
} from '../types'

type Props = {
  session: Session
  requests: SongRequest[]
  busy?: boolean
  onCreate: (
    title: string,
    neededSlots: SongRequestSlot[],
    mySlots: SongRequestSlot[],
    youtubeUrl: string,
  ) => void | Promise<void>
  onClaim: (id: string, slot: SongRequestSlot) => void | Promise<void>
  onDelete: (id: string) => void | Promise<void>
}

function slotValue(request: SongRequest, slot: SongRequestSlot): string {
  return request[slot]
}

function isComplete(request: SongRequest): boolean {
  return request.neededSlots.every((slot) => Boolean(slotValue(request, slot).trim()))
}

export function SongRequestBoard({
  session,
  requests,
  busy = false,
  onCreate,
  onClaim,
  onDelete,
}: Props) {
  const [composing, setComposing] = useState(false)
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [neededSlots, setNeededSlots] = useState<SongRequestSlot[]>([
    'vocal',
    'guitar1',
    'bass',
    'drums',
  ])
  const [mySlots, setMySlots] = useState<SongRequestSlot[]>([])
  const [localError, setLocalError] = useState('')
  const [previewPlaying, setPreviewPlaying] = useState(false)

  function resetCompose() {
    setYoutubeUrl('')
    setNeededSlots(['vocal', 'guitar1', 'bass', 'drums'])
    setMySlots([])
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

  const sortedNeeded = useMemo(
    () => SONG_REQUEST_SLOTS.filter((slot) => neededSlots.includes(slot.id)).map((slot) => slot.id),
    [neededSlots],
  )

  const previewId = parseYoutubeId(youtubeUrl)

  function toggleNeeded(slot: SongRequestSlot) {
    setNeededSlots((prev) => {
      const next = prev.includes(slot) ? prev.filter((item) => item !== slot) : [...prev, slot]
      setMySlots((mine) => mine.filter((item) => next.includes(item)))
      return next
    })
    setLocalError('')
  }

  function toggleMine(slot: SongRequestSlot) {
    if (!neededSlots.includes(slot)) return
    setMySlots((prev) =>
      prev.includes(slot) ? prev.filter((item) => item !== slot) : [...prev, slot],
    )
    setLocalError('')
  }

  async function handleCreate() {
    const nextYoutube = youtubeUrl.trim()
    const videoId = parseYoutubeId(nextYoutube)
    if (!videoId) {
      setLocalError('유튜브 링크를 입력해 주세요.')
      return
    }
    if (neededSlots.length === 0) {
      setLocalError('필요한 세션을 하나 이상 선택해 주세요.')
      return
    }
    setLocalError('')
    const fetched = await fetchYoutubeTitle(videoId)
    const nextTitle = fetched || '유튜브 곡'
    await onCreate(
      nextTitle,
      sortedNeeded,
      mySlots.filter((slot) => neededSlots.includes(slot)),
      youtubeWatchUrl(videoId),
    )
    closeCompose()
  }

  return (
    <section className="song-request-board">
      <header className="song-request-header">
        <p className="section-kicker">Requests</p>
        <h2>{composing ? '새 곡 신청' : '곡 신청'}</h2>
        <p className="panel-lead">
          {composing
            ? '유튜브 링크와 필요한 세션을 고르면 신청이 올라갑니다. 완성되면 곡 리스트로 옮겨집니다.'
            : '올라온 신청에서 세션 칸을 채워 팀을 완성하세요. 새 곡은 「곡 신청하기」로 올립니다.'}
        </p>
      </header>

      {composing ? (
        <div className="song-request-compose">
          <div className="song-request-compose-toolbar">
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
            <div className="song-request-compose-preview">
              <SongYoutubeMedia
                youtubeUrl={youtubeWatchUrl(previewId)}
                title=""
                playing={previewPlaying}
                onPlay={() => setPreviewPlaying(true)}
                onClose={() => setPreviewPlaying(false)}
              />
              <p className="song-request-preview-hint">
                썸네일을 누르면 바로 재생됩니다. 곡 제목은 유튜브에서 가져옵니다.
              </p>
            </div>
          ) : null}

          <div className="song-request-slot-picks" role="group" aria-label="필요한 세션">
            <span className="song-request-slot-picks-label">필요한 세션</span>
            <div className="song-request-slot-picks-grid">
              {SONG_REQUEST_SLOTS.map((slot) => {
                const checked = neededSlots.includes(slot.id)
                return (
                  <label
                    key={slot.id}
                    className={['song-request-pick', checked ? 'is-checked' : ''].filter(Boolean).join(' ')}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={busy}
                      onChange={() => toggleNeeded(slot.id)}
                    />
                    <span>{slot.label}</span>
                  </label>
                )
              })}
            </div>
          </div>

          <div className="song-request-slot-picks" role="group" aria-label="내가 할 세션">
            <span className="song-request-slot-picks-label">내가 할 세션 (선택)</span>
            <div className="song-request-slot-picks-grid">
              {SONG_REQUEST_SLOTS.map((slot) => {
                const enabled = neededSlots.includes(slot.id)
                const checked = mySlots.includes(slot.id)
                return (
                  <label
                    key={slot.id}
                    className={[
                      'song-request-pick',
                      checked ? 'is-checked' : '',
                      enabled ? '' : 'is-disabled',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={busy || !enabled}
                      onChange={() => toggleMine(slot.id)}
                    />
                    <span>{slot.label}</span>
                  </label>
                )
              })}
            </div>
          </div>

          {localError ? <p className="form-error">{localError}</p> : null}

          <button type="button" className="btn-primary" disabled={busy} onClick={() => void handleCreate()}>
            {busy ? '등록 중…' : '등록'}
          </button>
        </div>
      ) : (
        <>
          <div className="song-request-actions">
            <button type="button" className="btn-primary song-request-new" disabled={busy} onClick={openCompose}>
              곡 신청하기
            </button>
          </div>

          <div className="song-request-list">
            {requests.length === 0 ? (
              <p className="song-request-empty">아직 신청이 없습니다. 「곡 신청하기」로 올려 보세요.</p>
            ) : (
              [...requests]
                .sort((a, b) => Number(isComplete(a)) - Number(isComplete(b)))
                .map((request) => (
                <RequestCard
                  key={request.id}
                  request={request}
                  me={session}
                  busy={busy}
                  onClaim={onClaim}
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

function RequestCard({
  request,
  me,
  busy,
  onClaim,
  onDelete,
}: {
  request: SongRequest
  me: Member
  busy: boolean
  onClaim: (id: string, slot: SongRequestSlot) => void | Promise<void>
  onDelete: (id: string) => void | Promise<void>
}) {
  const [playing, setPlaying] = useState(false)
  const mine = isSameMember(me, request.createdBy)
  const complete = isComplete(request)
  const filled = request.neededSlots.filter((slot) => Boolean(slotValue(request, slot).trim())).length
  const visibleSlots = SONG_REQUEST_SLOTS.filter((slot) => request.neededSlots.includes(slot.id))
  const videoId = parseYoutubeId(request.youtubeUrl)

  return (
    <article
      className={['song-request-card', complete ? 'is-complete' : ''].filter(Boolean).join(' ')}
      aria-disabled={complete || undefined}
    >
      <div className="song-request-meta-row">
        <p className="song-request-meta">
          <span className="song-request-meta-title">{request.title || '유튜브 곡'}</span>
          <span className="song-request-meta-rest">
            · {memberLabel(request.createdBy)} · {filled}/{request.neededSlots.length}
            {complete ? ' · 완성' : ''}
          </span>
        </p>
        {mine && !complete ? (
          <button
            type="button"
            className="btn-ghost song-delete song-delete--inline song-request-delete"
            disabled={busy}
            onClick={() => {
              if (!window.confirm(`「${request.title}」 신청을 삭제할까요?`)) return
              void onDelete(request.id)
            }}
          >
            삭제
          </button>
        ) : null}
      </div>

      <div className="song-request-card-row">
        <SongYoutubeMedia
          youtubeUrl={request.youtubeUrl}
          title={request.title}
          playing={!complete && playing}
          onPlay={() => {
            if (complete) return
            setPlaying(true)
          }}
          onClose={() => setPlaying(false)}
          fallbackText={request.title || '신청'}
          variant="cover"
          className="song-request-cover"
        />

        <div className="song-request-slots">
          {visibleSlots.map((slot) => {
            const value = slotValue(request, slot.id)
            const isMine = value === me.name
            const taken = Boolean(value) && !isMine
            return (
              <button
                key={slot.id}
                type="button"
                className={[
                  'song-request-slot',
                  `is-${slot.id}`,
                  value ? 'is-filled' : 'is-open',
                  isMine ? 'is-mine' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                disabled={busy || taken || complete}
                title={
                  complete
                    ? '완성된 신청'
                    : taken
                      ? `${slot.label}: ${value}`
                      : isMine
                        ? '다시 누르면 신청 취소'
                        : `${slot.label} 신청`
                }
                onClick={() => void onClaim(request.id, slot.id)}
              >
                <span className="song-request-slot-label">{slot.label}</span>
                <span className="song-request-slot-name">{value || '신청'}</span>
              </button>
            )
          })}
        </div>
      </div>

      {!complete && playing && videoId ? (
        <div className="song-request-player">
          <div className="song-youtube-player">
            <iframe
              title={`${request.title || 'YouTube'} player`}
              src={youtubeEmbedUrl(videoId, true)}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
          <button type="button" className="btn-ghost song-youtube-close" onClick={() => setPlaying(false)}>
            닫기
          </button>
        </div>
      ) : null}
    </article>
  )
}
