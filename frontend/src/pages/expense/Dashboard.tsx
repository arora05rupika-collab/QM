import { useMemo } from 'react'
import { Trash2, TrendingDown, TrendingUp, Sparkles } from 'lucide-react'
import type { Expense, Settings } from '../../types'
import {
  getMonthExpenses,
  getTotalSpent,
  getBudgetPercent,
  getBudgetStatus,
  getDailyBudget,
  getDailyAverage,
  getSafeToSpend,
  getRemainingDays,
  getDaysInMonth,
  formatCurrency,
  formatCurrencyDecimal,
  getMonthKey,
} from '../../utils/calculations'
import { CATEGORY_EMOJI, CATEGORY_COLORS } from '../../utils/categories'

interface Props {
  expenses: Expense[]
  settings: Settings
  effectiveBudget: number
  onDelete: (id: string) => void
  onNavigateAdd: () => void
}

export default function Dashboard({ expenses, settings, effectiveBudget, onDelete, onNavigateAdd }: Props) {
  const now = new Date()
  const monthExpenses = useMemo(() => getMonthExpenses(expenses, getMonthKey(now)), [expenses])
  const totalSpent = useMemo(() => getTotalSpent(monthExpenses), [monthExpenses])
  const remaining = effectiveBudget - totalSpent
  const pct = getBudgetPercent(totalSpent, effectiveBudget)
  const status = getBudgetStatus(totalSpent, effectiveBudget)
  const dailyBudget = getDailyBudget(effectiveBudget, now)
  const dailyAvg = getDailyAverage(totalSpent, now)
  const safeToSpend = getSafeToSpend(effectiveBudget, totalSpent, now)
  const remainingDays = getRemainingDays(now)
  const daysInMonth = getDaysInMonth(now)
  const daysPassed = now.getDate()

  const barColor = status === 'good' ? '#10b981' : status === 'warning' ? '#f59e0b' : '#f43f5e'
  const monthLabel = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  const recentExpenses = useMemo(
    () => [...expenses].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8),
    [expenses],
  )

  return (
    <div className="space-y-4 pb-6">

      {/* Hero Budget Card */}
      <div className="rounded-3xl p-6 text-white relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 60%, #4f46e5 100%)' }}>
        {/* Decorative circles */}
        <div className="absolute top-0 right-0 w-40 h-40 rounded-full opacity-10" style={{ background: 'white', transform: 'translate(30%, -30%)' }} />
        <div className="absolute bottom-0 left-0 w-28 h-28 rounded-full opacity-10" style={{ background: 'white', transform: 'translate(-30%, 30%)' }} />

        <div className="relative">
          <div className="flex items-center justify-between mb-1">
            <p className="text-violet-200 text-sm font-semibold">{monthLabel}</p>
            {settings.carMode && (
              <span className="text-xs bg-white/20 px-2.5 py-1 rounded-full font-bold">🚗 Car Mode</span>
            )}
          </div>
          <p className="text-white/70 text-sm mt-3 mb-1">Budget Remaining</p>
          <p className={`font-extrabold tracking-tight leading-none ${remaining < 0 ? 'text-red-300' : 'text-white'}`}
            style={{ fontSize: '2.8rem' }}>
            {remaining < 0 ? '-' : ''}{formatCurrency(Math.abs(remaining))}
          </p>
          <p className="text-violet-200 text-sm mt-1">of {formatCurrency(effectiveBudget)} · spent {formatCurrency(totalSpent)}</p>

          {/* Progress bar */}
          <div className="mt-4">
            <div className="flex justify-between text-xs text-violet-200 mb-2">
              <span>{pct.toFixed(0)}% used</span>
              <span>{daysPassed} / {daysInMonth} days</span>
            </div>
            <div className="h-2.5 bg-white/20 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${Math.min(100, pct)}%`, backgroundColor: barColor }}
              />
            </div>
          </div>

          {/* Alerts */}
          {settings.alertAt70 && pct >= 70 && pct < 90 && (
            <div className="mt-3 flex items-center gap-2 bg-amber-400/20 rounded-xl px-3 py-2">
              <span>⚠️</span>
              <p className="text-amber-200 text-xs font-semibold">70% of budget used — watch spending</p>
            </div>
          )}
          {settings.alertAt90 && pct >= 90 && pct < 100 && (
            <div className="mt-3 flex items-center gap-2 bg-red-400/20 rounded-xl px-3 py-2">
              <span>🚨</span>
              <p className="text-red-200 text-xs font-semibold">90% used — slow down!</p>
            </div>
          )}
          {pct >= 100 && (
            <div className="mt-3 flex items-center gap-2 bg-red-400/30 rounded-xl px-3 py-2">
              <span>🔴</span>
              <p className="text-red-200 text-xs font-semibold">Over budget!</p>
            </div>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Safe to Spend"
          value={formatCurrencyDecimal(safeToSpend)}
          sub="today"
          icon="🎯"
          color="#8b5cf6"
          bgColor="#f5f3ff"
        />
        <StatCard
          label="Daily Average"
          value={formatCurrencyDecimal(dailyAvg)}
          sub={`budget: ${formatCurrencyDecimal(dailyBudget)}/day`}
          icon={dailyAvg > dailyBudget ? '📈' : '📉'}
          color={dailyAvg > dailyBudget ? '#f59e0b' : '#10b981'}
          bgColor={dailyAvg > dailyBudget ? '#fffbeb' : '#ecfdf5'}
        />
        <StatCard
          label="Days Left"
          value={String(remainingDays)}
          sub={`of ${daysInMonth} days`}
          icon="📅"
          color="#6d28d9"
          bgColor="#f5f3ff"
        />
        <StatCard
          label="Total Spent"
          value={formatCurrency(totalSpent)}
          sub="this month"
          icon="💳"
          color="#7c3aed"
          bgColor="#ede9fe"
        />
      </div>

      {/* INR note */}
      {settings.showInr && remaining > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-center gap-2">
          <span className="text-lg">🇮🇳</span>
          <p className="text-sm text-amber-700 font-semibold">
            ≈ ₹{Math.round(remaining * settings.inrRate).toLocaleString('en-IN')} remaining
          </p>
        </div>
      )}

      {/* Quick Add Button */}
      <button
        onClick={onNavigateAdd}
        className="w-full btn-primary flex items-center justify-center gap-2"
      >
        <Sparkles size={18} />
        Log an Expense
      </button>

      {/* Recent Expenses */}
      <div>
        <h3 className="text-sm font-extrabold text-slate-500 uppercase tracking-wider mb-3 px-1">Recent</h3>
        {recentExpenses.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-3xl shadow-card border border-violet-100/60">
            <p className="text-4xl mb-3">💸</p>
            <p className="text-slate-400 font-semibold">No expenses yet this month</p>
            <p className="text-slate-300 text-sm mt-1">Tap "Log an Expense" to start</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentExpenses.map(expense => (
              <ExpenseRow key={expense.id} expense={expense} onDelete={onDelete} showInr={settings.showInr} inrRate={settings.inrRate} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value, sub, icon, color, bgColor }: {
  label: string; value: string; sub?: string; icon: string; color: string; bgColor: string
}) {
  return (
    <div className="bg-white rounded-2xl p-4 shadow-card border border-violet-100/60">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center text-base"
          style={{ backgroundColor: bgColor }}>
          {icon}
        </div>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">{label}</p>
      </div>
      <p className="text-xl font-extrabold" style={{ color }}>{value}</p>
      {sub && <p className="text-xs text-slate-400 font-semibold mt-0.5">{sub}</p>}
    </div>
  )
}

function ExpenseRow({ expense, onDelete, showInr, inrRate }: {
  expense: Expense; onDelete: (id: string) => void; showInr: boolean; inrRate: number
}) {
  const emoji = CATEGORY_EMOJI[expense.category] ?? '📦'
  const color = CATEGORY_COLORS[expense.category] ?? '#8b5cf6'
  const isAuto = expense.note.startsWith('[Auto]')
  const noteDisplay = expense.note.replace('[Auto] ', '')

  return (
    <div className="flex items-center gap-3 bg-white rounded-2xl px-4 py-3.5 shadow-card border border-violet-100/60">
      <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl flex-shrink-0"
        style={{ backgroundColor: color + '18' }}>
        {emoji}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-bold text-slate-700 truncate">{expense.category}</p>
          {isAuto && (
            <span className="text-xs text-violet-400 bg-violet-50 px-1.5 py-0.5 rounded-full font-semibold">auto</span>
          )}
        </div>
        <p className="text-xs text-slate-400 truncate font-medium">{noteDisplay || '—'} · {expense.date.slice(5)}</p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-sm font-extrabold text-slate-800">{formatCurrencyDecimal(expense.amount)}</p>
        {showInr && (
          <p className="text-xs text-slate-400">₹{Math.round(expense.amount * inrRate).toLocaleString('en-IN')}</p>
        )}
      </div>
      <button onClick={() => onDelete(expense.id)}
        className="ml-1 w-7 h-7 rounded-xl flex items-center justify-center text-slate-300 hover:text-red-400 hover:bg-red-50 transition-all flex-shrink-0">
        <Trash2 size={13} />
      </button>
    </div>
  )
}
