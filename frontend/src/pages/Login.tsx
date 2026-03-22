import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authApi } from '../services/api'
import { ArrowLeftRight } from 'lucide-react'
import toast from 'react-hot-toast'

export default function Login() {
  const navigate = useNavigate()
  const [isRegister, setIsRegister] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ orgName: '', email: '', password: '' })

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      if (isRegister) {
        await authApi.register(form.orgName, form.email, form.password)
        toast.success('Account created! Please log in.')
        setIsRegister(false)
      } else {
        await authApi.login(form.email, form.password)
        navigate('/')
      }
    } catch {
      toast.error(isRegister ? 'Registration failed' : 'Invalid credentials')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-600 rounded-xl mb-4">
            <ArrowLeftRight className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">MigrateAI</h1>
          <p className="text-gray-400 text-sm mt-1">AI-Powered ERP Migration Platform</p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-6">
            {isRegister ? 'Create Account' : 'Sign In'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegister && (
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Organisation Name</label>
                <input className="input" placeholder="Acme Corp" required value={form.orgName} onChange={set('orgName')} />
              </div>
            )}
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Email</label>
              <input className="input" type="email" placeholder="you@company.com" required value={form.email} onChange={set('email')} />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Password</label>
              <input className="input" type="password" placeholder="••••••••" required value={form.password} onChange={set('password')} />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition-colors mt-2"
            >
              {loading ? '...' : isRegister ? 'Create Account' : 'Sign In'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-4">
            {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button
              onClick={() => setIsRegister(!isRegister)}
              className="text-blue-400 hover:text-blue-300 font-medium"
            >
              {isRegister ? 'Sign In' : 'Register'}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
