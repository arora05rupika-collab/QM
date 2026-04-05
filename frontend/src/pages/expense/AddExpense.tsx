import { useState, useCallback } from 'react'
import { CheckCircle2 } from 'lucide-react'
import type { Expense, Settings } from '../../types'
import { getCategories, CATEGORY_EMOJI, CATEGORY_COLORS } from '../../utils/categories'
import { formatDate } from '../../utils/calculations'

const QUICK_AMOUNTS = [5, 10, 20, 50, 100]

interface Props {
  settings: Settings
  onAdd: (data: Omit<Expense, 'id' | 'createdAt'>) => void
  onNavigateDashboard: () => void
}

// Pastel versions of category colors
const PASTEL_BG: Record<string, string> = {
  Rent: '#fff1f2',
  Groceries: '#f0fdf4',
  'Eating Out': '#fff7ed',
  'Cab/Uber': '#f5f3ff',
  'Car Payment': '#f5f3ff',
  Gas: '#fdf4ff',
  'Car Insurance': '#faf5ff',
  Shopping: '#ecfeff',
  Subscriptions: '#f8fafc',
  'India Trip Fund': '#fffbeb',
  'Mini Trips': '#f0fdf4',
  Entertainment: '#eff6ff',
  Health: '#f0fdfa',
  Misc: '#f9fafb',
}

export default function AddExpense({ settings, onAdd, onNavigateDashboard }: Props) {
  const categories = getCategories(settings.carMode)
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState(categories[1])
  const [note, setNote] = useState('')
  const [date, setDate] = useState(formatDate())
  const [success, setSuccess] = useState(false)

  const handleAmountInput = (val: string) => {
    const cleaned = val.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1')
    setAmount(cleaned)
  }

  const handleSubmit = useCallback(() => {
    const parsed = parseFloat(amount)
    if (!parsed || parsed <= 0) return
    onAdd({ amount: parsed, category, note: note.trim(), date })
    setAmount('')
    setNote('')
    setDate(formatDate())
    setSuccess(true)
    setTimeout(() => setSuccess(false), 2200)
  }, [amount, category, note, date, onAdd])

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center h-72 gap-4">
        <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center">
          <CheckCircle2 size={44} className="text-emerald-500" />
        </div>
        <p className="text-2xl font-extrabold text-slate-700">Logged! 🎉</p>
        <p className="text-slate-400 font-semibold">Expense saved successfully</p>
        <button onClick={onNavigateDashboard} className="mt-2 btn-secondary px-6">
          Back to Dashboard
        </button>
      </div>
    )
  }

  const amountNum = parseFloat(amount)
  const isValid = amountNum > 0
  const selectedColor = CATEGORY_COLORS[category] ?? '#8b5cf6'

  return (
    <div className="space-y-5 pb-6">

      {/* Amount input card */}
      <div className="bg-white rounded-3xl p-5 shadow-card border border-violet-100/60">
        <p className="text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-3">Amount</p>
        <div className="flex items-center gap-1">
          <span className="text-4xl font-extrabold text-violet-300">$</span>
          <input
            type="number"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={e => handleAmountInput(e.target.value)}
            className="flex-1 bg-transparent text-5xl font-extrabold text-slate-800 placeholder-slate-200 outline-none w-full"
            autoFocus
          />
        </div>

        {/* Quick amounts */}
        <div className="flex gap-2 mt-4 flex-wrap">
          {QUICK_AMOUNTS.map(amt => (
            <button
              key={amt}
              onClick={() => setAmount(String(amt))}
              className={`px-4 py-2 rounded-xl text-sm font-extrabold transition-all active:scale-95 ${
                amount === String(amt)
                  ? 'text-white shadow-md'
                  : 'bg-violet-50 text-violet-600 hover:bg-violet-100'
              }`}
              style={amount === String(amt) ? { background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)' } : {}}
            >
              ${amt}
            </button>
          ))}
        </div>
      </div>

      {/* Category picker */}
      <div>
        <p className="text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-3 px-1">Category</p>
        <div className="grid grid-cols-3 gap-2.5">
          {categories.map(cat => {
            const emoji = CATEGORY_EMOJI[cat] ?? '📦'
            const color = CATEGORY_COLORS[cat] ?? '#8b5cf6'
            const pastelBg = PASTEL_BG[cat] ?? '#f5f3ff'
            const isSelected = category === cat
            return (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`flex flex-col items-center gap-1.5 py-3.5 px-2 rounded-2xl text-xs font-bold transition-all active:scale-95 ${
                  isSelected ? 'shadow-md' : 'bg-white border border-violet-100/60 text-slate-500 hover:border-violet-200'
                }`}
                style={isSelected ? {
                  backgroundColor: pastelBg,
                  border: `2px solid ${color}`,
                  color: color,
                } : {}}
              >
                <span className="text-2xl">{emoji}</span>
                <span className="leading-tight text-center" style={isSelected ? { color } : {}}>
                  {cat.length > 10 ? cat.slice(0, 10) + '…' : cat}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Note and date */}
      <div className="bg-white rounded-3xl p-5 shadow-card border border-violet-100/60 space-y-4">
        <div>
          <p className="text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-2">Note</p>
          <input
            type="text"
            placeholder="What was this for? (optional)"
            value={note}
            onChange={e => setNote(e.target.value)}
            className="input-field"
          />
        </div>
        <div>
          <p className="text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-2">Date</p>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="input-field"
          />
        </div>
      </div>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={!isValid}
        className={`w-full py-4 rounded-2xl font-extrabold text-base transition-all active:scale-95 ${
          isValid ? 'text-white' : 'bg-slate-100 text-slate-300 cursor-not-allowed'
        }`}
        style={isValid ? {
          background: `linear-gradient(135deg, ${selectedColor}, #6d28d9)`,
          boxShadow: `0 4px 16px ${selectedColor}44`,
        } : {}}
      >
        {isValid
          ? `${CATEGORY_EMOJI[category]} Save $${amountNum.toFixed(2)} · ${category}`
          : 'Enter an amount to continue'}
      </button>
    </div>
  )
}
