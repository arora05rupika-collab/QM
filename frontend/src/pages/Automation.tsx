import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { automationApi, connectorsApi } from '../services/api'
import { Zap, Plus, Play, Pause, CheckCircle, XCircle, Clock } from 'lucide-react'
import toast from 'react-hot-toast'

const EXAMPLE_WORKFLOWS = [
  {
    name: 'Daily Invoice Processing',
    description: 'Automatically fetch pending invoices, validate, and post to accounts',
    trigger: 'Every weekday at 8:00 AM',
    steps: [
      { action: 'query_erp', model: 'account.move', filters: { state: 'draft' } },
      { action: 'action_post', model: 'account.move', description: 'Post all draft invoices' },
      { action: 'send_notification', channel: 'email', description: 'Notify finance team' },
    ],
  },
  {
    name: 'Auto Purchase Order Approval',
    description: 'Approve POs under $5,000 automatically, escalate larger ones',
    trigger: 'When new purchase order is created',
    steps: [
      { action: 'query_erp', model: 'purchase.order', filters: { state: 'draft' } },
      { action: 'conditional_approve', condition: 'amount < 5000', description: 'Auto-approve if under limit' },
      { action: 'send_notification', channel: 'email', description: 'Notify for high-value POs' },
    ],
  },
  {
    name: 'Inventory Reorder Alert',
    description: 'Check stock levels and auto-create purchase orders for low-stock items',
    trigger: 'Every day at 6:00 AM',
    steps: [
      { action: 'query_erp', model: 'product.product', filters: { qty_available: 0 } },
      { action: 'create_po', model: 'purchase.order', description: 'Create PO for stockouts' },
      { action: 'send_notification', channel: 'slack', description: 'Alert procurement team' },
    ],
  },
]

function WorkflowCard({ wf, onRun, onToggle }: { wf: any; onRun: () => void; onToggle: () => void }) {
  const isActive = wf.status === 'active'
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${isActive ? 'bg-orange-900' : 'bg-gray-800'}`}>
            <Zap className={`w-4 h-4 ${isActive ? 'text-orange-300' : 'text-gray-500'}`} />
          </div>
          <div>
            <h3 className="font-semibold text-white text-sm">{wf.name}</h3>
            <span className={`text-xs px-2 py-0.5 rounded-full ${isActive ? 'bg-green-900 text-green-300' : 'bg-gray-800 text-gray-500'}`}>
              {wf.status}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onRun}
            className="flex items-center gap-1 bg-blue-900 hover:bg-blue-800 text-blue-300 text-xs px-2.5 py-1.5 rounded-lg transition-colors"
          >
            <Play className="w-3 h-3" />
            Run Now
          </button>
          <button
            onClick={onToggle}
            className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg transition-colors ${
              isActive
                ? 'bg-gray-800 hover:bg-gray-700 text-gray-400'
                : 'bg-green-900 hover:bg-green-800 text-green-300'
            }`}
          >
            {isActive ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
            {isActive ? 'Pause' : 'Activate'}
          </button>
        </div>
      </div>

      {wf.description && <p className="text-xs text-gray-400 mb-3">{wf.description}</p>}

      <div className="flex items-center gap-2 text-xs text-gray-500 mb-3">
        <Clock className="w-3.5 h-3.5" />
        <span>{wf.trigger}</span>
      </div>

      <div className="flex items-center gap-4 text-xs text-gray-500">
        <span>{wf.run_count} total runs</span>
        {wf.last_run_at && <span>Last: {new Date(wf.last_run_at).toLocaleDateString()}</span>}
      </div>
    </div>
  )
}

function CreateWorkflowModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const { data: connectors = [] } = useQuery({ queryKey: ['connectors'], queryFn: connectorsApi.list })
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [connectorId, setConnectorId] = useState('')
  const [trigger, setTrigger] = useState('')
  const [stepsJson, setStepsJson] = useState(JSON.stringify([
    { action: 'query_erp', model: 'account.move', filters: { state: 'draft' } },
    { action: 'send_notification', channel: 'email', recipient: 'finance@company.com', body: 'Daily invoice summary' },
  ], null, 2))

  const create = useMutation({
    mutationFn: () => automationApi.create({
      name, description, connector_id: connectorId, trigger,
      steps: JSON.parse(stepsJson),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['automations'] })
      toast.success('Workflow created')
      onClose()
    },
    onError: () => toast.error('Failed to create workflow'),
  })

  const loadExample = (ex: typeof EXAMPLE_WORKFLOWS[0]) => {
    setName(ex.name)
    setDescription(ex.description)
    setTrigger(ex.trigger)
    setStepsJson(JSON.stringify(ex.steps, null, 2))
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-bold text-white mb-2">New Automation Workflow</h2>
        <p className="text-xs text-gray-400 mb-6">Define an AI-powered workflow that runs automatically in your ERP</p>

        {/* Quick templates */}
        <div className="mb-5">
          <p className="text-xs text-gray-500 mb-2">Quick templates:</p>
          <div className="flex flex-wrap gap-2">
            {EXAMPLE_WORKFLOWS.map(ex => (
              <button
                key={ex.name}
                onClick={() => loadExample(ex)}
                className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-lg transition-colors"
              >
                {ex.name}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Name</label>
            <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Daily Invoice Processing" />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Description</label>
            <input className="input" value={description} onChange={e => setDescription(e.target.value)} placeholder="What does this workflow do?" />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">ERP Connector</label>
            <select className="input" value={connectorId} onChange={e => setConnectorId(e.target.value)}>
              <option value="">Select connector...</option>
              {connectors.map((c: any) => <option key={c.id} value={c.id}>{c.name} ({c.connector_type})</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Trigger (natural language)</label>
            <input className="input" value={trigger} onChange={e => setTrigger(e.target.value)} placeholder="Every weekday at 8am" />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Steps (JSON)</label>
            <textarea
              className="input font-mono text-xs h-40 resize-none"
              value={stepsJson}
              onChange={e => setStepsJson(e.target.value)}
            />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={() => create.mutate()}
            disabled={!name || !connectorId || !trigger || create.isPending}
            className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg transition-colors"
          >
            {create.isPending ? 'Creating...' : 'Create Workflow'}
          </button>
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
        </div>
      </div>
    </div>
  )
}

export default function Automation() {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)

  const { data: automations = [], isLoading } = useQuery({ queryKey: ['automations'], queryFn: automationApi.list })

  const runMutation = useMutation({
    mutationFn: (id: string) => automationApi.run(id, {}),
    onSuccess: () => toast.success('Automation triggered'),
    onError: () => toast.error('Failed to trigger automation'),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => automationApi.setStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automations'] }),
  })

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Automation</h2>
          <p className="text-gray-400 text-sm mt-1">
            AI agents that replace manual ERP operations — automate up to 90% of routine tasks
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Workflow
        </button>
      </div>

      {/* Value proposition banner */}
      <div className="bg-gradient-to-r from-orange-950 to-yellow-950 border border-orange-800 rounded-xl p-5 mb-8">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 bg-orange-900 rounded-lg flex items-center justify-center flex-shrink-0">
            <Zap className="w-5 h-5 text-orange-300" />
          </div>
          <div>
            <h3 className="font-semibold text-orange-200 mb-1">AI-Powered ERP Automation</h3>
            <p className="text-sm text-orange-300/70">
              Define workflows in plain English. Claude autonomously executes ERP actions —
              creating invoices, approving POs, updating inventory, sending reports —
              without manual intervention. Replace repetitive data entry and approval chains
              with intelligent automation.
            </p>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-gray-500">Loading workflows...</div>
      ) : automations.length === 0 ? (
        <div className="text-center py-16">
          <Zap className="w-12 h-12 text-gray-700 mx-auto mb-3" />
          <p className="text-gray-400 mb-2">No automation workflows yet.</p>
          <p className="text-sm text-gray-600">Create your first workflow to start automating your ERP operations.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {automations.map((wf: any) => (
            <WorkflowCard
              key={wf.id}
              wf={wf}
              onRun={() => runMutation.mutate(wf.id)}
              onToggle={() => toggleMutation.mutate({
                id: wf.id,
                status: wf.status === 'active' ? 'paused' : 'active',
              })}
            />
          ))}
        </div>
      )}

      {showCreate && <CreateWorkflowModal onClose={() => setShowCreate(false)} />}
    </div>
  )
}
