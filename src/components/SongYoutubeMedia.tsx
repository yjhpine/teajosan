import { parseYoutubeId, youtubeEmbedUrl, youtubeThumbUrl } from '../lib/youtube'

type Props = {
  youtubeUrl: string
  title?: string
  playing: boolean
  onPlay: () => void
  onClose: () => void
  fallbackText?: string
  className?: string
  /** wide = 16:9 (default), cover = square album art */
  variant?: 'wide' | 'cover'
}

export function SongYoutubeMedia({
  youtubeUrl,
  title = '',
  playing,
  onPlay,
  onClose,
  fallbackText = '링크 없는 곡',
  className,
  variant = 'wide',
}: Props) {
  const videoId = parseYoutubeId(youtubeUrl)
  const isCover = variant === 'cover'
  const thumbClass = ['song-thumb', isCover ? 'song-thumb--cover' : '', className]
    .filter(Boolean)
    .join(' ')
  const mediaClass = ['song-media', isCover ? 'song-media--cover' : '', className]
    .filter(Boolean)
    .join(' ')

  if (playing && videoId && !isCover) {
    return (
      <div className={mediaClass}>
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
        className={[thumbClass, playing ? 'is-playing' : ''].filter(Boolean).join(' ')}
        aria-label={playing ? `${title || '유튜브'} 닫기` : `${title || '유튜브'} 재생`}
        aria-pressed={playing}
        onClick={playing ? onClose : onPlay}
      >
        <img src={youtubeThumbUrl(videoId)} alt="" loading="lazy" />
        <span className="song-thumb-play" aria-hidden="true">
          {playing ? '■' : '▶'}
        </span>
        {!isCover && title ? <span className="song-thumb-title">{title}</span> : null}
      </button>
    )
  }

  return (
    <p className={['song-title-fallback', isCover ? 'song-title-fallback--cover' : ''].filter(Boolean).join(' ')}>
      {title || fallbackText}
    </p>
  )
}
