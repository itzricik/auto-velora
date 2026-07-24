import type { ImgHTMLAttributes, SyntheticEvent } from 'react'

const FALLBACK_IMAGE = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800" role="img" aria-label="VELORA">
    <defs>
      <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#111318"/>
        <stop offset="1" stop-color="#08090b"/>
      </linearGradient>
      <radialGradient id="glow" cx="50%" cy="45%" r="55%">
        <stop offset="0" stop-color="#c88452" stop-opacity="0.18"/>
        <stop offset="1" stop-color="#c88452" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="1200" height="800" fill="url(#background)"/>
    <rect width="1200" height="800" fill="url(#glow)"/>
    <path d="M420 400h360" stroke="#c88452" stroke-width="2" opacity="0.55"/>
    <text x="600" y="365" fill="#f4f1eb" font-family="Arial, sans-serif" font-size="64" font-weight="700" letter-spacing="18" text-anchor="middle">VELORA</text>
    <text x="600" y="445" fill="#c88452" font-family="Arial, sans-serif" font-size="20" font-weight="700" letter-spacing="10" text-anchor="middle">DETAIL LAB</text>
  </svg>
`)}`

function resolveAssetUrl(url: string): string {
  if (!url.startsWith('/') || url.startsWith('//')) return url
  const base = import.meta.env.BASE_URL || '/'
  return `${base.replace(/\/?$/, '/')}${url.replace(/^\/+/, '')}`
}

function resolveSrcSet(srcSet: string | undefined): string | undefined {
  if (!srcSet) return undefined

  return srcSet
    .split(',')
    .map((candidate) => {
      const [url, ...descriptor] = candidate.trim().split(/\s+/)
      return [resolveAssetUrl(url), ...descriptor].join(' ')
    })
    .join(', ')
}

type SafeImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'srcSet'> & {
  src: string
  srcSet?: string
}

export function SafeImage({ src, srcSet, alt = '', onError, ...props }: SafeImageProps) {
  const handleError = (event: SyntheticEvent<HTMLImageElement>) => {
    const image = event.currentTarget
    if (image.dataset.fallbackApplied === 'true') return

    image.dataset.fallbackApplied = 'true'
    image.removeAttribute('srcset')
    image.removeAttribute('sizes')
    image.src = FALLBACK_IMAGE
    image.alt = alt || 'VELORA Detail Lab'
    image.style.backgroundColor = '#111318'
    image.style.objectFit = 'cover'
    onError?.(event)
  }

  return (
    <img
      {...props}
      src={resolveAssetUrl(src)}
      srcSet={resolveSrcSet(srcSet)}
      alt={alt}
      onError={handleError}
    />
  )
}
