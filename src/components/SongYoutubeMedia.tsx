import { parseYoutubeId, youtubeEmbedUrl, youtubeThumbUrl } from '../lib/youtube'

type Props = {
  youtubeUrl: string
  title?: string
  playing: boolean
  onPlay: () => void
  onClose: () => void
  fallbackText?: string
  className?: string
}

export function SongYoutubeMedia({
  youtubeUrl,
  title = '',
  playing,
  onPlay,
  onClose,
  fallbackText = '링크 없는 곡',
  className,
}: Props) {
  const videoId = parseYoutubeId(youtubeUrl)
  const rootClass = ['song-media', className].filter(Boolean).join(' ')

  if (playing && videoId) {
    return (
      <div className={rootClass}>
        <div className="song-youtube-player">
          <iframe
            title={`${title || 'YouTube'} player`}
            src={youtubeEmbedUrl(videoId, true)}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
        <button type="button" className="btn-ghost song-youtube-close" onClick={onClose}>
          닫기
        </button>
      </div>
    )
  }

  if (videoId) {
    return (
      <button
        type="button"
        className={['song-thumb', className].filter(Boolean).join(' ')}
        aria-label={`${title || '유튜브'} 재생`}
        onClick={onPlay}
      >
        <img src={youtubeThumbUrl(videoId)} alt="" loading="lazy" />
        <span className="song-thumb-play" aria-hidden="true">
          ▶
        </span>
        {title ? <span className="song-thumb-title">{title}</span> : null}
      </button>
    )
  }

  return <p className="song-title-fallback">{title || fallbackText}</p>
}
