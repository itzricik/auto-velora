import { CalendarX, Download, LoaderCircle, LogOut, Search, ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import {
  addBlock,
  downloadBookingsCsv,
  getBooking,
  listBookings,
  loadBlocks,
  removeBlock,
  updateBooking,
  type AdminBlock,
  type AdminBooking,
  type AdminIdentity,
  type AdminSummary,
} from '../admin/api'
import { hasAdminSession, signInAdmin, signOutAdmin } from '../admin/auth'

const emptySummary: AdminSummary = {
  today: 0,
  tomorrow: 0,
  upcoming: 0,
  requested: 0,
  confirmed: 0,
  cancelled: 0,
}

function person(booking: AdminBooking) {
  return Array.isArray(booking.customers) ? booking.customers[0] : booking.customers
}

function toLocalInput(iso: string): string {
  const date = new Date(iso)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function AdminSignIn({ onSignedIn }: { onSignedIn(): void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setStatus('loading')
    try {
      await signInAdmin(email, password)
      onSignedIn()
    } catch {
      setStatus('error')
    }
  }

  return (
    <main className="admin-sign-in">
      <form onSubmit={submit}>
        <span className="eyebrow">VELORA administration</span>
        <h1>Secure sign in</h1>
        <p>Only active Supabase administrator and staff accounts can continue.</p>
        <label htmlFor="admin-email">Email</label>
        <input id="admin-email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
        <label htmlFor="admin-password">Password</label>
        <input id="admin-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        {status === 'error' && <p className="field-error" role="alert">Sign-in failed or this account is not authorized.</p>}
        <button className="button button--copper button--full" disabled={status === 'loading'}>
          {status === 'loading' && <LoaderCircle className="spin" size={18} />} Sign in
        </button>
      </form>
    </main>
  )
}

export function AdminApp() {
  const [signedIn, setSignedIn] = useState(hasAdminSession)
  const [identity, setIdentity] = useState<AdminIdentity | null>(null)
  const [bookings, setBookings] = useState<AdminBooking[]>([])
  const [summary, setSummary] = useState(emptySummary)
  const [selected, setSelected] = useState<AdminBooking | null>(null)
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [view, setView] = useState<'bookings' | 'availability'>('bookings')
  const [blocks, setBlocks] = useState<AdminBlock[]>([])
  const [bays, setBays] = useState<Array<{ id: string; name: string }>>([])
  const [hours, setHours] = useState<Array<{ weekday: number; opens_at: string | null; closes_at: string | null; is_closed: boolean }>>([])
  const [blockForm, setBlockForm] = useState({ workBayId: '', startsAt: '', endsAt: '', reason: '' })

  const refresh = useCallback(async () => {
    if (!signedIn) return
    setLoading(true)
    setError('')
    try {
      const result = await listBookings({ search, status: statusFilter, from, to })
      setBookings(result.bookings)
      setSummary(result.summary)
      setIdentity(result.identity)
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : ''
      if (code === 'ADMIN_UNAUTHENTICATED') {
        signOutAdmin()
        setSignedIn(false)
      } else setError('Bookings could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [from, search, signedIn, statusFilter, to])

  useEffect(() => { void refresh() }, [refresh])

  const openBooking = async (id: string) => {
    setLoading(true)
    try {
      setSelected((await getBooking(id)).booking)
    } catch {
      setError('Booking details could not be loaded.')
    } finally {
      setLoading(false)
    }
  }

  const applyAction = async (input: Parameters<typeof updateBooking>[0]) => {
    setLoading(true)
    setError('')
    try {
      await updateBooking(input)
      setSelected((await getBooking(input.bookingId)).booking)
      await refresh()
    } catch (caught) {
      setError(caught instanceof Error && caught.message === 'ADMIN_CONFLICT'
        ? 'The action conflicts with availability or the booking lifecycle.'
        : 'The booking could not be updated.')
    } finally {
      setLoading(false)
    }
  }

  const exportCsv = async () => {
    try {
      const blob = await downloadBookingsCsv({ search, status: statusFilter, from, to })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'velora-bookings.csv'
      anchor.click()
      URL.revokeObjectURL(url)
    } catch {
      setError('CSV export failed. Administrator access is required.')
    }
  }

  const openAvailability = async () => {
    setView('availability')
    try {
      const result = await loadBlocks()
      setBlocks(result.blocks)
      setBays(result.bays)
      setHours(result.hours)
    } catch {
      setError('Availability configuration could not be loaded.')
    }
  }

  const createBlock = async (event: React.FormEvent) => {
    event.preventDefault()
    try {
      await addBlock({
        workBayId: blockForm.workBayId || null,
        startsAt: new Date(blockForm.startsAt).toISOString(),
        endsAt: new Date(blockForm.endsAt).toISOString(),
        reason: blockForm.reason,
      })
      setBlockForm({ workBayId: '', startsAt: '', endsAt: '', reason: '' })
      setBlocks((await loadBlocks()).blocks)
    } catch {
      setError('The blocked period could not be created.')
    }
  }

  if (!signedIn) return <AdminSignIn onSignedIn={() => setSignedIn(true)} />

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <a className="wordmark" href="/"><span>VELORA</span><small>Administration</small></a>
        <nav><button onClick={() => setView('bookings')}>Bookings</button><button onClick={openAvailability}>Availability</button></nav>
        <span>{identity?.displayName} · {identity?.role}</span>
        <button onClick={() => { signOutAdmin(); setSignedIn(false) }}><LogOut size={17} /> Sign out</button>
      </header>

      {view === 'bookings' ? (
        <div className="admin-content">
          <section className="admin-summary" aria-label="Booking summary">
            {Object.entries(summary).map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}
          </section>
          <section className="admin-panel">
            <div className="admin-filters">
              <label><Search size={16} /><input aria-label="Search bookings" placeholder="Reference, customer, phone or email" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
              <select aria-label="Status filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="">All statuses</option>
                {['requested', 'confirmed', 'in_progress', 'completed', 'cancelled', 'rejected', 'no_show'].map((status) => <option key={status}>{status}</option>)}
              </select>
              <input aria-label="From date" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
              <input aria-label="To date" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
              <button className="button button--outline" onClick={refresh}>Apply</button>
              {identity?.role === 'admin' && <button className="button button--outline" onClick={exportCsv}><Download size={16} /> Export personal-data CSV</button>}
            </div>
            {error && <p className="field-error" role="alert">{error}</p>}
            {loading && <p><LoaderCircle className="spin" size={18} /> Loading…</p>}
            <div className="admin-table-wrap">
              <table>
                <thead><tr><th>Reference</th><th>Start</th><th>Customer</th><th>Vehicle</th><th>Status</th><th>Estimate</th></tr></thead>
                <tbody>{bookings.map((booking) => (
                  <tr key={booking.id} onClick={() => openBooking(booking.id)} tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter') void openBooking(booking.id) }}>
                    <td>{booking.reference}</td><td>{new Date(booking.starts_at).toLocaleString()}</td><td>{person(booking)?.full_name}</td><td>{booking.vehicle_description}</td><td>{booking.status}</td><td>€{(booking.estimated_price_cents / 100).toFixed(2)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </section>
        </div>
      ) : (
        <div className="admin-content">
          <section className="admin-panel">
            <h1>Availability management</h1>
            <div className="admin-hours">{hours.map((entry) => <span key={entry.weekday}>{entry.weekday}: {entry.is_closed ? 'Closed' : `${entry.opens_at?.slice(0, 5)}–${entry.closes_at?.slice(0, 5)}`}</span>)}</div>
            <form className="admin-block-form" onSubmit={createBlock}>
              <select value={blockForm.workBayId} onChange={(event) => setBlockForm({ ...blockForm, workBayId: event.target.value })}><option value="">Whole studio</option>{bays.map((bay) => <option key={bay.id} value={bay.id}>{bay.name}</option>)}</select>
              <input type="datetime-local" value={blockForm.startsAt} onChange={(event) => setBlockForm({ ...blockForm, startsAt: event.target.value })} required />
              <input type="datetime-local" value={blockForm.endsAt} onChange={(event) => setBlockForm({ ...blockForm, endsAt: event.target.value })} required />
              <input placeholder="Reason" maxLength={500} value={blockForm.reason} onChange={(event) => setBlockForm({ ...blockForm, reason: event.target.value })} required />
              <button className="button button--copper">Block period</button>
            </form>
            <ul className="admin-block-list">{blocks.map((block) => <li key={block.id}><CalendarX size={17} /><span>{new Date(block.starts_at).toLocaleString()} — {new Date(block.ends_at).toLocaleString()} · {block.reason}</span><button onClick={async () => { await removeBlock(block.id); setBlocks((await loadBlocks()).blocks) }}>Remove</button></li>)}</ul>
          </section>
        </div>
      )}

      {selected && (
        <aside className="admin-detail" aria-label="Booking details">
          <button className="admin-detail__close" onClick={() => setSelected(null)}>Close</button>
          <ShieldCheck size={22} /><h2>{selected.reference}</h2>
          <p>{person(selected)?.full_name} · {person(selected)?.normalized_email} · {person(selected)?.normalized_phone}</p>
          <p>{selected.vehicle_description}</p>
          <ul>{selected.booking_services.map((service) => <li key={service.service_name_snapshot}>{service.service_name_snapshot}</li>)}</ul>
          <p>Customer note: {selected.customer_notes || '—'}</p>
          <div className="admin-actions">
            {selected.status === 'requested' && <><button onClick={() => applyAction({ bookingId: selected.id, status: 'confirmed' })}>Confirm</button><button onClick={() => applyAction({ bookingId: selected.id, status: 'rejected' })}>Reject</button></>}
            {selected.status === 'confirmed' && <><button onClick={() => applyAction({ bookingId: selected.id, status: 'in_progress' })}>Start work</button><button onClick={() => applyAction({ bookingId: selected.id, status: 'no_show' })}>No-show</button></>}
            {selected.status === 'in_progress' && <button onClick={() => applyAction({ bookingId: selected.id, status: 'completed' })}>Complete</button>}
            {['requested', 'confirmed', 'in_progress'].includes(selected.status) && <button onClick={() => applyAction({ bookingId: selected.id, status: 'cancelled' })}>Cancel</button>}
          </div>
          <label>Start<input type="datetime-local" defaultValue={toLocalInput(selected.starts_at)} id="admin-start" /></label>
          <label>End<input type="datetime-local" defaultValue={toLocalInput(selected.ends_at)} id="admin-end" /></label>
          <button onClick={() => {
            const start = (document.getElementById('admin-start') as HTMLInputElement).value
            const end = (document.getElementById('admin-end') as HTMLInputElement).value
            void applyAction({ bookingId: selected.id, startsAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString(), note: 'Rescheduled by administrator' })
          }}>Reschedule</button>
          <label>Internal notes<textarea defaultValue={selected.internal_notes ?? ''} id="admin-notes" maxLength={5000} /></label>
          <button onClick={() => {
            const notes = (document.getElementById('admin-notes') as HTMLTextAreaElement).value
            void applyAction({ bookingId: selected.id, internalNotes: notes, note: 'Internal notes updated' })
          }}>Save notes</button>
          <h3>Status history</h3>
          <ol>{selected.booking_status_history?.map((history) => <li key={`${history.created_at}-${history.new_status}`}>{new Date(history.created_at).toLocaleString()} · {history.previous_status ?? 'new'} → {history.new_status} · {history.change_source}</li>)}</ol>
        </aside>
      )}
    </main>
  )
}
