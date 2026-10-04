// 2026-10-03 22:25, server-side mirror of the tablet's getVideoEmbed() rules (src/views/tablet-app.html)
// so the dashboard only saves videos the tablet can actually play.

/** True for YouTube (watch / youtu.be / shorts / embed / live), Vimeo, or an uploaded /uploads/... video file. */
export function isPlayableVideoUrl(raw: unknown): boolean {
  if (typeof raw !== 'string' || !raw.trim()) return false;
  const value = raw.trim();

  if (value.startsWith('/uploads/') && !value.includes('..')) {
    return /\.(mp4|webm|mov|m4v)$/i.test(value);
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;

  const host = url.hostname.replace(/^www\.|^m\./, '');
  if (host === 'youtu.be') {
    return /^[\w-]{6,20}$/.test(url.pathname.slice(1));
  }
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const id = url.searchParams.get('v') || (url.pathname.match(/^\/(?:embed|shorts|live)\/([^/?]+)/) || [])[1];
    return !!id && /^[\w-]{6,20}$/.test(id);
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    return /\d{6,12}/.test(url.pathname);
  }
  return false;
}
