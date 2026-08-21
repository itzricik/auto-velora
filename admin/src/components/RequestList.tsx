import { ArrowRight, CalendarDays, Search } from 'lucide-react'
import type { Reservation } from '../types'

const requestedStartFormatter = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/Riga',
})

export function RequestList({ requests, search, onSearch, onOpen }: {
  requests: Reservation[]
  search: string
  onSearch: (value: string) => void
  onOpen: (id: string) => void
}) {
  return (
    <section className="requests-panel">
      <div className="panel-heading">
        <div><p className="eyebrow">Awaiting confirmation</p><h2>New requests</h2><p>Review every pending website request, including customers who selected an available start time.</p></div>
        <label className="search-field"><Search size={16} /><span className="sr-only">Search requests</span><input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Reference, customer, phone, vehicle" /></label>
      </div>
      <div className="request-grid">
        {requests.map((request) => (
          <article className="request-card" key={request.id}>
            <div className="request-card__top"><span className={`status status-${request.status}`}>{request.status === 'expired' ? 'hold expired' : request.status}</span><strong>{request.reference}</strong></div>
            <h3>{request.customer.full_name}</h3>
            <p>{request.vehicle.make_model} · {request.vehicle.vehicle_type}</p>
            <p>{request.services.map((service) => service.service_name_snapshot).join(', ')}</p>
            <div className="request-meta"><span><CalendarDays size={15} /> {request.starts_at ? `Requested ${requestedStartFormatter.format(new Date(request.starts_at))}` : `Preferred ${request.preferred_date}`}</span><strong>€{(request.estimated_total_cents / 100).toFixed(2)}</strong></div>
            {request.customer_message && <blockquote>{request.customer_message}</blockquote>}
            <button className="secondary" onClick={() => onOpen(request.id)}>Review request <ArrowRight size={16} /></button>
          </article>
        ))}
        {!requests.length && <div className="empty-state"><p>No pending website requests match this search.</p></div>}
      </div>
    </section>
  )
}
