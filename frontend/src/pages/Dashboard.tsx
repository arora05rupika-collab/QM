import { useQuery } from '@tanstack/react-query'
import { migrationsApi, connectorsApi, automationApi } from '../services/api'
import {
  Database, ArrowLeftRight, Zap, CheckCircle, Clock, AlertCircle, TrendingUp
} from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

const MOCK_CHART = [
  { day: 'Mon', records: 12000 },
  { day: 'Tue', records: 45000 },
  { day: 'Wed', records: 28000 },
  { day: 'Thu', records: 67000 },
  { day: 'Fri', records: 89000 },
  { day: 'Sat', records: 34000 },
  { day: 'Sun', records: 51000 },
]

function StatCard({ label, value, icon: Icon, color, sub }: any) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex items-start gap-4">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div>
        <p className="text-2xl font-bold text-white">{value}</p>
        <p className="text-sm text-gray-400">{label}</p>
        {sub && <p className="text-xs text-green-400 mt-1">{sub}</p>}
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    completed: 'bg-green-900 text-green-300',
    running: 'bg-blue-900 text-blue-300',
    failed: 'bg-red-900 text-red-300',
    draft: 'bg-gray-800 text-gray-400',
    ready: 'bg-yellow-900 text-yellow-300',
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${map[status] || 'bg-gray-800 text-gray-400'}`}>
      {status}
    </span>
  )
}

export default function Dashboard() {
  const { data: migrations = [] } = useQuery({ queryKey: ['migrations'], queryFn: migrationsApi.list })
  const { data: connectors = [] } = useQuery({ queryKey: ['connectors'], queryFn: connectorsApi.list })
  const { data: automations = [] } = useQuery({ queryKey: ['automations'], queryFn: automationApi.list })

  const completed = migrations.filter((m: any) => m.status === 'completed').length
  const running = migrations.filter((m: any) => m.status === 'running').length
  const totalRecords = migrations.reduce((acc: number, m: any) => acc + (m.migrated_records || 0), 0)

  return (
    <div className="p-8">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white">Dashboard</h2>
        <p className="text-gray-400 text-sm mt-1">Overview of your ERP migration and automation activity</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatCard label="Connected ERPs" value={connectors.length} icon={Database} color="bg-blue-600" />
        <StatCard label="Total Migrations" value={migrations.length} icon={ArrowLeftRight} color="bg-purple-600" sub={`${completed} completed`} />
        <StatCard label="Records Migrated" value={totalRecords.toLocaleString()} icon={TrendingUp} color="bg-green-600" sub="Across all jobs" />
        <StatCard label="Active Automations" value={automations.filter((a: any) => a.status === 'active').length} icon={Zap} color="bg-orange-600" />
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Chart */}
        <div className="col-span-2 bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-white mb-4">Records Migrated (7 days)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={MOCK_CHART}>
              <defs>
                <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="day" tick={{ fill: '#6b7280', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                labelStyle={{ color: '#9ca3af' }}
                itemStyle={{ color: '#60a5fa' }}
              />
              <Area type="monotone" dataKey="records" stroke="#3b82f6" fill="url(#grad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Recent migrations */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-white mb-4">Recent Migrations</h3>
          {migrations.length === 0 ? (
            <div className="text-center py-8">
              <ArrowLeftRight className="w-8 h-8 text-gray-700 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No migrations yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {migrations.slice(0, 6).map((m: any) => (
                <div key={m.id} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-white truncate max-w-[140px]">{m.name}</p>
                    <p className="text-xs text-gray-500">{m.migrated_records?.toLocaleString()} records</p>
                  </div>
                  <StatusBadge status={m.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Automations */}
      {automations.length > 0 && (
        <div className="mt-6 bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-white mb-4">Active Automation Workflows</h3>
          <div className="grid grid-cols-3 gap-4">
            {automations.slice(0, 6).map((a: any) => (
              <div key={a.id} className="bg-gray-800 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="w-4 h-4 text-orange-400" />
                  <span className="text-sm font-medium text-white truncate">{a.name}</span>
                </div>
                <p className="text-xs text-gray-400 truncate">{a.trigger}</p>
                <p className="text-xs text-gray-500 mt-1">{a.run_count} runs</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
