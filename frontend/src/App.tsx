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
    /* Full page background */
    <div className="min-h-screen w-full flex items-start justify-center"
      style={{ background: 'linear-gradient(160deg, #f0e8ff 0%, #e8f4ff 50%, #f0fff4 100%)' }}>

      {/* Phone-sized app shell — centered on desktop, full screen on mobile */}
      <div className="w-full max-w-sm flex flex-col bg-app relative"
        style={{ minHeight: '100svh' }}>

        {/* Header */}
        <header className="flex items-center justify-between px-5 py-4 bg-white/90 backdrop-blur-md sticky top-0 z-10 border-b border-violet-100">
          <h1 className="text-lg font-extrabold text-slate-800">{currentTitle}</h1>
          <button
            onClick={() => setShowSettings(s => !s)}
            className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
              showSettings ? 'text-white shadow-md' : 'bg-violet-50 text-violet-500 hover:bg-violet-100'
            }`}
            style={showSettings ? { background: 'linear-gradient(135deg,#8b5cf6,#6d28d9)' } : {}}
          >
            <Settings size={16} />
          </button>
        </header>

        {/* Scrollable content */}
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
          <nav className="bg-white border-t border-violet-100 sticky bottom-0"
            style={{ boxShadow: '0 -4px 20px rgba(139,92,246,0.08)' }}>
            <div className="flex items-center justify-around px-1 py-1">
              {NAV_ITEMS.map(({ tab, icon: Icon, label }) => {
                const isActive = activeTab === tab
                const isAdd = tab === 'add'
                return (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className="flex flex-col items-center gap-0.5 py-2 px-2 min-w-[52px] transition-all active:scale-95"
                  >
                    {isAdd ? (
                      <>
                        <div className="w-11 h-11 rounded-2xl flex items-center justify-center"
                          style={{ background: 'linear-gradient(135deg,#8b5cf6,#6d28d9)', boxShadow: '0 4px 12px rgba(109,40,217,0.35)' }}>
                          <Icon size={22} className="text-white" />
                        </div>
                        <span className="text-xs font-extrabold text-violet-600">{label}</span>
                      </>
                    ) : (
                      <>
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${isActive ? 'bg-violet-100' : ''}`}>
                          <Icon size={18} className={isActive ? 'text-violet-600' : 'text-slate-400'} />
                        </div>
                        <span className={`text-xs font-bold ${isActive ? 'text-violet-600' : 'text-slate-400'}`}>{label}</span>
                      </>
                    )}
                  </button>
                )
              })}
            </div>
          </nav>
        )}
      </div>
    </div>
  )
}
