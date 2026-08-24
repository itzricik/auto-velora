import { lazy, Suspense, useEffect, useState } from 'react'
import { Header } from './components/Header'
import { Hero } from './components/Hero'
import { Services } from './components/Services'
import { Estimator } from './components/Estimator'
import { BeforeAfter } from './components/BeforeAfter'
import { Gallery } from './components/Gallery'
import { Process } from './components/Process'
import { Pricing } from './components/Pricing'
import { Faq } from './components/Faq'
import { Booking } from './components/Booking'
import { Footer } from './components/Footer'
import { translations, type Language } from './i18n/translations'
import type { ServiceId, VehicleId } from './pricing'
import { BookingManager } from './components/BookingManager'
import { CommercialContent } from './components/CommercialContent'
import { CatalogProvider } from './booking/CatalogContext'

const TelegramApp = lazy(async () => ({ default: (await import('./telegram/TelegramApp')).TelegramApp }))

function getInitialLanguage(): Language {
  const saved = window.localStorage.getItem('velora-language')
  return saved === 'lv' || saved === 'ru' || saved === 'en' ? saved : 'en'
}

export default function App() {
  const [language, setLanguage] = useState<Language>(getInitialLanguage)
  const [selectedServices, setSelectedServices] = useState<ServiceId[]>([])
  const [vehicle, setVehicle] = useState<VehicleId>('sedan')
  const copy = translations[language]

  useEffect(() => {
    window.localStorage.setItem('velora-language', language)
    document.documentElement.lang = language
    document.title = copy.meta.title
    document.querySelector<HTMLMetaElement>('meta[name="description"]')?.setAttribute('content', copy.meta.description)
  }, [copy.meta.description, copy.meta.title, language])

  useEffect(() => {
    const elements = document.querySelectorAll<HTMLElement>('[data-reveal]')
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-revealed')
          observer.unobserve(entry.target)
        }
      }),
      { threshold: 0.08, rootMargin: '0px 0px -40px' },
    )
    elements.forEach((element) => observer.observe(element))
    return () => observer.disconnect()
  }, [language])

  const toggleService = (service: ServiceId) => {
    setSelectedServices((current) => current.includes(service) ? current.filter((item) => item !== service) : [...current, service])
  }

  const scrollToBooking = () => document.getElementById('booking')?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  const choosePackage = (serviceIds: ServiceId[]) => {
    setSelectedServices(serviceIds)
    window.setTimeout(scrollToBooking, 0)
  }

  if (window.location.pathname === '/telegram') {
    return <CatalogProvider><Suspense fallback={<main className="tg-centered"><span className="tg-loader" /></main>}><TelegramApp /></Suspense></CatalogProvider>
  }

  if (window.location.pathname === '/booking') {
    return <BookingManager language={language} />
  }

  return (
    <CatalogProvider>
      <a className="skip-link" href="#main-content">{copy.common.skip}</a>
      <Header language={language} onLanguageChange={setLanguage} />
      <main id="main-content">
        <Hero language={language} />
        <Services language={language} selected={selectedServices} onToggle={toggleService} />
        <Estimator language={language} selected={selectedServices} vehicle={vehicle} onVehicleChange={setVehicle} onToggle={toggleService} onContinue={scrollToBooking} />
        <CommercialContent language={language} />
        <BeforeAfter language={language} />
        <Gallery language={language} />
        <Process language={language} />
        <Pricing language={language} onChoose={choosePackage} />
        <Faq language={language} />
        <Booking language={language} estimatorSelections={selectedServices} estimatorVehicle={vehicle} />
      </main>
      <Footer language={language} />
      <a className="mobile-sticky-cta" href="#booking">{copy.header.book}</a>
    </CatalogProvider>
  )
}
