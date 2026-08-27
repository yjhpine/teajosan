const YOUTUBE_ID_RE = /^[\w-]{11}$/

export function parseYoutubeId(input: string): string | null {
  const raw = input.trim()
  if (!raw) return null
  if (YOUTUBE_ID_RE.test(raw)) return raw

  try {
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
    const url = new URL(withProtocol)
    const host = url.hostname.replace(/^www\./, '')

    if (host === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0] ?? ''
      return YOUTUBE_ID_RE.test(id) ? id : null
    }

    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      const v = url.searchParams.get('v')
      if (v && YOUTUBE_ID_RE.test(v)) return v

      const parts = url.pathname.split('/').filter(Boolean)
      if ((parts[0] === 'embed' || parts[0] === 'shorts' || parts[0] === 'live') && parts[1]) {
        return YOUTUBE_ID_RE.test(parts[1]) ? parts[1] : null
      }
    }
  } catch {
    return null
  }

  return null
}

export function youtubeEmbedUrl(id: string): string {
  return `https://www.youtube-nocookie.com/embed/${id}?rel=0`
}

export function youtubeWatchUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`
}
