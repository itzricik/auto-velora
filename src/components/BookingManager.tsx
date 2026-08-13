import { LoaderCircle, XCircle } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { cancelApiBooking, fetchBookingStatus } from '../booking/apiClient'
import type { Language } from '../i18n/translations'

const copy = {
  en: {
    title: 'Manage booking',
    loading: 'Loading booking…',
    invalid: 'This management link is invalid or has expired.',
    status: 'Status',
    date: 'Date and time',
    services: 'Services',
    vehicle: 'Vehicle',
    estimate: 'Estimated price',
    cancel: 'Cancel booking',
    cancelling: 'Cancelling…',
    reason: 'Cancellation reason (optional)',
    cancelled: 'The booking was cancelled.',
    unavailable: 'Booking management is temporarily unavailable.',
    back: 'Return to VELORA',
  },
  lv: {
    title: 'Pārvaldīt vizīti',
    loading: 'Ielādējam vizīti…',
    invalid: 'Šī pārvaldības saite nav derīga vai ir beigusies.',
    status: 'Statuss',
    date: 'Datums un laiks',
    services: 'Pakalpojumi',
    vehicle: 'Auto',
    estimate: 'Paredzamā cena',
    cancel: 'Atcelt vizīti',
    cancelling: 'Atceļam…',
    reason: 'Atcelšanas iemesls (nav obligāts)',
    cancelled: 'Vizīte ir atcelta.',
    unavailable: 'Vizītes pārvaldība īslaicīgi nav pieejama.',
    back: 'Atgriezties VELORA',
  },
  ru: {
    title: 'Управление записью',
    loading: 'Загружаем запись…',
    invalid: 'Ссылка управления недействительна или устарела.',
    status: 'Статус',
    date: 'Дата и время',
    services: 'Услуги',
    vehicle: 'Автомобиль',
    estimate: 'Ориентировочная цена',
    cancel: 'Отменить запись',
    cancelling: 'Отменяем…',
    reason: 'Причина отмены (необязательно)',
    cancelled: 'Запись отменена.',
    unavailable: 'Управление записью временно недоступно.',
    back: 'Вернуться в VELORA',
  },
} as const

type BookingStatusView = Awaited<ReturnType<typeof fetchBookingStatus>>

export function BookingManager({ language }: { language: Language }) {
  const text = copy[language]
  const credentials = useMemo(() => {
    const params = new URLSearchParams(window.location.search)
    return {
      reference: params.get('reference') ?? '',
      token: params.get('token') ?? '',
    }
  }, [])
  const [booking, setBooking] = useState<BookingStatusView | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'invalid' | 'error'>('loading')
  const [reason, setReason] = useState('')
  const [cancelling, setCancelling] = useState(false)

  useEffect(() => {
    window.history.replaceState({}, '', '/booking')
    if (!credentials.reference || !credentials.token) {
      setStatus('invalid')
      return
    }
    fetchBookingStatus(credentials.reference, credentials.token)
      .then((result) => {
        setBooking(result)
        setStatus('ready')
      })
      .catch((error: unknown) => {
        setStatus(error instanceof Error && error.message === 'INVALID_ACCESS' ? 'invalid' : 'error')
      })
  }, [credentials])

  const cancel = async () => {
    if (!booking || !booking.canCancel || cancelling) return
    setCancelling(true)
    try {
      await cancelApiBooking(credentials.reference, credentials.token, reason)
      setBooking({ ...booking, status: 'cancelled', canCancel: false })
    } catch {
      setStatus('error')
    } finally {
      setCancelling(false)
    }
  }

  const price = booking && new Intl.NumberFormat(language === 'en' ? 'en-LV' : `${language}-LV`, {
    style: 'currency',
    currency: 'EUR',
  }).format(booking.estimatedPriceCents / 100)

  return (
    <main className="booking-manager">
      <section className="booking-manager__card" aria-live="polite">
        <a className="wordmark wordmark--footer" href="/"><span>VELORA</span><small>Detail Lab</small></a>
        <h1>{text.title}</h1>
        {status === 'loading' && <p><LoaderCircle className="spin" size={20} /> {text.loading}</p>}
        {status === 'invalid' && <p className="field-error"><XCircle size={20} /> {text.invalid}</p>}
        {status === 'error' && <p className="field-error"><XCircle size={20} /> {text.unavailable}</p>}
        {status === 'ready' && booking && (
          <>
            {booking.status === 'cancelled' && <p className="booking-manager__notice">{text.cancelled}</p>}
            <dl className="demo-summary">
              <div><dt>{text.status}</dt><dd>{booking.status}</dd></div>
              <div><dt>{text.date}</dt><dd>{new Date(booking.start).toLocaleString(language, { timeZone: 'Europe/Riga' })}</dd></div>
              <div><dt>{text.services}</dt><dd>{booking.services.map((service) => service.service_name_snapshot).join(', ')}</dd></div>
              <div><dt>{text.vehicle}</dt><dd>{booking.vehicleDescription}</dd></div>
              <div><dt>{text.estimate}</dt><dd>{price}</dd></div>
            </dl>
            {booking.canCancel && (
              <div className="booking-manager__cancel">
                <label htmlFor="cancel-reason">{text.reason}</label>
                <textarea id="cancel-reason" maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />
                <button className="button button--outline" type="button" onClick={cancel} disabled={cancelling}>
                  {cancelling ? text.cancelling : text.cancel}
                </button>
              </div>
            )}
          </>
        )}
        <a className="booking-manager__back" href="/">{text.back}</a>
      </section>
    </main>
  )
}
