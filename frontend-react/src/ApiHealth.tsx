import { useEffect, useState } from 'react'

type Status = 'loading' | 'ok' | 'error'

const apiUrl: string = import.meta.env.VITE_API_URL ?? ''

export function ApiHealth() {
  const [status, setStatus] = useState<Status>('loading')
  const [appName, setAppName] = useState('')

  useEffect(() => {
    fetch(`${apiUrl}/api/health`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data) => {
        setStatus(data.status === 'ok' ? 'ok' : 'error')
        setAppName(data.app ?? '')
      })
      .catch(() => setStatus('error'))
  }, [])

  return (
    <div>
      <p data-testid="status">API: {status}</p>
      {appName && <p data-testid="app-name">{appName}</p>}
    </div>
  )
}
