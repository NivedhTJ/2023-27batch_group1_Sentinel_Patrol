import { useState, useEffect, useCallback } from 'react'
import {
  Shield, Users, Building2, ScrollText, BarChart3, Plus, Search,
  Edit2, Power, PowerOff, ChevronRight, X, RefreshCw,
  AlertCircle, UserCheck, UserX, Lock, Phone, Eye, EyeOff
} from 'lucide-react'
import api from '../api'

const RANK_LEVELS = [
  'Constable','Head Constable','Assistant Sub-Inspector','Sub-Inspector',
  'Circle Inspector','Deputy Superintendent of Police','Superintendent of Police',
  'Deputy Inspector General','Inspector General of Police',
  'Additional Director General of Police','Director General of Police','Home Minister'
]

const DEPARTMENTS = [
  'General Duty','Criminal Investigation Department','Traffic',
  'Special Branch','Anti-Terrorism Squad','Cyber Crime Cell',
  'Women & Children Protection Cell','Intelligence','Armed Police Battalion',
  'IT / Platform Administration'
]

const KERALA_DISTRICTS = [
  'Thiruvananthapuram','Kollam','Pathanamthitta','Alappuzha','Kottayam',
  'Idukki','Ernakulam','Thrissur','Palakkad','Malappuram',
  'Kozhikode','Wayanad','Kannur','Kasaragod'
]

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div className="flex items-center gap-4 p-4 rounded-xl"
      style={{ background: 'rgba(15,23,42,0.7)', border: '1px solid rgba(51,65,85,0.4)' }}>
      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: `${color}22`, border: `1px solid ${color}44` }}>
        <Icon size={18} style={{ color }} />
      </div>
      <div>
        <p className="text-xs text-slate-500 leading-none mb-1">{label}</p>
        <p className="text-xl font-bold text-white leading-none">{value ?? 'Loading...'}</p>
      </div>
    </div>
  )
}

function Pill({ children, color, bg }) {
  return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
      style={{ color, background: bg }}>{children}</span>
  )
}

