import { ArrowUp, Instagram, Mail, MapPin, Phone, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { siteConfig } from '../config/site'
import { translations, type Language } from '../i18n/translations'

const footerNav = [
  { id: 'services', href: '#services' },
  { id: 'results', href: '#results' },
  { id: 'process', href: '#process' },
  { id: 'pricing', href: '#pricing' },
  { id: 'faq', href: '#faq' },
] as const

export function Footer({ language }: { language: Language }) {
  const copy = translations[language]
  const [privacyOpen, setPrivacyOpen] = useState(false)
  const privacyButtonRef = useRef<HTMLButtonElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const privacyCardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!privacyOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButtonRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPrivacyOpen(false)
        privacyButtonRef.current?.focus()
      }
      if (event.key === 'Tab') {
        const focusable = privacyCardRef.current?.querySelectorAll<HTMLElement>('button, a[href]')
        if (!focusable?.length) return
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
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [privacyOpen])

  const closePrivacy = () => {
    setPrivacyOpen(false)
    window.setTimeout(() => privacyButtonRef.current?.focus(), 0)
  }

  const privacyValues = {
    controller: siteConfig.dataControllerName ?? siteConfig.requiredConfigurationLabels.dataController,
    retention: siteConfig.dataRetentionPeriod ?? siteConfig.requiredConfigurationLabels.retentionPeriod,
    contact: siteConfig.privacyContact ?? siteConfig.requiredConfigurationLabels.privacyContact,
  }

  return (
    <footer className="site-footer">
      <div className="container footer-main">
        <div className="footer-brand">
          <a className="wordmark wordmark--footer" href="#top" aria-label="VELORA Detail Lab"><span>VELORA</span><small>DETAIL LAB</small></a>
          <p>{copy.footer.description}</p>
          <span className="placeholder-note">{copy.footer.placeholder}</span>
        </div>
        <div className="footer-column">
          <h2>{copy.footer.visit}</h2>
          <p><MapPin size={16} aria-hidden="true" />{siteConfig.address ?? siteConfig.requiredConfigurationLabels.address}</p>
          <h2>{copy.footer.hours}</h2>
          <p>{copy.footer.weekday}<br />{copy.footer.saturday}<br />{copy.footer.sunday}</p>
        </div>
        <div className="footer-column">
          <h2>{copy.footer.contact}</h2>
          {siteConfig.phoneHref && siteConfig.phoneDisplay
            ? <a href={`tel:${siteConfig.phoneHref}`}><Phone size={16} aria-hidden="true" />{siteConfig.phoneDisplay}</a>
            : <p><Phone size={16} aria-hidden="true" />{siteConfig.requiredConfigurationLabels.phone}</p>}
          {siteConfig.bookingEmail
            ? <a href={`mailto:${siteConfig.bookingEmail}`}><Mail size={16} aria-hidden="true" />{siteConfig.bookingEmail}</a>
            : <p><Mail size={16} aria-hidden="true" />{siteConfig.requiredConfigurationLabels.email}</p>}
          {siteConfig.instagramUrl
            ? <a href={siteConfig.instagramUrl} target="_blank" rel="noreferrer"><Instagram size={16} aria-hidden="true" />{copy.footer.follow}</a>
            : <p><Instagram size={16} aria-hidden="true" />{siteConfig.requiredConfigurationLabels.instagram}</p>}
        </div>
        <nav className="footer-nav" aria-label={copy.header.navLabel}>
          {footerNav.map((item) => <a key={item.id} href={item.href}>{copy.header.nav[item.id]}</a>)}
        </nav>
      </div>
      <div className="container footer-bottom">
        <p>© {new Date().getFullYear()} VELORA Detail Lab. {copy.footer.rights}</p>
        <button ref={privacyButtonRef} type="button" onClick={() => setPrivacyOpen(true)}>{copy.footer.privacy}</button>
        <a href="#top" className="back-to-top" aria-label="VELORA"><ArrowUp size={17} aria-hidden="true" /></a>
      </div>

      {privacyOpen && (
        <div className="privacy-modal" role="dialog" aria-modal="true" aria-labelledby="privacy-title" onMouseDown={(event) => event.target === event.currentTarget && closePrivacy()}>
          <div className="privacy-modal__card" ref={privacyCardRef}>
            <button ref={closeButtonRef} type="button" onClick={closePrivacy} aria-label={copy.privacy.close}><X aria-hidden="true" /></button>
            <p className="eyebrow">VELORA DETAIL LAB</p>
            <h2 id="privacy-title">{copy.privacy.title}</h2>
            <p className="privacy-modal__intro">{copy.privacy.intro}</p>
            <div className="privacy-policy">
              <section><h3>{copy.privacy.collectedTitle}</h3><p>{copy.privacy.collectedBody}</p></section>
              <section><h3>{copy.privacy.purposeTitle}</h3><p>{copy.privacy.purposeBody}</p></section>
              <section><h3>{copy.privacy.processingTitle}</h3><p>{copy.privacy.processingBody}</p></section>
              <section><h3>{copy.privacy.legalTitle}</h3><p>{copy.privacy.legalBody}</p></section>
              <section><h3>{copy.privacy.retentionTitle}</h3><p>{copy.privacy.retentionBody.replace('{retention}', privacyValues.retention)}</p></section>
              <section><h3>{copy.privacy.rightsTitle}</h3><p>{copy.privacy.rightsBody.replace('{contact}', privacyValues.contact)}</p></section>
              <section><h3>{copy.privacy.statusTitle}</h3><p>{copy.privacy.statusBody}</p></section>
            </div>
            <p className="privacy-policy__meta">{copy.privacy.controller.replace('{controller}', privacyValues.controller)}<br />{copy.privacy.version.replace('{version}', siteConfig.consentPolicyVersion)}</p>
            <p className="privacy-policy__owner-action">{copy.privacy.ownerAction}</p>
          </div>
        </div>
      )}
    </footer>
  )
}
