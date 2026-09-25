import { useState, useEffect, useCallback } from 'react'
import {
  Briefcase, Plus, X, Search, Filter, RefreshCw, Folder,
  FileText, Shield, User as UserIcon, Clock, Paperclip,
  CheckCircle2, AlertCircle, ChevronRight, Hash, Tag, Layers,
  Upload, FileCode, Trash2, Eye, ShieldAlert, Check
} from 'lucide-react'
import api from '../api'

const CASE_STATUS_COLORS = {
  'Open': { text: '#f87171', bg: 'rgba(248, 113, 113, 0.15)', border: 'rgba(248, 113, 113, 0.3)' },
  'Under Investigation': { text: '#fb923c', bg: 'rgba(251, 146, 60, 0.15)', border: 'rgba(251, 146, 60, 0.3)' },
  'Closed': { text: '#4ade80', bg: 'rgba(74, 222, 128, 0.15)', border: 'rgba(74, 222, 128, 0.3)' }
}

const EVIDENCE_TYPE_BADGES = {
  'Physical': { text: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)', label: 'Physical' },
  'Digital': { text: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)', label: 'Digital' },
  'Testimonial': { text: '#a855f7', bg: 'rgba(168, 85, 247, 0.15)', label: 'Testimonial' },
  'Document': { text: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', label: 'Document' }
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

export default function CasesPanel() {
  const [cases, setCases] = useState([])
  const [incidents, setIncidents] = useState([])
  const [fetching, setFetching] = useState(false)
  const [statusFilter, setStatusFilter] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')

  // New Case Modal State
  const [showNewCaseModal, setShowNewCaseModal] = useState(false)
  const [newCase, setNewCase] = useState({
    title: '',
    description: '',
    incident_id: '',
    assigned_officer_id: '',
    status: 'Open'
  })
  const [caseFormError, setCaseFormError] = useState('')
  const [caseFormLoading, setCaseFormLoading] = useState(false)

  // Selected Case (Detail View Modal) State
  const [selectedCase, setSelectedCase] = useState(null)
  const [evidenceList, setEvidenceList] = useState([])
  const [fetchingEvidence, setFetchingEvidence] = useState(false)
  const [updatingCaseStatus, setUpdatingCaseStatus] = useState(false)

  // Digital Evidence Files State
  const [digitalEvidenceList, setDigitalEvidenceList] = useState([])
  const [fetchingDigitalEvidence, setFetchingDigitalEvidence] = useState(false)
  const [activeEvidenceTab, setActiveEvidenceTab] = useState('textual') // 'textual' | 'digital'

  // Digital File Upload Form State
  const [uploadFile, setUploadFile] = useState(null)
  const [uploadDescription, setUploadDescription] = useState('')
  const [isSensitiveFile, setIsSensitiveFile] = useState(false)
  const [uploadingFile, setUploadingFile] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [uploadSuccess, setUploadSuccess] = useState('')

  // Add Evidence Form State
  const [newEvidence, setNewEvidence] = useState({
    description: '',
    evidence_type: 'Physical'
  })
  const [evidenceError, setEvidenceError] = useState('')
  const [evidenceLoading, setEvidenceLoading] = useState(false)

  // Hydrate logged-in user from localStorage to default assigned_officer_id if appropriate
  const currentUser = (() => {
    try {
      return JSON.parse(localStorage.getItem('sentinel_user'))
    } catch {
      return null
    }
  })()

  // Fetch all cases
  const fetchCases = useCallback(async () => {
    setFetching(true)
    try {
      const res = await api.get('/api/cases')
      setCases(res.data)
    } catch (err) {
      console.error('Failed to fetch cases', err)
    } finally {
      setFetching(false)
    }
  }, [])

  // Fetch incidents for dropdown
  const fetchIncidents = useCallback(async () => {
    try {
      const res = await api.get('/api/incidents')
      setIncidents(res.data)
      if (res.data.length > 0 && !newCase.incident_id) {
        setNewCase(prev => ({ ...prev, incident_id: res.data[0].id }))
      }
    } catch (err) {
      console.error('Failed to fetch incidents', err)
    }
  }, [newCase.incident_id])

  useEffect(() => {
    fetchCases()
    fetchIncidents()
  }, [fetchCases, fetchIncidents])

  // Fetch evidence for selected case
  const fetchEvidenceForCase = useCallback(async (caseId) => {
    setFetchingEvidence(true)
    try {
      const res = await api.get(`/api/cases/${caseId}/evidence`)
      setEvidenceList(res.data)
    } catch (err) {
      console.error('Failed to fetch evidence', err)
    } finally {
      setFetchingEvidence(false)
    }
  }, [])

  // Fetch digital evidence files for selected case
  const fetchDigitalEvidenceForCase = useCallback(async (caseId) => {
    setFetchingDigitalEvidence(true)
    try {
      const res = await api.get(`/api/digital-evidence/case/${caseId}`)
      setDigitalEvidenceList(res.data)
    } catch (err) {
      console.error('Failed to fetch digital evidence', err)
    } finally {
      setFetchingDigitalEvidence(false)
    }
  }, [])

  // Open Case Detail View
  const handleOpenCaseDetail = (caseItem) => {
    setSelectedCase(caseItem)
    setUploadSuccess('')
    setUploadError('')
    setUploadFile(null)
    setUploadDescription('')
    setIsSensitiveFile(false)
    fetchEvidenceForCase(caseItem.id)
    fetchDigitalEvidenceForCase(caseItem.id)
  }

  // Handle File Upload Submit
  const handleFileUploadSubmit = async (e) => {
    e.preventDefault()
    if (!selectedCase || !uploadFile) return
    setUploadError('')
    setUploadSuccess('')
    setUploadingFile(true)

    try {
      const formData = new FormData()
      formData.append('case_id', selectedCase.id)
      formData.append('description', uploadDescription)
      formData.append('is_sensitive', isSensitiveFile)
      formData.append('file', uploadFile)

      const res = await api.post('/api/digital-evidence/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })

      setUploadSuccess(`File uploaded & hashed successfully! SHA-256: ${res.data.hash_sha256}`)
      setUploadFile(null)
      setUploadDescription('')
      setIsSensitiveFile(false)
      await fetchDigitalEvidenceForCase(selectedCase.id)
    } catch (err) {
      setUploadError(err?.response?.data?.detail || 'Failed to upload evidence file.')
    } finally {
      setUploadingFile(false)
    }
  }

  // Handle Delete Digital Evidence File
  const handleDeleteDigitalEvidence = async (evidenceId) => {
    if (!window.confirm('Are you sure you want to delete this digital evidence record?')) return
    try {
      await api.delete(`/api/digital-evidence/${evidenceId}`)
      await fetchDigitalEvidenceForCase(selectedCase.id)
    } catch (err) {
      alert(err?.response?.data?.detail || 'Failed to delete digital evidence.')
    }
  }

  // Submit New Case
  const handleCreateCaseSubmit = async (e) => {
    e.preventDefault()
    setCaseFormError('')
    setCaseFormLoading(true)

    try {
      const payload = {
        title: newCase.title,
        description: newCase.description,
        incident_id: parseInt(newCase.incident_id),
        assigned_officer_id: parseInt(newCase.assigned_officer_id || (currentUser ? currentUser.id : 1)),
        status: newCase.status || 'Open'
      }

      await api.post('/api/cases', payload)
      setShowNewCaseModal(false)
      setNewCase({
        title: '',
        description: '',
        incident_id: incidents[0]?.id || '',
        assigned_officer_id: currentUser ? currentUser.id : '',
        status: 'Open'
      })
      await fetchCases()
    } catch (err) {
      setCaseFormError(err?.response?.data?.detail || 'Failed to create case.')
    } finally {
      setCaseFormLoading(false)
    }
  }

  // Update Case Status via PATCH
  const handleUpdateCaseStatus = async (newStatus) => {
    if (!selectedCase) return
    setUpdatingCaseStatus(true)
    try {
      const res = await api.patch(`/api/cases/${selectedCase.id}`, { status: newStatus })
      setSelectedCase(res.data)
      setCases(prevCases => prevCases.map(c => c.id === res.data.id ? res.data : c))
    } catch (err) {
      console.error('Failed to update case status', err)
    } finally {
      setUpdatingCaseStatus(false)
    }
  }

  // Submit Add Evidence
  const handleAddEvidenceSubmit = async (e) => {
    e.preventDefault()
    if (!selectedCase) return
    setEvidenceError('')
    setEvidenceLoading(true)

    try {
      await api.post('/api/evidence', {
        case_id: selectedCase.id,
        description: newEvidence.description,
        evidence_type: newEvidence.evidence_type
      })

      setNewEvidence({ description: '', evidence_type: 'Physical' })
      await fetchEvidenceForCase(selectedCase.id)
    } catch (err) {
      setEvidenceError(err?.response?.data?.detail || 'Failed to add evidence.')
    } finally {
      setEvidenceLoading(false)
    }
  }

  // Filtered cases list
  const filteredCases = cases.filter(c => {
    const matchesStatus = statusFilter === 'All' || c.status === statusFilter
    const matchesSearch = searchQuery.trim() === '' ||
      c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.description.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesStatus && matchesSearch
  })

  // Counters
  const totalCount = cases.length
  const openCount = cases.filter(c => c.status === 'Open').length
  const investigatingCount = cases.filter(c => c.status === 'Under Investigation').length
  const closedCount = cases.filter(c => c.status === 'Closed').length

  return (
    <div className="flex flex-col h-full gap-4 overflow-hidden">
      {/* ═══════════ STATS & CONTROLS BAR ════════════════════════════ */}
      <div className="shrink-0 grid grid-cols-1 md:grid-cols-4 gap-3">
        {/* Total Cases */}
        <div className="glass rounded-xl p-3.5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
               style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)' }}>
            <Briefcase size={20} className="text-blue-400" />
          </div>
          <div>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Total Cases</p>
            <p className="text-lg font-bold text-white leading-none mt-0.5">{totalCount}</p>
          </div>
        </div>

        {/* Open Cases */}
        <div className="glass rounded-xl p-3.5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
               style={{ background: 'rgba(248,113,113,0.15)', border: '1px solid rgba(248,113,113,0.3)' }}>
            <Folder size={20} className="text-red-400" />
          </div>
          <div>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Open</p>
            <p className="text-lg font-bold text-red-400 leading-none mt-0.5">{openCount}</p>
          </div>
        </div>

        {/* Under Investigation */}
        <div className="glass rounded-xl p-3.5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
               style={{ background: 'rgba(251,146,60,0.15)', border: '1px solid rgba(251,146,60,0.3)' }}>
            <Layers size={20} className="text-amber-400" />
          </div>
          <div>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Under Investigation</p>
            <p className="text-lg font-bold text-amber-400 leading-none mt-0.5">{investigatingCount}</p>
          </div>
        </div>

        {/* Closed */}
        <div className="glass rounded-xl p-3.5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
               style={{ background: 'rgba(74,222,128,0.15)', border: '1px solid rgba(74,222,128,0.3)' }}>
            <CheckCircle2 size={20} className="text-green-400" />
          </div>
          <div>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Closed</p>
            <p className="text-lg font-bold text-green-400 leading-none mt-0.5">{closedCount}</p>
          </div>
        </div>
      </div>

      {/* ═══════════ MAIN CONTENT AREA ═══════════════════════════════ */}
      <div className="flex-1 glass rounded-xl p-4 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3 flex-1 min-w-[240px]">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Search cases by title or description..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-lg text-xs text-white placeholder-slate-500 outline-none"
                style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(51,65,85,0.7)' }}
              />
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-1.5 bg-slate-900/60 p-1 rounded-lg border border-slate-800">
              <Filter size={12} className="text-slate-500 ml-1.5" />
              {['All', 'Open', 'Under Investigation', 'Closed'].map(st => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className="px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all"
                  style={{
                    background: statusFilter === st ? 'rgba(59,130,246,0.25)' : 'transparent',
                    color: statusFilter === st ? '#60a5fa' : '#64748b',
                    border: statusFilter === st ? '1px solid rgba(59,130,246,0.4)' : '1px solid transparent'
                  }}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={fetchCases}
              title="Refresh Cases"
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all border border-slate-800"
            >
              <RefreshCw size={14} className={fetching ? 'animate-spin-slow' : ''} />
            </button>

            <button
              onClick={() => {
                setNewCase({
                  title: '',
                  description: '',
                  incident_id: incidents[0]?.id || '',
                  assigned_officer_id: currentUser ? currentUser.id : '',
                  status: 'Open'
                })
                setShowNewCaseModal(true)
              }}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold text-white transition-all"
              style={{
                background: 'linear-gradient(135deg, #1d4ed8, #3b82f6)',
                boxShadow: '0 4px 16px rgba(59,130,246,0.3)'
              }}
            >
              <Plus size={14} />
              <span>New Case</span>
            </button>
          </div>
        </div>

        {/* Case List Grid */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-3 chat-scroll">
          {filteredCases.length === 0 && !fetching && (
            <div className="flex flex-col items-center justify-center h-48 text-center">
              <Briefcase size={36} className="text-slate-600 mb-2" />
              <p className="text-sm font-semibold text-slate-400">No cases found</p>
              <p className="text-xs text-slate-600 mt-1">Try adjusting search or status filters, or create a new case.</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredCases.map(c => {
              const statusCfg = CASE_STATUS_COLORS[c.status] || CASE_STATUS_COLORS['Open']
              return (
                <div
                  key={c.id}
                  onClick={() => handleOpenCaseDetail(c)}
                  className="glass rounded-xl p-4 cursor-pointer transition-all hover:scale-[1.01] hover:border-blue-500/50 flex flex-col justify-between group"
                  style={{ border: '1px solid rgba(51,65,85,0.5)' }}
                >
                  <div>
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="text-sm font-semibold text-white group-hover:text-blue-400 transition-colors line-clamp-1">
                        {c.title}
                      </h3>
                      <span
                        className="shrink-0 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider"
                        style={{
                          color: statusCfg.text,
                          background: statusCfg.bg,
                          border: `1px solid ${statusCfg.border}`
                        }}
                      >
                        {c.status}
                      </span>
                    </div>

                    <p className="text-xs text-slate-400 line-clamp-2 mb-3">
                      {c.description}
                    </p>
                  </div>

                  {/* Metadata Footer */}
                  <div className="pt-3 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-500">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1" title="Incident Reference">
                        <Tag size={11} className="text-blue-400" />
                        <span>Inc #{c.incident_id}</span>
                      </span>
                      <span className="flex items-center gap-1" title="Assigned Officer ID">
                        <UserIcon size={11} className="text-purple-400" />
                        <span>Officer #{c.assigned_officer_id}</span>
                      </span>
                    </div>

                    <ChevronRight size={13} className="text-slate-600 group-hover:text-blue-400 transition-colors" />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ═══════════ NEW CASE MODAL ═══════════════════════════════════ */}
      {showNewCaseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div
            className="w-full max-w-lg glass rounded-2xl p-6 shadow-2xl animate-slide-in relative"
            style={{ border: '1px solid rgba(59,130,246,0.3)' }}
          >
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-blue-500/20 text-blue-400">
                  <Briefcase size={16} />
                </div>
                <h2 className="text-base font-bold text-white">Create New Case</h2>
              </div>
              <button
                onClick={() => setShowNewCaseModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateCaseSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wider">
                  Case Title
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Investigation into Central Bank Robbery"
                  value={newCase.title}
                  onChange={e => setNewCase({ ...newCase, title: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg text-sm text-white placeholder-slate-600 outline-none"
                  style={{ background: 'rgba(15,23,42,0.9)', border: '1px solid rgba(51,65,85,0.7)' }}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wider">
                  Description
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="Provide comprehensive background and objective of case..."
                  value={newCase.description}
                  onChange={e => setNewCase({ ...newCase, description: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg text-sm text-white placeholder-slate-600 outline-none resize-none"
                  style={{ background: 'rgba(15,23,42,0.9)', border: '1px solid rgba(51,65,85,0.7)' }}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wider">
                    Linked Incident
                  </label>
                  <select
                    value={newCase.incident_id}
                    onChange={e => setNewCase({ ...newCase, incident_id: e.target.value })}
                    required
                    className="w-full px-3 py-2 rounded-lg text-sm text-white outline-none"
                    style={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(51,65,85,0.7)' }}
                  >
                    {incidents.length === 0 ? (
                      <option value="">No incidents available</option>
                    ) : (
                      incidents.map(inc => (
                        <option key={inc.id} value={inc.id}>
                          #{inc.id} - {inc.title} ({inc.district})
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wider">
                    Assigned Officer ID
                  </label>
                  <input
                    type="number"
                    required
                    placeholder="Officer User ID"
                    value={newCase.assigned_officer_id}
                    onChange={e => setNewCase({ ...newCase, assigned_officer_id: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg text-sm text-white placeholder-slate-600 outline-none"
                    style={{ background: 'rgba(15,23,42,0.9)', border: '1px solid rgba(51,65,85,0.7)' }}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wider">
                  Initial Status
                </label>
                <select
                  value={newCase.status}
                  onChange={e => setNewCase({ ...newCase, status: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg text-sm text-white outline-none"
                  style={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(51,65,85,0.7)' }}
                >
                  <option value="Open">Open</option>
                  <option value="Under Investigation">Under Investigation</option>
                  <option value="Closed">Closed</option>
                </select>
              </div>

              {caseFormError && (
                <div className="p-2.5 rounded-lg text-xs text-red-400 bg-red-500/10 border border-red-500/20 flex items-center gap-2">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{caseFormError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewCaseModal(false)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-400 hover:text-white transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={caseFormLoading}
                  className="px-5 py-2 rounded-lg text-xs font-semibold text-white transition-all disabled:opacity-50"
                  style={{
                    background: 'linear-gradient(135deg,#1d4ed8,#3b82f6)',
                    boxShadow: '0 4px 16px rgba(59,130,246,0.3)'
                  }}
                >
                  {caseFormLoading ? 'Creating...' : 'Create Case'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══════════ CASE DETAIL & EVIDENCE MODAL ════════════════════ */}
      {selectedCase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div
            className="w-full max-w-3xl glass rounded-2xl p-6 shadow-2xl animate-slide-in relative max-h-[90vh] flex flex-col overflow-hidden"
            style={{ border: '1px solid rgba(59,130,246,0.3)' }}
          >
            {/* Header */}
            <div className="shrink-0 flex items-start justify-between pb-4 mb-4 border-b border-slate-800">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mono text-blue-400 font-bold uppercase tracking-wider">
                    Case #{selectedCase.id}
                  </span>
                  <span className="text-slate-600">•</span>
                  <span className="text-xs text-slate-500">
                    Created {new Date(selectedCase.created_at || Date.now()).toLocaleDateString()}
                  </span>
                </div>
                <h2 className="text-lg font-bold text-white">{selectedCase.title}</h2>
              </div>

              <div className="flex items-center gap-3">
                {/* Status Dropdown */}
                <div className="flex items-center gap-2 bg-slate-900/90 px-3 py-1.5 rounded-xl border border-slate-800">
                  <label className="text-[11px] font-semibold text-slate-400 uppercase">Status:</label>
                  <select
                    value={selectedCase.status}
                    disabled={updatingCaseStatus}
                    onChange={e => handleUpdateCaseStatus(e.target.value)}
                    className="bg-transparent text-xs font-bold outline-none cursor-pointer"
                    style={{
                      color: CASE_STATUS_COLORS[selectedCase.status]?.text || '#60a5fa'
                    }}
                  >
                    <option value="Open" className="bg-slate-900 text-red-400">Open</option>
                    <option value="Under Investigation" className="bg-slate-900 text-amber-400">Under Investigation</option>
                    <option value="Closed" className="bg-slate-900 text-green-400">Closed</option>
                  </select>
                </div>

                <button
                  onClick={() => setSelectedCase(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Modal Scrollable Body */}
            <div className="flex-1 overflow-y-auto space-y-6 pr-1 chat-scroll">
              {/* Case Description */}
              <div className="glass rounded-xl p-4 bg-slate-900/40 border border-slate-800">
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Description</h4>
                <p className="text-xs text-slate-300 leading-relaxed">{selectedCase.description}</p>
                
                <div className="mt-4 pt-3 border-t border-slate-800/80 grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-slate-500">Linked Incident ID:</span>
                    <span className="ml-2 font-mono font-semibold text-blue-400">#{selectedCase.incident_id}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Assigned Officer ID:</span>
                    <span className="ml-2 font-mono font-semibold text-purple-400">#{selectedCase.assigned_officer_id}</span>
                  </div>
                </div>
              </div>

              {/* Evidence Section */}
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <div className="flex items-center gap-2">
                    <Paperclip size={16} className="text-blue-400" />
                    <h3 className="text-sm font-bold text-white">Evidence Collection</h3>
                  </div>

                  {/* Sub-tabs for Textual vs Digital Files */}
                  <div className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-lg border border-slate-800">
                    <button
                      type="button"
                      onClick={() => setActiveEvidenceTab('textual')}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all"
                      style={{
                        background: activeEvidenceTab === 'textual' ? 'rgba(59,130,246,0.25)' : 'transparent',
                        color: activeEvidenceTab === 'textual' ? '#60a5fa' : '#64748b',
                        border: activeEvidenceTab === 'textual' ? '1px solid rgba(59,130,246,0.4)' : '1px solid transparent'
                      }}
                    >
                      <FileText size={12} />
                      <span>Text Logs ({evidenceList.length})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveEvidenceTab('digital')}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all"
                      style={{
                        background: activeEvidenceTab === 'digital' ? 'rgba(59,130,246,0.25)' : 'transparent',
                        color: activeEvidenceTab === 'digital' ? '#60a5fa' : '#64748b',
                        border: activeEvidenceTab === 'digital' ? '1px solid rgba(59,130,246,0.4)' : '1px solid transparent'
                      }}
                    >
                      <Upload size={12} />
                      <span>Digital Files ({digitalEvidenceList.length})</span>
                    </button>
                  </div>
                </div>

                {/* ── TAB 1: TEXT LOGGED EVIDENCE ───────────────────────────── */}
                {activeEvidenceTab === 'textual' && (
                  <div className="space-y-4 animate-fade-in">
                    <div className="space-y-2">
                      {fetchingEvidence && (
                        <div className="p-4 text-center text-xs text-slate-500">Loading evidence items...</div>
                      )}

                      {!fetchingEvidence && evidenceList.length === 0 && (
                        <div className="glass rounded-xl p-4 text-center text-xs text-slate-500">
                          No textual evidence logged for this case yet. Add a record below.
                        </div>
                      )}

                      {evidenceList.map(ev => {
                        const badgeCfg = EVIDENCE_TYPE_BADGES[ev.evidence_type] || EVIDENCE_TYPE_BADGES['Physical']
                        return (
                          <div
                            key={ev.id}
                            className="glass rounded-xl p-3 flex flex-col md:flex-row md:items-center justify-between gap-3 border border-slate-800"
                          >
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span
                                  className="text-[10px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider"
                                  style={{ color: badgeCfg.text, background: badgeCfg.bg }}
                                >
                                  {ev.evidence_type}
                                </span>
                                <span className="text-[10px] text-slate-500">
                                  Collected {new Date(ev.collected_at || Date.now()).toLocaleString()}
                                </span>
                              </div>
                              <p className="text-xs text-white">{ev.description}</p>
                            </div>

                            <div className="shrink-0 text-right text-[11px] text-slate-500">
                              <span>Officer #{ev.collected_by}</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Add Evidence Mini-Form */}
                    <div className="glass rounded-xl p-4 bg-slate-900/60 border border-slate-800">
                      <h4 className="text-xs font-bold text-white mb-3 flex items-center gap-2">
                        <Plus size={14} className="text-blue-400" /> Log Text Evidence Record
                      </h4>

                      <form onSubmit={handleAddEvidenceSubmit} className="space-y-3">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-400 mb-1 uppercase">
                            Evidence Description
                          </label>
                          <textarea
                            required
                            rows={2}
                            placeholder="Detailed description of evidence item (e.g. fingerprint sample, recovered physical tool)..."
                            value={newEvidence.description}
                            onChange={e => setNewEvidence({ ...newEvidence, description: e.target.value })}
                            className="w-full px-3 py-2 rounded-lg text-xs text-white placeholder-slate-600 outline-none resize-none"
                            style={{ background: 'rgba(15,23,42,0.9)', border: '1px solid rgba(51,65,85,0.7)' }}
                          />
                        </div>

                        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
                          <div className="w-full md:w-1/2">
                            <label className="block text-[11px] font-semibold text-slate-400 mb-1 uppercase">
                              Evidence Type
                            </label>
                            <select
                              value={newEvidence.evidence_type}
                              onChange={e => setNewEvidence({ ...newEvidence, evidence_type: e.target.value })}
                              className="w-full px-3 py-1.5 rounded-lg text-xs text-white outline-none"
                              style={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(51,65,85,0.7)' }}
                            >
                              <option value="Physical">Physical</option>
                              <option value="Digital">Digital</option>
                              <option value="Testimonial">Testimonial</option>
                              <option value="Document">Document</option>
                            </select>
                          </div>

                          <button
                            type="submit"
                            disabled={evidenceLoading}
                            className="w-full md:w-auto px-5 py-2 rounded-lg text-xs font-semibold text-white transition-all disabled:opacity-50 self-end"
                            style={{
                              background: 'linear-gradient(135deg, #1d4ed8, #3b82f6)',
                              boxShadow: '0 4px 16px rgba(59,130,246,0.3)'
                            }}
                          >
                            {evidenceLoading ? 'Submitting...' : 'Add Record'}
                          </button>
                        </div>

                        {evidenceError && (
                          <p className="text-xs text-red-400 mt-2">{evidenceError}</p>
                        )}
                      </form>
                    </div>
                  </div>
                )}

                {/* ── TAB 2: DIGITAL FILES & SHA-256 UPLOAD ───────────────────── */}
                {activeEvidenceTab === 'digital' && (
                  <div className="space-y-4 animate-fade-in">
                    {/* File Upload Box */}
                    <div className="glass rounded-xl p-4 bg-slate-900/70 border border-blue-500/30">
                      <h4 className="text-xs font-bold text-white mb-3 flex items-center gap-2">
                        <Upload size={14} className="text-blue-400" /> Upload Digital Evidence File (SHA-256 Hashed)
                      </h4>

                      <form onSubmit={handleFileUploadSubmit} className="space-y-3">
                        {/* File Selector */}
                        <div className="p-3 rounded-xl border border-dashed border-slate-700 bg-slate-950/50 flex flex-col items-center justify-center text-center">
                          <input
                            type="file"
                            id="digital-evidence-input"
                            required
                            onChange={e => setUploadFile(e.target.files[0] || null)}
                            className="hidden"
                          />
                          <label
                            htmlFor="digital-evidence-input"
                            className="cursor-pointer flex flex-col items-center gap-1.5"
                          >
                            <Upload size={24} className="text-blue-400 animate-bounce" />
                            <span className="text-xs font-semibold text-blue-400">
                              {uploadFile ? uploadFile.name : 'Click to select evidence file'}
                            </span>
                            <span className="text-[10px] text-slate-500">
                              {uploadFile
                                ? `${formatBytes(uploadFile.size)} • ${uploadFile.type || 'Unknown Type'}`
                                : 'Supports Photos, Videos, Audio, PDFs & Documents (Max 100 MB)'}
                            </span>
                          </label>
                        </div>

                        {/* File Description */}
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-400 mb-1 uppercase">
                            File Notes / Description
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. CCTV clip showing suspect vehicle, crime scene photo..."
                            value={uploadDescription}
                            onChange={e => setUploadDescription(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg text-xs text-white placeholder-slate-600 outline-none"
                            style={{ background: 'rgba(15,23,42,0.9)', border: '1px solid rgba(51,65,85,0.7)' }}
                          />
                        </div>

                        {/* Sensitive Checkbox & Submit */}
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
                          <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                            <input
                              type="checkbox"
                              checked={isSensitiveFile}
                              onChange={e => setIsSensitiveFile(e.target.checked)}
                              className="rounded border-slate-700 bg-slate-900 text-blue-500 focus:ring-0"
                            />
                            <ShieldAlert size={14} className="text-amber-400" />
                            <span>Mark as Sensitive / Restricted Access</span>
                          </label>

                          <button
                            type="submit"
                            disabled={uploadingFile || !uploadFile}
                            className="w-full sm:w-auto px-5 py-2 rounded-lg text-xs font-semibold text-white transition-all disabled:opacity-50"
                            style={{
                              background: 'linear-gradient(135deg, #1d4ed8, #3b82f6)',
                              boxShadow: '0 4px 16px rgba(59,130,246,0.3)'
                            }}
                          >
                            {uploadingFile ? 'Hashing & Uploading...' : 'Upload & Compute Hash'}
                          </button>
                        </div>

                        {uploadError && (
                          <div className="p-2.5 rounded-lg text-xs text-red-400 bg-red-500/10 border border-red-500/20 flex items-center gap-2">
                            <AlertCircle size={14} className="shrink-0" />
                            <span>{uploadError}</span>
                          </div>
                        )}

                        {uploadSuccess && (
                          <div className="p-2.5 rounded-lg text-xs text-green-400 bg-green-500/10 border border-green-500/20 flex items-center gap-2">
                            <Check size={14} className="shrink-0" />
                            <span className="font-mono text-[11px] break-all">{uploadSuccess}</span>
                          </div>
                        )}
                      </form>
                    </div>

                    {/* Uploaded Digital Files List */}
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                        Uploaded Digital Media ({digitalEvidenceList.length})
                      </h4>

                      {fetchingDigitalEvidence && (
                        <div className="p-4 text-center text-xs text-slate-500">Loading digital evidence files...</div>
                      )}

                      {!fetchingDigitalEvidence && digitalEvidenceList.length === 0 && (
                        <div className="glass rounded-xl p-4 text-center text-xs text-slate-500">
                          No digital evidence files uploaded for this case yet. Use the upload box above.
                        </div>
                      )}

                      {digitalEvidenceList.map(item => (
                        <div
                          key={item.id}
                          className="glass rounded-xl p-3 flex flex-col md:flex-row md:items-center justify-between gap-3 border border-slate-800"
                        >
                          <div className="flex-1 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <FileCode size={14} className="text-blue-400" />
                              <span className="text-xs font-bold text-white font-mono">{item.original_filename}</span>
                              <span className="text-[10px] px-2 py-0.5 rounded-md font-bold bg-blue-500/20 text-blue-400">
                                {item.category}
                              </span>
                              <span className="text-[10px] px-2 py-0.5 rounded-md font-mono bg-slate-800 text-slate-300">
                                {formatBytes(item.file_size_bytes)}
                              </span>
                              {item.is_sensitive && (
                                <span className="text-[10px] px-2 py-0.5 rounded-md font-bold bg-amber-500/20 text-amber-400 flex items-center gap-1">
                                  <ShieldAlert size={10} /> Sensitive
                                </span>
                              )}
                            </div>

                            {item.description && (
                              <p className="text-xs text-slate-300">{item.description}</p>
                            )}

                            {item.hash_sha256 && (
                              <div className="flex items-center gap-1 text-[10px] font-mono text-slate-500 bg-slate-950/60 px-2 py-1 rounded border border-slate-900 w-fit max-w-full overflow-hidden text-ellipsis">
                                <Hash size={10} className="text-blue-400 shrink-0" />
                                <span className="truncate">SHA-256: {item.hash_sha256}</span>
                              </div>
                            )}
                          </div>

                          <div className="shrink-0 flex items-center justify-end gap-3 text-[11px] text-slate-500">
                            <span>Uploaded {new Date(item.uploaded_at || Date.now()).toLocaleDateString()}</span>
                            <button
                              onClick={() => handleDeleteDigitalEvidence(item.id)}
                              title="Delete file"
                              className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10 transition-all border border-red-500/20"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

