export type TelegramWebApp = {
  initData: string
  initDataUnsafe?: { start_param?: string }
  colorScheme: 'light' | 'dark'
  themeParams: Record<string, string | undefined>
  viewportHeight: number
  viewportStableHeight: number
  isExpanded: boolean
  ready(): void
  expand(): void
  close(): void
  disableVerticalSwipes?(): void
  setHeaderColor?(color: string): void
  setBackgroundColor?(color: string): void
  requestWriteAccess?(callback?: (granted: boolean) => void): void
  BackButton: { isVisible: boolean; show(): void; hide(): void; onClick(callback: () => void): void; offClick(callback: () => void): void }
  MainButton: {
    isVisible: boolean
    show(): void
    hide(): void
    setText(text: string): void
    enable(): void
    disable(): void
    showProgress(leaveActive?: boolean): void
    hideProgress(): void
    onClick(callback: () => void): void
    offClick(callback: () => void): void
  }
  HapticFeedback?: {
    impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void
    notificationOccurred(type: 'error' | 'success' | 'warning'): void
  }
}

declare global {
  interface Window { Telegram?: { WebApp?: TelegramWebApp } }
}

let loading: Promise<TelegramWebApp | null> | null = null

export function loadTelegramWebApp(): Promise<TelegramWebApp | null> {
  if (window.Telegram?.WebApp) return Promise.resolve(window.Telegram.WebApp)
  if (loading) return loading
  loading = new Promise((resolve) => {
    const script = document.createElement('script')
    script.src = 'https://telegram.org/js/telegram-web-app.js'
    script.async = true
    script.onload = () => resolve(window.Telegram?.WebApp ?? null)
    script.onerror = () => resolve(null)
    document.head.append(script)
  })
  return loading
}

export function applyTelegramTheme(app: TelegramWebApp): void {
  const root = document.documentElement
  const theme = app.themeParams
  root.style.setProperty('--tg-bg', theme.bg_color ?? '#08090b')
  root.style.setProperty('--tg-surface', theme.secondary_bg_color ?? theme.section_bg_color ?? '#111318')
  root.style.setProperty('--tg-text', theme.text_color ?? '#f4f1eb')
  root.style.setProperty('--tg-muted', theme.hint_color ?? '#9b9da3')
  root.style.setProperty('--tg-button', theme.button_color ?? '#c88452')
  root.style.setProperty('--tg-button-text', theme.button_text_color ?? '#08090b')
  root.style.setProperty('--tg-link', theme.link_color ?? '#d99a69')
  root.style.setProperty('--tg-destructive', theme.destructive_text_color ?? '#e36c6c')
  root.style.setProperty('--tg-viewport-height', `${app.viewportStableHeight || app.viewportHeight || window.innerHeight}px`)
}
