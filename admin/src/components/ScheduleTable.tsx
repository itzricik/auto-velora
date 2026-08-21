import { Ban, Pencil, Plus, Unlock } from 'lucide-react'
import { displayTime } from '../schedule'
import type { ScheduleRow, WorkBay } from '../types'

export function ScheduleTable({ rows, bays, onCreate, onEdit, onBlock, onUnblock }: {
  rows: ScheduleRow[]
  bays: WorkBay[]
  onCreate: (start: string, bayId: string) => void
  onEdit: (reservationId: string) => void
  onBlock: (start: string, bayId: string) => void
  onUnblock: (blockId: string) => void
}) {
  return <div className="schedule-table-wrap bay-schedule-wrap"><table className="schedule-table bay-schedule">
    <thead><tr><th>Time</th>{bays.map((bay) => <th key={bay.id}>{bay.name}{!bay.is_active && <small>Inactive</small>}</th>)}</tr></thead>
    <tbody>{rows.map((row) => <tr key={row.start}><td data-label="Time"><strong>{row.start}–{row.end}</strong></td>{bays.map((bay) => {
      const cell = row.cells[bay.id]
      const reservation = cell.segment?.reservation
      const segmentIndex = reservation && cell.segment ? reservation.segments.findIndex((item) => item.id === cell.segment?.id) : -1
      const beginsHere = cell.segment ? displayTime(cell.segment.segment_start) === row.start : false
      return <td key={bay.id} data-label={bay.name} className={`bay-cell bay-cell-${cell.status}`}>
        {cell.status === 'available' && <div className="bay-cell-actions"><button className="table-action" onClick={() => onCreate(row.start, bay.id)}><Plus size={14} /> Add</button><button className="icon-action" aria-label={`Block ${bay.name} at ${row.start}`} onClick={() => onBlock(row.start, bay.id)}><Ban size={14} /></button></div>}
        {cell.status === 'inactive' && <span className="status status-blocked">inactive</span>}
        {cell.status === 'blocked' && cell.block && <div><span className="status status-blocked">blocked</span><small>{cell.block.reason}</small><button className="table-action" onClick={() => onUnblock(cell.block!.id)}><Unlock size={14} /> Unblock</button></div>}
        {reservation && <button aria-label={`Open ${reservation.reference}`} className={`reservation-cell ${beginsHere ? 'reservation-cell-start' : 'reservation-cell-continuation'}`} onClick={() => onEdit(reservation.id)}>{beginsHere && <><span className={`status status-${reservation.status}`}>{reservation.status.replace('_', ' ')}</span><strong>{reservation.reference}{reservation.segments.length > 1 ? ` · part ${segmentIndex + 1}/${reservation.segments.length}` : ''}</strong><small>{reservation.customer.full_name} · {reservation.vehicle.make_model}</small><span><Pencil size={13} /> Open</span></>}</button>}
      </td>
    })}</tr>)}</tbody>
  </table></div>
}
