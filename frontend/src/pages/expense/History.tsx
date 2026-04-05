import { useMemo } from 'react'
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import type { Expense } from '../../types'
import {
  getMonthExpenses, getTotalSpent, getAllMonthKeys, getMonthLabel,
  formatCurrency, formatCurrencyDecimal, getSpendingByCategory,
} from '../../utils/calculations'
import { CATEGORY_EMOJI } from '../../utils/categories'

interface Props {
  expenses: Expense[]
  effectiveBudget: number
}

export default function History({ expenses, effectiveBudget }: Props) {
  const allMonths = useMemo(() => getAllMonthKeys(expenses), [expenses])

  const monthData = useMemo(() => allMonths.map(monthKey => {
    const me = getMonthExpenses(expenses, monthKey)
    const totalSpent = getTotalSpent(me)
    const byCategory = getSpendingByCategory(me)
    const topCat = Object.entries(byCategory).sort((a, b) => b[1] - a[1])[0]
    const [year, month] = monthKey.split('-')
    const d = new Date(Number(year), Number(month) - 1, 1)
    return {
      monthKey, label: getMonthLabel(monthKey),
      shortLabel: d.toLocaleDateString('en-US', { month: 'short' }),
      totalSpent, budget: effectiveBudget,
      underBudget: totalSpent <= effectiveBudget,
      topCategory: topCat?.[0] ?? '—',
      topCategoryAmount: topCat?.[1] ?? 0,
    }
  }), [allMonths, expenses, effectiveBudget])

  const streak = useMemo(() => {
    let count = 0
    for (const m of monthData) { if (m.underBudget) count++; else break }
    return count
  }, [monthData])

  const chartData = useMemo(() =>
    [...monthData].reverse().slice(-6).map(m => ({
      name: m.shortLabel, spent: m.totalSpent,
      fill: m.underBudget ? '#10b981' : '#f43f5e',
    })), [monthData])

  const totalAllTime = useMemo(() => expenses.reduce((sum, e) => sum + e.amount, 0), [expenses])
  const avgMonthly = monthData.length > 0 ? totalAllTime / monthData.length : 0

  return (
    <div className="space-y-4 pb-6">

      {/* Streak hero */}
      <div className="rounded-3xl p-6 text-white relative overflow-hidden"
        style={{ background: streak > 0 ? 'linear-gradient(135deg, #10b981, #059669)' : 'linear-gradient(135deg, #8b5cf6, #6d28d9)' }}>
        <div className="absolute top-0 right-0 w-36 h-36 rounded-full opacity-10 bg-white"
          style={{ transform: 'translate(30%, -30%)' }} />
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center text-4xl">
            {streak > 0 ? '🔥' : '💪'}
          </div>
          <div>
            <p className="text-white/80 text-sm font-bold">Budget Streak</p>
            <p className="text-5xl font-extrabold">{streak}</p>
            <p className="text-white/70 text-sm font-semibold">
              {streak === 1 ? 'month' : 'months'} under budget
            </p>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-2.5">
        <div className="bg-white rounded-2xl p-3.5 shadow-card border border-violet-100/60 text-center">
          <p className="text-xl font-extrabold text-violet-600">{monthData.filter(m => m.underBudget).length}</p>
          <p className="text-xs font-bold text-slate-400 mt-0.5">Months<br/>under</p>
        </div>
        <div className="bg-white rounded-2xl p-3.5 shadow-card border border-violet-100/60 text-center">
          <p className="text-xl font-extrabold text-slate-800">{formatCurrency(avgMonthly)}</p>
          <p className="text-xs font-bold text-slate-400 mt-0.5">Avg<br/>monthly</p>
        </div>
        <div className="bg-white rounded-2xl p-3.5 shadow-card border border-violet-100/60 text-center">
          <p className="text-xl font-extrabold text-indigo-600">{formatCurrency(totalAllTime)}</p>
          <p className="text-xs font-bold text-slate-400 mt-0.5">All<br/>time</p>
        </div>
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="bg-white rounded-3xl p-4 shadow-card border border-violet-100/60">
          <p className="text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-3">Last 6 Months</p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3e8ff" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'Nunito', fontWeight: 700 }}
                axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 10, fontFamily: 'Nunito', fontWeight: 700 }}
                tickFormatter={v => `$${v / 1000}k`} axisLine={false} tickLine={false} />
              <ReferenceLine y={effectiveBudget} stroke="#ddd6fe" strokeDasharray="5 4"
                label={{ value: 'Budget', fill: '#a78bfa', fontSize: 10, fontFamily: 'Nunito', fontWeight: 700 }} />
              <Tooltip contentStyle={{ background: '#fff', border: '1px solid #ede9fe', borderRadius: 12, fontFamily: 'Nunito', fontWeight: 700 }}
                formatter={(val: number) => [formatCurrencyDecimal(val), 'Spent']}
                cursor={{ fill: '#f5f3ff' }} />
              <Bar dataKey="spent" radius={[6, 6, 0, 0]}>
                {chartData.map((e, i) => <Cell key={i} fill={e.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Month list */}
      <div className="space-y-2.5">
        {monthData.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-3xl shadow-card border border-violet-100/60">
            <p className="text-5xl mb-3">📅</p>
            <p className="text-slate-400 font-bold">No history yet</p>
          </div>
        ) : monthData.map((m, i) => {
          const saved = m.budget - m.totalSpent
          const pct = Math.min(100, (m.totalSpent / m.budget) * 100)
          return (
            <div key={m.monthKey} className={`bg-white rounded-3xl p-5 shadow-card border transition-all ${
              m.underBudget ? 'border-violet-100/60' : 'border-rose-200'
            }`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-base font-extrabold text-slate-800">{m.label}</p>
                    {i === 0 && (
                      <span className="text-xs bg-violet-100 text-violet-600 px-2 py-0.5 rounded-full font-bold">current</span>
                    )}
                    {m.underBudget && i < streak && <span className="text-base">🔥</span>}
                  </div>
                  <p className="text-xs text-slate-400 font-semibold mt-0.5">
                    {CATEGORY_EMOJI[m.topCategory] ?? ''} Top: {m.topCategory} ({formatCurrencyDecimal(m.topCategoryAmount)})
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-base font-extrabold text-slate-800">{formatCurrencyDecimal(m.totalSpent)}</p>
                  <p className={`text-xs font-extrabold ${m.underBudget ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {m.underBudget ? `✓ saved ${formatCurrency(saved)}` : `✗ over ${formatCurrency(-saved)}`}
                  </p>
                </div>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-500 ${m.underBudget ? 'bg-emerald-400' : 'bg-rose-400'}`}
                  style={{ width: `${pct}%` }} />
              </div>
              <p className="text-xs text-slate-400 font-semibold mt-1.5">{pct.toFixed(0)}% of {formatCurrency(m.budget)}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