function UserFormModal({ user, stations, onClose, onSaved }) {
  const isEdit = !!user
  const [form, setForm] = useState({
    badge_number: user?.badge_number || '',
    name: user?.name || '',
    password: '',
    role: user?.role || 'Constable',
    station_id: user?.station_id || '',
    department: user?.department || '',
    phone: user?.phone || '',
    email: user?.email || '',
    is_admin: user?.is_admin || false,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPass, setShowPass] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const inputStyle = { background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(51,65,85,0.5)' }

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(''); setLoading(true)
    try {
      const payload = { ...form }
      if (payload.station_id === '') delete payload.station_id
      if (isEdit && !payload.password) delete payload.password
      if (isEdit) await api.patch(`/api/admin/users/${user.id}`, payload)
      else await api.post('/api/admin/users', payload)
      onSaved(); onClose()
    } catch (err) {
      setError(err?.response?.data?.detail || 'Operation failed')
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-lg rounded-2xl overflow-hidden animate-slide-in"
        style={{ background: '#0f172a', border: '1px solid rgba(51,65,85,0.6)', boxShadow: '0 32px 80px rgba(0,0,0,0.8)' }}>
        <div className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid rgba(51,65,85,0.4)', background: 'rgba(30,41,59,0.5)' }}>
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <Edit2 size={13} className="text-blue-400" />
            {isEdit ? 'Edit Personnel' : 'Create Personnel Account'}
          </h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[72vh] overflow-y-auto">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg text-xs text-red-400"
              style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <AlertCircle size={12} />{error}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Badge Number *</label>
              <input value={form.badge_number} onChange={e => set('badge_number', e.target.value)}
                disabled={isEdit} required
                className="w-full px-3 py-2 rounded-lg text-sm text-white placeholder-slate-600 outline-none disabled:opacity-50"
                style={inputStyle} placeholder="e.g. SI-201" />
            </div>
            <div>
              <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Full Name *</label>
              <input value={form.name} onChange={e => set('name', e.target.value)} required
                className="w-full px-3 py-2 rounded-lg text-sm text-white placeholder-slate-600 outline-none"
                style={inputStyle} placeholder="Full name" />
            </div>
          </div>
          <div>
            <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">
              Password {isEdit ? '(leave blank to keep)' : '*'}
            </label>
            <div className="relative">
              <input type={showPass ? 'text' : 'password'} value={form.password}
                onChange={e => set('password', e.target.value)} required={!isEdit}
                className="w-full px-3 py-2 pr-10 rounded-lg text-sm text-white placeholder-slate-600 outline-none"
                style={inputStyle} placeholder={isEdit ? 'Leave blank to keep current' : 'New password'} />
              <button type="button" onClick={() => setShowPass(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                {showPass ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Rank *</label>
              <select value={form.role} onChange={e => set('role', e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm text-white outline-none" style={inputStyle}>
                {RANK_LEVELS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Station</label>
              <select value={form.station_id} onChange={e => set('station_id', e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm text-white outline-none" style={inputStyle}>
                <option value="">— No station —</option>
                {stations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Department</label>
            <select value={form.department} onChange={e => set('department', e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm text-white outline-none" style={inputStyle}>
              <option value="">— Select department —</option>
              {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Phone</label>
              <input value={form.phone} onChange={e => set('phone', e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm text-white placeholder-slate-600 outline-none"
                style={inputStyle} placeholder="+91 XXXXX XXXXX" />
            </div>
            <div>
              <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Email</label>
              <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm text-white placeholder-slate-600 outline-none"
                style={inputStyle} placeholder="officer@police.gov.in" />
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg"
            style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)' }}>
            <input type="checkbox" id="is_admin_chk" checked={form.is_admin}
              onChange={e => set('is_admin', e.target.checked)} className="w-4 h-4 accent-purple-500" />
            <label htmlFor="is_admin_chk" className="text-xs text-purple-300 cursor-pointer">
              <span className="font-bold">Grant System Administrator access</span>
              <span className="text-purple-400 block text-[10px] mt-0.5">Platform-level only. Independent of police rank.</span>
            </label>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-slate-400"
              style={{ background: 'rgba(51,65,85,0.3)', border: '1px solid rgba(51,65,85,0.4)' }}>Cancel</button>
            <button type="submit" disabled={loading}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg,#1d4ed8,#3b82f6)', boxShadow: '0 4px 16px rgba(59,130,246,0.3)' }}>
              {loading ? 'Saving...' : isEdit ? 'Update' : 'Create Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function StationFormModal({ station, onClose, onSaved }) {
  const isEdit = !!station?.id
  const [form, setForm] = useState({
    name: station?.name || '', district: station?.district || '',
    address: station?.address || '', phone: station?.phone || '',
    officer_in_charge: station?.officer_in_charge || '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const inputStyle = { background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(51,65,85,0.5)' }

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(''); setLoading(true)
    try {
      if (isEdit) await api.patch(`/api/admin/stations/${station.id}`, form)
      else await api.post('/api/admin/stations', form)
      onSaved(); onClose()
    } catch (err) {
      setError(err?.response?.data?.detail || 'Operation failed')
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-md rounded-2xl overflow-hidden animate-slide-in"
        style={{ background: '#0f172a', border: '1px solid rgba(51,65,85,0.6)', boxShadow: '0 32px 80px rgba(0,0,0,0.8)' }}>
        <div className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid rgba(51,65,85,0.4)', background: 'rgba(30,41,59,0.5)' }}>
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <Building2 size={13} className="text-emerald-400" />
            {isEdit ? 'Edit Station' : 'Add Police Station'}
          </h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg text-xs text-red-400"
              style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <AlertCircle size={12} />{error}
            </div>
          )}
          <div>
            <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Station Name *</label>
            <input value={form.name} onChange={e => set('name', e.target.value)} required
              className="w-full px-3 py-2 rounded-lg text-sm text-white placeholder-slate-600 outline-none"
              style={inputStyle} placeholder="e.g. Ernakulam Central Police Station" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">District *</label>
              <select value={form.district} onChange={e => set('district', e.target.value)} required
                className="w-full px-3 py-2 rounded-lg text-sm text-white outline-none" style={inputStyle}>
                <option value="">Select district</option>
                {KERALA_DISTRICTS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Phone</label>
              <input value={form.phone} onChange={e => set('phone', e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm text-white placeholder-slate-600 outline-none"
                style={inputStyle} placeholder="0484-XXXXXXX" />
            </div>
          </div>
          <div>
            <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Address *</label>
            <textarea value={form.address} onChange={e => set('address', e.target.value)} required rows={2}
              className="w-full px-3 py-2 rounded-lg text-sm text-white placeholder-slate-600 outline-none resize-none"
              style={inputStyle} placeholder="Full station address" />
          </div>
          <div>
            <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Officer In Charge</label>
            <input value={form.officer_in_charge} onChange={e => set('officer_in_charge', e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm text-white placeholder-slate-600 outline-none"
              style={inputStyle} placeholder="Name of OIC" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-slate-400"
              style={{ background: 'rgba(51,65,85,0.3)', border: '1px solid rgba(51,65,85,0.4)' }}>Cancel</button>
            <button type="submit" disabled={loading}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg,#059669,#10b981)', boxShadow: '0 4px 16px rgba(16,185,129,0.3)' }}>
              {loading ? 'Saving...' : isEdit ? 'Update Station' : 'Add Station'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function AdminPanel() {
  const [activeSection, setActiveSection] = useState('overview')
  const [stats, setStats] = useState(null)
  const [users, setUsers] = useState([])
  const [stations, setStations] = useState([])
  const [auditLogs, setAuditLogs] = useState([])
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [activeFilter, setActiveFilter] = useState('')
  const [loading, setLoading] = useState(false)
  const [userModal, setUserModal] = useState(null)
  const [stationModal, setStationModal] = useState(null)

  const fetchStats = useCallback(async () => {
    try { const r = await api.get('/api/admin/stats'); setStats(r.data) } catch {}
  }, [])

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const params = {}
      if (search) params.search = search
      if (roleFilter) params.role = roleFilter
      if (activeFilter !== '') params.is_active = activeFilter === 'active'
      const r = await api.get('/api/admin/users', { params })
      setUsers(r.data)
    } catch {} finally { setLoading(false) }
  }, [search, roleFilter, activeFilter])

  const fetchStations = useCallback(async () => {
    try { const r = await api.get('/api/admin/stations'); setStations(r.data) } catch {}
  }, [])

  const fetchAuditLogs = useCallback(async () => {
    try { const r = await api.get('/api/admin/audit-logs'); setAuditLogs(r.data) } catch {}
  }, [])

  useEffect(() => { fetchStats(); fetchStations() }, [fetchStats, fetchStations])
  useEffect(() => { if (activeSection === 'users') fetchUsers() }, [activeSection, fetchUsers])
  useEffect(() => { if (activeSection === 'stations') fetchStations() }, [activeSection, fetchStations])
  useEffect(() => { if (activeSection === 'audit') fetchAuditLogs() }, [activeSection, fetchAuditLogs])

  const toggleActivation = async (u) => {
    try {
      await api.patch(`/api/admin/users/${u.id}/activation`, { is_active: !u.is_active })
      fetchUsers(); fetchStats()
    } catch (err) { alert(err?.response?.data?.detail || 'Failed to update') }
  }

  const sections = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'users', label: 'Personnel', icon: Users },
    { id: 'stations', label: 'Stations', icon: Building2 },
    { id: 'audit', label: 'Audit Logs', icon: ScrollText },
  ]

  return (
    <div className="flex h-full gap-4 animate-fade-in">
      <div className="w-44 flex-shrink-0 flex flex-col gap-1 py-2">
        <div className="px-3 py-2 mb-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: 'rgba(168,85,247,0.2)', border: '1px solid rgba(168,85,247,0.3)' }}>
              <Lock size={12} className="text-purple-400" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-purple-400 uppercase tracking-widest leading-none">Admin</p>
              <p className="text-[9px] text-slate-600 leading-none mt-0.5">Control Panel</p>
            </div>
          </div>
        </div>
        {sections.map(s => {
          const Icon = s.icon; const active = activeSection === s.id
          return (
            <button key={s.id} onClick={() => setActiveSection(s.id)}
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all text-left"
              style={{
                background: active ? 'rgba(168,85,247,0.15)' : 'transparent',
                color: active ? '#c084fc' : '#64748b',
                border: active ? '1px solid rgba(168,85,247,0.25)' : '1px solid transparent',
              }}>
              <Icon size={13} />{s.label}
              {active && <ChevronRight size={10} className="ml-auto" />}
            </button>
          )
        })}
      </div>

      <div className="flex-1 overflow-hidden flex flex-col min-w-0">
        {activeSection === 'overview' && (
          <div className="flex-1 overflow-y-auto space-y-5 animate-fade-in">
            <div>
              <h2 className="text-base font-bold text-white mb-1">System Overview</h2>
              <p className="text-xs text-slate-500">Platform health and key statistics</p>
            </div>
            {stats ? (
              <div className="grid grid-cols-3 gap-3">
                <StatCard icon={Users} label="Total Personnel" value={stats.total_users} color="#3b82f6" />
                <StatCard icon={UserCheck} label="Active Accounts" value={stats.active_users} color="#4ade80" />
                <StatCard icon={UserX} label="Deactivated" value={stats.inactive_users} color="#f87171" />
                <StatCard icon={Building2} label="Stations" value={stats.total_stations} color="#f59e0b" />
                <StatCard icon={AlertCircle} label="Suspects on File" value={stats.total_suspects} color="#a78bfa" />
                <StatCard icon={Shield} label="Wanted Persons" value={stats.wanted_suspects} color="#fb923c" />
              </div>
            ) : (
              <div className="flex justify-center items-center h-40">
                <div className="w-8 h-8 rounded-full border-2 border-purple-500/30 border-t-purple-500 animate-spin" />
              </div>
            )}

          </div>
        )}

        {activeSection === 'users' && (
          <div className="flex-1 overflow-hidden flex flex-col gap-3 animate-fade-in">
            <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
              <div className="flex-1 relative min-w-48">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && fetchUsers()}
                  placeholder="Search name or badge..."
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm text-white placeholder-slate-600 outline-none"
                  style={{ background: 'rgba(15,23,42,0.7)', border: '1px solid rgba(51,65,85,0.4)' }} />
              </div>
              <select value={roleFilter} onChange={e => { setRoleFilter(e.target.value) }}
                className="px-3 py-2.5 rounded-xl text-xs text-slate-300 outline-none"
                style={{ background: 'rgba(15,23,42,0.7)', border: '1px solid rgba(51,65,85,0.4)' }}>
                <option value="">All Ranks</option>
                {RANK_LEVELS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <select value={activeFilter} onChange={e => setActiveFilter(e.target.value)}
                className="px-3 py-2.5 rounded-xl text-xs text-slate-300 outline-none"
                style={{ background: 'rgba(15,23,42,0.7)', border: '1px solid rgba(51,65,85,0.4)' }}>
                <option value="">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
              <button onClick={fetchUsers} className="p-2.5 rounded-xl text-slate-400 hover:text-white"
                style={{ background: 'rgba(15,23,42,0.7)', border: '1px solid rgba(51,65,85,0.4)' }}>
                <RefreshCw size={13} />
              </button>
              <button onClick={() => setUserModal('create')}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white"
                style={{ background: 'linear-gradient(135deg,#1d4ed8,#3b82f6)', boxShadow: '0 4px 16px rgba(59,130,246,0.25)' }}>
                <Plus size={13} />Create Account
              </button>
            </div>
            <div className="flex-1 overflow-auto rounded-xl"
              style={{ background: 'rgba(15,23,42,0.5)', border: '1px solid rgba(51,65,85,0.3)' }}>
              {loading ? (
                <div className="flex justify-center items-center h-32">
                  <div className="w-6 h-6 rounded-full border-2 border-blue-500/30 border-t-blue-500 animate-spin" />
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(51,65,85,0.4)', background: 'rgba(15,23,42,0.8)' }}>
                      {['Badge','Name','Rank','Dept','Station','Type','Status','Actions'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {users.length === 0
                      ? <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-600">No personnel found</td></tr>
                      : users.map(u => (
                        <tr key={u.id} className="group hover:bg-white/[0.02] transition-colors"
                          style={{ borderBottom: '1px solid rgba(51,65,85,0.15)' }}>
                          <td className="px-4 py-3"><code className="text-blue-400 font-mono text-[11px]">{u.badge_number}</code></td>
                          <td className="px-4 py-3 text-white font-semibold">{u.name}</td>
                          <td className="px-4 py-3 text-slate-400 text-[11px]">{u.role}</td>
                          <td className="px-4 py-3 text-slate-500 text-[11px]">{u.department || '—'}</td>
                          <td className="px-4 py-3 text-slate-500 text-[11px]">
                            {stations.find(s => s.id === u.station_id)?.name?.split(' ').slice(0,2).join(' ') || `#${u.station_id || '—'}`}
                          </td>
                          <td className="px-4 py-3">
                            {u.is_admin
                              ? <Pill color="#c084fc" bg="rgba(168,85,247,0.15)">SysAdmin</Pill>
                              : <Pill color="#60a5fa" bg="rgba(59,130,246,0.12)">Officer</Pill>}
                          </td>
                          <td className="px-4 py-3">
                            {u.is_active
                              ? <Pill color="#4ade80" bg="rgba(74,222,128,0.12)">Active</Pill>
                              : <Pill color="#f87171" bg="rgba(248,113,113,0.12)">Inactive</Pill>}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => setUserModal(u)} title="Edit"
                                className="p-1.5 rounded-lg text-blue-400 hover:bg-blue-500/10">
                                <Edit2 size={11} />
                              </button>
                              <button onClick={() => toggleActivation(u)}
                                title={u.is_active ? 'Deactivate' : 'Activate'}
                                className={`p-1.5 rounded-lg ${u.is_active ? 'text-red-400 hover:bg-red-500/10' : 'text-green-400 hover:bg-green-500/10'}`}>
                                {u.is_active ? <PowerOff size={11} /> : <Power size={11} />}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    }
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {activeSection === 'stations' && (
          <div className="flex-1 overflow-hidden flex flex-col gap-3 animate-fade-in">
            <div className="flex items-center justify-between flex-shrink-0">
              <div>
                <h2 className="text-sm font-bold text-white">Police Stations</h2>
                <p className="text-xs text-slate-500">{stations.length} stations registered</p>
              </div>
              <button onClick={() => setStationModal({})}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white"
                style={{ background: 'linear-gradient(135deg,#059669,#10b981)', boxShadow: '0 4px 16px rgba(16,185,129,0.25)' }}>
                <Plus size={13} />Add Station
              </button>
            </div>
            <div className="flex-1 overflow-auto space-y-2">
              {stations.map(s => (
                <div key={s.id} className="p-4 rounded-xl flex items-start justify-between group"
                  style={{ background: 'rgba(15,23,42,0.7)', border: '1px solid rgba(51,65,85,0.4)' }}>
                  <div className="flex gap-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.25)' }}>
                      <Building2 size={14} className="text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">{s.name}</p>
                      <p className="text-xs text-slate-500">{s.district} District</p>
                      <p className="text-[10px] text-slate-600">{s.address}</p>
                      <div className="flex items-center gap-3 mt-1">
                        {s.phone && <span className="text-[10px] text-slate-500 flex items-center gap-1"><Phone size={9} />{s.phone}</span>}
                        {s.officer_in_charge && <span className="text-[10px] text-slate-500 flex items-center gap-1"><UserCheck size={9} />OIC: {s.officer_in_charge}</span>}
                      </div>
                    </div>
                  </div>
                  <button onClick={() => setStationModal(s)}
                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-blue-400 hover:bg-blue-500/10">
                    <Edit2 size={12} />
                  </button>
                </div>
              ))}
              {stations.length === 0 && <div className="flex justify-center items-center h-32 text-slate-600 text-sm">No stations found</div>}
            </div>
          </div>
        )}

        {activeSection === 'audit' && (
          <div className="flex-1 overflow-hidden flex flex-col gap-3 animate-fade-in">
            <div className="flex items-center justify-between flex-shrink-0">
              <div>
                <h2 className="text-sm font-bold text-white">Audit Log</h2>
                <p className="text-xs text-slate-500">Latest administrative actions</p>
              </div>
              <button onClick={fetchAuditLogs} className="p-2.5 rounded-xl text-slate-400 hover:text-white"
                style={{ background: 'rgba(15,23,42,0.7)', border: '1px solid rgba(51,65,85,0.4)' }}>
                <RefreshCw size={13} />
              </button>
            </div>
            <div className="flex-1 overflow-auto rounded-xl"
              style={{ background: 'rgba(15,23,42,0.5)', border: '1px solid rgba(51,65,85,0.3)' }}>
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(51,65,85,0.4)', background: 'rgba(15,23,42,0.8)' }}>
                    {['Timestamp','Actor','Action','Resource','Detail','IP'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.length === 0
                    ? <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-600">No audit entries yet</td></tr>
                    : auditLogs.map(log => (
                      <tr key={log.id} className="hover:bg-white/[0.02]"
                        style={{ borderBottom: '1px solid rgba(51,65,85,0.15)' }}>
                        <td className="px-4 py-3 font-mono text-[10px] text-slate-500">
                          {new Date(log.timestamp).toLocaleString('en-IN')}
                        </td>
                        <td className="px-4 py-3"><code className="text-blue-400">{log.actor_badge}</code></td>
                        <td className="px-4 py-3"><Pill color="#a78bfa" bg="rgba(167,139,250,0.12)">{log.action}</Pill></td>
                        <td className="px-4 py-3 text-slate-400">{log.resource_type}{log.resource_id ? ` #${log.resource_id}` : ''}</td>
                        <td className="px-4 py-3 text-slate-500 max-w-xs truncate">{log.detail || '—'}</td>
                        <td className="px-4 py-3 font-mono text-[10px] text-slate-600">{log.ip_address || '—'}</td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {userModal && (
        <UserFormModal
          user={userModal === 'create' ? null : userModal}
          stations={stations}
          onClose={() => setUserModal(null)}
          onSaved={() => { fetchUsers(); fetchStats() }}
        />
      )}
      {stationModal !== null && (
        <StationFormModal
          station={stationModal && Object.keys(stationModal).length > 0 ? stationModal : null}
          onClose={() => setStationModal(null)}
          onSaved={fetchStations}
        />
      )}
    </div>
  )
}
