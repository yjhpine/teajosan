import { useEffect, useState, type FormEvent } from 'react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { findOverlappingRehearsal } from '../lib/rehearsalOverlap'
import type { Member, Rehearsal, Song } from '../types'
import { isSameMember, memberLabel } from '../types'

export type RehearsalDraft = {
  date: string
  startTime: string
  endTime: string
  teamName: string
}

type Props = {
  open: boolean
  member: Member
  rehearsals: Rehearsal[]
  songs: Song[]
  initialDate: Date
  initialStartTime?: string
  editing: Rehearsal | null
  busy?: boolean
  mobile?: boolean
  onClose: () => void
  onSave: (draft: RehearsalDraft) => void
  onDelete?: () => void
}

function addTwoHours(startTime: string): string {
  const [h, m] = startTime.split(':').map(Number)
  const next = Math.min(23, h + 2)
  return `${String(next).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`
}

const emptyDraft = (date: Date, startTime = '19:00'): RehearsalDraft => ({
  date: format(date, 'yyyy-MM-dd'),
  startTime,
  endTime: addTwoHours(startTime),
  teamName: '',
})

export function RehearsalModal({
  open,
  member,
  rehearsals,
  songs,
  initialDate,
  initialStartTime = '19:00',
  editing,
  busy = false,
  mobile = false,
  onClose,
  onSave,
  onDelete,
}: Props) {
  const [draft, setDraft] = useState<RehearsalDraft>(
    emptyDraft(initialDate, initialStartTime),
  )
  const [localError, setLocalError] = useState('')
  const canManage = !editing || isSameMember(member, editing.createdBy)

  const mySongs = songs.filter((song) =>
    [song.vocal, song.guitar1, song.guitar2, song.bass, song.drums, song.keyboard].includes(
      member.name,
    ),
  )
  const otherSongs = songs.filter((song) => !mySongs.includes(song))
  const myTitles = mySongs.map((song) => song.title.trim()).filter(Boolean)
  const otherTitles = otherSongs
    .map((song) => song.title.trim())
    .filter((title) => title && !myTitles.includes(title))
  const hasAnySong = songs.some((song) => song.title.trim())
  const orphanTitle =
    draft.teamName &&
    !myTitles.includes(draft.teamName) &&
    !otherTitles.includes(draft.teamName)
      ? draft.teamName
      : ''

  useEffect(() => {
    if (!open) return
    setLocalError('')
    if (editing) {
      setDraft({
        date: editing.date,
        startTime: editing.startTime,
        endTime: editing.endTime,
        teamName: editing.teamName,
      })
      return
    }
    setDraft(emptyDraft(initialDate, initialStartTime))
  }, [open, editing, initialDate, initialStartTime])

  if (!open) return null

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canManage) return
    if (!draft.date || !draft.startTime || !draft.endTime) return
    if (!draft.teamName.trim()) {
      setLocalError('곡을 선택해 주세요.')
      return
    }
    if (draft.startTime >= draft.endTime) {
      setLocalError('종료 시간은 시작 시간보다 뒤여야 합니다.')
      return
    }
    const conflict = findOverlappingRehearsal(rehearsals, draft, editing?.id)
    if (conflict) {
      setLocalError(
        `이미 ${conflict.teamName || '합주'} (${conflict.startTime.slice(0, 5)}–${conflict.endTime.slice(0, 5)})가 있어 등록할 수 없습니다.`,
      )
      return
    }
    onSave({ ...draft, teamName: draft.teamName.trim() })
  }

  return (
    <div
      className={['modal-backdrop', mobile ? 'modal-backdrop--mobile' : '']
        .filter(Boolean)
        .join(' ')}
      onClick={onClose}
    >
      <div
        className={['modal-panel', mobile ? 'modal-panel--mobile' : '']
          .filter(Boolean)
          .join(' ')}
        role="dialog"
        aria-modal="true"
        aria-labelledby="rehearsal-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            <p className="section-kicker">합주</p>
            <h3 id="rehearsal-modal-title">
              {editing ? (canManage ? '합주 수정' : '합주 보기') : '합주 잡기'}
            </h3>
          </div>
          <button type="button" className="btn-ghost" onClick={onClose}>
            닫기
          </button>
        </header>

        <form className="modal-form" onSubmit={handleSubmit}>
          <label className="field">
            <span>곡</span>
            <select
              value={draft.teamName}
              onChange={(e) => setDraft({ ...draft, teamName: e.target.value })}
              required
              autoFocus={canManage}
              disabled={!canManage || !hasAnySong}
            >
              <option value="">
                {hasAnySong ? '곡 선택' : '곡 리스트에서 먼저 곡을 추가해 주세요'}
              </option>
              {orphanTitle ? <option value={orphanTitle}>{orphanTitle}</option> : null}
              {myTitles.length > 0 ? (
                <optgroup label="내 배정 곡">
                  {myTitles.map((title) => (
                    <option key={`mine-${title}`} value={title}>
                      {title}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              {otherTitles.length > 0 ? (
                <optgroup label="다른 곡">
                  {otherTitles.map((title) => (
                    <option key={`other-${title}`} value={title}>
                      {title}
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </select>
          </label>
          <label className="field">
            <span>날짜</span>
            <input
              type="date"
              value={draft.date}
              onChange={(e) => setDraft({ ...draft, date: e.target.value })}
              required
              readOnly={!canManage}
              disabled={!canManage}
            />
          </label>
          <div className="field-row">
            <label className="field">
              <span>시작</span>
              <input
                type="time"
                value={draft.startTime}
                onChange={(e) => setDraft({ ...draft, startTime: e.target.value })}
                required
                readOnly={!canManage}
                disabled={!canManage}
              />
            </label>
            <label className="field">
              <span>종료</span>
              <input
                type="time"
                value={draft.endTime}
                onChange={(e) => setDraft({ ...draft, endTime: e.target.value })}
                required
                readOnly={!canManage}
                disabled={!canManage}
              />
            </label>
          </div>

          {localError ? <p className="form-error">{localError}</p> : null}
          {editing && !canManage ? (
            <p className="form-error">
              본인이 등록한 합주만 수정·삭제할 수 있습니다.
            </p>
          ) : null}

          <p className="modal-meta">
            {editing
              ? `등록자 · ${memberLabel(editing.createdBy)} (${format(
                  new Date(editing.createdAt),
                  'M/d HH:mm',
                  { locale: ko },
                )})`
              : `작성자 · ${memberLabel(member)}`}
          </p>

          <div className="modal-actions">
            {editing && canManage && onDelete ? (
              <button
                type="button"
                className={['btn-danger', mobile ? 'btn-danger--mobile' : '']
                  .filter(Boolean)
                  .join(' ')}
                onClick={onDelete}
                disabled={busy}
              >
                삭제
              </button>
            ) : (
              <span />
            )}
            {canManage ? (
              <button
                type="submit"
                className="btn-primary"
                disabled={busy || !hasAnySong}
              >
                {busy ? '저장 중…' : editing ? '저장' : '등록'}
              </button>
            ) : (
              <button type="button" className="btn-primary" onClick={onClose}>
                확인
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
