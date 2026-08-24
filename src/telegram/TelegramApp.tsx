import { CalendarDays, Car, ChevronRight, Clock3, Home, Send, ShieldCheck, Sparkles, UserRound, Wrench } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { usePublicCatalog } from '../booking/CatalogContext'
import type { BookingLanguage } from '../shared/contracts'
import { parseTelegramStartParam, type TelegramProfile, type TelegramView } from '../shared/telegram'
import { authenticateTelegram, updateTelegramProfile } from './api'
import { telegramCopy } from './copy'
import { TelegramBookingFlow } from './TelegramBookingFlow'
import { applyTelegramTheme, loadTelegramWebApp, type TelegramWebApp } from './telegram-sdk'
import './telegram.css'

function localized(item: Record<string, unknown>, field: string, language: BookingLanguage): string {
  return String(item[`${field}_${language}`] ?? item[`${field}_en`] ?? '')
}

function money(cents: number, language: BookingLanguage): string {
  const locale = language === 'lv' ? 'lv-LV' : language === 'ru' ? 'ru-LV' : 'en-LV'
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(cents / 100)
}

function Loading({ text }: { text: string }) {
  return <main className="tg-centered"><span className="tg-loader" aria-hidden="true" /><p>{text}</p></main>
}

export function TelegramApp() {
  const { catalog, status: catalogStatus, retry } = usePublicCatalog()
  const [app, setApp] = useState<TelegramWebApp | null>(null)
  const [mode, setMode] = useState<'loading' | 'outside' | 'error' | 'ready'>('loading')
  const [token, setToken] = useState('')
  const [profile, setProfile] = useState<TelegramProfile | null>(null)
  const [view, setView] = useState<TelegramView>('home')
  const [language, setLanguage] = useState<BookingLanguage>('en')
  const [selectedServices, setSelectedServices] = useState<string[]>([])
  const [pendingStartParam, setPendingStartParam] = useState('')

  useEffect(() => {
    let active = true
    loadTelegramWebApp().then(async (telegram) => {
      if (!active) return
      setApp(telegram)
      if (!telegram?.initData) { setMode('outside'); return }
      try {
        telegram.ready()
        telegram.expand()
        telegram.disableVerticalSwipes?.()
        telegram.setHeaderColor?.('#08090b')
        telegram.setBackgroundColor?.('#08090b')
        applyTelegramTheme(telegram)
        const auth = await authenticateTelegram(telegram.initData)
        if (!active) return
        setToken(auth.sessionToken)
        setProfile(auth.profile)
        setLanguage(auth.profile.language)
        setPendingStartParam(auth.startParam ?? telegram.initDataUnsafe?.start_param ?? new URLSearchParams(location.search).get('tgStart') ?? '')
        setMode('ready')
      } catch {
        if (active) setMode('error')
      }
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!catalog || !pendingStartParam) return
    const start = parseTelegramStartParam(pendingStartParam, catalog.services.map((service) => service.code))
    setView(start.view)
    if (start.serviceCode) {
      const service = catalog.services.find((item) => item.code === start.serviceCode)
      if (service) setSelectedServices([service.id])
    }
    setPendingStartParam('')
  }, [catalog, pendingStartParam])

  const go = useCallback((next: TelegramView) => {
    setView(next)
    window.scrollTo({ top: 0, behavior: 'smooth' })
    app?.HapticFeedback?.impactOccurred('light')
  }, [app])

  useEffect(() => {
    if (!app) return
    const back = () => go('home')
    if (view === 'home') app.BackButton.hide()
    else { app.BackButton.show(); app.BackButton.onClick(back) }
    return () => app.BackButton.offClick(back)
  }, [app, go, view])

  const copy = telegramCopy[language]
  if (mode === 'loading' || mode === 'ready' && catalogStatus === 'loading') return <Loading text={copy.loading} />
  if (mode === 'outside') return <main className="tg-centered tg-outside"><div className="tg-mark">VELORA<small>DETAIL LAB</small></div><Send size={28} /><h1>Telegram Mini App</h1><p>{copy.telegramOnly}</p><a className="tg-primary" href="/">{copy.openWebsite}</a></main>
  if (mode === 'error') return <main className="tg-centered"><div className="tg-mark">VELORA<small>DETAIL LAB</small></div><h1>{copy.authError}</h1><button className="tg-primary" onClick={() => location.reload()}>{copy.retry}</button></main>
  if (!profile || !catalog || catalogStatus === 'error') return <main className="tg-centered"><p>{copy.error}</p><button className="tg-primary" onClick={retry}>{copy.retry}</button></main>

  const toggleService = (id: string) => setSelectedServices((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id])
  const startBooking = (serviceId?: string) => {
    if (serviceId) setSelectedServices((current) => current.includes(serviceId) ? current : [...current, serviceId])
    go('book')
  }
  const setUpdatedProfile = (next: TelegramProfile) => { setProfile(next); setLanguage(next.language) }

  return (
    <div className="tg-shell">
      <header className="tg-header"><div className="tg-mark">VELORA<small>DETAIL LAB</small></div><button className="tg-avatar" onClick={() => go('profile')} aria-label={copy.profile}>{profile.photoUrl ? <img src={profile.photoUrl} alt="" /> : profile.firstName.slice(0, 1)}</button></header>
      <main className="tg-main">
        {view === 'home' && <HomeView profile={profile} language={language} onGo={go} />}
        {view === 'services' && <section><div className="tg-section-head"><div><span>{copy.services}</span><h1>{copy.chooseServices}</h1></div><b>{selectedServices.length} {copy.selected}</b></div><div className="tg-service-list">{catalog.services.map((service) => <button key={service.id} className={`tg-service ${selectedServices.includes(service.id) ? 'is-selected' : ''}`} onClick={() => toggleService(service.id)}><span className="tg-check" aria-hidden="true">{selectedServices.includes(service.id) ? '✓' : ''}</span><span><strong>{localized(service as unknown as Record<string, unknown>, 'name', language)}</strong><small>{localized(service as unknown as Record<string, unknown>, 'description', language)}</small><em>{copy.from} {money(service.base_price_cents, language)} · {service.base_duration_minutes} {copy.minutes}</em></span></button>)}</div><button className="tg-primary tg-wide" disabled={!selectedServices.length} onClick={() => startBooking()}>{copy.continue}<ChevronRight size={18} /></button></section>}
        {view === 'book' && <TelegramBookingFlow app={app} token={token} profile={profile} catalog={catalog} language={language} initialServiceIds={selectedServices} onProfile={setUpdatedProfile} onDone={() => go('bookings')} />}
        {view === 'bookings' && <BookingsView profile={profile} language={language} onBook={() => go('services')} />}
        {view === 'profile' && <ProfileView app={app} token={token} profile={profile} language={language} onProfile={setUpdatedProfile} />}
      </main>
      {view !== 'book' && <nav className="tg-nav" aria-label="Mini App"><button className={view === 'home' ? 'active' : ''} onClick={() => go('home')}><Home size={20} /><span>VELORA</span></button><button className={view === 'services' ? 'active' : ''} onClick={() => go('services')}><Wrench size={20} /><span>{copy.services}</span></button><button className={view === 'bookings' ? 'active' : ''} onClick={() => go('bookings')}><CalendarDays size={20} /><span>{copy.bookings}</span></button><button className={view === 'profile' ? 'active' : ''} onClick={() => go('profile')}><UserRound size={20} /><span>{copy.profile}</span></button></nav>}
    </div>
  )
}

function HomeView({ profile, language, onGo }: { profile: TelegramProfile; language: BookingLanguage; onGo: (view: TelegramView) => void }) {
  const copy = telegramCopy[language]
  const next = profile.bookings.find((booking) => booking.start && Date.parse(booking.start) > Date.now() && !['cancelled', 'completed', 'no_show'].includes(booking.status))
  return <><section className="tg-hero"><span className="tg-kicker">VELORA · RIGA</span><h1>{copy.welcome}</h1><p>{copy.lead}</p><button className="tg-primary" onClick={() => onGo('services')}>{copy.book}<ChevronRight size={18} /></button></section>{next && <button className="tg-next" onClick={() => onGo('bookings')}><CalendarDays size={21} /><span><small>{copy.upcoming}</small><strong>{next.vehicle}</strong><em>{new Intl.DateTimeFormat(language === 'ru' ? 'ru-LV' : language === 'lv' ? 'lv-LV' : 'en-LV', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Riga' }).format(new Date(next.start!))}</em></span><ChevronRight size={18} /></button>}<div className="tg-home-grid"><button onClick={() => onGo('services')}><Sparkles size={22} /><strong>{copy.services}</strong><span>{copy.chooseServices}</span></button><button onClick={() => onGo('profile')}><Car size={22} /><strong>{copy.garage}</strong><span>{profile.vehicles.length || '—'}</span></button><button onClick={() => onGo('bookings')}><ShieldCheck size={22} /><strong>{copy.bookings}</strong><span>{profile.bookings.length || '—'}</span></button><button onClick={() => onGo('book')}><Clock3 size={22} /><strong>{copy.book}</strong><span>{copy.available}</span></button></div></>
}

function BookingsView({ profile, language, onBook }: { profile: TelegramProfile; language: BookingLanguage; onBook: () => void }) {
  const copy = telegramCopy[language]
  const sorted = [...profile.bookings].sort((a, b) => Date.parse(b.start ?? '0') - Date.parse(a.start ?? '0'))
  return <section><div className="tg-section-head"><div><span>VELORA</span><h1>{copy.bookings}</h1></div></div>{!sorted.length ? <div className="tg-empty"><CalendarDays size={30} /><p>{copy.noBookings}</p><button className="tg-primary" onClick={onBook}>{copy.book}</button></div> : <div className="tg-booking-list">{sorted.map((booking) => <article key={booking.id}><div><span className={`tg-status status-${booking.status}`}>{booking.status.replace('_', ' ')}</span><small>{booking.reference}</small></div><h2>{booking.vehicle}</h2><p>{booking.services.join(', ')}</p>{booking.start && <time>{new Intl.DateTimeFormat(language === 'ru' ? 'ru-LV' : language === 'lv' ? 'lv-LV' : 'en-LV', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Riga' }).format(new Date(booking.start))}</time>}<strong>{money(booking.estimatedPriceMinCents, language)}{booking.estimatedPriceMaxCents !== booking.estimatedPriceMinCents ? `–${money(booking.estimatedPriceMaxCents, language)}` : ''}</strong></article>)}</div>}</section>
}

function ProfileView({ app, token, profile, language, onProfile }: { app: TelegramWebApp | null; token: string; profile: TelegramProfile; language: BookingLanguage; onProfile: (value: TelegramProfile) => void }) {
  const copy = telegramCopy[language]
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const selected = profile.vehicles.find((vehicle) => vehicle.id === editing)
  const [saving, setSaving] = useState(false)
  const enable = () => app?.requestWriteAccess?.(async (granted) => {
    try { onProfile(await updateTelegramProfile(token, { action: 'write_access', granted })) } catch { app.HapticFeedback?.notificationOccurred('error') }
  })
  return <section><div className="tg-profile-card">{profile.photoUrl ? <img src={profile.photoUrl} alt="" /> : <span>{profile.firstName[0]}</span>}<div><h1>{profile.firstName} {profile.lastName}</h1>{profile.username && <p>@{profile.username}</p>}<small>{profile.customer?.phone ?? 'Telegram ID ' + profile.userId}</small></div></div><div className="tg-panel"><div className="tg-panel-title"><h2>{copy.notifications}</h2>{profile.allowsWriteToPm ? <span className="tg-positive">{copy.notificationsOn}</span> : <button onClick={enable}>{copy.enableNotifications}</button>}</div></div><div className="tg-panel"><div className="tg-panel-title"><h2>{copy.garage}</h2>{profile.linked && <button onClick={() => setEditing('new')}>+ {copy.addCar}</button>}</div>{!profile.linked && <p className="tg-muted">{copy.linkedAfter}</p>}{profile.vehicles.map((vehicle) => <div className="tg-car" key={vehicle.id}><Car size={21} /><span><strong>{vehicle.makeModel}</strong><small>{vehicle.registrationNumber ?? vehicle.vehicleType}</small></span><button onClick={() => setEditing(vehicle.id)}>{copy.edit}</button></div>)}{editing && <VehicleEditor language={language} initial={selected} saving={saving} onCancel={() => setEditing(null)} onSave={async (value) => { setSaving(true); try { onProfile(await updateTelegramProfile(token, { action: 'save_vehicle', vehicleId: selected?.id, ...value })); setEditing(null); app?.HapticFeedback?.notificationOccurred('success') } finally { setSaving(false) } }} />}</div><div className="tg-language"><span>{copy.language}</span>{(['en', 'lv', 'ru'] as const).map((item) => <button key={item} className={item === language ? 'active' : ''} onClick={() => { void updateTelegramProfile(token, { action: 'set_language', language: item }).then(onProfile) }}>{item.toUpperCase()}</button>)}</div></section>
}

function VehicleEditor({ language, initial, saving, onCancel, onSave }: { language: BookingLanguage; initial?: TelegramProfile['vehicles'][number]; saving: boolean; onCancel: () => void; onSave: (value: { makeModel: string; vehicleCategoryId: string; registrationNumber: string }) => Promise<void> }) {
  const { catalog } = usePublicCatalog()
  const copy = telegramCopy[language]
  const [makeModel, setMakeModel] = useState(initial?.makeModel ?? '')
  const [category, setCategory] = useState(initial?.vehicleCategoryId ?? catalog?.vehicleCategories[0]?.id ?? '')
  const [registration, setRegistration] = useState(initial?.registrationNumber ?? '')
  return <form className="tg-inline-form" onSubmit={(event) => { event.preventDefault(); void onSave({ makeModel, vehicleCategoryId: category, registrationNumber: registration }) }}><label>{copy.makeModel}<input required minLength={2} maxLength={120} value={makeModel} onChange={(event) => setMakeModel(event.target.value)} /></label><label>{copy.category}<select value={category} onChange={(event) => setCategory(event.target.value)}>{catalog?.vehicleCategories.map((item) => <option value={item.id} key={item.id}>{localized(item as unknown as Record<string, unknown>, 'name', language)}</option>)}</select></label><label>{copy.registration}<input maxLength={20} value={registration} onChange={(event) => setRegistration(event.target.value)} /></label><div><button type="button" onClick={onCancel}>{copy.back}</button><button className="tg-primary" disabled={saving}>{copy.save}</button></div></form>
}
