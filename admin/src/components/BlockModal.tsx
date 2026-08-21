import { X } from 'lucide-react'
import { useState } from 'react'
import { blockSlots } from '../api'

export function BlockModal({ date, start, workBayId, onClose, onSaved }: { date: string; start: string; workBayId: string; onClose: () => void; onSaved: () => void }) {
  const [reason, setReason] = useState('')
  const [durationMinutes, setDurationMinutes] = useState(30)
  const [error, setError] = useState('')
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    try { await blockSlots({ slotDate: date, startTime: start, durationMinutes, workBayId, reason }); onSaved() }
    catch { setError('The selected time range cannot be blocked.') }
  }
  return <div className="modal-backdrop"><section className="modal modal-small" role="dialog" aria-modal="true" aria-labelledby="block-title"><header><div><p className="eyebrow">Manual block</p><h2 id="block-title">Block {date} at {start}</h2></div><button className="icon-action" onClick={onClose} aria-label="Close"><X /></button></header><form onSubmit={submit}><label>Duration<select value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value))}>{[30, 60, 90, 120, 180, 240, 300, 360].map((value) => <option key={value} value={value}>{value} minutes</option>)}</select></label><label>Reason<input autoFocus value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} required /></label>{error && <p className="error">{error}</p>}<footer><span /><button type="button" className="ghost" onClick={onClose}>Close</button><button className="primary">Block time</button></footer></form></section></div>
}
