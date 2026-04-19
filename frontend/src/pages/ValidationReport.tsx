import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { discrepanciesApi, migrationsApi } from '../services/api'
import {
  CheckCircle, AlertTriangle, XCircle, ArrowLeftRight,
  BarChart2, FileCheck, Download, Loader2
} from 'lucide-react'
import {
  RadialBarChart, RadialBar, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip, Cell
} from 'recharts'

function ScoreGauge({ pct }: { pct: number }) {
  const color = pct >= 80 ? '#22c55e' : pct >= 60 ? '#f59e0b' : '#ef4444'
  const data = [{ value: pct, fill: color }]

  return (
    <div className="relative flex flex-col items-center">
      <ResponsiveContainer width={180} height={180}>
        <RadialBarChart
          innerRadius={60} outerRadius={85}
          data={data} startAngle={180} endAngle={0}
        >
          <RadialBar dataKey="value" cornerRadius={8} background={{ fill: '#374151' }} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pt-6">
        <span className="text-4xl font-bold text-white">{pct}%</span>
        <span className="text-xs text-gray-400">confidence</span>
      </div>
    </div>
  )
}

function StatCard({ label, value, icon: Icon, color }: any) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div>
        <p className="text-2xl font-bold text-white">{value?.toLocaleString?.() ?? value}</p>
        <p className="text-sm text-gray-400">{label}</p>
      </div>
    </div>
  )
}

const RISK_COLORS: Record<string, string> = {
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#22c55e',
}

export default function ValidationReport() {
  const { migrationId } = useParams<{ migrationId: string }>()
  const navigate = useNavigate()

  const { data: report, isLoading: reportLoading } = useQuery({
    queryKey: ['validation-report', migrationId],
    queryFn: () => discrepanciesApi.report(migrationId!),
  })

  const { data: migration } = useQuery({
    queryKey: ['migration', migrationId],
    queryFn: () => migrationsApi.get(migrationId!),
  })

  const { data: stats } = useQuery({
    queryKey: ['discrepancy-stats', migrationId],
    queryFn: () => discrepanciesApi.stats(migrationId!),
  })

  if (reportLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    )
  }

  if (!report) return null

  const fieldData = Object.entries(report.discrepancies_by_field || {})
    .map(([field, count]) => ({ field, count }))
    .slice(0, 8)

  const entityData = Object.entries(report.discrepancies_by_entity || {})
    .map(([entity, count]) => ({ entity, count }))

  const isReady = report.migration_ready
  const conf = report.overall_confidence_pct

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `validation-report-${migrationId}.json`
    a.click()
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <button onClick={() => navigate('/migrations')} className="text-gray-400 hover:text-white">
          <ArrowLeftRight className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-white">Validation Report</h2>
          <p className="text-gray-400 text-sm">{migration?.name}</p>
        </div>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm px-3 py-1.5 rounded-lg transition-colors"
        >
          <Download className="w-4 h-4" />
          Export JSON
        </button>
        {report.pending_review > 0 && (
          <button
            onClick={() => navigate(`/flashcards/${migrationId}`)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm px-3 py-1.5 rounded-lg transition-colors"
          >
            <FileCheck className="w-4 h-4" />
            Review {report.pending_review} pending
          </button>
        )}
      </div>

      {/* Migration readiness banner */}
      <div className={`rounded-xl p-5 mb-8 border flex items-start gap-4 ${
        isReady
          ? 'bg-green-950 border-green-800'
          : 'bg-yellow-950 border-yellow-800'
      }`}>
        {isReady
          ? <CheckCircle className="w-6 h-6 text-green-400 flex-shrink-0 mt-0.5" />
          : <AlertTriangle className="w-6 h-6 text-yellow-400 flex-shrink-0 mt-0.5" />
        }
        <div>
          <h3 className={`font-semibold mb-1 ${isReady ? 'text-green-300' : 'text-yellow-300'}`}>
            {isReady ? 'Migration Ready' : 'Review Required Before Migration'}
          </h3>
          <p className={`text-sm ${isReady ? 'text-green-400/70' : 'text-yellow-400/70'}`}>
            {isReady
              ? 'All discrepancies have been resolved. Data integrity is validated and the migration can proceed safely.'
              : `${report.pending_review} discrepancies still need human review. Resolve them via flashcard mode before running the final migration.`
            }
          </p>
        </div>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Records" value={report.total_records} icon={BarChart2} color="bg-blue-600" />
        <StatCard label="Discrepancies Found" value={report.total_discrepancies} icon={AlertTriangle} color="bg-yellow-600" />
        <StatCard label="High Risk" value={report.high_risk_count} icon={XCircle} color="bg-red-600" />
        <StatCard label="Resolved" value={report.resolved} icon={CheckCircle} color="bg-green-600" />
      </div>

      <div className="grid grid-cols-3 gap-6 mb-8">
        {/* Confidence gauge */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 flex flex-col items-center">
          <h3 className="text-sm font-semibold text-white mb-4">Overall Confidence</h3>
          <ScoreGauge pct={conf} />
          <p className="text-xs text-gray-500 mt-3 text-center">
            {conf >= 80 ? 'High confidence — data looks clean'
              : conf >= 60 ? 'Moderate — some fields need attention'
              : 'Low — significant mapping issues found'}
          </p>
        </div>

        {/* Review breakdown */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-white mb-4">Review Breakdown</h3>
          {stats && (
            <div className="space-y-3">
              {[
                { label: 'Confirmed (AI correct)', value: stats.confirmed, color: 'bg-green-500' },
                { label: 'Corrected by user', value: stats.corrected, color: 'bg-blue-500' },
                { label: 'Rejected (keep source)', value: stats.rejected, color: 'bg-red-500' },
                { label: 'Auto-propagated', value: stats.propagated, color: 'bg-purple-500' },
                { label: 'Pending review', value: stats.pending, color: 'bg-yellow-500' },
              ].map(item => (
                <div key={item.label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-400">{item.label}</span>
                    <span className="text-white font-medium">{item.value}</span>
                  </div>
                  <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${item.color} rounded-full`}
                      style={{ width: `${stats.total ? (item.value / stats.total) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Discrepancies by entity */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-white mb-4">Issues by Entity</h3>
          {entityData.length > 0 ? (
            <div className="space-y-2">
              {entityData.map(({ entity, count }) => (
                <div key={entity} className="flex items-center justify-between text-sm">
                  <span className="text-gray-300 truncate max-w-[140px] font-mono text-xs">{entity}</span>
                  <span className="bg-gray-800 text-white text-xs px-2 py-0.5 rounded-full">{count as number}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No entity data</p>
          )}
        </div>
      </div>

      {/* Top problematic fields */}
      {fieldData.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-white mb-4">Most Problematic Fields</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={fieldData} layout="vertical">
              <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis dataKey="field" type="category" tick={{ fill: '#9ca3af', fontSize: 11 }} width={120} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                labelStyle={{ color: '#9ca3af' }}
                itemStyle={{ color: '#60a5fa' }}
              />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {fieldData.map((_, i) => (
                  <Cell key={i} fill={i < 2 ? '#ef4444' : i < 4 ? '#f59e0b' : '#3b82f6'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <p className="text-xs text-gray-600 mt-6 text-right">
        Report generated: {new Date(report.generated_at).toLocaleString()}
      </p>
    </div>
  )
}
