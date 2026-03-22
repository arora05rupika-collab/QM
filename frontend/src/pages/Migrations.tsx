import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { migrationsApi, connectorsApi } from '../services/api'
import { ArrowLeftRight, Play, Sparkles, Plus, BarChart2, AlertTriangle, CheckCircle } from 'lucide-react'
import toast from 'react-hot-toast'

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    completed: { cls: 'bg-green-900 text-green-300', label: '✓ Completed' },
    running: { cls: 'bg-blue-900 text-blue-300 animate-pulse', label: '⟳ Running' },
    failed: { cls: 'bg-red-900 text-red-300', label: '✗ Failed' },
    draft: { cls: 'bg-gray-800 text-gray-400', label: 'Draft' },
    ready: { cls: 'bg-yellow-900 text-yellow-300', label: 'Ready' },
    analyzing: { cls: 'bg-purple-900 text-purple-300', label: 'Analyzing' },
  }
  const { cls, label } = map[status] || { cls: 'bg-gray-800 text-gray-400', label: status }
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>{label}</span>
}

function ProgressBar({ value, total }: { value: number; total: number }) {
  const pct = total > 0 ? Math.min(100, (value / total) * 100) : 0
  return (
    <div className="mt-3">
      <div className="flex justify-between text-xs text-gray-400 mb-1">
        <span>{value.toLocaleString()} / {total.toLocaleString()} records</span>
        <span>{pct.toFixed(0)}%</span>
      </div>
      <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function CreateMigrationModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const { data: connectors = [] } = useQuery({ queryKey: ['connectors'], queryFn: connectorsApi.list })
  const [name, setName] = useState('')
  const [srcId, setSrcId] = useState('')
  const [tgtId, setTgtId] = useState('')
  const [srcEntity, setSrcEntity] = useState('')
  const [tgtEntity, setTgtEntity] = useState('')
  const [batchSize, setBatchSize] = useState('500')
  const [dryRun, setDryRun] = useState(false)

  const create = useMutation({
    mutationFn: () => migrationsApi.create({
      name,
      source_connector_id: srcId,
      target_connector_id: tgtId,
      entity_pairs: [{ source_entity: srcEntity, target_entity: tgtEntity }],
      config: { batch_size: Number(batchSize), dry_run: dryRun, mode: 'upsert' },
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['migrations'] })
      toast.success('Migration created')
      onClose()
    },
    onError: () => toast.error('Failed to create migration'),
  })

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg p-6">
        <h2 className="text-lg font-bold text-white mb-6">New Migration Job</h2>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Job Name</label>
            <input className="input" placeholder="Q3 ERP Migration" value={name} onChange={e => setName(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Source Connector</label>
              <select className="input" value={srcId} onChange={e => setSrcId(e.target.value)}>
                <option value="">Select...</option>
                {connectors.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Target Connector</label>
              <select className="input" value={tgtId} onChange={e => setTgtId(e.target.value)}>
                <option value="">Select...</option>
                {connectors.filter((c: any) => c.id !== srcId).map((c: any) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Source Entity</label>
              <input className="input" placeholder="e.g. customers" value={srcEntity} onChange={e => setSrcEntity(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Target Entity</label>
              <input className="input" placeholder="e.g. res.partner" value={tgtEntity} onChange={e => setTgtEntity(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Batch Size</label>
              <input className="input" type="number" value={batchSize} onChange={e => setBatchSize(e.target.value)} />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={dryRun} onChange={e => setDryRun(e.target.checked)} className="rounded" />
                <span className="text-sm text-gray-300">Dry Run (validate only)</span>
              </label>
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={() => create.mutate()}
            disabled={!name || !srcId || !tgtId || create.isPending}
            className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg transition-colors"
          >
            {create.isPending ? 'Creating...' : 'Create Job'}
          </button>
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
        </div>
      </div>
    </div>
  )
}

export default function Migrations() {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [selectedJob, setSelectedJob] = useState<any>(null)

  const { data: migrations = [], isLoading } = useQuery({
    queryKey: ['migrations'],
    queryFn: migrationsApi.list,
    refetchInterval: 3000, // poll running jobs
  })

  const generateMapping = useMutation({
    mutationFn: ({ id, src, tgt }: { id: string; src: string; tgt: string }) =>
      migrationsApi.generateMapping(id, src, tgt),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['migrations'] })
      toast.success(`AI mapped ${data.count} fields`)
    },
    onError: () => toast.error('Mapping failed'),
  })

  const startJob = useMutation({
    mutationFn: (id: string) => migrationsApi.start(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['migrations'] })
      toast.success('Migration started')
    },
    onError: () => toast.error('Failed to start migration'),
  })

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-white">Migrations</h2>
          <p className="text-gray-400 text-sm mt-1">AI-powered data migration between ERP systems</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Migration
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-gray-500">Loading...</div>
      ) : migrations.length === 0 ? (
        <div className="text-center py-16">
          <ArrowLeftRight className="w-12 h-12 text-gray-700 mx-auto mb-3" />
          <p className="text-gray-400">No migration jobs yet. Create your first one.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {migrations.map((m: any) => (
            <div key={m.id} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="font-semibold text-white">{m.name}</h3>
                    <StatusBadge status={m.status} />
                  </div>
                  <p className="text-xs text-gray-500">
                    Created {new Date(m.created_at).toLocaleDateString()}
                    {m.config?.dry_run && ' · Dry Run'}
                    {m.config?.batch_size && ` · Batch: ${m.config.batch_size}`}
                  </p>

                  {(m.total_records > 0) && (
                    <ProgressBar value={m.migrated_records} total={m.total_records} />
                  )}
                  {m.failed_records > 0 && (
                    <p className="text-xs text-red-400 mt-1">
                      <AlertTriangle className="w-3 h-3 inline mr-1" />
                      {m.failed_records} failed records
                    </p>
                  )}
                </div>

                <div className="flex gap-2 ml-4">
                  {m.status === 'draft' && (
                    <button
                      onClick={() => {
                        const pairs = m.config?.entity_pairs || [{ source_entity: '', target_entity: '' }]
                        const pair = pairs[0]
                        generateMapping.mutate({ id: m.id, src: pair.source_entity, tgt: pair.target_entity })
                      }}
                      disabled={generateMapping.isPending}
                      className="flex items-center gap-1.5 bg-purple-900 hover:bg-purple-800 text-purple-300 text-xs px-3 py-1.5 rounded-lg transition-colors"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      AI Map
                    </button>
                  )}
                  {(m.status === 'draft' || m.status === 'ready') && (
                    <button
                      onClick={() => startJob.mutate(m.id)}
                      disabled={startJob.isPending}
                      className="flex items-center gap-1.5 bg-green-900 hover:bg-green-800 text-green-300 text-xs px-3 py-1.5 rounded-lg transition-colors"
                    >
                      <Play className="w-3.5 h-3.5" />
                      Start
                    </button>
                  )}
                </div>
              </div>

              {/* Field mapping preview */}
              {m.field_mapping && m.field_mapping.length > 0 && (
                <div className="mt-4 bg-gray-800 rounded-lg p-3">
                  <p className="text-xs text-gray-400 mb-2 font-medium">AI Field Mapping ({m.field_mapping.length} fields)</p>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {m.field_mapping.slice(0, 8).map((f: any, i: number) => (
                      <div key={i} className="flex items-center text-xs gap-2">
                        <span className="text-blue-300 font-mono">{f.source_field || '—'}</span>
                        <ArrowLeftRight className="w-3 h-3 text-gray-600 flex-shrink-0" />
                        <span className="text-green-300 font-mono">{f.target_field}</span>
                        <span className="ml-auto text-gray-500">{(f.confidence * 100).toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showCreate && <CreateMigrationModal onClose={() => setShowCreate(false)} />}
    </div>
  )
}
