import { useMemo, useState } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'
import type { Expense } from '../../types'
import {
  getMonthExpenses,
  getTotalSpent,
  getSpendingByCategory,
  formatCurrencyDecimal,
  getMonthKey,
  getAllMonthKeys,
  getMonthLabel,
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
  const [chartType, setChartType] = useState<'pie' | 'bar'>('bar')

  const monthExpenses = useMemo(() => getMonthExpenses(expenses, selectedMonth), [expenses, selectedMonth])
  const totalSpent = useMemo(() => getTotalSpent(monthExpenses), [monthExpenses])
  const byCategory = useMemo(() => getSpendingByCategory(monthExpenses), [monthExpenses])

  const chartData = useMemo(() => {
    return Object.entries(byCategory)
      .map(([cat, amount]) => ({
        name: cat,
        amount,
        pct: totalSpent > 0 ? (amount / totalSpent) * 100 : 0,
        color: CATEGORY_COLORS[cat] ?? '#6b7280',
        emoji: CATEGORY_EMOJI[cat] ?? '📦',
      }))
      .sort((a, b) => b.amount - a.amount)
  }, [byCategory, totalSpent])

  const RADIAN = Math.PI / 180
  const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, pct }: any) => {
    if (pct < 5) return null
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5
    const x = cx + radius * Math.cos(-midAngle * RADIAN)
    const y = cy + radius * Math.sin(-midAngle * RADIAN)
    return (
      <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={600}>
        {pct.toFixed(0)}%
      </text>
    )
  }

  return (
    <div className="space-y-4 pb-4">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-lg font-semibold text-gray-200">Breakdown</h2>
        <select
          value={selectedMonth}
          onChange={e => setSelectedMonth(e.target.value)}
          className="bg-gray-800 border border-gray-700 text-sm text-gray-300 rounded-lg px-2 py-1 focus:outline-none"
        >
          {allMonths.map(m => (
            <option key={m} value={m}>
              {getMonthLabel(m)}
            </option>
          ))}
        </select>
      </div>

      {/* Total */}
      <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 flex justify-between items-center">
        <div>
          <p className="text-xs text-gray-500">Total Spent</p>
          <p className="text-2xl font-bold text-gray-100">{formatCurrencyDecimal(totalSpent)}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500">of {formatCurrencyDecimal(effectiveBudget)}</p>
          <p className={`text-lg font-semibold ${totalSpent <= effectiveBudget ? 'text-emerald-400' : 'text-red-400'}`}>
            {((totalSpent / effectiveBudget) * 100).toFixed(0)}% used
          </p>
        </div>
      </div>

      {chartData.length === 0 ? (
        <div className="text-center py-16 text-gray-600">
          <p className="text-4xl mb-3">📊</p>
          <p>No expenses this month</p>
        </div>
      ) : (
        <>
          {/* Chart toggle */}
          <div className="flex bg-gray-900 rounded-xl p-1 border border-gray-800">
            {(['bar', 'pie'] as const).map(type => (
              <button
                key={type}
                onClick={() => setChartType(type)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                  chartType === type ? 'bg-gray-700 text-white' : 'text-gray-500'
                }`}
              >
                {type === 'bar' ? '📊 Bar' : '🍩 Donut'}
              </button>
            ))}
          </div>

          {/* Chart */}
          <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4">
            {chartType === 'pie' ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="amount"
                    labelLine={false}
                    label={renderCustomLabel}
                  >
                    {chartData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                    formatter={(val: number) => [formatCurrencyDecimal(val), 'Spent']}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height={chartData.length * 36 + 20}>
                <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fill: '#6b7280', fontSize: 10 }}
                    tickFormatter={v => `$${v}`}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fill: '#9ca3af', fontSize: 11 }}
                    width={90}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={name => `${CATEGORY_EMOJI[name] ?? ''} ${name.length > 9 ? name.slice(0, 9) + '…' : name}`}
                  />
                  <Tooltip
                    contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                    formatter={(val: number) => [formatCurrencyDecimal(val), 'Spent']}
                    cursor={{ fill: '#1f2937' }}
                  />
                  <Bar dataKey="amount" radius={[0, 6, 6, 0]}>
                    {chartData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Category list */}
          <div className="space-y-2">
            {chartData.map(item => {
              const overspendThreshold = item.name === 'Rent' ? 900 : effectiveBudget * 0.2
              const isHigh = item.amount > overspendThreshold && item.name !== 'Rent'
              return (
                <div key={item.name} className="flex items-center gap-3 bg-gray-900 rounded-xl px-4 py-3 border border-gray-800">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-base flex-shrink-0"
                    style={{ backgroundColor: item.color + '22', border: `1px solid ${item.color}44` }}
                  >
                    {item.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-200">{item.name}</p>
                      {isHigh && <span className="text-xs text-amber-500">↑ high</span>}
                    </div>
                    <div className="mt-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${item.pct}%`, backgroundColor: item.color }}
                      />
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-semibold text-gray-100">{formatCurrencyDecimal(item.amount)}</p>
                    <p className="text-xs text-gray-500">{item.pct.toFixed(1)}%</p>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
