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

export function youtubeEmbedUrl(id: string, autoplay = false): string {
  const params = new URLSearchParams({ rel: '0', playsinline: '1' })
  if (autoplay) params.set('autoplay', '1')
  return `https://www.youtube-nocookie.com/embed/${id}?${params.toString()}`
}

export function youtubeWatchUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`
}

export function youtubeThumbUrl(id: string): string {
  // mqdefault is true 16:9; hqdefault is 4:3 with letterbox bars baked in
  return `https://i.ytimg.com/vi/${id}/mqdefault.jpg`
}

export async function fetchYoutubeTitle(id: string): Promise<string | null> {
  try {
    const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(youtubeWatchUrl(id))}&format=json`
    const res = await fetch(endpoint)
    if (!res.ok) return null
    const data = (await res.json()) as { title?: unknown }
    const title = typeof data.title === 'string' ? data.title.trim() : ''
    return title || null
  } catch {
    return null
  }
}
