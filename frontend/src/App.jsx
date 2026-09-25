import { useState, useEffect, lazy, Suspense } from 'react'
import {
  Shield, Map, Camera, Bot, Briefcase, LogOut,
  ChevronRight, AlertCircle, User as UserIcon, BadgeCheck
} from 'lucide-react'
import Login from './components/Login'

// Lazy-load heavy tabs
const MapView     = lazy(() => import('./components/MapView'))
const CCTVGrid    = lazy(() => import('./components/CCTVGrid'))
const AIAssistant = lazy(() => import('./components/AIAssistant'))
const CasesPanel  = lazy(() => import('./components/CasesPanel'))
const AdminPanel  = lazy(() => import('./components/AdminPanel'))

const BASE_TABS = [
  { id: 'map',   label: 'GIS Map & Incidents', icon: Map },
  { id: 'cctv',  label: 'Station CCTV Feeds',  icon: Camera },
  { id: 'ai',    label: 'AI Assistant',         icon: Bot },
  { id: 'cases', label: 'Cases & Evidence',    icon: Briefcase },
]

function TabSpinner() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 rounded-full border-2 border-blue-500/30 border-t-blue-500 animate-spin" />
        <p className="text-sm text-slate-500">Loading module…</p>
      </div>
    </div>
  )
}

export default function App() {
  const [user, setUser]         = useState(null)
  const [activeTab, setActiveTab] = useState('map')

  // Hydrate from localStorage on first load
  useEffect(() => {
    const storedUser  = localStorage.getItem('sentinel_user')
    const storedToken = localStorage.getItem('sentinel_token')
    if (storedUser && storedToken) {
      try { setUser(JSON.parse(storedUser)) }
      catch { localStorage.clear() }
    }
  }, [])

  const handleLogin = (userInfo) => setUser(userInfo)

  const handleLogout = () => {
    localStorage.removeItem('sentinel_token')
    localStorage.removeItem('sentinel_user')
    setUser(null)
  }

  if (!user) return <Login onLogin={handleLogin} />

  const seniorRanks = ['Superintendent of Police', 'Deputy Inspector General', 'Inspector General of Police', 'Additional Director General of Police', 'Director General of Police', 'Home Minister']
  const roleColor = seniorRanks.includes(user.role) ? '#a78bfa' : '#60a5fa'

  const availableTabs = user?.is_admin
    ? [...BASE_TABS, { id: 'admin', label: 'System Admin', icon: Shield }]
    : BASE_TABS

  return (
    <div className="flex flex-col h-screen overflow-hidden"
         style={{ background: 'linear-gradient(180deg, #0a0f1e 0%, #0d1420 100%)' }}>

      {/* ═══════════ HEADER ═══════════════════════════════════════ */}
      <header className="shrink-0 flex items-center justify-between px-6 py-3"
              style={{
                background: 'rgba(10,15,30,0.95)',
                backdropFilter: 'blur(20px)',
                borderBottom: '1px solid rgba(51,65,85,0.5)',
                boxShadow: '0 4px 32px rgba(0,0,0,0.5)',
              }}>
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="absolute inset-0 rounded-full opacity-30 animate-pulse"
                 style={{ background: 'radial-gradient(circle, #3b82f6, transparent)' }} />
            <div className="relative w-9 h-9 rounded-xl flex items-center justify-center"
                 style={{ background: 'linear-gradient(135deg, #1d4ed8, #3b82f6)' }}>
              <Shield size={18} className="text-white" />
            </div>
          </div>
          <div>
            <h1 className="text-base font-bold text-white tracking-tight leading-none">
              Sentinel Patrol
            </h1>
            <p className="text-[10px] text-slate-500 tracking-widest uppercase leading-none mt-0.5">
              Kerala Police Intelligence
            </p>
          </div>
          <div className="w-px h-8 mx-2" style={{ background: 'rgba(51,65,85,0.6)' }} />
          {/* Breadcrumb */}
          <div className="hidden md:flex items-center gap-1.5 text-xs text-slate-500">
            <span>Command Dashboard</span>
            <ChevronRight size={12} />
            <span className="text-slate-400">{availableTabs.find(t => t.id === activeTab)?.label}</span>
          </div>
        </div>

        {/* Center – Tab navigation */}
        <nav className="flex items-center gap-1 p-1 rounded-xl"
             style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(51,65,85,0.4)' }}>
          {availableTabs.map(tab => {
            const Icon    = tab.icon
            const active  = activeTab === tab.id
            return (
              <button
                key={tab.id}
                id={`tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all duration-200"
                style={{
                  background: active ? 'linear-gradient(135deg,#1d4ed8,#3b82f6)' : 'transparent',
                  color: active ? 'white' : '#64748b',
                  boxShadow: active ? '0 4px 16px rgba(59,130,246,0.3)' : 'none',
                }}
              >
                <Icon size={13} />
                <span className="hidden lg:inline">{tab.label}</span>
              </button>
            )
          })}
        </nav>

        {/* Right – User info + logout */}
        <div className="flex items-center gap-3">
          {/* User card */}
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl"
               style={{ background: 'rgba(15,23,42,0.7)', border: '1px solid rgba(51,65,85,0.4)' }}>
            <div className="w-7 h-7 rounded-full flex items-center justify-center"
                 style={{ background: `${roleColor}22`, border: `1px solid ${roleColor}44` }}>
              <UserIcon size={13} style={{ color: roleColor }} />
            </div>
            <div className="hidden md:block text-right">
              <p className="text-xs font-semibold text-white leading-none">{user.name}</p>
              <div className="flex items-center gap-1 mt-0.5">
                <BadgeCheck size={9} style={{ color: roleColor }} />
                <p className="text-[9px] font-medium leading-none" style={{ color: roleColor }}>
                  {user.role}
                </p>
              </div>
            </div>
          </div>

          {/* Logout */}
          <button
            id="logout-btn"
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all group"
            style={{
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.2)',
              color: '#f87171',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(239,68,68,0.18)'
              e.currentTarget.style.boxShadow = '0 4px 16px rgba(239,68,68,0.2)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(239,68,68,0.08)'
              e.currentTarget.style.boxShadow = 'none'
            }}
          >
            <LogOut size={13} />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </header>

      {/* ═══════════ STATUS BAR ═══════════════════════════════════ */}
      <div className="shrink-0 flex items-center gap-6 px-6 py-1.5 text-[10px] font-mono text-slate-600"
           style={{ background: 'rgba(10,15,30,0.7)', borderBottom: '1px solid rgba(51,65,85,0.2)' }}>
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          <span className="text-green-500">SYSTEM ONLINE</span>
        </span>
        <span>BADGE: {user.badge_number}</span>
        <span>STATION: {user.station_id || 'N/A'}</span>
        <span className="ml-auto">
          {new Date().toLocaleString('en-IN', {
            weekday:'short', year:'numeric', month:'short',
            day:'numeric', hour:'2-digit', minute:'2-digit', second:'2-digit',
          })}
        </span>
      </div>

      {/* ═══════════ TAB CONTENT ══════════════════════════════════ */}
      <main className="flex-1 overflow-hidden p-4">
        <Suspense fallback={<TabSpinner />}>
          {activeTab === 'map'   && <MapView />}
          {activeTab === 'cctv'  && <CCTVGrid />}
          {activeTab === 'ai'    && <AIAssistant />}
          {activeTab === 'cases' && <CasesPanel />}
          {activeTab === 'admin' && <AdminPanel />}
        </Suspense>
      </main>
    </div>
  )
}
