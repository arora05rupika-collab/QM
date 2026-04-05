import { useState } from 'react'
import { Plus, Trash2, Download, Car, Bell, DollarSign, RefreshCcw, Globe } from 'lucide-react'
import type { Settings, RecurringExpense, Expense } from '../../types'
import { getCategories, CATEGORY_EMOJI } from '../../utils/categories'
import { getMonthKey, getMonthExpenses, formatCurrencyDecimal } from '../../utils/calculations'

interface Props {
  settings: Settings
  recurring: RecurringExpense[]
  expenses: Expense[]
  onUpdateSettings: (patch: Partial<Settings>) => void
  onUpdateRecurring: (recurring: RecurringExpense[]) => void
}

function Toggle({ value, onChange, label, sub }: {
  value: boolean; onChange: (v: boolean) => void; label: string; sub?: string
}) {
  return (
    <div className="flex items-center justify-between py-3.5">
      <div className="flex-1 pr-4">
        <p className="text-sm font-bold text-slate-700">{label}</p>
        {sub && <p className="text-xs text-slate-400 font-semibold mt-0.5">{sub}</p>}
      </div>
      <button onClick={() => onChange(!value)}
        className={`relative w-12 h-6.5 rounded-full transition-all duration-200 flex-shrink-0 ${value ? '' : 'bg-slate-200'}`}
        style={{ height: '1.625rem', background: value ? 'linear-gradient(135deg, #8b5cf6, #6d28d9)' : undefined }}>
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${value ? 'translate-x-6' : 'translate-x-0'}`} />
      </button>
    </div>
  )
}

function Section({ title, icon: Icon, color, children }: {
  title: string; icon: React.ElementType; color: string; children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-3xl shadow-card border border-violet-100/60 overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: color + '18' }}>
          <Icon size={15} style={{ color }} />
        </div>
        <p className="text-sm font-extrabold text-slate-700">{title}</p>
      </div>
      <div className="px-5">{children}</div>
    </div>
  )
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}

export default function SettingsPage({ settings, recurring, expenses, onUpdateSettings, onUpdateRecurring }: Props) {
  const categories = getCategories(settings.carMode)
  const [showAddRecurring, setShowAddRecurring] = useState(false)
  const [newRec, setNewRec] = useState({ category: categories[0], amount: '', note: '', dayOfMonth: 1 })

  const handleAddRecurring = () => {
    const amount = parseFloat(newRec.amount)
    if (!amount || amount <= 0) return
    onUpdateRecurring([...recurring, {
      id: generateId(), category: newRec.category, amount,
      note: newRec.note, dayOfMonth: newRec.dayOfMonth, enabled: true,
    }])
    setNewRec({ category: categories[0], amount: '', note: '', dayOfMonth: 1 })
    setShowAddRecurring(false)
  }

  const exportCSV = (all = false) => {
    const data = all ? expenses : getMonthExpenses(expenses, getMonthKey())
    const rows = [['Date', 'Category', 'Amount', 'Note'],
      ...data.sort((a, b) => b.date.localeCompare(a.date))
        .map(e => [e.date, e.category, e.amount.toFixed(2), `"${e.note.replace(/"/g, '""')}"`])]
    const blob = new Blob([rows.map(r => r.join(',')).join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `expenses-${all ? 'all' : getMonthKey()}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4 pb-6">

      {/* Car Mode */}
      <Section title="Car Mode 🚗" icon={Car} color="#8b5cf6">
        <Toggle value={settings.carMode} onChange={v => onUpdateSettings({ carMode: v })}
          label="Enable Car Mode"
          sub={settings.carMode
            ? `Budget: $${settings.monthlyBudget + settings.carBudget}/mo ($${settings.carBudget} for car)`
            : 'Off — budget stays at $2,500/mo'} />
        {settings.carMode && (
          <div className="pb-4">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Monthly Car Budget</p>
            <div className="flex items-center bg-violet-50 rounded-xl px-4 py-3 border border-violet-200">
              <span className="text-violet-400 font-bold mr-2">$</span>
              <input type="number" value={settings.carBudget}
                onChange={e => onUpdateSettings({ carBudget: parseInt(e.target.value) || 250 })}
                className="flex-1 bg-transparent text-slate-800 text-sm font-bold outline-none" />
            </div>
            <p className="text-xs text-slate-400 font-semibold mt-1.5">Covers payment + gas + insurance</p>
          </div>
        )}
      </Section>

      {/* Budget */}
      <Section title="Monthly Budget" icon={DollarSign} color="#10b981">
        <div className="py-4">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Spending Limit</p>
          <div className="flex items-center bg-violet-50 rounded-xl px-4 py-3 border border-violet-200">
            <span className="text-violet-400 font-bold mr-2">$</span>
            <input type="number" value={settings.monthlyBudget}
              onChange={e => onUpdateSettings({ monthlyBudget: parseInt(e.target.value) || 2500 })}
              className="flex-1 bg-transparent text-slate-800 text-sm font-bold outline-none" />
          </div>
        </div>
      </Section>

      {/* Alerts */}
      <Section title="Budget Alerts" icon={Bell} color="#f59e0b">
        <div className="divide-y divide-slate-100">
          <Toggle value={settings.alertAt70} onChange={v => onUpdateSettings({ alertAt70: v })}
            label="Warn at 70%" sub="Amber warning when 70% spent" />
          <Toggle value={settings.alertAt90} onChange={v => onUpdateSettings({ alertAt90: v })}
            label="Alert at 90%" sub="Red alert when 90% spent" />
        </div>
      </Section>

      {/* Currency / INR */}
      <Section title="Currency" icon={Globe} color="#6d28d9">
        <div className="divide-y divide-slate-100">
          <Toggle value={settings.showInr} onChange={v => onUpdateSettings({ showInr: v })}
            label="Show INR equivalent" sub="Useful for India trip planning" />
          {settings.showInr && (
            <div className="py-4">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Exchange Rate (₹ per $1)</p>
              <div className="flex items-center bg-violet-50 rounded-xl px-4 py-3 border border-violet-200">
                <span className="text-violet-400 font-bold mr-2">₹</span>
                <input type="number" value={settings.inrRate}
                  onChange={e => onUpdateSettings({ inrRate: parseFloat(e.target.value) || 84 })}
                  className="flex-1 bg-transparent text-slate-800 text-sm font-bold outline-none" />
                <span className="text-slate-400 text-sm font-semibold">per $1</span>
              </div>
            </div>
          )}
        </div>
      </Section>

      {/* Recurring */}
      <Section title="Recurring Expenses" icon={RefreshCcw} color="#8b5cf6">
        <div className="divide-y divide-slate-100">
          {recurring.map(r => (
            <div key={r.id} className="flex items-center gap-3 py-3.5">
              <span className="text-xl">{CATEGORY_EMOJI[r.category] ?? '📦'}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-700">{r.note || r.category}</p>
                <p className="text-xs text-slate-400 font-semibold">${r.amount} · {r.category} · day {r.dayOfMonth}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={() => onUpdateRecurring(recurring.map(x => x.id === r.id ? { ...x, enabled: !x.enabled } : x))}
                  className="relative w-10 h-5 rounded-full transition-all flex-shrink-0"
                  style={{ background: r.enabled ? 'linear-gradient(135deg, #8b5cf6, #6d28d9)' : '#e2e8f0' }}>
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${r.enabled ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
                <button onClick={() => onUpdateRecurring(recurring.filter(x => x.id !== r.id))}
                  className="w-7 h-7 rounded-xl bg-red-50 flex items-center justify-center text-red-400 hover:bg-red-100 transition-colors">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}

          {showAddRecurring ? (
            <div className="py-4 space-y-3">
              <select value={newRec.category} onChange={e => setNewRec(n => ({ ...n, category: e.target.value }))}
                className="w-full bg-violet-50 border border-violet-200 text-sm text-slate-700 font-bold rounded-xl px-3 py-2.5 focus:outline-none">
                {categories.map(c => <option key={c} value={c}>{CATEGORY_EMOJI[c]} {c}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center bg-violet-50 rounded-xl px-3 py-2.5 border border-violet-200">
                  <span className="text-violet-400 mr-1.5 font-bold text-sm">$</span>
                  <input type="number" placeholder="Amount" value={newRec.amount}
                    onChange={e => setNewRec(n => ({ ...n, amount: e.target.value }))}
                    className="flex-1 bg-transparent text-slate-800 text-sm font-bold outline-none" />
                </div>
                <div className="flex items-center bg-violet-50 rounded-xl px-3 py-2.5 border border-violet-200 gap-2">
                  <span className="text-slate-400 text-xs font-bold">Day</span>
                  <input type="number" min={1} max={28} value={newRec.dayOfMonth}
                    onChange={e => setNewRec(n => ({ ...n, dayOfMonth: parseInt(e.target.value) || 1 }))}
                    className="flex-1 bg-transparent text-slate-800 text-sm font-bold outline-none" />
                </div>
              </div>
              <input type="text" placeholder="Note (e.g. Netflix)" value={newRec.note}
                onChange={e => setNewRec(n => ({ ...n, note: e.target.value }))}
                className="input-field" />
              <div className="flex gap-2">
                <button onClick={handleAddRecurring}
                  className="flex-1 py-3 text-white text-sm font-bold rounded-xl transition-all"
                  style={{ background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)' }}>
                  Add
                </button>
                <button onClick={() => setShowAddRecurring(false)}
                  className="flex-1 py-3 bg-slate-100 text-slate-500 text-sm font-bold rounded-xl">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowAddRecurring(true)}
              className="flex items-center gap-2 py-4 text-sm font-bold text-violet-600 hover:text-violet-700 transition-colors w-full">
              <div className="w-6 h-6 rounded-lg bg-violet-100 flex items-center justify-center">
                <Plus size={14} />
              </div>
              Add recurring expense
            </button>
          )}
        </div>
      </Section>

      {/* Export */}
      <Section title="Export Data" icon={Download} color="#64748b">
        <div className="py-4 space-y-2.5">
          <button onClick={() => exportCSV(false)}
            className="w-full flex items-center justify-center gap-2 py-3.5 bg-slate-50 hover:bg-slate-100 text-slate-700 text-sm font-bold rounded-2xl transition-colors border border-slate-200">
            <Download size={15} /> Export This Month (CSV)
          </button>
          <button onClick={() => exportCSV(true)}
            className="w-full flex items-center justify-center gap-2 py-3.5 bg-slate-50 hover:bg-slate-100 text-slate-700 text-sm font-bold rounded-2xl transition-colors border border-slate-200">
            <Download size={15} /> Export All Time (CSV)
          </button>
        </div>
      </Section>

      <p className="text-center text-xs text-slate-400 font-semibold pb-2">
        💜 Expense Tracker · F-1 OPT Edition · Data stored locally
      </p>
    </div>
  )
}
