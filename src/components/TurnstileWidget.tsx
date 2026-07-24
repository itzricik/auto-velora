import { useEffect, useRef } from 'react'

declare global {
  interface Window {
    turnstile?: {
      render(element: HTMLElement, options: {
        sitekey: string
        callback(token: string): void
        'expired-callback'(): void
        theme: 'dark'
      }): string
      remove(widgetId: string): void
    }
  }
}

type TurnstileWidgetProps = {
  onTokenChange(token: string): void
}

export function TurnstileWidget({ onTokenChange }: TurnstileWidgetProps) {
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!siteKey || !container.current) return
    let widgetId = ''
    const render = () => {
      if (!container.current || !window.turnstile || widgetId) return
      widgetId = window.turnstile.render(container.current, {
        sitekey: siteKey,
        callback: onTokenChange,
        'expired-callback': () => onTokenChange(''),
        theme: 'dark',
      })
    }
    const existing = document.querySelector<HTMLScriptElement>('script[data-velora-turnstile]')
    if (existing) {
      existing.addEventListener('load', render)
      render()
    } else {
      const script = document.createElement('script')
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      script.async = true
      script.defer = true
      script.dataset.veloraTurnstile = 'true'
      script.addEventListener('load', render)
      document.head.append(script)
    }
    return () => {
      existing?.removeEventListener('load', render)
      if (widgetId) window.turnstile?.remove(widgetId)
    }
  }, [onTokenChange, siteKey])

  return siteKey ? <div ref={container} className="turnstile-widget" /> : null
}
