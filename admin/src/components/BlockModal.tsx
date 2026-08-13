import { X } from 'lucide-react'
import { useState } from 'react'
import { blockSlots } from '../api'

export function BlockModal({ date, start, onClose, onSaved }: { date: string; start: string; onClose: () => void; onSaved: () => void }) {
  const [reason, setReason] = useState('')
  const [durationSlots, setDurationSlots] = useState(1)
  const [error, setError] = useState('')

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    try {
      await blockSlots({ slotDate: date, startTime: start, durationSlots, reason })
      onSaved()
    } catch {
      setError('The selected interval range cannot be blocked.')
    }
  }

  return <div className="modal-backdrop"><section className="modal modal-small" role="dialog" aria-modal="true" aria-labelledby="block-title"><header><div><p className="eyebrow">Manual block</p><h2 id="block-title">Block {date} at {start}</h2></div><button className="icon-action" onClick={onClose} aria-label="Close"><X /></button></header><form onSubmit={submit}><label>Number of intervals<select value={durationSlots} onChange={(event) => setDurationSlots(Number(event.target.value))}>{[1, 2, 3, 4, 5, 6].map((value) => <option key={value} value={value}>{value} Â· {value * 2} hours</option>)}</select></label><label>Reason<input autoFocus value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} required /></label>{error && <p className="error">{error}</p>}<footer><span /><button type="button" className="ghost" onClick={onClose}>Close</button><button className="primary">Block intervals</button></footer></form></section></div>
}
