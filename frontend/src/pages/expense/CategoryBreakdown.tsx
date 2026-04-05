import { useMemo, useState } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'
import type { Expense } from '../../types'
import {
  getMonthExpenses, getTotalSpent, getSpendingByCategory,
  formatCurrencyDecimal, getMonthKey, getAllMonthKeys, getMonthLabel,
} from '../../utils/calculations'
import { CATEGORY_COLORS, CATEGORY_EMOJI } from '../../utils/categories'

interface Props {
  expenses: Expense[]
  effectiveBudget: number
}

export default function CategoryBreakdown({ expenses, effectiveBudget }: Props) {
  const now = new Date()
  const allMonths = useMemo(() => getAllMonthKeys(expenses), [expenses])
  const [selectedMonth, setSelectedMonth] = useState(getMonthKey(now))
  const [chartType, setChartType] = useState<'bar' | 'pie'>('bar')

  const monthExpenses = useMemo(() => getMonthExpenses(expenses, selectedMonth), [expenses, selectedMonth])
  const totalSpent = useMemo(() => getTotalSpent(monthExpenses), [monthExpenses])
  const byCategory = useMemo(() => getSpendingByCategory(monthExpenses), [monthExpenses])

  const chartData = useMemo(() =>
    Object.entries(byCategory)
      .map(([cat, amount]) => ({
        name: cat, amount,
        pct: totalSpent > 0 ? (amount / totalSpent) * 100 : 0,
        color: CATEGORY_COLORS[cat] ?? '#8b5cf6',
        emoji: CATEGORY_EMOJI[cat] ?? '📦',
      }))
      .sort((a, b) => b.amount - a.amount),
    [byCategory, totalSpent],
  )

  const RADIAN = Math.PI / 180
  const renderLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, pct }: any) => {
    if (pct < 6) return null
    const r = innerRadius + (outerRadius - innerRadius) * 0.5
    return (
      <text x={cx + r * Math.cos(-midAngle * RADIAN)} y={cy + r * Math.sin(-midAngle * RADIAN)}
        fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={700}>
        {pct.toFixed(0)}%
      </text>
    )
  }

  return (
    <div className="space-y-4 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">Select Month</p>
        <select
          value={selectedMonth}
          onChange={e => setSelectedMonth(e.target.value)}
          className="bg-white border border-violet-200 text-sm text-slate-700 font-bold rounded-xl px-3 py-2 focus:outline-none shadow-sm"
        >
          {allMonths.map(m => <option key={m} value={m}>{getMonthLabel(m)}</option>)}
        </select>
      </div>

      {/* Summary card */}
      <div className="bg-white rounded-3xl p-5 shadow-card border border-violet-100/60 flex justify-between items-center">
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Total Spent</p>
          <p className="text-3xl font-extrabold text-slate-800 mt-1">{formatCurrencyDecimal(totalSpent)}</p>
        </div>
        <div className="text-right">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Budget</p>
          <p className={`text-xl font-extrabold mt-1 ${totalSpent <= effectiveBudget ? 'text-emerald-500' : 'text-rose-500'}`}>
            {((totalSpent / effectiveBudget) * 100).toFixed(0)}% used
          </p>
          <p className="text-xs text-slate-400 font-semibold">of {formatCurrencyDecimal(effectiveBudget)}</p>
        </div>
      </div>

      {chartData.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-3xl shadow-card border border-violet-100/60">
          <p className="text-5xl mb-3">📊</p>
          <p className="text-slate-400 font-bold">No expenses this month</p>
        </div>
      ) : (
        <>
          {/* Chart type toggle */}
          <div className="flex bg-white rounded-2xl p-1.5 shadow-card border border-violet-100/60">
            {(['bar', 'pie'] as const).map(type => (
              <button key={type} onClick={() => setChartType(type)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-extrabold transition-all ${
                  chartType === type
                    ? 'text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
                style={chartType === type ? { background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)' } : {}}>
                {type === 'bar' ? '📊 Bar Chart' : '🍩 Donut'}
              </button>
            ))}
          </div>

          {/* Chart */}
          <div className="bg-white rounded-3xl p-4 shadow-card border border-violet-100/60">
            {chartType === 'pie' ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={chartData} cx="50%" cy="50%" innerRadius={55} outerRadius={95}
                    paddingAngle={3} dataKey="amount" labelLine={false} label={renderLabel}>
                    {chartData.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: '#fff', border: '1px solid #ede9fe', borderRadius: 12, fontFamily: 'Nunito', fontWeight: 700 }}
                    formatter={(val: number) => [formatCurrencyDecimal(val), 'Spent']} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height={chartData.length * 40 + 20}>
                <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3e8ff" horizontal={false} />
                  <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 10, fontFamily: 'Nunito', fontWeight: 700 }}
                    tickFormatter={v => `$${v}`} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fill: '#64748b', fontSize: 11, fontFamily: 'Nunito', fontWeight: 700 }}
                    width={95} axisLine={false} tickLine={false}
                    tickFormatter={n => `${CATEGORY_EMOJI[n] ?? ''} ${n.length > 9 ? n.slice(0, 9) + '…' : n}`} />
                  <Tooltip contentStyle={{ background: '#fff', border: '1px solid #ede9fe', borderRadius: 12, fontFamily: 'Nunito', fontWeight: 700 }}
                    formatter={(val: number) => [formatCurrencyDecimal(val), 'Spent']}
                    cursor={{ fill: '#f5f3ff' }} />
                  <Bar dataKey="amount" radius={[0, 8, 8, 0]}>
                    {chartData.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Category list */}
          <div className="space-y-2">
            {chartData.map(item => (
              <div key={item.name} className="flex items-center gap-3 bg-white rounded-2xl px-4 py-3.5 shadow-card border border-violet-100/60">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl flex-shrink-0"
                  style={{ backgroundColor: item.color + '18' }}>
                  {item.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-sm font-bold text-slate-700">{item.name}</p>
                    <p className="text-xs font-bold" style={{ color: item.color }}>{item.pct.toFixed(1)}%</p>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${item.pct}%`, backgroundColor: item.color }} />
                  </div>
                </div>
                <p className="text-sm font-extrabold text-slate-800 flex-shrink-0 ml-2">
                  {formatCurrencyDecimal(item.amount)}
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
