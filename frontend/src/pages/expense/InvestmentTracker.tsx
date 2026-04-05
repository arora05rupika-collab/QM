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
  capitalOne: '🏦', fidelityVOO: '📈', fidelityQQQ: '🚀', roth401k: '🔐',
}

const ACCOUNT_GRADIENTS: Record<AccountKey, string> = {
  capitalOne: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
  fidelityVOO: 'linear-gradient(135deg, #10b981, #059669)',
  fidelityQQQ: 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
  roth401k: 'linear-gradient(135deg, #f59e0b, #d97706)',
}

const ACCOUNT_LIGHT: Record<AccountKey, string> = {
  capitalOne: '#eff6ff', fidelityVOO: '#ecfdf5', fidelityQQQ: '#f5f3ff', roth401k: '#fffbeb',
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

  const startEdit = (key: AccountKey) => { setDraft({ ...investments[key] }); setEditing(key) }
  const saveEdit = () => { if (!editing) return; onUpdate({ ...investments, [editing]: draft }); setEditing(null) }

  return (
    <div className="space-y-4 pb-6">

      {/* Net Worth Hero */}
      <div className="rounded-3xl p-6 text-white relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #6d28d9 0%, #4f46e5 100%)' }}>
        <div className="absolute top-0 right-0 w-36 h-36 rounded-full opacity-10 bg-white"
          style={{ transform: 'translate(30%, -30%)' }} />
        <p className="text-violet-200 text-sm font-bold mb-1">Total Net Worth</p>
        <p className="text-5xl font-extrabold text-white">{formatCurrency(totalBalance)}</p>
        <p className="text-violet-200 text-sm mt-2">+{formatCurrencyDecimal(totalContribution)}/mo contributions</p>

        {/* Allocation bars */}
        <div className="mt-4 space-y-1.5">
          {(Object.keys(investments) as AccountKey[]).map(key => {
            const acc = investments[key]
            const pct = totalBalance > 0 ? (acc.balance / totalBalance) * 100 : 0
            return (
              <div key={key} className="flex items-center gap-2 text-xs">
                <div className="w-14 text-violet-300 font-bold text-right">{acc.label.split(' ')[0]}</div>
                <div className="flex-1 h-1.5 bg-white/20 rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-white/70 transition-all duration-500"
                    style={{ width: `${pct}%` }} />
                </div>
                <div className="w-14 text-white font-bold">{formatCurrency(acc.balance)}</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Projections */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl p-4 shadow-card border border-violet-100/60">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">3-Year</p>
          <p className="text-xl font-extrabold text-violet-600">{formatCurrency(projected3yr)}</p>
          <p className="text-xs text-slate-400 font-semibold mt-0.5">@ 8% annual return</p>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-card border border-violet-100/60">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">5-Year</p>
          <p className="text-xl font-extrabold text-indigo-600">{formatCurrency(projected5yr)}</p>
          <p className="text-xs text-slate-400 font-semibold mt-0.5">@ 8% annual return</p>
        </div>
      </div>

      {/* Monthly target */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3.5 flex justify-between items-center">
        <div>
          <p className="text-xs font-bold text-emerald-600 uppercase tracking-wide">Monthly Target</p>
          <p className="text-base font-extrabold text-emerald-800 mt-0.5">$2,276 / month</p>
        </div>
        <div className="text-right">
          <p className="text-xs font-bold text-emerald-600 uppercase tracking-wide">Actual</p>
          <p className="text-base font-extrabold text-emerald-700 mt-0.5">{formatCurrencyDecimal(totalContribution)}</p>
        </div>
      </div>

      {/* Account cards */}
      <div className="space-y-3">
        {(Object.keys(investments) as AccountKey[]).map(key => {
          const acc = investments[key]
          const isEditing = editing === key
          const isRoth = key === 'roth401k'

          return (
            <div key={key} className={`bg-white rounded-3xl p-5 shadow-card border transition-all ${
              isEditing ? 'border-violet-400' : 'border-violet-100/60'
            }`}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl"
                    style={{ background: ACCOUNT_LIGHT[key] }}>
                    {ACCOUNT_ICONS[key]}
                  </div>
                  <div>
                    <p className="text-sm font-extrabold text-slate-800">{acc.label}</p>
                    {isRoth && (
                      <span className="text-xs text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full font-bold">paused</span>
                    )}
                  </div>
                </div>
                {!isEditing ? (
                  <button onClick={() => startEdit(key)}
                    className="w-8 h-8 rounded-xl bg-violet-50 flex items-center justify-center text-violet-500 hover:bg-violet-100 transition-colors">
                    <Edit2 size={14} />
                  </button>
                ) : (
                  <div className="flex gap-1.5">
                    <button onClick={saveEdit}
                      className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600 hover:bg-emerald-200 transition-colors">
                      <Check size={14} />
                    </button>
                    <button onClick={() => setEditing(null)}
                      className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors">
                      <X size={14} />
                    </button>
                  </div>
                )}
              </div>

              {!isEditing ? (
                <div className="mt-4 flex justify-between items-end">
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Balance</p>
                    <p className="text-2xl font-extrabold mt-0.5" style={{
                      background: ACCOUNT_GRADIENTS[key], WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
                    }}>
                      {formatCurrencyDecimal(acc.balance)}
                    </p>
                  </div>
                  {!isRoth && (
                    <div className="text-right">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Monthly</p>
                      <p className="text-base font-extrabold text-slate-700 mt-0.5">+{formatCurrencyDecimal(acc.contribution)}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  <div>
                    <p className="text-xs font-bold text-slate-500 mb-1.5">Balance</p>
                    <div className="flex items-center bg-violet-50 rounded-xl px-3 py-2.5 border border-violet-200">
                      <span className="text-violet-400 mr-2 font-bold">$</span>
                      <input type="number" inputMode="decimal" value={draft.balance || ''}
                        onChange={e => setDraft(d => ({ ...d, balance: parseFloat(e.target.value) || 0 }))}
                        className="flex-1 bg-transparent text-slate-800 text-sm font-bold outline-none" placeholder="0" />
                    </div>
                  </div>
                  {!isRoth && (
                    <div>
                      <p className="text-xs font-bold text-slate-500 mb-1.5">Monthly Contribution</p>
                      <div className="flex items-center bg-violet-50 rounded-xl px-3 py-2.5 border border-violet-200">
                        <span className="text-violet-400 mr-2 font-bold">$</span>
                        <input type="number" inputMode="decimal" value={draft.contribution || ''}
                          onChange={e => setDraft(d => ({ ...d, contribution: parseFloat(e.target.value) || 0 }))}
                          className="flex-1 bg-transparent text-slate-800 text-sm font-bold outline-none" placeholder="0" />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <p className="text-center text-xs text-slate-400 font-semibold pt-1">
        Update balances monthly · Projections assume 8% avg. annual return
      </p>
    </div>
  )
}
