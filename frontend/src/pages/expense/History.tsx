import { useMemo } from 'react'
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import type { Expense } from '../../types'
import {
  getMonthExpenses,
  getTotalSpent,
  getAllMonthKeys,
  getMonthLabel,
  formatCurrency,
  formatCurrencyDecimal,
  getSpendingByCategory,
} from '../../utils/calculations'
import { CATEGORY_COLORS } from '../../utils/categories'

interface Props {
  expenses: Expense[]
  effectiveBudget: number
}

interface MonthData {
  monthKey: string
  label: string
  shortLabel: string
  totalSpent: number
  budget: number
  underBudget: boolean
  topCategory: string
  topCategoryAmount: number
}

export default function History({ expenses, effectiveBudget }: Props) {
  const allMonths = useMemo(() => getAllMonthKeys(expenses), [expenses])

  const monthData: MonthData[] = useMemo(() => {
    return allMonths.map(monthKey => {
      const monthExpenses = getMonthExpenses(expenses, monthKey)
      const totalSpent = getTotalSpent(monthExpenses)
      const byCategory = getSpendingByCategory(monthExpenses)
      const topCategory = Object.entries(byCategory).sort((a, b) => b[1] - a[1])[0]

      const [year, month] = monthKey.split('-')
      const d = new Date(Number(year), Number(month) - 1, 1)
      const shortLabel = d.toLocaleDateString('en-US', { month: 'short' })

      return {
        monthKey,
        label: getMonthLabel(monthKey),
        shortLabel,
        totalSpent,
        budget: effectiveBudget,
        underBudget: totalSpent <= effectiveBudget,
        topCategory: topCategory?.[0] ?? '—',
        topCategoryAmount: topCategory?.[1] ?? 0,
      }
    })
  }, [allMonths, expenses, effectiveBudget])

  // Streak: consecutive months under budget (most recent first)
  const streak = useMemo(() => {
    let count = 0
    for (const m of monthData) {
      if (m.underBudget) count++
      else break
    }
    return count
  }, [monthData])

  const totalAllTime = useMemo(() => expenses.reduce((sum, e) => sum + e.amount, 0), [expenses])
  const avgMonthly = monthData.length > 0 ? totalAllTime / monthData.length : 0

  const chartData = useMemo(
    () =>
      [...monthData]
        .reverse()
        .slice(-6)
        .map(m => ({
          name: m.shortLabel,
          spent: m.totalSpent,
          budget: m.budget,
          fill: m.underBudget ? '#10b981' : '#ef4444',
        })),
    [monthData],
  )

  return (
    <div className="space-y-4 pb-4">
      <h2 className="text-lg font-semibold text-gray-200 px-1">History</h2>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-gray-900 rounded-xl p-3 border border-gray-800 text-center">
          <p className="text-2xl font-bold text-emerald-400">{streak}</p>
          <p className="text-xs text-gray-500 mt-0.5">Month streak</p>
          <p className="text-xs text-gray-600">under budget</p>
        </div>
        <div className="bg-gray-900 rounded-xl p-3 border border-gray-800 text-center">
          <p className="text-2xl font-bold text-gray-100">{monthData.filter(m => m.underBudget).length}</p>
          <p className="text-xs text-gray-500 mt-0.5">Months</p>
          <p className="text-xs text-gray-600">under budget</p>
        </div>
        <div className="bg-gray-900 rounded-xl p-3 border border-gray-800 text-center">
          <p className="text-2xl font-bold text-blue-400">{formatCurrency(avgMonthly)}</p>
          <p className="text-xs text-gray-500 mt-0.5">Avg monthly</p>
          <p className="text-xs text-gray-600">spending</p>
        </div>
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
          <p className="text-xs text-gray-500 mb-3">Last 6 months vs budget</p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} tickFormatter={v => `$${v / 1000}k`} axisLine={false} tickLine={false} />
              <ReferenceLine y={effectiveBudget} stroke="#374151" strokeDasharray="4 4" label={{ value: 'Budget', fill: '#6b7280', fontSize: 10 }} />
              <Tooltip
                contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                formatter={(val: number) => [formatCurrencyDecimal(val), 'Spent']}
                cursor={{ fill: '#1f2937' }}
              />
              <Bar dataKey="spent" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Month list */}
      <div className="space-y-2">
        {monthData.length === 0 ? (
          <div className="text-center py-16 text-gray-600">
            <p className="text-4xl mb-3">📅</p>
            <p>No history yet</p>
          </div>
        ) : (
          monthData.map((m, i) => {
            const saved = m.budget - m.totalSpent
            const pct = Math.min(100, (m.totalSpent / m.budget) * 100)
            const isCurrentMonth = i === 0

            return (
              <div key={m.monthKey} className={`bg-gray-900 rounded-2xl p-4 border ${m.underBudget ? 'border-gray-800' : 'border-red-500/20'}`}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-gray-200">{m.label}</p>
                      {isCurrentMonth && (
                        <span className="text-xs bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded border border-blue-500/30">
                          current
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Top: {m.topCategory} ({formatCurrencyDecimal(m.topCategoryAmount)})
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-base font-bold text-gray-100">{formatCurrencyDecimal(m.totalSpent)}</p>
                    <p className={`text-xs font-medium ${m.underBudget ? 'text-emerald-400' : 'text-red-400'}`}>
                      {m.underBudget ? `✓ saved ${formatCurrency(saved)}` : `✗ over ${formatCurrency(-saved)}`}
                    </p>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${m.underBudget ? 'bg-emerald-500' : 'bg-red-500'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-gray-600 mt-1">
                  <span>{pct.toFixed(0)}% of {formatCurrency(m.budget)}</span>
                  {m.underBudget && streak > 0 && i < streak && (
                    <span className="text-emerald-600">🔥</span>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
