import { CalendarDays, Clock3, Plus, Search, ShieldOff } from 'lucide-react'

export type DashboardMetrics = {
  todayVehicles: number
  occupiedBays: number
  freeBays: number
  pendingRequests: number
  confirmedReservations: number
  completedReservations: number
  estimatedDailyRevenueCents: number
  finalCompletedRevenueCents: number
  checklistAlerts: number
  notificationFailures: number
}

export function Dashboard({ metrics, onSchedule, onRequests, onNew }: { metrics: DashboardMetrics | null; onSchedule: () => void; onRequests: () => void; onNew: () => void }) {
  const money = (value: number) => new Intl.NumberFormat('en-LV', { style: 'currency', currency: 'EUR' }).format(value / 100)
  const cards = metrics ? [
    ['Today’s vehicles', metrics.todayVehicles], ['Occupied bays', metrics.occupiedBays], ['Free bays', metrics.freeBays],
    ['Pending requests', metrics.pendingRequests], ['Confirmed', metrics.confirmedReservations], ['Completed', metrics.completedReservations],
    ['Estimated revenue', money(metrics.estimatedDailyRevenueCents)], ['Final revenue', money(metrics.finalCompletedRevenueCents)],
    ['Checklist alerts', metrics.checklistAlerts], ['Notification failures', metrics.notificationFailures],
  ] : []
  return <>
    <section className="page-heading"><div><p className="eyebrow">Daily operations</p><h1>Studio dashboard</h1><p>Capacity, requests, operational warnings and today’s revenue in one place.</p></div></section>
    {!metrics ? <p className="loading-line">Loading dashboard…</p> : <section className="dashboard-grid">{cards.map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}</section>}
    <section className="quick-actions"><h2>Quick actions</h2><div><button className="secondary" onClick={onNew}><Plus size={16} /> New reservation</button><button className="secondary" onClick={onSchedule}><CalendarDays size={16} /> Today’s schedule</button><button className="secondary" onClick={onRequests}><Clock3 size={16} /> Pending requests</button><button className="secondary" onClick={onSchedule}><Search size={16} /> Find availability</button><button className="secondary" onClick={onSchedule}><ShieldOff size={16} /> Block a bay</button></div></section>
  </>
}
