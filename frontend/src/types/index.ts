export interface Expense {
  id: string
  amount: number
  category: string
  note: string
  date: string // YYYY-MM-DD
  createdAt: string
}

export interface RecurringExpense {
  id: string
  category: string
  amount: number
  note: string
  dayOfMonth: number
  enabled: boolean
}

export interface InvestmentAccount {
  balance: number
  contribution: number
  label: string
}

export interface Investments {
  capitalOne: InvestmentAccount
  fidelityVOO: InvestmentAccount
  fidelityQQQ: InvestmentAccount
  roth401k: InvestmentAccount
}

export interface Settings {
  carMode: boolean
  monthlyBudget: number
  carBudget: number
  darkMode: boolean
  alertAt70: boolean
  alertAt90: boolean
  inrRate: number
  showInr: boolean
}

export type Tab = 'dashboard' | 'add' | 'breakdown' | 'investments' | 'history' | 'settings'
