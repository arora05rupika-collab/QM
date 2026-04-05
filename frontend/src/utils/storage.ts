import type { Expense, RecurringExpense, Settings, Investments } from '../types'

const KEYS = {
  EXPENSES: 'et_expenses',
  SETTINGS: 'et_settings',
  INVESTMENTS: 'et_investments',
  RECURRING: 'et_recurring',
}

export const DEFAULT_SETTINGS: Settings = {
  carMode: false,
  monthlyBudget: 2500,
  carBudget: 250,
  darkMode: true,
  alertAt70: true,
  alertAt90: true,
  inrRate: 84,
  showInr: false,
}

export const DEFAULT_INVESTMENTS: Investments = {
  capitalOne: { balance: 0, contribution: 500, label: 'Capital One Savings' },
  fidelityVOO: { balance: 0, contribution: 500, label: 'Fidelity VOO' },
  fidelityQQQ: { balance: 0, contribution: 300, label: 'Fidelity QQQ' },
  roth401k: { balance: 800, contribution: 0, label: 'Roth 401(k)' },
}

export const DEFAULT_RECURRING: RecurringExpense[] = [
  { id: 'rent', category: 'Rent', amount: 800, note: 'Monthly rent', dayOfMonth: 1, enabled: true },
  { id: 'phone', category: 'Subscriptions', amount: 50, note: 'Phone bill', dayOfMonth: 15, enabled: true },
  { id: 'spotify', category: 'Subscriptions', amount: 11, note: 'Spotify', dayOfMonth: 1, enabled: true },
]

function load<T>(key: string, defaultVal: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : defaultVal
  } catch {
    return defaultVal
  }
}

function save<T>(key: string, val: T) {
  localStorage.setItem(key, JSON.stringify(val))
}

export const storage = {
  getExpenses: (): Expense[] => load<Expense[]>(KEYS.EXPENSES, []),
  saveExpenses: (expenses: Expense[]) => save(KEYS.EXPENSES, expenses),

  getSettings: (): Settings => ({ ...DEFAULT_SETTINGS, ...load<Partial<Settings>>(KEYS.SETTINGS, {}) }),
  saveSettings: (settings: Settings) => save(KEYS.SETTINGS, settings),

  getInvestments: (): Investments => {
    const stored = load<Partial<Investments>>(KEYS.INVESTMENTS, {})
    return { ...DEFAULT_INVESTMENTS, ...stored }
  },
  saveInvestments: (investments: Investments) => save(KEYS.INVESTMENTS, investments),

  getRecurring: (): RecurringExpense[] => load<RecurringExpense[]>(KEYS.RECURRING, DEFAULT_RECURRING),
  saveRecurring: (recurring: RecurringExpense[]) => save(KEYS.RECURRING, recurring),
}
