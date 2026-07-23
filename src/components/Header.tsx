import { Menu, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { languageLabels, translations, type Language } from '../i18n/translations'

type HeaderProps = {
  language: Language
  onLanguageChange: (language: Language) => void
}

const navItems = [
  { id: 'services', href: '#services' },
  { id: 'results', href: '#results' },
  { id: 'process', href: '#process' },
  { id: 'pricing', href: '#pricing' },
  { id: 'faq', href: '#faq' },
] as const

function LanguageSelector({ language, onChange, label }: { language: Language; onChange: (language: Language) => void; label: string }) {
  return (
    <div className="language-selector" aria-label={label} role="group">
      {(Object.keys(languageLabels) as Language[]).map((item) => (
        <button key={item} type="button" className={language === item ? 'is-active' : ''} aria-pressed={language === item} onClick={() => onChange(item)}>
          {languageLabels[item]}
        </button>
      ))}
    </div>
  )
}

export function Header({ language, onLanguageChange }: HeaderProps) {
  const copy = translations[language]
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeSection, setActiveSection] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 36)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const observers = navItems
      .map(({ id }) => document.getElementById(id))
      .filter((section): section is HTMLElement => Boolean(section))
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        if (visible) setActiveSection(visible.target.id)
      },
      { rootMargin: '-25% 0px -60% 0px', threshold: [0.05, 0.2, 0.5] },
    )
    observers.forEach((section) => observer.observe(section))
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const panel = menuRef.current
    const focusable = panel?.querySelectorAll<HTMLElement>('a, button:not([disabled])')
    focusable?.[0]?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
        menuButtonRef.current?.focus()
        return
      }
      if (event.key !== 'Tab' || !focusable?.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  const closeMenu = () => setMenuOpen(false)

  return (
    <header className={`site-header ${scrolled || menuOpen ? 'site-header--solid' : ''}`}>
      <div className="site-header__inner container">
        <a className="wordmark" href="#top" aria-label="VELORA Detail Lab" onClick={closeMenu}>
          <span>VELORA</span>
          <small>DETAIL LAB</small>
        </a>

        <nav className="desktop-nav" aria-label={copy.header.navLabel}>
          {navItems.map((item) => (
            <a key={item.id} href={item.href} className={activeSection === item.id ? 'is-active' : ''} aria-current={activeSection === item.id ? 'location' : undefined}>
              {copy.header.nav[item.id]}
            </a>
          ))}
        </nav>

        <div className="site-header__actions">
          <div className="desktop-language">
            <LanguageSelector language={language} onChange={onLanguageChange} label={copy.header.language} />
          </div>
          <a className="button button--small button--copper desktop-book" href="#booking">{copy.header.book}</a>
          <button
            ref={menuButtonRef}
            type="button"
            className="menu-button"
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            aria-label={menuOpen ? copy.header.menuClose : copy.header.menuOpen}
            onClick={() => setMenuOpen((value) => !value)}
          >
            {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </button>
        </div>
      </div>

      <div id="mobile-menu" ref={menuRef} className={`mobile-menu ${menuOpen ? 'is-open' : ''}`} aria-hidden={!menuOpen}>
        <nav aria-label={copy.header.navLabel}>
          {navItems.map((item, index) => (
            <a key={item.id} href={item.href} onClick={closeMenu} tabIndex={menuOpen ? 0 : -1}>
              <span>0{index + 1}</span>{copy.header.nav[item.id]}
            </a>
          ))}
        </nav>
        <div className="mobile-menu__footer">
          <LanguageSelector language={language} onChange={onLanguageChange} label={copy.header.language} />
          <a className="button button--copper" href="#booking" onClick={closeMenu} tabIndex={menuOpen ? 0 : -1}>{copy.header.book}</a>
        </div>
      </div>
    </header>
  )
}
