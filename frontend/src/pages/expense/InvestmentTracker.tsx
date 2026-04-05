import { useState } from 'react'
import { Edit2, Check, X } from 'lucide-react'
import type { Investments, InvestmentAccount } from '../../types'
import { formatCurrency, formatCurrencyDecimal, projectNetWorth } from '../../utils/calculations'

interface Props {
  investments: Investments
  onUpdate: (updated: Investments) => void
}

type AccountKey = keyof Investments

const ACCOUNT_ICONS: Record<AccountKey, string> = {
  capitalOne: '🏦',
  fidelityVOO: '📈',
  fidelityQQQ: '🚀',
  roth401k: '🔐',
}

const ACCOUNT_COLORS: Record<AccountKey, string> = {
  capitalOne: '#3b82f6',
  fidelityVOO: '#10b981',
  fidelityQQQ: '#8b5cf6',
  roth401k: '#f59e0b',
}

export default function InvestmentTracker({ investments, onUpdate }: Props) {
  const [editing, setEditing] = useState<AccountKey | null>(null)
  const [draft, setDraft] = useState<InvestmentAccount>({ balance: 0, contribution: 0, label: '' })

  const totalBalance = Object.values(investments).reduce((sum, acc) => sum + acc.balance, 0)
  const totalContribution = (Object.keys(investments) as AccountKey[])
    .filter(k => k !== 'roth401k')
    .reduce((sum, k) => sum + investments[k].contribution, 0)

  const projected3yr = projectNetWorth(totalBalance, totalContribution, 3)
  const projected5yr = projectNetWorth(totalBalance, totalContribution, 5)

  const startEdit = (key: AccountKey) => {
    setDraft({ ...investments[key] })
    setEditing(key)
  }

  const saveEdit = () => {
    if (!editing) return
    onUpdate({ ...investments, [editing]: draft })
    setEditing(null)
  }

  const cancelEdit = () => setEditing(null)

  return (
    <div className="space-y-4 pb-4">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-lg font-semibold text-gray-200">Investments</h2>
        <span className="text-xs text-gray-500">Tap account to update</span>
      </div>

      {/* Net worth card */}
      <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
        <p className="text-xs text-gray-500 mb-1">Total Net Worth</p>
        <p className="text-4xl font-bold text-emerald-400">{formatCurrency(totalBalance)}</p>
        <p className="text-sm text-gray-500 mt-1">+{formatCurrencyDecimal(totalContribution)}/mo contributions</p>

        {/* Mini bar for each account */}
        <div className="mt-4 space-y-2">
          {(Object.keys(investments) as AccountKey[]).map(key => {
            const acc = investments[key]
            const pct = totalBalance > 0 ? (acc.balance / totalBalance) * 100 : 0
            return (
              <div key={key} className="flex items-center gap-2 text-xs">
                <div className="w-16 text-gray-500 text-right">{acc.label.split(' ')[0]}</div>
                <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${pct}%`, backgroundColor: ACCOUNT_COLORS[key] }}
                  />
                </div>
                <div className="w-16 text-gray-400 font-medium">{formatCurrency(acc.balance)}</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Projection cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gray-900 rounded-xl p-3.5 border border-gray-800">
          <p className="text-xs text-gray-500 mb-1">3-Year Projection</p>
          <p className="text-lg font-bold text-violet-400">{formatCurrency(projected3yr)}</p>
          <p className="text-xs text-gray-600 mt-0.5">@ 8% avg. annual</p>
        </div>
        <div className="bg-gray-900 rounded-xl p-3.5 border border-gray-800">
          <p className="text-xs text-gray-500 mb-1">5-Year Projection</p>
          <p className="text-lg font-bold text-blue-400">{formatCurrency(projected5yr)}</p>
          <p className="text-xs text-gray-600 mt-0.5">@ 8% avg. annual</p>
        </div>
      </div>

      {/* Monthly investment target */}
      <div className="bg-gray-900 rounded-xl p-3.5 border border-emerald-500/20">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-xs text-gray-500">Monthly Investment Target</p>
            <p className="text-base font-semibold text-gray-200 mt-0.5">$2,276 / month</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500">Actual contributions</p>
            <p className="text-base font-semibold text-emerald-400">{formatCurrencyDecimal(totalContribution)}</p>
          </div>
        </div>
      </div>

      {/* Account cards */}
      <div className="space-y-3">
        {(Object.keys(investments) as AccountKey[]).map(key => {
          const acc = investments[key]
          const isEditing = editing === key
          const color = ACCOUNT_COLORS[key]
          const icon = ACCOUNT_ICONS[key]
          const isRoth = key === 'roth401k'

          return (
            <div
              key={key}
              className="bg-gray-900 rounded-2xl p-4 border border-gray-800"
              style={{ borderColor: isEditing ? color + '66' : undefined }}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
                    style={{ backgroundColor: color + '22', border: `1px solid ${color}44` }}
                  >
                    {icon}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-200">{acc.label}</p>
                    {isRoth && (
                      <span className="text-xs text-amber-500/80 bg-amber-500/10 px-1.5 py-0.5 rounded mt-0.5 inline-block">
                        paused
                      </span>
                    )}
                  </div>
                </div>
                {!isEditing ? (
                  <button
                    onClick={() => startEdit(key)}
                    className="p-2 text-gray-600 hover:text-gray-300 transition-colors"
                  >
                    <Edit2 size={15} />
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <button onClick={saveEdit} className="p-2 text-emerald-400 hover:text-emerald-300 transition-colors">
                      <Check size={15} />
                    </button>
                    <button onClick={cancelEdit} className="p-2 text-gray-600 hover:text-gray-300 transition-colors">
                      <X size={15} />
                    </button>
                  </div>
                )}
              </div>

              {!isEditing ? (
                <div className="mt-3 flex justify-between">
                  <div>
                    <p className="text-xs text-gray-500">Balance</p>
                    <p className="text-xl font-bold" style={{ color }}>
                      {formatCurrencyDecimal(acc.balance)}
                    </p>
                  </div>
                  {!isRoth && (
                    <div className="text-right">
                      <p className="text-xs text-gray-500">Monthly contribution</p>
                      <p className="text-base font-semibold text-gray-300">+{formatCurrencyDecimal(acc.contribution)}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-3 space-y-2">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Balance</p>
                    <div className="flex items-center bg-gray-800 rounded-lg px-3 py-2">
                      <span className="text-gray-400 mr-1">$</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={draft.balance || ''}
                        onChange={e => setDraft(d => ({ ...d, balance: parseFloat(e.target.value) || 0 }))}
                        className="flex-1 bg-transparent text-white text-sm outline-none"
                        placeholder="0"
                      />
                    </div>
                  </div>
                  {!isRoth && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Monthly Contribution</p>
                      <div className="flex items-center bg-gray-800 rounded-lg px-3 py-2">
                        <span className="text-gray-400 mr-1">$</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          value={draft.contribution || ''}
                          onChange={e => setDraft(d => ({ ...d, contribution: parseFloat(e.target.value) || 0 }))}
                          className="flex-1 bg-transparent text-white text-sm outline-none"
                          placeholder="0"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <p className="text-center text-xs text-gray-600 pt-2">
        Update balances monthly · Projections assume 8% annual market return
      </p>
    </div>
  )
}
