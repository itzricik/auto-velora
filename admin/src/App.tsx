import { CalendarDays, ChevronLeft, ChevronRight, ClipboardList, LogOut, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { AdminApiError, loadRequests, loadReservation, loadSchedule, unblockSlot } from './api'
import { hasSession, signOut } from './auth'
import { BlockModal } from './components/BlockModal'
import { LoginPage } from './components/LoginPage'
import { RequestList } from './components/RequestList'
import { ReservationModal } from './components/ReservationModal'
import { ScheduleTable } from './components/ScheduleTable'
import { addDays, buildScheduleRows, todayInRiga } from './schedule'
import type { AdminIdentity, Reservation, ScheduleRow, Service, VehicleCategory } from './types'

export default function App() {
  const [signedIn, setSignedIn] = useState(hasSession)
  const [view, setView] = useState<'schedule' | 'requests'>('schedule')
  const [date, setDate] = useState(todayInRiga)
  const [rows, setRows] = useState<ScheduleRow[]>([])
  const [requests, setRequests] = useState<Reservation[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [categories, setCategories] = useState<VehicleCategory[]>([])
  const [identity, setIdentity] = useState<AdminIdentity | null>(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<Reservation | null>(null)
  const [createAt, setCreateAt] = useState<string | null>(null)
  const [blockAt, setBlockAt] = useState<string | null>(null)

  const handleError = useCallback((caught: unknown) => {
    if (caught instanceof AdminApiError && (caught.status === 401 || caught.status === 403)) {
      signOut()
      setSignedIn(false)
      return
    }
    setError('The admin data could not be loaded. Try again.')
  }, [])

  const refreshSchedule = useCallback(async (targetDate = date) => {
    if (!signedIn) return
    setLoading(true)
    setError('')
    try {
      const result = await loadSchedule(targetDate)
      setRows(buildScheduleRows(result.slots))
      setServices(result.services)
      setCategories(result.vehicleCategories)
      setIdentity(result.identity)
    } catch (caught) {
      handleError(caught)
    } finally {
      setLoading(false)
    }
  }, [date, handleError, signedIn])

  const refreshRequests = useCallback(async () => {
    if (!signedIn) return
    try {
      const result = await loadRequests(search)
      setRequests(result.requests)
      setIdentity(result.identity)
    } catch (caught) {
      handleError(caught)
    }
  }, [handleError, search, signedIn])

  useEffect(() => { void refreshSchedule() }, [refreshSchedule])
  useEffect(() => {
    const timeout = window.setTimeout(() => void refreshRequests(), 180)
    return () => window.clearTimeout(timeout)
  }, [refreshRequests])

  const openReservation = async (id: string) => {
    setLoading(true)
    try {
      setSelected((await loadReservation(id)).reservation)
    } catch (caught) {
      handleError(caught)
    } finally {
      setLoading(false)
    }
  }

  const saved = async (targetDate: string) => {
    setSelected(null)
    setCreateAt(null)
    setDate(targetDate)
    await Promise.all([refreshSchedule(targetDate), refreshRequests()])
  }

  if (!signedIn) return <LoginPage onSignedIn={() => setSignedIn(true)} />

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand"><strong>VELORA</strong><span>ADMINISTRATION</span></div>
        <nav aria-label="Admin sections">
          <button className={view === 'schedule' ? 'active' : ''} onClick={() => setView('schedule')}><CalendarDays size={17} /> Schedule</button>
          <button className={view === 'requests' ? 'active' : ''} onClick={() => setView('requests')}><ClipboardList size={17} /> New requests <span className="count">{requests.length}</span></button>
        </nav>
        <div className="admin-person"><span>{identity?.displayName ?? 'Administrator'}</span><small>{identity?.role ?? ''}</small></div>
        <button className="sign-out" onClick={() => { signOut(); setSignedIn(false) }}><LogOut size={16} /> Sign out</button>
      </header>

      <main className="content">
        {view === 'schedule' ? <>
          <section className="page-heading">
            <div><p className="eyebrow">Europe/Riga Â· six fixed intervals</p><h1>Daily schedule</h1><p>Reserve one or more consecutive two-hour intervals. Conflicts are rejected transactionally.</p></div>
            <button className="icon-action" aria-label="Refresh schedule" onClick={() => void refreshSchedule()}><RefreshCw className={loading ? 'spin' : ''} /></button>
          </section>
          <section className="date-controls" aria-label="Choose schedule date">
            <button className="icon-action" aria-label="Previous day" onClick={() => setDate(addDays(date, -1))}><ChevronLeft /></button>
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            <button className="icon-action" aria-label="Next day" onClick={() => setDate(addDays(date, 1))}><ChevronRight /></button>
            <button className="secondary" onClick={() => setDate(todayInRiga())}>Today</button>
          </section>
          {error && <p className="error" role="alert">{error}</p>}
          <ScheduleTable rows={rows} onCreate={setCreateAt} onEdit={(id) => void openReservation(id)} onBlock={setBlockAt} onUnblock={async (id) => { try { await unblockSlot(id); await refreshSchedule() } catch (caught) { handleError(caught) } }} />
        </> : <RequestList requests={requests} search={search} onSearch={setSearch} onOpen={(id) => void openReservation(id)} />}
      </main>

      {(selected || createAt) && <ReservationModal
        reservation={selected}
        selectedDate={date}
        selectedStart={createAt}
        services={services}
        vehicleCategories={categories}
        onClose={() => { setSelected(null); setCreateAt(null) }}
        onSaved={(target) => void saved(target)}
      />}
      {blockAt && <BlockModal date={date} start={blockAt} onClose={() => setBlockAt(null)} onSaved={() => { setBlockAt(null); void refreshSchedule() }} />}
    </div>
  )
}
