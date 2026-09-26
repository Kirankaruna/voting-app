import { useState, useEffect, useRef, useCallback } from 'react'
import Results from './Results'

const COLORS = {
  a: 'bg-indigo-500',
  b: 'bg-emerald-500',
  c: 'bg-amber-500',
  d: 'bg-rose-500',
}

const BORDER_COLORS = {
  a: 'border-indigo-400',
  b: 'border-emerald-400',
  c: 'border-amber-400',
  d: 'border-rose-400',
}

const WS_RECONNECT_DELAY_MS = 3000

export default function VotePage({ username, onLeave }) {
  const [poll, setPoll] = useState(null)
  const [counts, setCounts] = useState({})
  const [total, setTotal] = useState(0)
  const [userVote, setUserVote] = useState(null)
  const [loading, setLoading] = useState(true)
  const [voting, setVoting] = useState(false)
  const [error, setError] = useState('')
  const [wsConnected, setWsConnected] = useState(false)

  const wsRef = useRef(null)
  const reconnectTimerRef = useRef(null)
  const pollLoadedRef = useRef(false)

  // Fetch initial poll state
  useEffect(() => {
    fetch(`/poll?username=${encodeURIComponent(username)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data) => {
        setPoll(data.poll)
        setCounts(data.counts)
        setTotal(data.total)
        setUserVote(data.user_vote)
        pollLoadedRef.current = true
        setLoading(false)
      })
      .catch(() => {
        setError('Could not load the poll. Is the backend running?')
        setLoading(false)
      })
  }, [username])

  // WebSocket with auto-reconnect — only starts after poll is loaded
  const connectWs = useCallback(() => {
    if (!pollLoadedRef.current) return

    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${proto}://${window.location.host}/ws`)
    wsRef.current = ws

    ws.onopen = () => setWsConnected(true)

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'vote_update') {
          setCounts(data.counts)
          setTotal(data.total)
        }
      } catch {
        // ignore malformed messages
      }
    }

    ws.onclose = () => {
      setWsConnected(false)
      reconnectTimerRef.current = setTimeout(connectWs, WS_RECONNECT_DELAY_MS)
    }

    ws.onerror = () => {
      ws.close()
    }
  }, [])

  // Start WS only after poll is fetched
  useEffect(() => {
    if (!loading && poll) {
      connectWs()
    }
    return () => {
      clearTimeout(reconnectTimerRef.current)
      wsRef.current?.close()
    }
  }, [loading, poll, connectWs])

  async function handleVote(optionId) {
    if (userVote || voting) return
    setVoting(true)
    setError('')
    try {
      const res = await fetch('/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, option_id: optionId }),
      })
      if (res.status === 409) {
        const data = await res.json()
        // Use the server's recorded option_id, not the locally clicked one
        const serverOptionId = data.detail?.option_id ?? optionId
        setUserVote(serverOptionId)
        setError('You have already voted.')
        return
      }
      if (!res.ok) {
        const data = await res.json()
        setError(data.detail || 'Vote failed.')
        return
      }
      const data = await res.json()
      setCounts(data.counts)
      setTotal(data.total)
      setUserVote(optionId)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setVoting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500 text-lg animate-pulse">Loading poll...</p>
      </div>
    )
  }

  if (error && !poll) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <p className="text-red-500 text-lg">{error}</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="text-sm text-gray-500">Voting as</p>
              <p className="font-bold text-indigo-600 text-lg">{username}</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-sm text-gray-500">Total votes</p>
                <p className="font-bold text-gray-700 text-2xl">{total}</p>
              </div>
              <button
                onClick={onLeave}
                className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
                title="Switch user"
              >
                Leave
              </button>
            </div>
          </div>
        </div>

        {/* Poll Question */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-5">{poll.question}</h2>

          {userVote ? (
            <div className="mb-4 text-center text-emerald-600 font-semibold bg-emerald-50 rounded-lg py-2 px-4">
              ✓ Your vote is in! Results update live below.
            </div>
          ) : (
            <p className="text-gray-500 mb-4 text-sm">Select an option to cast your vote:</p>
          )}

          <div className="space-y-3">
            {poll.options.map((opt) => {
              const isVoted = userVote === opt.id
              const isOther = userVote && userVote !== opt.id
              const color = COLORS[opt.id] || 'bg-gray-500'
              const border = BORDER_COLORS[opt.id] || 'border-gray-400'

              return (
                <button
                  key={opt.id}
                  onClick={() => handleVote(opt.id)}
                  disabled={!!userVote || voting}
                  className={`w-full text-left px-5 py-4 rounded-xl border-2 transition-all font-medium
                    ${isVoted
                      ? `${border} bg-white text-gray-800 shadow-md scale-[1.01]`
                      : isOther
                      ? 'border-gray-200 bg-gray-50 text-gray-400 cursor-default'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-indigo-300 hover:shadow-md hover:scale-[1.01] cursor-pointer'
                    }`}
                >
                  <span className="flex items-center gap-3">
                    <span className={`w-3 h-3 rounded-full ${color} flex-shrink-0`} />
                    {opt.label}
                    {isVoted && <span className="ml-auto text-emerald-600">✓ Your vote</span>}
                  </span>
                </button>
              )
            })}
          </div>

          {error && <p className="text-red-500 text-sm mt-3">{error}</p>}
        </div>

        {/* Live Results — only shown after user has voted */}
        {userVote && (
          <Results
            poll={poll}
            counts={counts}
            total={total}
            userVote={userVote}
            wsConnected={wsConnected}
          />
        )}
      </div>
    </div>
  )
}
