import { useMemo, useState } from 'react'
import { fetchYoutubeTitle, parseYoutubeId, youtubeEmbedUrl, youtubeWatchUrl } from '../lib/youtube'
import { SongYoutubeMedia } from './SongYoutubeMedia'
import {
  SONG_REQUEST_SLOTS,
  isSameMember,
  makeExtraSlotId,
  memberLabel,
  type Member,
  type Session,
  type SongExtraSlot,
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
    memo: string,
    extraSlots: SongExtraSlot[],
  ) => void | Promise<void>
  onClaim: (id: string, slot: string) => void | Promise<void>
  onDelete: (id: string) => void | Promise<void>
}

function slotValue(request: SongRequest, slot: SongRequestSlot): string {
  return request[slot]
}

function isComplete(request: SongRequest): boolean {
  const fixedOk = request.neededSlots.every((slot) => Boolean(slotValue(request, slot).trim()))
  const extraOk = request.extraSlots.every((slot) => Boolean(slot.name.trim()))
  return fixedOk && extraOk && (request.neededSlots.length > 0 || request.extraSlots.length > 0)
}

function totalNeeded(request: SongRequest): number {
  return request.neededSlots.length + request.extraSlots.length
}

function totalFilled(request: SongRequest): number {
  const fixed = request.neededSlots.filter((slot) => Boolean(slotValue(request, slot).trim())).length
  const extra = request.extraSlots.filter((slot) => Boolean(slot.name.trim())).length
  return fixed + extra
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
  const [searchQuery, setSearchQuery] = useState('')
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [neededSlots, setNeededSlots] = useState<SongRequestSlot[]>([
    'vocal',
    'guitar1',
    'bass',
    'drums',
  ])
  const [mySlots, setMySlots] = useState<SongRequestSlot[]>([])
  const [extraSlots, setExtraSlots] = useState<SongExtraSlot[]>([])
  const [myExtraIds, setMyExtraIds] = useState<string[]>([])
  const [memo, setMemo] = useState('')
  const [addingCustom, setAddingCustom] = useState(false)
  const [customLabel, setCustomLabel] = useState('')
  const [localError, setLocalError] = useState('')
  const [previewPlaying, setPreviewPlaying] = useState(false)

  function resetCompose() {
    setYoutubeUrl('')
    setNeededSlots(['vocal', 'guitar1', 'bass', 'drums'])
    setMySlots([])
    setExtraSlots([])
    setMyExtraIds([])
    setMemo('')
    setAddingCustom(false)
    setCustomLabel('')
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

  const visibleRequests = useMemo(() => {
    const q = searchQuery.trim().toLocaleLowerCase('ko-KR')
    const filtered = q
      ? requests.filter((request) => {
          const haystack = [
            request.title,
            request.memo,
            memberLabel(request.createdBy),
            request.createdBy.name,
            request.createdBy.cohort,
            ...request.neededSlots.map((slot) => slotValue(request, slot)),
            ...request.extraSlots.flatMap((slot) => [slot.label, slot.name]),
          ]
            .join(' ')
            .toLocaleLowerCase('ko-KR')
          return haystack.includes(q)
        })
      : requests
    return [...filtered].sort((a, b) => Number(isComplete(a)) - Number(isComplete(b)))
  }, [requests, searchQuery])

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

  function addCustomSlot() {
    const label = customLabel.trim().slice(0, 20)
    if (!label) {
      setLocalError('커스텀 세션 이름을 입력해 주세요.')
      return
    }
    if (
      SONG_REQUEST_SLOTS.some((slot) => slot.label === label) ||
      extraSlots.some((slot) => slot.label === label)
    ) {
      setLocalError('이미 있는 세션 이름입니다.')
      return
    }
    setExtraSlots((prev) => [...prev, { id: makeExtraSlotId(), label, name: '' }])
    setCustomLabel('')
    setAddingCustom(false)
    setLocalError('')
  }

  function removeCustomSlot(id: string) {
    setExtraSlots((prev) => prev.filter((slot) => slot.id !== id))
    setMyExtraIds((prev) => prev.filter((item) => item !== id))
    setLocalError('')
  }

  function toggleMyExtra(id: string) {
    setMyExtraIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
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
    if (neededSlots.length === 0 && extraSlots.length === 0) {
      setLocalError('필요한 세션을 하나 이상 선택해 주세요.')
      return
    }
    setLocalError('')
    const fetched = await fetchYoutubeTitle(videoId)
    const nextTitle = fetched || '유튜브 곡'
    const nextExtras = extraSlots.map((slot) => ({
      ...slot,
      name: myExtraIds.includes(slot.id) ? session.name : '',
    }))
    await onCreate(
      nextTitle,
      sortedNeeded,
      mySlots.filter((slot) => neededSlots.includes(slot)),
      youtubeWatchUrl(videoId),
      memo.trim().slice(0, 300),
      nextExtras,
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
            ? '유튜브 링크와 필요한 세션을 고르면 신청이 올라갑니다. +로 커스텀 세션도 추가할 수 있어요.'
            : '올라온 신청에서 세션 칸을 채워 팀을 완성하세요. 완성되면 곡 리스트로 옮겨지고 하단에는 흐리게 남습니다.'}
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
              {extraSlots.map((slot) => (
                <div key={slot.id} className="song-request-pick is-checked is-custom">
                  <span>{slot.label}</span>
                  <button
                    type="button"
                    className="song-request-pick-remove"
                    disabled={busy}
                    aria-label={`${slot.label} 삭제`}
                    onClick={() => removeCustomSlot(slot.id)}
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="song-request-pick song-request-pick-add"
                disabled={busy}
                onClick={() => {
                  setAddingCustom(true)
                  setLocalError('')
                }}
              >
                <span aria-hidden="true">+</span>
                <span className="sr-only">세션 추가</span>
              </button>
            </div>
            {addingCustom ? (
              <div className="song-request-custom-add">
                <input
                  type="text"
                  value={customLabel}
                  disabled={busy}
                  maxLength={20}
                  placeholder="예: 퍼커션, 코러스"
                  aria-label="커스텀 세션 이름"
                  onChange={(e) => setCustomLabel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addCustomSlot()
                    }
                  }}
                />
                <button type="button" className="btn-ghost" disabled={busy} onClick={addCustomSlot}>
                  추가
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={busy}
                  onClick={() => {
                    setAddingCustom(false)
                    setCustomLabel('')
                  }}
                >
                  취소
                </button>
              </div>
            ) : null}
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
              {extraSlots.map((slot) => {
                const checked = myExtraIds.includes(slot.id)
                return (
                  <label
                    key={slot.id}
                    className={['song-request-pick', checked ? 'is-checked' : ''].filter(Boolean).join(' ')}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={busy}
                      onChange={() => toggleMyExtra(slot.id)}
                    />
                    <span>{slot.label}</span>
                  </label>
                )
              })}
            </div>
          </div>

          <label className="field">
            <span>메모 (선택)</span>
            <textarea
              value={memo}
              disabled={busy}
              rows={2}
              maxLength={300}
              placeholder="연습 포인트, 참고 사항 등"
              onChange={(e) => setMemo(e.target.value)}
            />
          </label>

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

          <label className="field song-request-search">
            <input
              type="search"
              value={searchQuery}
              disabled={busy}
              placeholder="곡·등록자·세션 멤버 검색"
              aria-label="모집곡 검색"
              maxLength={80}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </label>

          <div className="song-request-list">
            {requests.length === 0 ? (
              <p className="song-request-empty">아직 신청이 없습니다. 「곡 신청하기」로 올려 보세요.</p>
            ) : visibleRequests.length === 0 ? (
              <p className="song-request-empty">검색 결과가 없습니다.</p>
            ) : (
              visibleRequests.map((request) => (
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
  onClaim: (id: string, slot: string) => void | Promise<void>
  onDelete: (id: string) => void | Promise<void>
}) {
  const [playing, setPlaying] = useState(false)
  const mine = isSameMember(me, request.createdBy)
  const complete = isComplete(request)
  const filled = totalFilled(request)
  const needed = totalNeeded(request)
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
            · {memberLabel(request.createdBy)} · {filled}/{needed}
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

      {request.memo.trim() ? <p className="song-request-memo">{request.memo}</p> : null}

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
          {request.extraSlots.map((slot) => {
            const value = slot.name
            const isMine = value === me.name
            const taken = Boolean(value) && !isMine
            return (
              <button
                key={slot.id}
                type="button"
                className={[
                  'song-request-slot',
                  'is-custom',
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
