import { useState } from 'react'
import { Shield, Eye, EyeOff, AlertCircle, Lock, BadgeCheck } from 'lucide-react'
import api from '../api'

export default function Login({ onLogin }) {
  const [badgeNumber, setBadgeNumber] = useState('')
  const [password, setPassword]       = useState('')
  const [showPass, setShowPass]       = useState(false)
  const [error, setError]             = useState('')
  const [loading, setLoading]         = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await api.post('/api/auth/login', {
        badge_number: badgeNumber,
        password,
      })
      const { access_token, user } = res.data
      localStorage.setItem('sentinel_token', access_token)
      localStorage.setItem('sentinel_user', JSON.stringify(user))
      onLogin(user)
    } catch (err) {
      const detail = err?.response?.data?.detail
      setError(detail || 'Authentication failed. Check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden"
         style={{ background: 'linear-gradient(135deg, #020817 0%, #0a0f1e 40%, #0d1b2a 100%)' }}>

      {/* ── Animated background grid ── */}
      <div className="absolute inset-0 opacity-10"
           style={{
             backgroundImage: 'linear-gradient(rgba(59,130,246,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,0.4) 1px, transparent 1px)',
             backgroundSize: '60px 60px',
           }} />

      {/* ── Radial glow spots ── */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full opacity-10"
           style={{ background: 'radial-gradient(circle, #3b82f6 0%, transparent 70%)', filter: 'blur(60px)' }} />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full opacity-8"
           style={{ background: 'radial-gradient(circle, #6366f1 0%, transparent 70%)', filter: 'blur(80px)' }} />

      {/* ── Login card ── */}
      <div className="relative w-full max-w-md mx-4 animate-slide-in">
        <div className="glass rounded-2xl p-10 shadow-2xl"
             style={{ boxShadow: '0 0 80px rgba(59,130,246,0.12), 0 32px 80px rgba(0,0,0,0.7)' }}>

          {/* Header */}
          <div className="flex flex-col items-center mb-10">
            <div className="relative mb-4">
              <div className="absolute inset-0 rounded-full animate-ping opacity-20"
                   style={{ background: 'radial-gradient(circle, #3b82f6, transparent)', animationDuration: '2s' }} />
              <div className="relative flex items-center justify-center w-20 h-20 rounded-full"
                   style={{ background: 'linear-gradient(135deg, #1d4ed8, #3b82f6)' }}>
                <Shield size={36} className="text-white" />
              </div>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-white">Sentinel Patrol</h1>
            <p className="mt-1 text-sm font-medium text-blue-400 tracking-widest uppercase">Kerala Police Command System</p>
            <div className="mt-3 h-px w-24 rounded-full"
                 style={{ background: 'linear-gradient(90deg, transparent, #3b82f6, transparent)' }} />
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Badge Number */}
            <div className="space-y-1.5">
              <label htmlFor="badge" className="block text-xs font-semibold text-slate-400 tracking-widest uppercase">
                Badge Number
              </label>
              <div className="relative">
                <BadgeCheck size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  id="badge"
                  type="text"
                  value={badgeNumber}
                  onChange={e => setBadgeNumber(e.target.value)}
                  placeholder="e.g. KP-001"
                  required
                  className="w-full pl-10 pr-4 py-3 rounded-xl text-sm text-white placeholder-slate-500 outline-none transition-all duration-200"
                  style={{
                    background: 'rgba(15, 23, 42, 0.8)',
                    border: '1px solid rgba(51, 65, 85, 0.8)',
                  }}
                  onFocus={e => e.target.style.borderColor = '#3b82f6'}
                  onBlur={e => e.target.style.borderColor = 'rgba(51, 65, 85, 0.8)'}
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label htmlFor="password" className="block text-xs font-semibold text-slate-400 tracking-widest uppercase">
                Password
              </label>
              <div className="relative">
                <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  id="password"
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter secure password"
                  required
                  className="w-full pl-10 pr-12 py-3 rounded-xl text-sm text-white placeholder-slate-500 outline-none transition-all duration-200"
                  style={{
                    background: 'rgba(15, 23, 42, 0.8)',
                    border: '1px solid rgba(51, 65, 85, 0.8)',
                  }}
                  onFocus={e => e.target.style.borderColor = '#3b82f6'}
                  onBlur={e => e.target.style.borderColor = 'rgba(51, 65, 85, 0.8)'}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(v => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                  tabIndex={-1}
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Error message */}
            {error && (
              <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm text-red-400 animate-fade-in"
                   style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)' }}>
                <AlertCircle size={15} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Submit */}
            <button
              id="login-submit"
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl font-semibold text-sm tracking-wide text-white transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed mt-2"
              style={{
                background: loading
                  ? 'rgba(59, 130, 246, 0.5)'
                  : 'linear-gradient(135deg, #1d4ed8, #3b82f6)',
                boxShadow: loading ? 'none' : '0 4px 24px rgba(59, 130, 246, 0.35)',
              }}
              onMouseEnter={e => { if(!loading) e.target.style.boxShadow = '0 4px 32px rgba(59,130,246,0.55)' }}
              onMouseLeave={e => { if(!loading) e.target.style.boxShadow = '0 4px 24px rgba(59,130,246,0.35)' }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Authenticating…
                </span>
              ) : (
                'Secure Login'
              )}
            </button>
          </form>

          <p className="mt-8 text-center text-xs text-slate-600">
            Authorized personnel only • Kerala Police Department
          </p>
        </div>

        {/* Corner decorations */}
        <div className="absolute -top-px -left-px w-8 h-8 border-t-2 border-l-2 border-blue-500 rounded-tl-2xl" />
        <div className="absolute -top-px -right-px w-8 h-8 border-t-2 border-r-2 border-blue-500 rounded-tr-2xl" />
        <div className="absolute -bottom-px -left-px w-8 h-8 border-b-2 border-l-2 border-blue-500 rounded-bl-2xl" />
        <div className="absolute -bottom-px -right-px w-8 h-8 border-b-2 border-r-2 border-blue-500 rounded-br-2xl" />
      </div>
    </div>
  )
}
