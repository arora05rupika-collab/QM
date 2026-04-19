import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { discrepanciesApi, migrationsApi } from '../services/api'
import {
  CheckCircle, XCircle, Edit3, ChevronRight, AlertTriangle,
  Zap, User, ArrowLeftRight, BarChart2, Loader2
} from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'

// ─── Confidence ring ─────────────────────────────────────────────────────────

function ConfidenceRing({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  const color = pct >= 75 ? '#22c55e' : pct >= 40 ? '#f59e0b' : '#ef4444'
  const radius = 28
  const circ = 2 * Math.PI * radius
  const dash = (pct / 100) * circ

  return (
    <div className="relative w-20 h-20 flex items-center justify-center">
      <svg className="absolute inset-0 -rotate-90" width="80" height="80">
        <circle cx="40" cy="40" r={radius} fill="none" stroke="#374151" strokeWidth="6" />
        <circle
          cx="40" cy="40" r={radius} fill="none"
          stroke={color} strokeWidth="6"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
        />
      </svg>
      <span className="text-lg font-bold text-white">{pct}%</span>
    </div>
  )
}

// ─── Risk badge ───────────────────────────────────────────────────────────────

function RiskBadge({ level }: { level: string }) {
  const map: Record<string, string> = {
    high: 'bg-red-900 text-red-300 border border-red-700',
    medium: 'bg-yellow-900 text-yellow-300 border border-yellow-700',
    low: 'bg-green-900 text-green-300 border border-green-700',
  }
  return (
    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${map[level] || map.medium}`}>
      {level.toUpperCase()} RISK
    </span>
  )
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ReviewProgress({ stats }: { stats: any }) {
  const resolved = stats.total - stats.pending
  const pct = stats.total > 0 ? Math.round((resolved / stats.total) * 100) : 0

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-medium text-white">Review Progress</span>
        <span className="text-sm text-gray-400">{resolved} / {stats.total} resolved</span>
      </div>
      <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-500 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex gap-4 mt-3 text-xs text-gray-500">
        <span className="text-green-400">✓ {stats.confirmed + stats.corrected} resolved</span>
        <span className="text-purple-400">⚡ {stats.propagated} auto-propagated</span>
        <span className="text-yellow-400">⏳ {stats.pending} pending</span>
      </div>
    </div>
  )
}

// ─── Main Flashcard component ─────────────────────────────────────────────────

export default function Flashcards() {
  const { migrationId } = useParams<{ migrationId: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [editMode, setEditMode] = useState(false)
  const [editValue, setEditValue] = useState('')
  const [notes, setNotes] = useState('')
  const [lastPropagated, setLastPropagated] = useState<number | null>(null)

  const { data: migration } = useQuery({
    queryKey: ['migration', migrationId],
    queryFn: () => migrationsApi.get(migrationId!),
  })

  const { data: card, isLoading, refetch: refetchCard } = useQuery({
    queryKey: ['flashcard-next', migrationId],
    queryFn: () => discrepanciesApi.next(migrationId!),
    refetchOnWindowFocus: false,
  })

  const { data: stats, refetch: refetchStats } = useQuery({
    queryKey: ['discrepancy-stats', migrationId],
    queryFn: () => discrepanciesApi.stats(migrationId!),
    refetchInterval: 5000,
  })

  const resolveMutation = useMutation({
    mutationFn: (payload: object) => discrepanciesApi.resolve(migrationId!, payload),
    onSuccess: (data) => {
      setLastPropagated(data.propagated_count)
      setEditMode(false)
      setEditValue('')
      setNotes('')
      qc.invalidateQueries({ queryKey: ['discrepancy-stats', migrationId] })
      refetchCard()
      if (data.propagated_count > 0) {
        toast.success(`✓ Resolved + auto-fixed ${data.propagated_count} similar issues`)
      } else {
        toast.success('Resolved')
      }
    },
    onError: () => toast.error('Failed to resolve'),
  })

  const resolve = (type: 'confirmed' | 'corrected' | 'rejected') => {
    if (!card) return
    resolveMutation.mutate({
      discrepancy_id: card.id,
      resolution_type: type,
      resolved_value: type === 'corrected' ? editValue : (type === 'confirmed' ? card.ai_suggested_value : card.source_value),
      notes: notes || null,
    })
  }

  useEffect(() => {
    if (card) setEditValue(card.ai_suggested_value || '')
  }, [card?.id])

  const allDone = stats && stats.pending === 0

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/migrations')} className="text-gray-400 hover:text-white transition-colors">
          <ArrowLeftRight className="w-5 h-5" />
        </button>
        <div>
          <h2 className="text-2xl font-bold text-white">Flashcard Review</h2>
          <p className="text-gray-400 text-sm">{migration?.name}</p>
        </div>
        <button
          onClick={() => navigate(`/report/${migrationId}`)}
          className="ml-auto flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm px-3 py-1.5 rounded-lg transition-colors"
        >
          <BarChart2 className="w-4 h-4" />
          View Report
        </button>
      </div>

      {/* Progress */}
      {stats && <ReviewProgress stats={stats} />}

      {/* Propagation toast */}
      {lastPropagated !== null && lastPropagated > 0 && (
        <div className="bg-purple-950 border border-purple-700 rounded-xl p-3 mb-4 flex items-center gap-3">
          <Zap className="w-4 h-4 text-purple-400 flex-shrink-0" />
          <p className="text-sm text-purple-300">
            Your decision was propagated to <strong>{lastPropagated}</strong> identical discrepancies automatically.
          </p>
          <button onClick={() => setLastPropagated(null)} className="ml-auto text-purple-500 hover:text-purple-300 text-xs">✕</button>
        </div>
      )}

      {/* All done state */}
      {allDone ? (
        <div className="bg-gray-900 border border-green-800 rounded-xl p-10 text-center">
          <CheckCircle className="w-14 h-14 text-green-400 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-white mb-2">All discrepancies reviewed!</h3>
          <p className="text-gray-400 mb-6">Your migration data is validated and ready to proceed.</p>
          <button
            onClick={() => navigate(`/report/${migrationId}`)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-medium transition-colors"
          >
            View Validation Report
          </button>
        </div>
      ) : !card ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-10 text-center">
          <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-white mb-2">No flashcards yet</h3>
          <p className="text-gray-400 mb-4">Generate discrepancies first from the Migration page.</p>
          <button onClick={() => navigate('/migrations')} className="text-blue-400 hover:text-blue-300 text-sm">
            ← Back to Migrations
          </button>
        </div>
      ) : (
        /* ─── The Flashcard ─────────────────────────────────────── */
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden shadow-2xl">
          {/* Card header */}
          <div className="bg-gray-800 px-6 py-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wider">Entity · Field</p>
              <p className="text-white font-mono font-semibold mt-0.5">
                {card.entity} <span className="text-gray-500">›</span> {card.field}
              </p>
            </div>
            <RiskBadge level={card.risk_level} />
          </div>

          {/* Card body */}
          <div className="p-6">
            <div className="flex gap-6 mb-6">
              {/* Confidence ring */}
              <div className="flex flex-col items-center gap-1">
                <ConfidenceRing value={card.confidence} />
                <p className="text-xs text-gray-500">confidence</p>
              </div>

              {/* Source → AI suggestion */}
              <div className="flex-1 space-y-4">
                <div className="bg-gray-800 rounded-xl p-4">
                  <p className="text-xs text-gray-400 mb-1">Source value (from legacy ERP)</p>
                  <p className="text-white font-mono text-sm break-all">
                    {card.source_value ?? <span className="text-gray-500 italic">null / empty</span>}
                  </p>
                </div>

                <div className="flex items-center gap-2 text-gray-600">
                  <div className="flex-1 h-px bg-gray-700" />
                  <ChevronRight className="w-4 h-4" />
                  <div className="flex-1 h-px bg-gray-700" />
                </div>

                <div className={clsx(
                  'rounded-xl p-4 border',
                  editMode
                    ? 'bg-blue-950 border-blue-700'
                    : 'bg-gray-800 border-gray-700'
                )}>
                  <p className="text-xs text-gray-400 mb-1">
                    {editMode ? 'Your corrected value' : 'AI suggested value'}
                  </p>
                  {editMode ? (
                    <input
                      autoFocus
                      className="w-full bg-transparent text-white font-mono text-sm focus:outline-none border-b border-blue-500 pb-1"
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      placeholder="Enter the correct value..."
                    />
                  ) : (
                    <p className="text-blue-300 font-mono text-sm break-all">
                      {card.ai_suggested_value ?? <span className="text-gray-500 italic">no suggestion</span>}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Owner badge */}
            {card.assigned_to && (
              <div className="flex items-center gap-2 mb-4 text-sm text-gray-400 bg-gray-800 rounded-lg px-3 py-2">
                <User className="w-4 h-4 text-gray-500" />
                <span>Assigned to:</span>
                <span className="text-white font-medium">{card.assigned_to}</span>
                {card.owner_field && <span className="text-gray-600 text-xs">({card.owner_field})</span>}
              </div>
            )}

            {/* Notes */}
            <div className="mb-6">
              <input
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 placeholder-gray-600 focus:outline-none focus:border-gray-600"
                placeholder="Add a note (optional)..."
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
            </div>

            {/* Action buttons */}
            <div className="grid grid-cols-3 gap-3">
              {/* Confirm */}
              <button
                onClick={() => resolve('confirmed')}
                disabled={resolveMutation.isPending || editMode}
                className="flex flex-col items-center gap-2 bg-green-950 hover:bg-green-900 border border-green-800 disabled:opacity-40 text-green-300 py-4 rounded-xl transition-all group"
              >
                <CheckCircle className="w-6 h-6 group-hover:scale-110 transition-transform" />
                <span className="text-xs font-medium">Confirm</span>
                <span className="text-xs text-green-600">AI is correct</span>
              </button>

              {/* Edit / Save correction */}
              <button
                onClick={() => {
                  if (editMode) {
                    if (editValue.trim()) resolve('corrected')
                    else setEditMode(false)
                  } else {
                    setEditMode(true)
                  }
                }}
                disabled={resolveMutation.isPending}
                className={clsx(
                  'flex flex-col items-center gap-2 border py-4 rounded-xl transition-all group',
                  editMode
                    ? 'bg-blue-900 border-blue-700 text-blue-200'
                    : 'bg-blue-950 hover:bg-blue-900 border-blue-800 text-blue-300'
                )}
              >
                <Edit3 className="w-6 h-6 group-hover:scale-110 transition-transform" />
                <span className="text-xs font-medium">{editMode ? 'Save Correction' : 'Edit'}</span>
                <span className="text-xs text-blue-600">{editMode ? 'apply your value' : 'fix the value'}</span>
              </button>

              {/* Reject */}
              <button
                onClick={() => resolve('rejected')}
                disabled={resolveMutation.isPending || editMode}
                className="flex flex-col items-center gap-2 bg-red-950 hover:bg-red-900 border border-red-800 disabled:opacity-40 text-red-300 py-4 rounded-xl transition-all group"
              >
                <XCircle className="w-6 h-6 group-hover:scale-110 transition-transform" />
                <span className="text-xs font-medium">Reject</span>
                <span className="text-xs text-red-600">keep source value</span>
              </button>
            </div>

            {editMode && (
              <button
                onClick={() => { setEditMode(false); setEditValue(card.ai_suggested_value || '') }}
                className="mt-3 w-full text-xs text-gray-500 hover:text-gray-400 transition-colors"
              >
                Cancel edit
              </button>
            )}
          </div>

          {/* Card footer */}
          <div className="bg-gray-800/50 px-6 py-3 flex items-center justify-between text-xs text-gray-500">
            <span>Record ID: {card.record_id || '—'}</span>
            <span>{stats?.pending ?? '?'} remaining</span>
          </div>
        </div>
      )}
    </div>
  )
}
