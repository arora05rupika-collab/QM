import { useState, useCallback } from 'react'
import { CheckCircle } from 'lucide-react'
import type { Expense, Settings } from '../../types'
import { getCategories, CATEGORY_EMOJI, CATEGORY_COLORS } from '../../utils/categories'
import { formatDate } from '../../utils/calculations'

const QUICK_AMOUNTS = [5, 10, 20, 50, 100]

interface Props {
  settings: Settings
  onAdd: (data: Omit<Expense, 'id' | 'createdAt'>) => void
  onNavigateDashboard: () => void
}

export default function AddExpense({ settings, onAdd, onNavigateDashboard }: Props) {
  const categories = getCategories(settings.carMode)

  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState(categories[1]) // default Groceries
  const [note, setNote] = useState('')
  const [date, setDate] = useState(formatDate())
  const [success, setSuccess] = useState(false)

  const handleAmountInput = (val: string) => {
    // Allow only numbers and single decimal point
    const cleaned = val.replace(/[^0-9.]/g, '').replace(/^(\d*\.?\d*).*$/, '$1')
    setAmount(cleaned)
  }

  const handleQuickAmount = (amt: number) => {
    setAmount(String(amt))
  }

  const handleSubmit = useCallback(() => {
    const parsed = parseFloat(amount)
    if (!parsed || parsed <= 0) return

    onAdd({ amount: parsed, category, note: note.trim(), date })
    setAmount('')
    setNote('')
    setDate(formatDate())
    setSuccess(true)
    setTimeout(() => setSuccess(false), 2000)
  }, [amount, category, note, date, onAdd])

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <CheckCircle size={56} className="text-emerald-400" />
        <p className="text-xl font-semibold text-emerald-400">Logged!</p>
        <button onClick={onNavigateDashboard} className="text-sm text-gray-400 underline">
          Back to Dashboard
        </button>
      </div>
    )
  }

  const amountNum = parseFloat(amount)
  const isValid = amountNum > 0

  return (
    <div className="space-y-5 pb-4">
      <h2 className="text-lg font-semibold text-gray-200 px-1">Log Expense</h2>

      {/* Amount input */}
      <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
        <p className="text-xs text-gray-500 mb-2">Amount</p>
        <div className="flex items-center">
          <span className="text-3xl font-bold text-gray-300 mr-1">$</span>
          <input
            type="number"
            inputMode="decimal"
            placeholder="0"
            value={amount}
            onChange={e => handleAmountInput(e.target.value)}
            className="flex-1 bg-transparent text-4xl font-bold text-white placeholder-gray-700 outline-none w-full"
            autoFocus
          />
        </div>

        {/* Quick amounts */}
        <div className="flex gap-2 mt-3 flex-wrap">
          {QUICK_AMOUNTS.map(amt => (
            <button
              key={amt}
              onClick={() => handleQuickAmount(amt)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all active:scale-95 ${
                amount === String(amt)
                  ? 'bg-emerald-600 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              ${amt}
            </button>
          ))}
        </div>
      </div>

      {/* Category picker */}
      <div>
        <p className="text-xs text-gray-500 mb-2 px-1">Category</p>
        <div className="grid grid-cols-3 gap-2">
          {categories.map(cat => {
            const emoji = CATEGORY_EMOJI[cat] ?? '📦'
            const color = CATEGORY_COLORS[cat] ?? '#6b7280'
            const isSelected = category === cat
            return (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`flex flex-col items-center gap-1 py-3 px-2 rounded-xl text-xs font-medium transition-all active:scale-95 ${
                  isSelected ? 'text-white' : 'bg-gray-900 text-gray-400 border border-gray-800 hover:border-gray-700'
                }`}
                style={
                  isSelected
                    ? { backgroundColor: color + '33', border: `1.5px solid ${color}`, color: 'white' }
                    : {}
                }
              >
                <span className="text-xl">{emoji}</span>
                <span className="leading-tight text-center">{cat}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Note and date */}
      <div className="space-y-3">
        <div>
          <p className="text-xs text-gray-500 mb-1.5 px-1">Note (optional)</p>
          <input
            type="text"
            placeholder="What was this for?"
            value={note}
            onChange={e => setNote(e.target.value)}
            className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-gray-600 transition-colors"
          />
        </div>

        <div>
          <p className="text-xs text-gray-500 mb-1.5 px-1">Date</p>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-gray-600 transition-colors"
          />
        </div>
      </div>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={!isValid}
        className={`w-full py-4 rounded-xl font-semibold text-base transition-all active:scale-95 ${
          isValid
            ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
            : 'bg-gray-800 text-gray-600 cursor-not-allowed'
        }`}
      >
        {isValid ? `Save $${amountNum.toFixed(2)} · ${category}` : 'Enter an amount'}
      </button>
    </div>
  )
}
