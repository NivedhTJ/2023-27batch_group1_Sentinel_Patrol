import { useState, useRef, useEffect } from 'react'
import { Bot, User, Send, RefreshCw, Database, AlertCircle, Sparkles, FileText, Cpu, TrendingUp } from 'lucide-react'
import api from '../api'

function ChatMessage({ msg }) {
  const isUser = msg.role === 'user'

  if (isUser) {
    return (
      <div className="flex justify-end gap-2.5 animate-slide-in">
        <div className="max-w-[70%] px-4 py-2.5 rounded-2xl rounded-tr-sm text-sm leading-relaxed"
             style={{
               background: 'linear-gradient(135deg, #1d4ed8, #3b82f6)',
               color: 'white',
               boxShadow: '0 4px 16px rgba(59,130,246,0.3)',
             }}>
          {msg.content}
        </div>
        <div className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
             style={{ background: 'rgba(59,130,246,0.2)', border: '1px solid rgba(59,130,246,0.3)' }}>
          <User size={14} className="text-blue-400" />
        </div>
      </div>
    )
  }

  if (msg.role === 'loading') {
    return (
      <div className="flex gap-2.5 animate-fade-in">
        <div className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
             style={{ background: 'linear-gradient(135deg,#1e3a5f,#1d4ed8)', border: '1px solid rgba(59,130,246,0.3)' }}>
          <Bot size={14} className="text-blue-300" />
        </div>
        <div className="px-4 py-3 rounded-2xl rounded-tl-sm glass">
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <span className="w-4 h-4 rounded-full border-2 border-blue-400/30 border-t-blue-400 animate-spin" />
            <span>Querying AI & scanning vector index…</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-2.5 animate-slide-in">
      <div className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
           style={{ background: 'linear-gradient(135deg,#1e3a5f,#1d4ed8)', border: '1px solid rgba(59,130,246,0.3)' }}>
        <Bot size={14} className="text-blue-300" />
      </div>
      <div className="flex-1 space-y-3">
        {/* Answer bubble */}
        <div className="px-4 py-3 rounded-2xl rounded-tl-sm"
             style={{ background: 'rgba(30,41,59,0.8)', border: '1px solid rgba(51,65,85,0.6)' }}>
          <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">{msg.content}</p>
        </div>

        {/* Source incidents */}
        {msg.sources && msg.sources.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-widest text-slate-600 font-semibold flex items-center gap-1.5">
              <FileText size={9} /> Retrieved Sources
            </p>
            {msg.sources.map((src, i) => (
              <div key={i}
                   className="px-3 py-2 rounded-xl text-xs flex items-start gap-2.5 animate-fade-in"
                   style={{
                     background: 'rgba(15,23,42,0.7)',
                     border: '1px solid rgba(51,65,85,0.5)',
                     animationDelay: `${i * 80}ms`,
                   }}>
                <span className="shrink-0 w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold"
                      style={{ background: 'rgba(59,130,246,0.2)', color: '#60a5fa' }}>
                  {i + 1}
                </span>
                <div>
                  <p className="font-semibold text-slate-300">{src.title || 'Incident'}</p>
                  {src.district && <p className="text-slate-500 mt-0.5">📍 {src.district}</p>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ML Prediction SHAP breakdown card */}
        {msg.isPrediction && msg.prediction && (
          <div className="rounded-xl overflow-hidden animate-fade-in"
               style={{ border: '1px solid rgba(59,130,246,0.3)', background: 'rgba(10,15,30,0.9)' }}>
            {/* Risk header */}
            <div className="flex items-center justify-between px-3 py-2"
                 style={{
                   borderBottom: '1px solid rgba(51,65,85,0.4)',
                   background: 'rgba(29,78,216,0.15)',
                 }}>
              <div className="flex items-center gap-2">
                <TrendingUp size={12} className="text-blue-400" />
                <span className="text-[10px] font-bold text-blue-300 tracking-widest uppercase">SHAP Risk Factors</span>
              </div>
              <span className="text-[10px] font-mono text-slate-500">
                {msg.prediction.district}
              </span>
            </div>
            {/* SHAP effects table */}
            <div className="p-3 space-y-1.5">
              {msg.prediction.shap_effects?.map((f, i) => {
                const barW = Math.min(Math.abs(f.shap_effect) * 400, 100)
                const isPos = f.direction === 'increases_risk'
                return (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-32 shrink-0 text-[9px] font-mono text-slate-500 truncate">
                      {f.feature.replace(/_/g, ' ')}
                    </span>
                    <div className="flex-1 h-1.5 rounded-full overflow-hidden"
                         style={{ background: 'rgba(51,65,85,0.3)' }}>
                      <div className="h-full rounded-full transition-all"
                           style={{
                             width: `${barW}%`,
                             background: isPos
                               ? 'linear-gradient(90deg,#f87171,#ef4444)'
                               : 'linear-gradient(90deg,#34d399,#10b981)',
                           }} />
                    </div>
                    <span className="w-14 shrink-0 text-right text-[9px] font-mono"
                          style={{ color: isPos ? '#f87171' : '#34d399' }}>
                      {f.shap_effect > 0 ? '+' : ''}{f.shap_effect.toFixed(3)}
                    </span>
                    <span className="w-20 shrink-0 text-[8px] text-slate-600 truncate">{f.value}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function AIAssistant() {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: 'Hello, Officer. I\'m Sentinel AI — your intelligence assistant. Ask me anything about logged incidents, patrol patterns, district activity, or any security queries. I\'ll retrieve the most relevant data from our vector database.',
      sources: [],
    }
  ])
  const [input, setInput]     = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const [error, setError]     = useState('')
  const bottomRef             = useRef(null)
  const lastPredictionRef     = useRef(null)  // tracks latest /predict result for /explain

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async () => {
    const question = input.trim()
    if (!question) return
    setInput('')
    setError('')

    setMessages(prev => [...prev, { role: 'user', content: question }])
    setMessages(prev => [...prev, { role: 'loading', content: '' }])

    // Slash command detection: route /predict, /explain, /help to /api/ai/command
    const isSlashCommand = question.startsWith('/') || /^(predict|explain|help)\b/i.test(question)

    if (isSlashCommand) {
      try {
        const res = await api.post('/api/ai/command', {
          command: question,
          last_prediction: lastPredictionRef.current,
        })
        const { type, briefing, prediction } = res.data

        // Save the latest prediction for future /explain calls
        if (type === 'prediction' && prediction) {
          lastPredictionRef.current = prediction
        }

        setMessages(prev => {
          const copy = [...prev]
          copy[copy.length - 1] = {
            role: 'assistant',
            content: briefing || 'No response generated.',
            sources: [],
            isPrediction: (type === 'prediction' || type === 'explanation') && !!prediction,
            prediction: prediction || null,
          }
          return copy
        })
      } catch (err) {
        const detail = err?.response?.data?.detail || 'ML command failed. Ensure the backend is running.'
        setMessages(prev => {
          const copy = [...prev]
          copy[copy.length - 1] = {
            role: 'assistant',
            content: `Error: ${detail}`,
            sources: [],
          }
          return copy
        })
        setError(detail)
      }
      return
    }

    // Standard Ollama RAG query
    try {
      const res = await api.post('/api/ai/query', { question })
      const { answer, retrieved_incidents } = res.data
      setMessages(prev => {
        const copy = [...prev]
        copy[copy.length - 1] = {
          role: 'assistant',
          content: answer || 'No answer generated.',
          sources: retrieved_incidents || [],
        }
        return copy
      })
    } catch (err) {
      const detail = err?.response?.data?.detail || 'AI query failed. Ensure the backend and Ollama are running.'
      setMessages(prev => {
        const copy = [...prev]
        copy[copy.length - 1] = {
          role: 'assistant',
          content: `⚠️ Error: ${detail}`,
          sources: [],
        }
        return copy
      })
      setError(detail)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  const syncIndex = async () => {
    setSyncing(true); setSyncMsg(''); setError('')
    try {
      const res = await api.post('/api/ai/sync-index')
      setSyncMsg(res.data?.message || 'Vector index synced successfully!')
      setTimeout(() => setSyncMsg(''), 4000)
    } catch (err) {
      const detail = err?.response?.data?.detail || 'Sync failed.'
      setError(detail)
    } finally {
      setSyncing(false)
    }
  }

  const isLoading = messages[messages.length - 1]?.role === 'loading'

  return (
    <div className="flex flex-col h-full gap-4">

      {/* Header */}
      <div className="glass rounded-xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center"
               style={{ background: 'linear-gradient(135deg,#1e3a5f,#1d4ed8)' }}>
            <Sparkles size={16} className="text-blue-300" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white">Sentinel AI Assistant</h2>
            <p className="text-xs text-slate-500">RAG · ChromaDB · Ollama LLM · XGBoost SHAP ML</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {syncMsg && (
            <span className="text-xs text-green-400 animate-fade-in px-2 py-1 rounded-lg"
                  style={{ background: 'rgba(74,222,128,0.1)' }}>
              ✓ {syncMsg}
            </span>
          )}
          {error && (
            <span className="text-xs text-red-400 flex items-center gap-1 px-2 py-1 rounded-lg animate-fade-in"
                  style={{ background: 'rgba(239,68,68,0.1)' }}>
              <AlertCircle size={11} /> {error}
            </span>
          )}
          <button
            id="sync-index-btn"
            onClick={syncIndex}
            disabled={syncing}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all disabled:opacity-50"
            style={{
              background: 'rgba(59,130,246,0.15)',
              border: '1px solid rgba(59,130,246,0.3)',
              color: '#60a5fa',
            }}
          >
            <Database size={12} className={syncing ? 'animate-spin-slow' : ''} />
            {syncing ? 'Syncing…' : 'Sync AI Index'}
          </button>
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto chat-scroll glass rounded-xl p-4 space-y-4">
        {messages.map((msg, i) => <ChatMessage key={i} msg={msg} />)}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="glass rounded-xl p-3 flex items-end gap-3">
        <textarea
          id="ai-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about incidents… or type /predict Ernakulam, /explain, /help"
          rows={2}
          disabled={isLoading}
          className="flex-1 resize-none text-sm text-white placeholder-slate-600 outline-none bg-transparent leading-relaxed disabled:opacity-50"
        />
        <button
          id="ai-send-btn"
          onClick={sendMessage}
          disabled={!input.trim() || isLoading}
          className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all disabled:opacity-30"
          style={{
            background: (!input.trim() || isLoading) ? 'rgba(51,65,85,0.5)' : 'linear-gradient(135deg,#1d4ed8,#3b82f6)',
            boxShadow: (!input.trim() || isLoading) ? 'none' : '0 4px 16px rgba(59,130,246,0.4)',
          }}
        >
          <Send size={16} className="text-white" />
        </button>
      </div>

      {/* Footer hint */}
      <p className="text-center text-[10px] text-slate-700 pb-1">
        Shift+Enter for new line · <span className="text-blue-800">ML commands: /predict &lt;district&gt; · /explain · /help</span>
      </p>
    </div>
  )
}
