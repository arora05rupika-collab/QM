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

function Toggle({ value, onChange, label, sub }: { value: boolean; onChange: (v: boolean) => void; label: string; sub?: string }) {
  return (
    <div className="flex items-center justify-between py-3">
      <div>
        <p className="text-sm text-gray-200">{label}</p>
        {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
      </div>
      <button
        onClick={() => onChange(!value)}
        className={`relative w-12 h-6 rounded-full transition-colors duration-200 flex-shrink-0 ${value ? 'bg-emerald-600' : 'bg-gray-700'}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${value ? 'translate-x-6' : 'translate-x-0'}`}
        />
      </button>
    </div>
  )
}

function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-800">
        <Icon size={15} className="text-gray-500" />
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{title}</p>
      </div>
      <div className="px-4">{children}</div>
    </div>
  )
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}

export default function SettingsPage({ settings, recurring, expenses, onUpdateSettings, onUpdateRecurring }: Props) {
  const categories = getCategories(settings.carMode)

  // New recurring form state
  const [showAddRecurring, setShowAddRecurring] = useState(false)
  const [newRec, setNewRec] = useState({ category: categories[0], amount: '', note: '', dayOfMonth: 1 })

  const handleAddRecurring = () => {
    const amount = parseFloat(newRec.amount)
    if (!amount || amount <= 0) return
    const item: RecurringExpense = {
      id: generateId(),
      category: newRec.category,
      amount,
      note: newRec.note,
      dayOfMonth: newRec.dayOfMonth,
      enabled: true,
    }
    onUpdateRecurring([...recurring, item])
    setNewRec({ category: categories[0], amount: '', note: '', dayOfMonth: 1 })
    setShowAddRecurring(false)
  }

  const toggleRecurring = (id: string) => {
    onUpdateRecurring(recurring.map(r => (r.id === id ? { ...r, enabled: !r.enabled } : r)))
  }

  const deleteRecurring = (id: string) => {
    onUpdateRecurring(recurring.filter(r => r.id !== id))
  }

  // CSV export
  const exportCSV = () => {
    const monthKey = getMonthKey()
    const monthExpenses = getMonthExpenses(expenses, monthKey)
    const rows = [
      ['Date', 'Category', 'Amount', 'Note'],
      ...monthExpenses.map(e => [e.date, e.category, e.amount.toFixed(2), `"${e.note.replace(/"/g, '""')}"`]),
    ]
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `expenses-${monthKey}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportAllCSV = () => {
    const rows = [
      ['Date', 'Category', 'Amount', 'Note'],
      ...expenses.sort((a, b) => b.date.localeCompare(a.date)).map(e => [e.date, e.category, e.amount.toFixed(2), `"${e.note.replace(/"/g, '""')}"`]),
    ]
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `expenses-all.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4 pb-4">
      <h2 className="text-lg font-semibold text-gray-200 px-1">Settings</h2>

      {/* Car Mode */}
      <Section title="Car Mode" icon={Car}>
        <Toggle
          value={settings.carMode}
          onChange={v => onUpdateSettings({ carMode: v })}
          label="Enable Car Mode"
          sub={
            settings.carMode
              ? `Budget: $${settings.monthlyBudget + settings.carBudget}/mo (includes $${settings.carBudget} car expenses)`
              : `Off — budget stays at $${settings.monthlyBudget}/mo`
          }
        />
        {settings.carMode && (
          <div className="pb-3">
            <p className="text-xs text-gray-500 mb-1.5">Monthly car budget</p>
            <div className="flex items-center bg-gray-800 rounded-lg px-3 py-2">
              <span className="text-gray-400 mr-1 text-sm">$</span>
              <input
                type="number"
                value={settings.carBudget}
                onChange={e => onUpdateSettings({ carBudget: parseInt(e.target.value) || 250 })}
                className="flex-1 bg-transparent text-white text-sm outline-none"
              />
            </div>
            <p className="text-xs text-gray-600 mt-1">Covers car payment + gas + insurance</p>
          </div>
        )}
      </Section>

      {/* Budget */}
      <Section title="Budget" icon={DollarSign}>
        <div className="py-3 space-y-3">
          <div>
            <p className="text-xs text-gray-500 mb-1.5">Monthly spending budget</p>
            <div className="flex items-center bg-gray-800 rounded-lg px-3 py-2">
              <span className="text-gray-400 mr-1">$</span>
              <input
                type="number"
                value={settings.monthlyBudget}
                onChange={e => onUpdateSettings({ monthlyBudget: parseInt(e.target.value) || 2500 })}
                className="flex-1 bg-transparent text-white text-sm outline-none"
              />
            </div>
          </div>
        </div>
      </Section>

      {/* Alerts */}
      <Section title="Budget Alerts" icon={Bell}>
        <div className="divide-y divide-gray-800">
          <Toggle
            value={settings.alertAt70}
            onChange={v => onUpdateSettings({ alertAt70: v })}
            label="Warn at 70%"
            sub="Amber warning when 70% spent"
          />
          <Toggle
            value={settings.alertAt90}
            onChange={v => onUpdateSettings({ alertAt90: v })}
            label="Alert at 90%"
            sub="Red alert when 90% spent"
          />
        </div>
      </Section>

      {/* INR display */}
      <Section title="Currency" icon={Globe}>
        <div className="divide-y divide-gray-800">
          <Toggle
            value={settings.showInr}
            onChange={v => onUpdateSettings({ showInr: v })}
            label="Show INR equivalent"
            sub="For India trip planning"
          />
          {settings.showInr && (
            <div className="py-3">
              <p className="text-xs text-gray-500 mb-1.5">USD → INR exchange rate</p>
              <div className="flex items-center bg-gray-800 rounded-lg px-3 py-2">
                <span className="text-gray-400 mr-1 text-sm">₹</span>
                <input
                  type="number"
                  value={settings.inrRate}
                  onChange={e => onUpdateSettings({ inrRate: parseFloat(e.target.value) || 84 })}
                  className="flex-1 bg-transparent text-white text-sm outline-none"
                />
                <span className="text-gray-500 text-xs">per $1</span>
              </div>
            </div>
          )}
        </div>
      </Section>

      {/* Recurring expenses */}
      <Section title="Recurring Expenses" icon={RefreshCcw}>
        <div className="divide-y divide-gray-800">
          {recurring.map(r => (
            <div key={r.id} className="flex items-center gap-3 py-3">
              <span className="text-base">{CATEGORY_EMOJI[r.category] ?? '📦'}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-200">{r.note || r.category}</p>
                <p className="text-xs text-gray-500">
                  ${r.amount} · {r.category} · day {r.dayOfMonth}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => toggleRecurring(r.id)}
                  className={`relative w-9 h-5 rounded-full transition-colors ${r.enabled ? 'bg-emerald-600' : 'bg-gray-700'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${r.enabled ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
                <button onClick={() => deleteRecurring(r.id)} className="p-1 text-gray-600 hover:text-red-400 transition-colors">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}

          {/* Add recurring */}
          {showAddRecurring ? (
            <div className="py-3 space-y-2">
              <select
                value={newRec.category}
                onChange={e => setNewRec(n => ({ ...n, category: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 text-sm text-gray-200 rounded-lg px-3 py-2 focus:outline-none"
              >
                {categories.map(c => (
                  <option key={c} value={c}>{CATEGORY_EMOJI[c]} {c}</option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center bg-gray-800 rounded-lg px-3 py-2">
                  <span className="text-gray-400 mr-1 text-sm">$</span>
                  <input
                    type="number"
                    placeholder="Amount"
                    value={newRec.amount}
                    onChange={e => setNewRec(n => ({ ...n, amount: e.target.value }))}
                    className="flex-1 bg-transparent text-white text-sm outline-none"
                  />
                </div>
                <div className="flex items-center bg-gray-800 rounded-lg px-3 py-2 gap-1">
                  <span className="text-gray-400 text-xs">Day</span>
                  <input
                    type="number"
                    min={1}
                    max={28}
                    value={newRec.dayOfMonth}
                    onChange={e => setNewRec(n => ({ ...n, dayOfMonth: parseInt(e.target.value) || 1 }))}
                    className="flex-1 bg-transparent text-white text-sm outline-none"
                  />
                </div>
              </div>
              <input
                type="text"
                placeholder="Note (e.g. Netflix)"
                value={newRec.note}
                onChange={e => setNewRec(n => ({ ...n, note: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleAddRecurring}
                  className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Add
                </button>
                <button
                  onClick={() => setShowAddRecurring(false)}
                  className="flex-1 py-2 bg-gray-800 text-gray-400 text-sm rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowAddRecurring(true)}
              className="flex items-center gap-2 py-3 text-sm text-emerald-400 hover:text-emerald-300 transition-colors w-full"
            >
              <Plus size={15} /> Add recurring expense
            </button>
          )}
        </div>
      </Section>

      {/* Export */}
      <Section title="Export Data" icon={Download}>
        <div className="py-3 space-y-2">
          <button
            onClick={exportCSV}
            className="w-full flex items-center justify-center gap-2 py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-xl transition-colors"
          >
            <Download size={15} /> Export This Month (CSV)
          </button>
          <button
            onClick={exportAllCSV}
            className="w-full flex items-center justify-center gap-2 py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-xl transition-colors"
          >
            <Download size={15} /> Export All Time (CSV)
          </button>
        </div>
      </Section>

      {/* App info */}
      <div className="text-center py-2 text-xs text-gray-700">
        <p>Expense Tracker · F-1 OPT Edition</p>
        <p className="mt-0.5">Data stored locally on your device</p>
      </div>
    </div>
  )
}
