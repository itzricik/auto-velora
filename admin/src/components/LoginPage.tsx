import { LoaderCircle, LockKeyhole } from 'lucide-react'
import { useState } from 'react'
import { signIn } from '../auth'

export function LoginPage({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      await signIn(email, password)
      onSignedIn()
    } catch {
      setError('Sign-in failed or this account is not authorized.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={submit}>
        <div className="brand"><strong>VELORA</strong><span>ADMINISTRATION</span></div>
        <LockKeyhole className="login-icon" aria-hidden="true" />
        <p className="eyebrow">Protected workspace</p>
        <h1>Sign in</h1>
        <p>Access is limited to active VELORA administrators.</p>
        <label htmlFor="email">Email</label>
        <input id="email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
        <label htmlFor="password">Password</label>
        <input id="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary" disabled={loading}>
          {loading && <LoaderCircle className="spin" size={18} />} Sign in
        </button>
      </form>
    </main>
  )
}
