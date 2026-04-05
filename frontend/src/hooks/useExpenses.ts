import { useState, useCallback, useEffect } from 'react'
import type { Expense } from '../types'
import { storage } from '../utils/storage'
import { formatDate, getMonthKey, getDayOfMonth } from '../utils/calculations'

// Simple UUID without external dep
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}

export function useExpenses() {
  const [expenses, setExpenses] = useState<Expense[]>(() => storage.getExpenses())

  const persist = useCallback((updated: Expense[]) => {
    storage.saveExpenses(updated)
    setExpenses(updated)
  }, [])

  // Auto-apply recurring expenses at start of session
  useEffect(() => {
    const today = new Date()
    const currentMonthKey = getMonthKey(today)
    const todayDay = getDayOfMonth(today)
    const recurring = storage.getRecurring()
    const current = storage.getExpenses()

    const toAdd: Expense[] = []
    for (const r of recurring) {
      if (!r.enabled) continue
      // Check if this recurring expense already exists this month
      const alreadyExists = current.some(
        e => e.note === `[Auto] ${r.note}` && e.date.startsWith(currentMonthKey) && e.category === r.category,
      )
      if (!alreadyExists && todayDay >= r.dayOfMonth) {
        const dateStr = `${currentMonthKey}-${String(r.dayOfMonth).padStart(2, '0')}`
        toAdd.push({
          id: generateId(),
          amount: r.amount,
          category: r.category,
          note: `[Auto] ${r.note}`,
          date: dateStr,
          createdAt: new Date().toISOString(),
        })
      }
    }

    if (toAdd.length > 0) {
      const updated = [...current, ...toAdd]
      storage.saveExpenses(updated)
      setExpenses(updated)
    }
  }, [])

  const addExpense = useCallback(
    (data: Omit<Expense, 'id' | 'createdAt'>) => {
      const expense: Expense = {
        ...data,
        id: generateId(),
        createdAt: new Date().toISOString(),
      }
      persist([expense, ...expenses])
      return expense
    },
    [expenses, persist],
  )

  const deleteExpense = useCallback(
    (id: string) => {
      persist(expenses.filter(e => e.id !== id))
    },
    [expenses, persist],
  )

  const editExpense = useCallback(
    (id: string, data: Partial<Omit<Expense, 'id' | 'createdAt'>>) => {
      persist(expenses.map(e => (e.id === id ? { ...e, ...data } : e)))
    },
    [expenses, persist],
  )

  return { expenses, addExpense, deleteExpense, editExpense }
}
