import { useEffect, useState } from 'react'
import { getSignedUserMediaUrl, isUserMediaReference } from './uploadUserMedia'

export function useUserMediaUrl(value) {
  const needsSignedUrl = isUserMediaReference(value)
  const [signed, setSigned] = useState({ source: null, url: '' })

  useEffect(() => {
    let cancelled = false
    if (!needsSignedUrl) return () => { cancelled = true }

    getSignedUserMediaUrl(value)
      .then(url => {
        if (!cancelled) setSigned({ source: value, url })
      })
      .catch(error => {
        console.warn('Could not resolve private media URL.', error)
        if (!cancelled) setSigned({ source: value, url: '' })
      })
    return () => { cancelled = true }
  }, [value, needsSignedUrl])

  if (!needsSignedUrl) return value || ''
  return signed.source === value ? signed.url : ''
}
