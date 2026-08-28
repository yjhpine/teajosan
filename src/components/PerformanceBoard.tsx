import { useMemo, useState } from 'react'
import type { Performance, Session, Song } from '../types'
import { memberLabel } from '../types'

type Props = {
  session: Session
  performances: Performance[]
  songs: Song[]
  busy?: boolean
  onCreate: (draft: {
    title: string
    date: string
    startTime: string
    place: string
    note: string
    songIds: string[]
  }) => void | Promise<void>
  onUpdate: (
    id: string,
    draft: {
      title: string
      date: string
      startTime: string
      place: string
      note: string
      songIds: string[]
    },
  ) => void | Promise<void>
  onDelete: (id: string) => void | Promise<void>
}

function todayIso() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatDateLabel(iso: string) {
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${Number(y)}.${Number(m)}.${Number(d)}`
}

function formatPerformanceWhen(date: string, startTime: string) {
  const dateLabel = formatDateLabel(date)
  const time = startTime.trim()
  return time ? `${dateLabel} · ${time}` : dateLabel
}

export function PerformanceBoard({
  session: _session,
  performances,
  songs,
  busy = false,
  onCreate,
  onUpdate,
  onDelete,
}: Props) {
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(todayIso)
  const [startTime, setStartTime] = useState('19:00')
  const [place, setPlace] = useState('')
  const [note, setNote] = useState('')
  const [songIds, setSongIds] = useState<string[]>([])
  const [localError, setLocalError] = useState('')
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set())

  const songMap = useMemo(() => new Map(songs.map((song) => [song.id, song])), [songs])

  const sorted = useMemo(
    () =>
      [...performances].sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? -1 : 1
        if (a.startTime !== b.startTime) return a.startTime < b.startTime ? -1 : 1
        return a.createdAt < b.createdAt ? -1 : 1
      }),
    [performances],
  )

  function resetForm() {
    setTitle('')
    setDate(todayIso())
    setStartTime('19:00')
    setPlace('')
    setNote('')
    setSongIds([])
    setLocalError('')
  }

  function openCreate() {
    resetForm()
    setEditingId('new')
  }

  function openEdit(item: Performance) {
    setTitle(item.title)
    setDate(item.date)
    setStartTime(item.startTime || '19:00')
    setPlace(item.place)
    setNote(item.note)
    setSongIds([...item.songIds])
    setLocalError('')
    setEditingId(item.id)
  }

  function closeForm() {
    resetForm()
    setEditingId(null)
  }

  function toggleSong(id: string) {
    setSongIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
    setLocalError('')
  }

  function moveSong(id: string, dir: -1 | 1) {
    setSongIds((prev) => {
      const idx = prev.indexOf(id)
      const nextIdx = idx + dir
      if (idx < 0 || nextIdx < 0 || nextIdx >= prev.length) return prev
      const next = [...prev]
      const [item] = next.splice(idx, 1)
      next.splice(nextIdx, 0, item)
      return next
    })
  }

  function toggleCardExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSave() {
    const nextTitle = title.trim()
    if (!nextTitle) {
      setLocalError('공연 이름을 입력해 주세요.')
      return
    }
    if (!date) {
      setLocalError('공연 날짜를 선택해 주세요.')
      return
    }
    const draft = {
      title: nextTitle,
      date,
      startTime,
      place: place.trim(),
      note: note.trim(),
      songIds,
    }
    setLocalError('')
    if (editingId === 'new') await onCreate(draft)
    else if (editingId) await onUpdate(editingId, draft)
    closeForm()
  }

  return (
    <section className="performance-board">
      <header className="performance-header">
        <p className="section-kicker">Show</p>
        <h2>{editingId ? (editingId === 'new' ? '공연 등록' : '공연 수정') : '공연'}</h2>
        <p className="panel-lead">
          {editingId
            ? '공연 정보와 세트리스트(출연 곡)를 저장합니다.'
            : '공연 일정을 등록하고, 그날 나가는 곡을 한눈에 확인하세요.'}
        </p>
      </header>

      {editingId ? (
        <div className="performance-compose">
          <div className="performance-compose-toolbar">
            <button type="button" className="btn-ghost" disabled={busy} onClick={closeForm}>
              ← 목록으로
            </button>
          </div>

          <label className="field">
            <span>공연 이름</span>
            <input
              type="text"
              value={title}
              disabled={busy}
              maxLength={120}
              placeholder="예: 정기공연, OT 무대"
              onChange={(e) => {
                setTitle(e.target.value)
                setLocalError('')
              }}
            />
          </label>

          <label className="field">
            <span>날짜</span>
            <input
              type="date"
              value={date}
              disabled={busy}
              onChange={(e) => {
                setDate(e.target.value)
                setLocalError('')
              }}
            />
          </label>

          <label className="field">
            <span>시작 시간</span>
            <input
              type="time"
              value={startTime}
              disabled={busy}
              onChange={(e) => {
                setStartTime(e.target.value)
                setLocalError('')
              }}
            />
          </label>

          <label className="field">
            <span>장소 (선택)</span>
            <input
              type="text"
              value={place}
              disabled={busy}
              maxLength={120}
              placeholder="예: 대강당"
              onChange={(e) => setPlace(e.target.value)}
            />
          </label>

          <label className="field">
            <span>메모 (선택)</span>
            <textarea
              value={note}
              disabled={busy}
              maxLength={500}
              rows={3}
              placeholder="리허설 시간, 복장 등"
              onChange={(e) => setNote(e.target.value)}
            />
          </label>

          <div className="performance-song-picks" role="group" aria-label="출연 곡">
            <span className="performance-song-picks-label">출연 곡 (곡 리스트에서 선택)</span>
            {songs.length === 0 ? (
              <p className="performance-empty-inline">곡 리스트에 곡이 없습니다. 먼저 곡을 추가해 주세요.</p>
            ) : (
              <div className="performance-song-picks-grid">
                {songs.map((song) => {
                  const checked = songIds.includes(song.id)
                  return (
                    <label
                      key={song.id}
                      className={['performance-song-pick', checked ? 'is-checked' : '']
                        .filter(Boolean)
                        .join(' ')}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={busy}
                        onChange={() => toggleSong(song.id)}
                      />
                      <span>{song.title || '제목 없음'}</span>
                    </label>
                  )
                })}
              </div>
            )}
          </div>

          {songIds.length > 0 ? (
            <div className="performance-setlist-edit">
              <span className="performance-song-picks-label">세트리스트 순서</span>
              <ol className="performance-setlist-order">
                {songIds.map((id, index) => {
                  const song = songMap.get(id)
                  return (
                    <li key={id}>
                      <span className="performance-setlist-num">{index + 1}</span>
                      <span className="performance-setlist-title">{song?.title || '삭제된 곡'}</span>
                      <span className="performance-setlist-move">
                        <button
                          type="button"
                          className="btn-ghost"
                          disabled={busy || index === 0}
                          onClick={() => moveSong(id, -1)}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="btn-ghost"
                          disabled={busy || index === songIds.length - 1}
                          onClick={() => moveSong(id, 1)}
                        >
                          ↓
                        </button>
                      </span>
                    </li>
                  )
                })}
              </ol>
            </div>
          ) : null}

          {localError ? <p className="form-error">{localError}</p> : null}

          <button type="button" className="btn-primary" disabled={busy} onClick={() => void handleSave()}>
            {busy ? '저장 중…' : '저장'}
          </button>
        </div>
      ) : (
        <>
          <div className="performance-actions">
            <button type="button" className="btn-primary performance-new" disabled={busy} onClick={openCreate}>
              공연 등록하기
            </button>
          </div>

          <div className="performance-list">
            {sorted.length === 0 ? (
              <p className="performance-empty">아직 공연이 없습니다. 「공연 등록하기」로 올려 보세요.</p>
            ) : (
              sorted.map((item) => {
                const expanded = expandedIds.has(item.id)
                return (
                <article key={item.id} className="performance-card">
                  <div className="performance-card-top">
                    <div>
                      <p className="performance-card-date">
                        {formatPerformanceWhen(item.date, item.startTime)}
                      </p>
                      <h3>{item.title}</h3>
                      {item.place ? <p className="performance-card-place">{item.place}</p> : null}
                    </div>
                    <div className="performance-card-actions">
                      <button
                        type="button"
                        className="btn-ghost performance-card-btn"
                        disabled={busy}
                        onClick={() => openEdit(item)}
                      >
                        수정
                      </button>
                      <button
                        type="button"
                        className="btn-ghost performance-card-btn performance-card-btn--danger"
                        disabled={busy}
                        onClick={() => {
                          if (!window.confirm(`「${item.title}」 공연을 삭제할까요?`)) return
                          void onDelete(item.id)
                        }}
                      >
                        삭제
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    className={['performance-card-toggle', expanded ? 'is-open' : ''].filter(Boolean).join(' ')}
                    aria-expanded={expanded}
                    onClick={() => toggleCardExpanded(item.id)}
                  >
                    <span>세트리스트 · {item.songIds.length}곡</span>
                    <span className="performance-card-chevron" aria-hidden="true">
                      {expanded ? '▾' : '▸'}
                    </span>
                  </button>

                  {expanded ? (
                    <div className="performance-card-details">
                      {item.note ? <p className="performance-card-note">{item.note}</p> : null}

                      <div className="performance-card-songs">
                        {item.songIds.length === 0 ? (
                          <p className="performance-empty-inline">등록된 곡이 없습니다.</p>
                        ) : (
                          <ol>
                            {item.songIds.map((id, index) => {
                              const song = songMap.get(id)
                              return (
                                <li key={`${item.id}-${id}`}>
                                  <span className="performance-setlist-num">{index + 1}</span>
                                  <span>{song?.title || '삭제된 곡'}</span>
                                </li>
                              )
                            })}
                          </ol>
                        )}
                      </div>

                      <p className="performance-card-meta">등록 {memberLabel(item.createdBy)}</p>
                    </div>
                  ) : null}
                </article>
              )})
            )}
          </div>
        </>
      )}
    </section>
  )
}
