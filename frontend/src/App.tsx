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

const TAB_TITLES: Record<Tab | 'settings', string> = {
  dashboard: '💰 My Finances',
  add: 'Log Expense',
  breakdown: 'Breakdown',
  investments: 'Investments',
  history: 'History',
  settings: 'Settings',
}

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard')
  const [showSettings, setShowSettings] = useState(false)

  const { expenses, addExpense, deleteExpense } = useExpenses()
  const { settings, updateSettings, investments, updateInvestments, recurring, updateRecurring, effectiveBudget } =
    useSettings()

  const currentTitle = showSettings ? TAB_TITLES.settings : TAB_TITLES[activeTab]

  return (
    <div className="min-h-screen bg-app flex flex-col max-w-md mx-auto">
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-4 bg-white/80 backdrop-blur-md sticky top-0 z-10 border-b border-violet-100/60">
        <div>
          <h1 className="text-lg font-extrabold text-slate-800">{currentTitle}</h1>
          {!showSettings && activeTab === 'dashboard' && (
            <p className="text-xs text-violet-400 font-semibold mt-0.5">F-1 OPT · Ohio</p>
          )}
        </div>
        <button
          onClick={() => setShowSettings(s => !s)}
          className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
            showSettings ? 'bg-violet-600 text-white shadow-md' : 'bg-violet-50 text-violet-500 hover:bg-violet-100'
          }`}
        >
          <Settings size={16} />
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
            onNavigateAdd={() => setActiveTab('add')}
          />
        ) : activeTab === 'add' ? (
          <AddExpense settings={settings} onAdd={addExpense} onNavigateDashboard={() => setActiveTab('dashboard')} />
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
        <nav className="bg-white shadow-nav border-t border-violet-100/60 sticky bottom-0">
          <div className="flex items-center justify-around px-2">
            {NAV_ITEMS.map(({ tab, icon: Icon, label }) => {
              const isActive = activeTab === tab
              const isAdd = tab === 'add'
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex flex-col items-center gap-1 py-3 px-3 min-w-[60px] transition-all active:scale-95 ${
                    isAdd ? '' : isActive ? 'text-violet-600' : 'text-slate-400'
                  }`}
                >
                  {isAdd ? (
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${
                      isActive
                        ? 'bg-violet-600 shadow-lg shadow-violet-200'
                        : 'bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg shadow-violet-200'
                    }`}>
                      <Icon size={22} className="text-white" />
                    </div>
                  ) : (
                    <>
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${
                        isActive ? 'bg-violet-100' : ''
                      }`}>
                        <Icon size={18} />
                      </div>
                    </>
                  )}
                  <span className={`text-xs font-bold ${isAdd ? 'text-violet-600' : ''}`}>{label}</span>
                </button>
              )
            })}
          </div>
        </nav>
      )}
    </div>
  )
}
