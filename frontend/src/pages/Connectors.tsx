import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { connectorsApi } from '../services/api'
import { Database, Plus, Wifi, WifiOff, Trash2, RefreshCw, ChevronDown } from 'lucide-react'
import toast from 'react-hot-toast'

const CONNECTOR_TYPES = [
  { value: 'postgresql', label: 'PostgreSQL', fields: ['host', 'port', 'database', 'user', 'password'] },
  { value: 'mysql', label: 'MySQL', fields: ['host', 'port', 'database', 'user', 'password'] },
  { value: 'firebase', label: 'Firebase / Firestore', fields: ['project_id', 'credentials_json'] },
  { value: 'odoo', label: 'Odoo ERP', fields: ['host', 'port', 'database', 'user', 'password'] },
  { value: 'mongodb', label: 'MongoDB', fields: ['connection_string', 'database'] },
]

const TYPE_COLORS: Record<string, string> = {
  postgresql: 'bg-blue-900 text-blue-300',
  mysql: 'bg-orange-900 text-orange-300',
  firebase: 'bg-yellow-900 text-yellow-300',
  odoo: 'bg-purple-900 text-purple-300',
  mongodb: 'bg-green-900 text-green-300',
}

function ConnectorForm({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [type, setType] = useState(CONNECTOR_TYPES[0])
  const [name, setName] = useState('')
  const [config, setConfig] = useState<Record<string, string>>({})

  const create = useMutation({
    mutationFn: () => connectorsApi.create({ name, connector_type: type.value, config }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['connectors'] })
      toast.success('Connector created')
      onClose()
    },
    onError: () => toast.error('Failed to create connector'),
  })

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg p-6">
        <h2 className="text-lg font-bold text-white mb-6">Add Connector</h2>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Name</label>
            <input
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              placeholder="My Production DB"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">Type</label>
            <select
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              value={type.value}
              onChange={e => setType(CONNECTOR_TYPES.find(t => t.value === e.target.value)!)}
            >
              {CONNECTOR_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {type.fields.map(field => (
            <div key={field}>
              <label className="text-xs text-gray-400 mb-1 block capitalize">{field.replace('_', ' ')}</label>
              <input
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                type={field.includes('password') || field.includes('key') || field.includes('json') ? 'password' : 'text'}
                placeholder={field}
                onChange={e => setConfig(c => ({ ...c, [field]: e.target.value }))}
              />
            </div>
          ))}
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={() => create.mutate()}
            disabled={!name || create.isPending}
            className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg transition-colors"
          >
            {create.isPending ? 'Creating...' : 'Create Connector'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Connectors() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const { data: connectors = [], isLoading } = useQuery({ queryKey: ['connectors'], queryFn: connectorsApi.list })

  const testMutation = useMutation({
    mutationFn: (id: string) => connectorsApi.test(id),
    onSuccess: (data) => toast[data.connected ? 'success' : 'error'](
      data.connected ? 'Connection successful' : 'Connection failed'
    ),
  })

  const schemaMutation = useMutation({
    mutationFn: (id: string) => connectorsApi.getSchema(id),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['connectors'] })
      toast.success(`Schema fetched: ${data.entities?.length} entities`)
    },
    onError: () => toast.error('Failed to fetch schema'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => connectorsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['connectors'] })
      toast.success('Connector removed')
    },
  })

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-white">Connectors</h2>
          <p className="text-gray-400 text-sm mt-1">Connect to your ERP systems and data sources</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Connector
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-gray-500">Loading connectors...</div>
      ) : connectors.length === 0 ? (
        <div className="text-center py-16">
          <Database className="w-12 h-12 text-gray-700 mx-auto mb-3" />
          <p className="text-gray-400">No connectors yet. Add your first ERP connection.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {connectors.map((c: any) => (
            <div key={c.id} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center">
                    <Database className="w-5 h-5 text-gray-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">{c.name}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${TYPE_COLORS[c.connector_type] || 'bg-gray-800 text-gray-400'}`}>
                      {c.connector_type}
                    </span>
                  </div>
                </div>
              </div>

              {c.schema_fetched_at && (
                <p className="text-xs text-gray-500 mb-4">
                  Schema fetched {new Date(c.schema_fetched_at).toLocaleDateString()}
                </p>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => testMutation.mutate(c.id)}
                  disabled={testMutation.isPending}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs py-1.5 rounded-lg transition-colors"
                >
                  <Wifi className="w-3.5 h-3.5" />
                  Test
                </button>
                <button
                  onClick={() => schemaMutation.mutate(c.id)}
                  disabled={schemaMutation.isPending}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs py-1.5 rounded-lg transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Sync Schema
                </button>
                <button
                  onClick={() => deleteMutation.mutate(c.id)}
                  className="flex items-center justify-center bg-gray-800 hover:bg-red-900 text-gray-400 hover:text-red-300 w-8 rounded-lg transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && <ConnectorForm onClose={() => setShowForm(false)} />}
    </div>
  )
}
