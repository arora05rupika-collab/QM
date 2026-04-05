import { useState } from 'react'
import { Home, PlusCircle, PieChart, TrendingUp, Clock, Settings } from 'lucide-react'
import type { Tab } from './types'
import { useExpenses } from './hooks/useExpenses'
import { useSettings } from './hooks/useSettings'
import Dashboard from './pages/expense/Dashboard'
import AddExpense from './pages/expense/AddExpense'
import CategoryBreakdown from './pages/expense/CategoryBreakdown'
import InvestmentTracker from './pages/expense/InvestmentTracker'
import History from './pages/expense/History'
import SettingsPage from './pages/expense/Settings'

const NAV_ITEMS: { tab: Tab; icon: React.ElementType; label: string }[] = [
  { tab: 'dashboard', icon: Home, label: 'Home' },
  { tab: 'breakdown', icon: PieChart, label: 'Breakdown' },
  { tab: 'add', icon: PlusCircle, label: 'Add' },
  { tab: 'investments', icon: TrendingUp, label: 'Invest' },
  { tab: 'history', icon: Clock, label: 'History' },
]

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard')
  const [showSettings, setShowSettings] = useState(false)

  const { expenses, addExpense, deleteExpense } = useExpenses()
  const { settings, updateSettings, investments, updateInvestments, recurring, updateRecurring, effectiveBudget } =
    useSettings()

  const handleNavigateAdd = () => setActiveTab('add')
  const handleNavigateDashboard = () => setActiveTab('dashboard')

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col max-w-md mx-auto">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 bg-gray-950/80 backdrop-blur-md sticky top-0 z-10 border-b border-gray-900">
        <div>
          <h1 className="text-base font-bold text-white tracking-tight">
            {showSettings
              ? 'Settings'
              : activeTab === 'dashboard'
                ? '💰 My Finances'
                : activeTab === 'add'
                  ? 'Log Expense'
                  : activeTab === 'breakdown'
                    ? 'Breakdown'
                    : activeTab === 'investments'
                      ? 'Investments'
                      : 'History'}
          </h1>
          {!showSettings && activeTab === 'dashboard' && (
            <p className="text-xs text-gray-500">F-1 OPT · Ohio</p>
          )}
        </div>
        <button
          onClick={() => setShowSettings(s => !s)}
          className={`p-2 rounded-xl transition-colors ${showSettings ? 'bg-gray-800 text-white' : 'text-gray-500 hover:text-gray-300'}`}
        >
          <Settings size={18} />
        </button>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto px-4 pt-4">
        {showSettings ? (
          <SettingsPage
            settings={settings}
            recurring={recurring}
            expenses={expenses}
            onUpdateSettings={updateSettings}
            onUpdateRecurring={updateRecurring}
          />
        ) : activeTab === 'dashboard' ? (
          <Dashboard
            expenses={expenses}
            settings={settings}
            effectiveBudget={effectiveBudget}
            onDelete={deleteExpense}
            onNavigateAdd={handleNavigateAdd}
          />
        ) : activeTab === 'add' ? (
          <AddExpense settings={settings} onAdd={addExpense} onNavigateDashboard={handleNavigateDashboard} />
        ) : activeTab === 'breakdown' ? (
          <CategoryBreakdown expenses={expenses} effectiveBudget={effectiveBudget} />
        ) : activeTab === 'investments' ? (
          <InvestmentTracker investments={investments} onUpdate={updateInvestments} />
        ) : (
          <History expenses={expenses} effectiveBudget={effectiveBudget} />
        )}
      </main>

      {/* Bottom navigation */}
      {!showSettings && (
        <nav className="bg-gray-950/90 backdrop-blur-md border-t border-gray-900 sticky bottom-0">
          <div className="flex items-center justify-around px-2">
            {NAV_ITEMS.map(({ tab, icon: Icon, label }) => {
              const isActive = activeTab === tab
              const isAdd = tab === 'add'
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex flex-col items-center gap-0.5 py-3 px-3 min-w-[60px] transition-colors active:scale-95 ${
                    isAdd
                      ? isActive
                        ? 'text-emerald-400'
                        : 'text-emerald-500'
                      : isActive
                        ? 'text-white'
                        : 'text-gray-600'
                  }`}
                >
                  <Icon size={isAdd ? 26 : 22} />
                  <span className="text-xs">{label}</span>
                </button>
              )
            })}
          </div>
        </nav>
      )}
    </div>
  )
}
