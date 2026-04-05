import { useMemo } from 'react'
import { Trash2, TrendingDown, TrendingUp } from 'lucide-react'
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

  const statusColor = {
    good: { bar: 'bg-emerald-500', text: 'text-emerald-400', ring: 'border-emerald-500/30' },
    warning: { bar: 'bg-amber-500', text: 'text-amber-400', ring: 'border-amber-500/30' },
    danger: { bar: 'bg-red-500', text: 'text-red-400', ring: 'border-red-500/30' },
  }[status]

  const recentExpenses = useMemo(
    () => [...expenses].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8),
    [expenses],
  )

  const monthLabel = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  return (
    <div className="space-y-4 pb-4">
      {/* Month header */}
      <div className="flex items-center justify-between px-1">
        <h2 className="text-lg font-semibold text-gray-200">{monthLabel}</h2>
        {settings.carMode && (
          <span className="text-xs bg-violet-500/20 text-violet-300 px-2 py-0.5 rounded-full border border-violet-500/30">
            🚗 Car Mode
          </span>
        )}
      </div>

      {/* Main budget card */}
      <div className={`rounded-2xl bg-gray-900 border ${statusColor.ring} p-5`}>
        <p className="text-sm text-gray-400 mb-1">Budget Remaining</p>
        <p className={`text-5xl font-bold tracking-tight ${remaining < 0 ? 'text-red-400' : statusColor.text}`}>
          {formatCurrency(Math.abs(remaining))}
          {remaining < 0 && <span className="text-2xl ml-1">over</span>}
        </p>
        <p className="text-sm text-gray-500 mt-1">
          of {formatCurrency(effectiveBudget)} budget · spent {formatCurrency(totalSpent)}
        </p>

        {/* Progress bar */}
        <div className="mt-4">
          <div className="flex justify-between text-xs text-gray-500 mb-1.5">
            <span>{pct.toFixed(0)}% used</span>
            <span>
              {daysPassed}/{daysInMonth} days
            </span>
          </div>
          <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${statusColor.bar}`}
              style={{ width: `${Math.min(100, pct)}%` }}
            />
          </div>
          {/* Alert badges */}
          {settings.alertAt70 && pct >= 70 && pct < 90 && (
            <p className="text-xs text-amber-400 mt-2">⚠️ 70% of budget used</p>
          )}
          {settings.alertAt90 && pct >= 90 && pct < 100 && (
            <p className="text-xs text-red-400 mt-2">🚨 90% of budget used — slow down!</p>
          )}
          {pct >= 100 && <p className="text-xs text-red-400 mt-2">🔴 Over budget!</p>}
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Safe to Spend Today"
          value={formatCurrencyDecimal(safeToSpend)}
          sub={`${remainingDays} days left`}
          highlight={status === 'good'}
        />
        <StatCard
          label="Daily Average"
          value={formatCurrencyDecimal(dailyAvg)}
          sub={`Budget: ${formatCurrencyDecimal(dailyBudget)}/day`}
          highlight={dailyAvg <= dailyBudget}
          trend={dailyAvg > dailyBudget ? 'up' : 'down'}
        />
        <StatCard label="Total Spent" value={formatCurrency(totalSpent)} sub={`This month`} />
        <StatCard label="Days Remaining" value={String(remainingDays)} sub={`of ${daysInMonth} days`} />
      </div>

      {/* Quick add button */}
      <button
        onClick={onNavigateAdd}
        className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 transition-all text-white font-semibold text-base"
      >
        + Log an Expense
      </button>

      {/* INR note if enabled */}
      {settings.showInr && (
        <p className="text-center text-xs text-gray-500">
          Remaining ≈ ₹{Math.round(remaining * settings.inrRate).toLocaleString('en-IN')}
        </p>
      )}

      {/* Recent expenses */}
      <div>
        <h3 className="text-sm font-semibold text-gray-400 mb-2 px-1">Recent Expenses</h3>
        {recentExpenses.length === 0 ? (
          <div className="text-center py-10 text-gray-600">
            <p className="text-3xl mb-2">💸</p>
            <p>No expenses yet this month</p>
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

function StatCard({
  label,
  value,
  sub,
  highlight,
  trend,
}: {
  label: string
  value: string
  sub?: string
  highlight?: boolean
  trend?: 'up' | 'down'
}) {
  return (
    <div className="bg-gray-900 rounded-xl p-3.5 border border-gray-800">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <div className="flex items-center gap-1.5">
        <p className={`text-lg font-bold ${highlight === false ? 'text-amber-400' : 'text-gray-100'}`}>{value}</p>
        {trend === 'up' && <TrendingUp size={14} className="text-red-400" />}
        {trend === 'down' && <TrendingDown size={14} className="text-emerald-400" />}
      </div>
      {sub && <p className="text-xs text-gray-600 mt-0.5">{sub}</p>}
    </div>
  )
}

function ExpenseRow({
  expense,
  onDelete,
  showInr,
  inrRate,
}: {
  expense: Expense
  onDelete: (id: string) => void
  showInr: boolean
  inrRate: number
}) {
  const emoji = CATEGORY_EMOJI[expense.category] ?? '📦'
  const color = CATEGORY_COLORS[expense.category] ?? '#6b7280'
  const isAuto = expense.note.startsWith('[Auto]')
  const noteDisplay = expense.note.replace('[Auto] ', '')

  return (
    <div className="flex items-center gap-3 bg-gray-900 rounded-xl px-4 py-3 border border-gray-800">
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
        style={{ backgroundColor: color + '22', border: `1px solid ${color}44` }}
      >
        {emoji}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium text-gray-200 truncate">{expense.category}</p>
          {isAuto && (
            <span className="text-xs text-gray-600 bg-gray-800 px-1 rounded">auto</span>
          )}
        </div>
        <p className="text-xs text-gray-500 truncate">{noteDisplay || '—'}</p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-sm font-semibold text-gray-100">{formatCurrencyDecimal(expense.amount)}</p>
        {showInr && (
          <p className="text-xs text-gray-600">₹{Math.round(expense.amount * inrRate).toLocaleString('en-IN')}</p>
        )}
        <p className="text-xs text-gray-600">{expense.date.slice(5)}</p>
      </div>
      <button
        onClick={() => onDelete(expense.id)}
        className="ml-1 p-1.5 text-gray-700 hover:text-red-400 active:scale-95 transition-all flex-shrink-0"
      >
        <Trash2 size={14} />
      </button>
    </div>
  )
}
