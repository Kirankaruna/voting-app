const BAR_COLORS = {
  a: 'bg-indigo-500',
  b: 'bg-emerald-500',
  c: 'bg-amber-500',
  d: 'bg-rose-500',
}

const TEXT_COLORS = {
  a: 'text-indigo-600',
  b: 'text-emerald-600',
  c: 'text-amber-600',
  d: 'text-rose-600',
}

export default function Results({ poll, counts, total, userVote, wsConnected }) {
  if (!poll) return null

  const maxCount = total > 0 ? Math.max(...Object.values(counts)) : 0
  // Only show "Leading" when one option is strictly ahead
  const tiedAtTop = total > 0 &&
    Object.values(counts).filter((c) => c === maxCount).length > 1

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-lg font-bold text-gray-800">Live Results</h3>
        <span className={`text-sm flex items-center gap-1 ${wsConnected ? 'text-gray-400' : 'text-amber-400'}`}>
          <span className={`inline-block w-2 h-2 rounded-full ${wsConnected ? 'bg-green-400 animate-pulse' : 'bg-amber-400'}`} />
          {wsConnected ? 'Live' : 'Reconnecting...'}
        </span>
      </div>

      <div className="space-y-4">
        {poll.options.map((opt) => {
          const count = counts[opt.id] || 0
          const pct = total > 0 ? Math.round((count / total) * 100) : 0
          const barColor = BAR_COLORS[opt.id] || 'bg-gray-400'
          const textColor = TEXT_COLORS[opt.id] || 'text-gray-600'
          const isLeading = !tiedAtTop && count === maxCount && total > 0

          return (
            <div key={opt.id}>
              <div className="flex justify-between items-center mb-1">
                <span className={`text-sm font-medium ${userVote === opt.id ? textColor : 'text-gray-600'}`}>
                  {opt.label}
                  {isLeading && (
                    <span className="ml-2 text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">
                      Leading
                    </span>
                  )}
                </span>
                <span className="text-sm font-bold text-gray-700">
                  {count} vote{count !== 1 ? 's' : ''} ({pct}%)
                </span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-4 overflow-hidden">
                <div
                  className={`${barColor} h-4 rounded-full transition-all duration-700 ease-out`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>

      {total === 0 && (
        <p className="text-center text-gray-400 text-sm mt-4">No votes yet. Be the first!</p>
      )}
    </div>
  )
}
