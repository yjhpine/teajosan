import { useEffect, useState, type FormEvent } from 'react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import type { Member, Rehearsal } from '../types'
import { memberLabel } from '../types'

type Draft = {
  date: string
  startTime: string
  endTime: string
  place: string
  note: string
}

type Props = {
  open: boolean
  member: Member
  initialDate: Date
  editing: Rehearsal | null
  busy?: boolean
  onClose: () => void
  onSave: (draft: Draft) => void
  onDelete?: () => void
}

const emptyDraft = (date: Date): Draft => ({
  date: format(date, 'yyyy-MM-dd'),
  startTime: '19:00',
  endTime: '21:00',
  place: '',
  note: '',
})

export function RehearsalModal({
  open,
  member,
  initialDate,
  editing,
  busy = false,
  onClose,
  onSave,
  onDelete,
}: Props) {
  const [draft, setDraft] = useState<Draft>(emptyDraft(initialDate))

  useEffect(() => {
    if (!open) return
    if (editing) {
      setDraft({
        date: editing.date,
        startTime: editing.startTime,
        endTime: editing.endTime,
        place: editing.place,
        note: editing.note,
      })
      return
    }
    setDraft(emptyDraft(initialDate))
  }, [open, editing, initialDate])

  if (!open) return null

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!draft.date || !draft.startTime || !draft.endTime) return
    onSave(draft)
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rehearsal-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            <p className="section-kicker">합주</p>
            <h3 id="rehearsal-modal-title">
              {editing ? '합주 수정' : '합주 잡기'}
            </h3>
          </div>
          <button type="button" className="btn-ghost" onClick={onClose}>
            닫기
          </button>
        </header>

        <form className="modal-form" onSubmit={handleSubmit}>
          <label className="field">
            <span>날짜</span>
            <input
              type="date"
              value={draft.date}
              onChange={(e) => setDraft({ ...draft, date: e.target.value })}
              required
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
              />
            </label>
            <label className="field">
              <span>종료</span>
              <input
                type="time"
                value={draft.endTime}
                onChange={(e) => setDraft({ ...draft, endTime: e.target.value })}
                required
              />
            </label>
          </div>
          <label className="field">
            <span>장소</span>
            <input
              placeholder="예: 음악실 / 강당"
              value={draft.place}
              onChange={(e) => setDraft({ ...draft, place: e.target.value })}
            />
          </label>
          <label className="field">
            <span>메모</span>
            <textarea
              rows={3}
              placeholder="곡 목록, 준비물 등"
              value={draft.note}
              onChange={(e) => setDraft({ ...draft, note: e.target.value })}
            />
          </label>

          <p className="modal-meta">
            작성자 · {memberLabel(member)}
            {editing
              ? ` · 최초 ${memberLabel(editing.createdBy)} (${format(
                  new Date(editing.createdAt),
                  'M/d HH:mm',
                  { locale: ko },
                )})`
              : null}
          </p>

          <div className="modal-actions">
            {editing && onDelete ? (
              <button
                type="button"
                className="btn-danger"
                onClick={onDelete}
                disabled={busy}
              >
                삭제
              </button>
            ) : (
              <span />
            )}
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? '저장 중…' : editing ? '저장' : '등록'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
