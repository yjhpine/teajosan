import { useMemo, useState } from 'react'
import {
  SONG_REQUEST_SLOTS,
  isSameMember,
  memberLabel,
  type Member,
  type Session,
  type Song,
  type SongRequest,
  type SongRequestSlot,
} from '../types'

type Props = {
  session: Session
  songs: Song[]
  requests: SongRequest[]
  busy?: boolean
  onCreate: (title: string, slots: SongRequestSlot[]) => void | Promise<void>
  onClaim: (id: string, slot: SongRequestSlot) => void | Promise<void>
  onDelete: (id: string) => void | Promise<void>
}

function slotValue(request: SongRequest, slot: SongRequestSlot): string {
  return request[slot]
}

export function SongRequestBoard({
  session,
  songs,
  requests,
  busy = false,
  onCreate,
  onClaim,
  onDelete,
}: Props) {
  const songTitles = useMemo(
    () =>
      Array.from(
        new Set(songs.map((song) => song.title.trim()).filter(Boolean)),
      ),
    [songs],
  )
  const [title, setTitle] = useState('')
  const [slots, setSlots] = useState<SongRequestSlot[]>([])
  const [localError, setLocalError] = useState('')

  function toggleSlot(slot: SongRequestSlot) {
    setSlots((prev) =>
      prev.includes(slot) ? prev.filter((item) => item !== slot) : [...prev, slot],
    )
    setLocalError('')
  }

  async function handleCreate() {
    const nextTitle = title.trim()
    if (!nextTitle) {
      setLocalError('곡을 선택해 주세요.')
      return
    }
    if (slots.length === 0) {
      setLocalError('원하는 세션을 하나 이상 선택해 주세요.')
      return
    }
    setLocalError('')
    await onCreate(nextTitle, slots)
    setTitle('')
    setSlots([])
  }

  return (
    <section className="song-request-board">
      <header className="song-request-header">
        <p className="section-kicker">Requests</p>
        <h2>곡 신청</h2>
        <p className="panel-lead">곡을 고르고 세션을 담아 올리면, 다른 멤버가 빈 자리를 신청합니다.</p>
      </header>

      <div className="song-request-compose">
        <label className="field">
          <span>곡 선택</span>
          <select
            value={title}
            disabled={busy || songTitles.length === 0}
            onChange={(e) => {
              setTitle(e.target.value)
              setLocalError('')
            }}
          >
            <option value="">
              {songTitles.length === 0 ? '곡 리스트에서 먼저 곡을 추가해 주세요' : '곡 선택'}
            </option>
            {songTitles.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>

        <div className="song-request-slot-picks" role="group" aria-label="내 세션 선택">
          <span className="song-request-slot-picks-label">내가 할 세션</span>
          <div className="song-request-slot-picks-grid">
            {SONG_REQUEST_SLOTS.map((slot) => {
              const checked = slots.includes(slot.id)
              return (
                <label
                  key={slot.id}
                  className={['song-request-pick', checked ? 'is-checked' : ''].filter(Boolean).join(' ')}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={busy}
                    onChange={() => toggleSlot(slot.id)}
                  />
                  <span>{slot.label}</span>
                </label>
              )
            })}
          </div>
        </div>

        {localError ? <p className="form-error">{localError}</p> : null}

        <button
          type="button"
          className="btn-primary"
          disabled={busy || songTitles.length === 0}
          onClick={() => void handleCreate()}
        >
          {busy ? '올리는 중…' : '신청 올리기'}
        </button>
      </div>

      <div className="song-request-list">
        {requests.length === 0 ? (
          <p className="song-request-empty">아직 신청이 없습니다. 위에서 첫 신청을 올려 보세요.</p>
        ) : (
          requests.map((request) => (
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
  const mine = isSameMember(me, request.createdBy)

  return (
    <article className="song-request-card">
      <div className="song-request-card-top">
        <div>
          <h3>{request.title}</h3>
          <p className="song-request-meta">신청 · {memberLabel(request.createdBy)}</p>
        </div>
        {mine ? (
          <button
            type="button"
            className="btn-ghost song-delete song-delete--inline"
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

      <div className="song-request-slots">
        {SONG_REQUEST_SLOTS.map((slot) => {
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
              disabled={busy || taken}
              title={
                taken
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
    </article>
  )
}
