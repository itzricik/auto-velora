import { BookOpen, CalendarDays, ChevronLeft, ChevronRight, ClipboardList, Gauge, History, LogOut, RefreshCw, Settings } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { AdminApiError, loadDashboard, loadRequests, loadReservation, loadSchedule, searchHistory, unblockSlot } from './api'
import { hasSession, signOut } from './auth'
import { BlockModal } from './components/BlockModal'
import { LoginPage } from './components/LoginPage'
import { RequestList } from './components/RequestList'
import { ReservationModal } from './components/ReservationModal'
import { ScheduleTable } from './components/ScheduleTable'
import { SettingsPage } from './components/SettingsPage'
import { Dashboard, type DashboardMetrics } from './components/Dashboard'
import { HistoryPage } from './components/HistoryPage'
import { ContentPage } from './components/ContentPage'
import { addDays, buildScheduleRows, todayInRiga } from './schedule'
import type { AdminIdentity, ConditionRule, Reservation, ScheduleRow, Service, VehicleCategory, WorkBay } from './types'

export default function App() {
  const [signedIn, setSignedIn] = useState(hasSession)
  const [view, setView] = useState<'dashboard' | 'schedule' | 'requests' | 'history' | 'content' | 'settings'>('dashboard')
  const [date, setDate] = useState(todayInRiga)
  const [rows, setRows] = useState<ScheduleRow[]>([])
  const [requests, setRequests] = useState<Reservation[]>([])
  const [historyRows, setHistoryRows] = useState<Reservation[]>([])
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null)
  const [services, setServices] = useState<Service[]>([])
  const [categories, setCategories] = useState<VehicleCategory[]>([])
  const [bays, setBays] = useState<WorkBay[]>([])
  const [conditionLevels, setConditionLevels] = useState<ConditionRule[]>([])
  const [conditionIndicators, setConditionIndicators] = useState<ConditionRule[]>([])
  const [startIntervalMinutes, setStartIntervalMinutes] = useState(30)
  const [identity, setIdentity] = useState<AdminIdentity | null>(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<Reservation | null>(null)
  const [createAt, setCreateAt] = useState<{ start: string; bayId: string } | null>(null)
  const [blockAt, setBlockAt] = useState<{ start: string; bayId: string } | null>(null)

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
      const weekday = new Date(`${targetDate}T12:00:00.000Z`).getUTCDay()
      const regular = result.businessHours.find((item) => item.weekday === weekday)
      const closed = result.exception?.is_closed ?? regular?.is_closed ?? true
      const opensAt = result.exception?.opens_at ?? regular?.opens_at ?? '10:00'
      const closesAt = result.exception?.closes_at ?? regular?.closes_at ?? '20:00'
      setRows(closed ? [] : buildScheduleRows(targetDate, result.bays, result.segments, result.blocks, opensAt.slice(0, 5), closesAt.slice(0, 5), result.startIntervalMinutes))
      setServices(result.services)
      setCategories(result.vehicleCategories)
      setBays(result.bays)
      setConditionLevels(result.conditionLevels)
      setConditionIndicators(result.conditionIndicators)
      setStartIntervalMinutes(result.startIntervalMinutes)
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

  const refreshDashboard = useCallback(async () => {
    if (!signedIn) return
    try { setMetrics(await loadDashboard(date)) } catch (caught) { handleError(caught) }
  }, [date, handleError, signedIn])

  const refreshHistory = useCallback(async () => {
    if (!signedIn || view !== 'history') return
    try { setHistoryRows((await searchHistory(search)).reservations) } catch (caught) { handleError(caught) }
  }, [handleError, search, signedIn, view])

  useEffect(() => { void refreshSchedule() }, [refreshSchedule])
  useEffect(() => {
    const timeout = window.setTimeout(() => void refreshRequests(), 180)
    return () => window.clearTimeout(timeout)
  }, [refreshRequests])
  useEffect(() => { void refreshDashboard() }, [refreshDashboard])
  useEffect(() => { const timeout = window.setTimeout(() => void refreshHistory(), 180); return () => window.clearTimeout(timeout) }, [refreshHistory])

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
          <button className={view === 'dashboard' ? 'active' : ''} onClick={() => setView('dashboard')}><Gauge size={17} /> Dashboard</button>
          <button className={view === 'schedule' ? 'active' : ''} onClick={() => setView('schedule')}><CalendarDays size={17} /> Schedule</button>
          <button className={view === 'requests' ? 'active' : ''} onClick={() => setView('requests')}><ClipboardList size={17} /> New requests <span className="count">{requests.length}</span></button>
          <button className={view === 'history' ? 'active' : ''} onClick={() => setView('history')}><History size={17} /> History</button>
          <button className={view === 'content' ? 'active' : ''} onClick={() => setView('content')}><BookOpen size={17} /> Content</button>
          <button className={view === 'settings' ? 'active' : ''} onClick={() => setView('settings')}><Settings size={17} /> Settings</button>
        </nav>
        <div className="admin-person"><span>{identity?.displayName ?? 'Administrator'}</span><small>{identity?.role ?? ''}</small></div>
        <button className="sign-out" onClick={() => { signOut(); setSignedIn(false) }}><LogOut size={16} /> Sign out</button>
      </header>

      <main className="content">
        {view === 'dashboard' ? <Dashboard metrics={metrics} onSchedule={() => { setDate(todayInRiga()); setView('schedule') }} onRequests={() => setView('requests')} onNew={() => { setDate(todayInRiga()); setCreateAt({ start: `${todayInRiga()}T10:00:00+03:00`, bayId: '' }) }} /> : view === 'schedule' ? <>
          <section className="page-heading">
            <div><p className="eyebrow">Europe/Riga · three work bays</p><h1>Daily schedule</h1><p>Reservations use continuous working time in one bay and may continue on the next open day.</p></div>
            <button className="icon-action" aria-label="Refresh schedule" onClick={() => void refreshSchedule()}><RefreshCw className={loading ? 'spin' : ''} /></button>
          </section>
          <section className="date-controls" aria-label="Choose schedule date">
            <button className="icon-action" aria-label="Previous day" onClick={() => setDate(addDays(date, -1))}><ChevronLeft /></button>
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            <button className="icon-action" aria-label="Next day" onClick={() => setDate(addDays(date, 1))}><ChevronRight /></button>
            <button className="secondary" onClick={() => setDate(todayInRiga())}>Today</button>
          </section>
          {error && <p className="error" role="alert">{error}</p>}
          {!loading && !rows.length && !error ? <p className="empty-state">The studio is closed on this date.</p> : <ScheduleTable rows={rows} bays={bays} onCreate={(start, bayId) => setCreateAt({ start, bayId })} onEdit={(id) => void openReservation(id)} onBlock={(start, bayId) => setBlockAt({ start, bayId })} onUnblock={async (id) => { try { await unblockSlot(id); await refreshSchedule() } catch (caught) { handleError(caught) } }} />}
        </> : view === 'requests' ? <RequestList requests={requests} search={search} onSearch={setSearch} onOpen={(id) => void openReservation(id)} /> : view === 'history' ? <HistoryPage reservations={historyRows} search={search} onSearch={setSearch} onOpen={(id) => void openReservation(id)} /> : view === 'content' ? <ContentPage /> : <SettingsPage />}
      </main>

      {(selected || createAt) && <ReservationModal
        reservation={selected}
        selectedDate={date}
        selectedStart={createAt?.start ?? null}
        selectedBayId={createAt?.bayId ?? null}
        services={services}
        vehicleCategories={categories}
        workBays={bays}
        conditionLevels={conditionLevels}
        conditionIndicators={conditionIndicators}
        startIntervalMinutes={startIntervalMinutes}
        onClose={() => { setSelected(null); setCreateAt(null) }}
        onSaved={(target) => void saved(target)}
      />}
      {blockAt && <BlockModal date={date} start={blockAt.start} workBayId={blockAt.bayId} onClose={() => setBlockAt(null)} onSaved={() => { setBlockAt(null); void refreshSchedule() }} />}
    </div>
  )
}
