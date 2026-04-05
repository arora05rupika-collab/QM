export const BASE_CATEGORIES = [
  'Rent',
  'Groceries',
  'Eating Out',
  'Cab/Uber',
  'Shopping',
  'Subscriptions',
  'India Trip Fund',
  'Mini Trips',
  'Entertainment',
  'Health',
  'Misc',
] as const

export const CAR_CATEGORIES = [
  'Rent',
  'Groceries',
  'Eating Out',
  'Car Payment',
  'Gas',
  'Car Insurance',
  'Shopping',
  'Subscriptions',
  'India Trip Fund',
  'Mini Trips',
  'Entertainment',
  'Health',
  'Misc',
] as const

export const CATEGORY_COLORS: Record<string, string> = {
  Rent: '#ef4444',
  Groceries: '#22c55e',
  'Eating Out': '#f97316',
  'Cab/Uber': '#a78bfa',
  'Car Payment': '#8b5cf6',
  Gas: '#ec4899',
  'Car Insurance': '#c084fc',
  Shopping: '#06b6d4',
  Subscriptions: '#94a3b8',
  'India Trip Fund': '#f59e0b',
  'Mini Trips': '#10b981',
  Entertainment: '#3b82f6',
  Health: '#14b8a6',
  Misc: '#6b7280',
}

export const CATEGORY_EMOJI: Record<string, string> = {
  Rent: '🏠',
  Groceries: '🛒',
  'Eating Out': '🍜',
  'Cab/Uber': '🚕',
  'Car Payment': '🚗',
  Gas: '⛽',
  'Car Insurance': '🛡️',
  Shopping: '🛍️',
  Subscriptions: '📱',
  'India Trip Fund': '✈️',
  'Mini Trips': '🗺️',
  Entertainment: '🎮',
  Health: '💊',
  Misc: '📦',
}

export function getCategories(carMode: boolean): readonly string[] {
  return carMode ? CAR_CATEGORIES : BASE_CATEGORIES
}
