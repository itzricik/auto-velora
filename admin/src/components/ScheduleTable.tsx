import { Ban, Pencil, Plus, Unlock } from 'lucide-react'
import type { ScheduleRow } from '../types'

const money = (cents: number | null | undefined) => cents == null ? 'â€”' : new Intl.NumberFormat('en-LV', {
  style: 'currency', currency: 'EUR',
}).format(cents / 100)

const statusLabel = (status: string) => status.replace('_', ' ')

export function ScheduleTable({
  rows,
  onCreate,
  onEdit,
  onBlock,
  onUnblock,
}: {
  rows: ScheduleRow[]
  onCreate: (start: string) => void
  onEdit: (reservationId: string) => void
  onBlock: (start: string) => void
  onUnblock: (slotId: string) => void
}) {
  return (
    <div className="schedule-table-wrap">
      <table className="schedule-table">
        <thead><tr><th>Time</th><th>Status</th><th>Reservation reference</th><th>Customer</th><th>Vehicle</th><th>Services</th><th>Price</th><th>Action</th></tr></thead>
        <tbody>{rows.map((row) => {
          const reservation = row.occupied?.reservation
          return (
            <tr key={row.start} className={`slot-${row.status}`}>
              <td data-label="Time"><strong>{row.start}â€“{row.end}</strong></td>
              <td data-label="Status"><span className={`status status-${row.status}`}>{statusLabel(row.status)}</span></td>
              <td data-label="Reference">{reservation?.reference ?? 'â€”'}</td>
              <td data-label="Customer">{reservation?.customer.full_name ?? 'â€”'}</td>
              <td data-label="Vehicle">{reservation?.vehicle.make_model ?? 'â€”'}</td>
              <td data-label="Services">{reservation?.services.map((service) => service.service_name_snapshot).join(', ') ?? row.occupied?.block_reason ?? 'â€”'}</td>
              <td data-label="Price">{money(reservation?.final_total_cents ?? reservation?.estimated_total_cents)}</td>
              <td data-label="Action" className="row-actions">
                {row.status === 'available' ? <>
                  <button className="table-action" onClick={() => onCreate(row.start)}><Plus size={15} /> Add</button>
                  <button className="icon-action" aria-label={`Block ${row.start}â€“${row.end}`} onClick={() => onBlock(row.start)}><Ban size={16} /></button>
                </> : row.status === 'blocked' && row.occupied ?
                  <button className="table-action" onClick={() => onUnblock(row.occupied!.id)}><Unlock size={15} /> Unblock</button>
                  : reservation && <button className="table-action" onClick={() => onEdit(reservation.id)}><Pencil size={15} /> Open</button>}
              </td>
            </tr>
          )
        })}</tbody>
      </table>
    </div>
  )
}
