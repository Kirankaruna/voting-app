import { useState } from 'react'
import VotePage from './VotePage'

export default function App() {
  const [username, setUsername] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [input, setInput] = useState('')
  const [error, setError] = useState('')

  function handleJoin(e) {
    e.preventDefault()
    const name = input.trim()
    if (!name) {
      setError('Please enter a username.')
      return
    }
    if (name.length > 32) {
      setError('Username must be 32 characters or fewer.')
      return
    }
    setUsername(name)
    setSubmitted(true)
  }

  if (submitted) {
    return <VotePage username={username} />
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-10 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🗳️</div>
          <h1 className="text-3xl font-bold text-gray-800">Team Vote</h1>
          <p className="text-gray-500 mt-2">Join the poll and cast your vote</p>
        </div>

        <form onSubmit={handleJoin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Your name
            </label>
            <input
              type="text"
              value={input}
              onChange={(e) => { setInput(e.target.value); setError('') }}
              placeholder="e.g. Alex, Sam, Jordan..."
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              autoFocus
            />
            {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
          </div>
          <button
            type="submit"
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-lg transition-colors"
          >
            Join Poll →
          </button>
        </form>
      </div>
    </div>
  )
}
