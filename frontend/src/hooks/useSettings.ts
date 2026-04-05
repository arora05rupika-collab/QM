import { useState, useCallback } from 'react'
import type { Settings, Investments, RecurringExpense } from '../types'
import { storage } from '../utils/storage'

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(() => storage.getSettings())
  const [investments, setInvestments] = useState<Investments>(() => storage.getInvestments())
  const [recurring, setRecurring] = useState<RecurringExpense[]>(() => storage.getRecurring())

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings(prev => {
      const updated = { ...prev, ...patch }
      storage.saveSettings(updated)
      return updated
    })
  }, [])

  const updateInvestments = useCallback((updated: Investments) => {
    storage.saveInvestments(updated)
    setInvestments(updated)
  }, [])

  const updateRecurring = useCallback((updated: RecurringExpense[]) => {
    storage.saveRecurring(updated)
    setRecurring(updated)
  }, [])

  // Effective budget: carMode adds car budget to expenses but reduces spending budget
  const effectiveBudget = settings.carMode
    ? settings.monthlyBudget + settings.carBudget // $2,750 total
    : settings.monthlyBudget // $2,500

  return { settings, updateSettings, investments, updateInvestments, recurring, updateRecurring, effectiveBudget }
}
