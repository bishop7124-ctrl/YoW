import { useUserMediaUrl } from '../../utils/useUserMediaUrl'

export function UserMediaImage({ src, fallback = null, ...props }) {
  const resolvedSrc = useUserMediaUrl(src)
  if (!resolvedSrc) return fallback
  return <img src={resolvedSrc} {...props} />
}

export function UserMediaSvgImage({ href, fallback = null, ...props }) {
  const resolvedHref = useUserMediaUrl(href)
  if (!resolvedHref) return fallback
  return <image href={resolvedHref} {...props} />
}
