import type { Expense } from '../types'

export function formatDate(date: Date = new Date()): string {
  return date.toISOString().split('T')[0]
}

export function getMonthKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 7) // YYYY-MM
}

export function getMonthExpenses(expenses: Expense[], monthKey?: string): Expense[] {
  const key = monthKey ?? getMonthKey()
  return expenses.filter(e => e.date.startsWith(key))
}

export function getTotalSpent(expenses: Expense[]): number {
  return expenses.reduce((sum, e) => sum + e.amount, 0)
}

export function getSpendingByCategory(expenses: Expense[]): Record<string, number> {
  return expenses.reduce(
    (acc, e) => {
      acc[e.category] = (acc[e.category] ?? 0) + e.amount
      return acc
    },
    {} as Record<string, number>,
  )
}

export function getDaysInMonth(date: Date = new Date()): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
}

export function getDayOfMonth(date: Date = new Date()): number {
  return date.getDate()
}

export function getRemainingDays(date: Date = new Date()): number {
  const daysInMonth = getDaysInMonth(date)
  return daysInMonth - date.getDate() + 1 // include today
}

export function getDailyBudget(budget: number, date: Date = new Date()): number {
  return budget / getDaysInMonth(date)
}

export function getDailyAverage(spent: number, date: Date = new Date()): number {
  const daysPassed = date.getDate()
  return daysPassed > 0 ? spent / daysPassed : 0
}

export function getSafeToSpend(budget: number, spent: number, date: Date = new Date()): number {
  const remaining = budget - spent
  const remainingDays = getRemainingDays(date)
  return Math.max(0, remaining / remainingDays)
}

export function getBudgetPercent(spent: number, budget: number): number {
  return Math.min(100, (spent / budget) * 100)
}

export function getBudgetStatus(spent: number, budget: number): 'good' | 'warning' | 'danger' {
  const pct = spent / budget
  if (pct >= 0.9) return 'danger'
  if (pct >= 0.7) return 'warning'
  return 'good'
}

export function getMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number)
  const date = new Date(year, month - 1, 1)
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

export function getAllMonthKeys(expenses: Expense[]): string[] {
  const keys = new Set(expenses.map(e => e.date.slice(0, 7)))
  const current = getMonthKey()
  keys.add(current)
  return Array.from(keys).sort().reverse()
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount)
}

export function formatCurrencyDecimal(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

export function projectNetWorth(currentTotal: number, monthlyContribution: number, years: number): number {
  // Simple projection with 8% annual return (avg market)
  const monthlyRate = 0.08 / 12
  const months = years * 12
  const fv = currentTotal * Math.pow(1 + monthlyRate, months) + monthlyContribution * ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate)
  return fv
}
