import { ArrowUp, Instagram, Mail, MapPin, MessageCircle, Phone, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { siteConfig } from '../config/site'
import { translations, type Language } from '../i18n/translations'
import { fetchPublicCatalog } from '../booking/apiClient'
import type { PublicCatalog } from '../shared/publicCatalog'

const footerNav = [
  { id: 'services', href: '#services' },
  { id: 'results', href: '#results' },
  { id: 'process', href: '#process' },
  { id: 'pricing', href: '#pricing' },
  { id: 'faq', href: '#faq' },
] as const

const legalHeadings = {
  en: { terms: 'Booking terms', cancellation: 'Cancellation policy', photos: 'Vehicle photographs', notice: 'Business privacy notice' },
  lv: { terms: 'Rezervācijas noteikumi', cancellation: 'Atcelšanas kārtība', photos: 'Transportlīdzekļa fotogrāfijas', notice: 'Uzņēmuma privātuma paziņojums' },
  ru: { terms: 'Условия записи', cancellation: 'Правила отмены', photos: 'Фотографии автомобиля', notice: 'Уведомление компании о конфиденциальности' },
} as const

export function Footer({ language }: { language: Language }) {
  const copy = translations[language]
  const [privacyOpen, setPrivacyOpen] = useState(false)
  const [catalog, setCatalog] = useState<PublicCatalog | null>(null)
  const privacyButtonRef = useRef<HTMLButtonElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const privacyCardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetchPublicCatalog(controller.signal).then((value) => {
      setCatalog(value)
      const business = value.business
      const script = document.getElementById('local-business-data')
      if (business && script) {
        script.textContent = JSON.stringify({
          '@context': 'https://schema.org', '@type': 'AutoWash',
          name: business.public_business_name, url: siteConfig.publicUrl,
          ...(business.registration_number ? { identifier: business.registration_number } : {}),
          ...(business.phone ? { telephone: business.phone } : {}),
          ...(business.email ? { email: business.email } : {}),
          ...(business.address ? { address: { '@type': 'PostalAddress', streetAddress: business.address, addressLocality: 'Riga', addressCountry: 'LV' } } : {}),
          openingHoursSpecification: value.businessHours.filter((row) => !row.is_closed && row.opens_at && row.closes_at).map((row) => ({ '@type': 'OpeningHoursSpecification', dayOfWeek: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][row.weekday], opens: row.opens_at?.slice(0, 5), closes: row.closes_at?.slice(0, 5) })),
        })
      }
    }).catch(() => undefined)
    return () => controller.abort()
  }, [])

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
    controller: catalog?.business?.legal_entity_name ?? 'Business-owned legal identity pending configuration',
    retention: catalog?.business?.reservation_retention_days ? `${catalog.business.reservation_retention_days} days` : 'Business-owned retention period pending configuration',
    contact: catalog?.business?.privacy_contact ?? 'Business-owned privacy contact pending configuration',
  }
  const business = catalog?.business
  const legalSuffix = language === 'lv' ? 'lv' : language === 'ru' ? 'ru' : 'en'
  const businessLegal = business ? {
    terms: business[`booking_terms_${legalSuffix}`],
    cancellation: business[`cancellation_policy_${legalSuffix}`],
    photos: business[`photo_processing_${legalSuffix}`],
    notice: business[`privacy_notice_${legalSuffix}`],
  } : null
  const dayNames = language === 'lv' ? ['Sv', 'Pr', 'Ot', 'Tr', 'Ce', 'Pk', 'Se'] : language === 'ru' ? ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  return (
    <footer className="site-footer">
      <div className="container footer-main">
        <div className="footer-brand">
          <a className="wordmark wordmark--footer" href="#top" aria-label="VELORA Detail Lab"><span>VELORA</span><small>DETAIL LAB</small></a>
          <p>{copy.footer.description}</p>
        </div>
        <div className="footer-column">
          <h2>{copy.footer.visit}</h2>
          {business?.address && (business.map_url ? <a href={business.map_url} target="_blank" rel="noopener noreferrer"><MapPin size={16} aria-hidden="true" />{business.address}</a> : <p><MapPin size={16} aria-hidden="true" />{business.address}</p>)}
          <h2>{copy.footer.hours}</h2>
          {catalog?.businessHours.filter((row) => !row.is_closed && row.opens_at && row.closes_at).map((row) => <p key={row.weekday}>{dayNames[row.weekday]} · {row.opens_at?.slice(0, 5)}–{row.closes_at?.slice(0, 5)}</p>)}
        </div>
        <div className="footer-column">
          <h2>{copy.footer.contact}</h2>
          {business?.phone && <a href={`tel:${business.phone.replace(/[^+\d]/g, '')}`}><Phone size={16} aria-hidden="true" />{business.phone}</a>}
          {business?.email && <a href={`mailto:${business.email}`}><Mail size={16} aria-hidden="true" />{business.email}</a>}
          {business?.instagram_url && <a href={business.instagram_url} target="_blank" rel="noopener noreferrer"><Instagram size={16} aria-hidden="true" />{copy.footer.follow}</a>}
          {business?.whatsapp_url && <a href={business.whatsapp_url} target="_blank" rel="noopener noreferrer"><MessageCircle size={16} aria-hidden="true" />WhatsApp</a>}
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
              {businessLegal?.terms && <section><h3>{legalHeadings[language].terms}</h3><p>{businessLegal.terms}</p></section>}
              {businessLegal?.cancellation && <section><h3>{legalHeadings[language].cancellation}</h3><p>{businessLegal.cancellation}</p></section>}
              {businessLegal?.photos && <section><h3>{legalHeadings[language].photos}</h3><p>{businessLegal.photos}</p></section>}
              {businessLegal?.notice && <section><h3>{legalHeadings[language].notice}</h3><p>{businessLegal.notice}</p></section>}
            </div>
            <p className="privacy-policy__meta">{copy.privacy.controller.replace('{controller}', privacyValues.controller)}<br />{copy.privacy.version.replace('{version}', siteConfig.consentPolicyVersion)}</p>
            <p className="privacy-policy__owner-action">{copy.privacy.ownerAction}</p>
          </div>
        </div>
      )}
    </footer>
  )
}
