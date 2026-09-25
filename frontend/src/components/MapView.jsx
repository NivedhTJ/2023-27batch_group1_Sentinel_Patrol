import { useEffect, useRef, useCallback, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import { MapPin, Plus, X, AlertTriangle, RefreshCw, Crosshair, Shield, Radio,
         ChevronDown, ChevronUp, Play, Square, Wifi, WifiOff, Flame, Layers, Map } from 'lucide-react'
import api from '../api'
import { usePatrolWebSocket } from './usePatrolWebSocket'

// ── Kerala districts ──────────────────────────────────────────
const DISTRICTS = [
  'Thiruvananthapuram','Kollam','Pathanamthitta','Alappuzha',
  'Kottayam','Idukki','Ernakulam','Thrissur',
  'Palakkad','Malappuram','Kozhikode','Wayanad',
  'Kannur','Kasaragod',
]

// ── Leaflet custom icons ───────────────────────────────────────
const makeIcon = (color) => L.divIcon({
  className: '',
  html: `
    <div style="position:relative;width:32px;height:40px;">
      <div style="
        position:absolute;inset:0;
        width:32px;height:32px;border-radius:50% 50% 50% 0;
        transform:rotate(-45deg);
        background:${color};
        box-shadow:0 4px 16px ${color}88;
        border:2px solid rgba(255,255,255,0.3);
      "></div>
      <div style="
        position:absolute;top:7px;left:7px;
        width:18px;height:18px;border-radius:50%;
        background:rgba(255,255,255,0.2);
        display:flex;align-items:center;justify-content:center;
      ">
        <div style="width:8px;height:8px;border-radius:50%;background:white;"></div>
      </div>
    </div>`,
  iconSize: [32, 40],
  iconAnchor: [16, 40],
  popupAnchor: [0, -44],
})

// ── Patrol officer DivIcon – blue shield shape ─────────────────
const patrolIcon = L.divIcon({
  className: '',
  html: `
    <div style="position:relative;width:36px;height:44px;filter:drop-shadow(0 4px 12px rgba(59,130,246,0.7));">
      <!-- Shield body -->
      <svg width="36" height="44" viewBox="0 0 36 44" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M18 2L4 8V20C4 29.4 10.4 38.2 18 41C25.6 38.2 32 29.4 32 20V8L18 2Z"
              fill="url(#sg)" stroke="rgba(147,197,253,0.6)" stroke-width="1.5"/>
        <defs>
          <linearGradient id="sg" x1="18" y1="2" x2="18" y2="41" gradientUnits="userSpaceOnUse">
            <stop stop-color="#3b82f6"/>
            <stop offset="1" stop-color="#1d4ed8"/>
          </linearGradient>
        </defs>
        <!-- Star badge -->
        <circle cx="18" cy="20" r="7" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.4)" stroke-width="1"/>
        <text x="18" y="24" text-anchor="middle" font-size="9" fill="white" font-weight="700" font-family="sans-serif">★</text>
      </svg>
      <!-- Pulse ring -->
      <div style="
        position:absolute;top:50%;left:50%;transform:translate(-50%,-60%);
        width:36px;height:36px;border-radius:50%;
        border:2px solid rgba(59,130,246,0.5);
        animation:ping 1.5s cubic-bezier(0,0,0.2,1) infinite;
      "></div>
    </div>
    <style>
      @keyframes ping{0%{transform:translate(-50%,-60%) scale(1);opacity:.8}100%{transform:translate(-50%,-60%) scale(1.8);opacity:0}}
    </style>`,
  iconSize: [36, 44],
  iconAnchor: [18, 44],
  popupAnchor: [0, -48],
})

const STATUS_COLORS = { Open: '#f87171', Investigating: '#fb923c', Closed: '#4ade80' }
const incidentIcon = (status) => makeIcon(STATUS_COLORS[status] || '#94a3b8')

// ── Heatmap canvas renderer (pure Leaflet, no extra dep) ────────
// Each hotspot = { lat, lng, intensity 0-1, radius px }
function HeatmapLayer({ hotspots }) {
  const map = useMap()
  const canvasRef = useRef(null)
  const overlayRef = useRef(null)

  useEffect(() => {
    if (!hotspots.length) return

    // Create a full-size canvas pane overlay
    const canvas = L.DomUtil.create('canvas')
    canvas.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;z-index:300;'
    canvasRef.current = canvas

    // Insert into Leaflet's overlay pane
    const pane = map.getPanes().overlayPane
    pane.appendChild(canvas)

    function draw() {
      const bounds = map.getBounds()
      const topLeft = map.latLngToContainerPoint(bounds.getNorthWest())
      const size    = map.getSize()

      canvas.width  = size.x
      canvas.height = size.y
      canvas.style.left = topLeft.x + 'px'
      canvas.style.top  = topLeft.y + 'px'

      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, size.x, size.y)

      // Composite mode so blobs blend naturally
      ctx.globalCompositeOperation = 'screen'

      hotspots.forEach(({ lat, lng, intensity, radius }) => {
        const pt = map.latLngToContainerPoint([lat, lng])
        const r  = radius || 60

        // Pick gradient stop colors by intensity
        // low (0.0-0.33) blue→cyan, mid (0.33-0.66) green→yellow, high (0.66-1.0) orange→red
        let innerColor, outerColor
        if (intensity < 0.33) {
          innerColor = `rgba(96,165,250,${0.55 + intensity})`   // blue-400
          outerColor = `rgba(34,211,238,0)`                      // cyan fade
        } else if (intensity < 0.66) {
          innerColor = `rgba(74,222,128,${0.5 + intensity * 0.4})`  // green-400
          outerColor = `rgba(250,204,21,0)`                         // yellow fade
        } else {
          innerColor = `rgba(248,113,113,${0.6 + intensity * 0.35})`  // red-400
          outerColor = `rgba(239,68,68,0)`
        }

        const grad = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, r)
        grad.addColorStop(0,   innerColor)
        grad.addColorStop(0.4, innerColor)
        grad.addColorStop(1,   outerColor)

        ctx.beginPath()
        ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2)
        ctx.fillStyle = grad
        ctx.fill()
      })
    }

    draw()
    map.on('zoomend moveend resize', draw)
    overlayRef.current = draw

    return () => {
      map.off('zoomend moveend resize', draw)
      if (canvasRef.current && pane.contains(canvasRef.current)) {
        pane.removeChild(canvasRef.current)
      }
    }
  }, [map, hotspots])

  return null
}

// ── Heatmap density legend ──────────────────────────────────────
function HeatmapLegend({ incidentCount }) {
  return (
    <div
      id="heatmap-legend"
      className="absolute bottom-16 left-3 z-[1000] rounded-2xl overflow-hidden animate-slide-in"
      style={{
        background: 'rgba(10,15,30,0.88)',
        backdropFilter: 'blur(14px)',
        border: '1px solid rgba(59,130,246,0.25)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.55)',
        minWidth: '192px',
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3.5 py-2.5 border-b"
           style={{ borderColor: 'rgba(51,65,85,0.6)' }}>
        <Flame size={13} className="text-red-400" />
        <span className="text-xs font-bold text-white tracking-wide">Crime Density Heatmap</span>
      </div>

      <div className="px-3.5 py-3 space-y-3">
        {/* Gradient bar */}
        <div>
          <div
            className="h-3 rounded-full"
            style={{
              background: 'linear-gradient(to right, #60a5fa, #4ade80, #facc15, #fb923c, #f87171)',
              boxShadow: '0 0 10px rgba(248,113,113,0.3)',
            }}
          />
          <div className="flex justify-between mt-1">
            <span className="text-[9px] font-mono text-blue-400 tracking-wide">LOW</span>
            <span className="text-[9px] font-mono text-green-400 tracking-wide">MED</span>
            <span className="text-[9px] font-mono text-red-400 tracking-wide">HIGH</span>
          </div>
        </div>

        {/* Density key swatches */}
        <div className="space-y-1.5">
          {[
            { color: '#60a5fa', label: 'Low Density',    sub: '1–2 incidents' },
            { color: '#4ade80', label: 'Medium Density', sub: '3–5 incidents' },
            { color: '#f87171', label: 'High Density',   sub: '6+ incidents'  },
          ].map(({ color, label, sub }) => (
            <div key={label} className="flex items-center gap-2.5">
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ background: color, boxShadow: `0 0 6px ${color}99` }}
              />
              <div>
                <p className="text-[10px] font-semibold leading-tight" style={{ color }}>{label}</p>
                <p className="text-[9px] text-slate-600 font-mono leading-tight">{sub}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Incident count badge */}
        <div className="flex items-center justify-between pt-1 border-t"
             style={{ borderColor: 'rgba(51,65,85,0.4)' }}>
          <span className="text-[9px] text-slate-600 font-mono uppercase tracking-wider">Total incidents</span>
          <span className="text-[10px] font-bold font-mono"
                style={{ color: '#60a5fa' }}>{incidentCount}</span>
        </div>
      </div>
    </div>
  )
}

// ── Map view mode toggle ────────────────────────────────────────
function MapModeToggle({ mode, onChange }) {
  return (
    <div
      id="map-mode-toggle"
      className="flex rounded-xl overflow-hidden"
      style={{
        background: 'rgba(10,15,30,0.88)',
        backdropFilter: 'blur(14px)',
        border: '1px solid rgba(51,65,85,0.5)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
      }}
    >
      {[
        { id: 'markers', label: 'Markers', Icon: Map   },
        { id: 'heatmap', label: 'Heatmap', Icon: Flame },
      ].map(({ id, label, Icon }) => {
        const active = mode === id
        return (
          <button
            key={id}
            id={`map-mode-${id}`}
            onClick={() => onChange(id)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold transition-all duration-200"
            style={{
              color: active ? 'white' : '#64748b',
              background: active
                ? id === 'heatmap'
                  ? 'linear-gradient(135deg,rgba(239,68,68,0.35),rgba(251,146,60,0.35))'
                  : 'linear-gradient(135deg,rgba(29,78,216,0.45),rgba(59,130,246,0.45))'
                : 'transparent',
              borderRight: id === 'markers' ? '1px solid rgba(51,65,85,0.5)' : 'none',
            }}
          >
            <Icon
              size={12}
              style={{ color: active ? (id === 'heatmap' ? '#fb923c' : '#60a5fa') : '#475569' }}
            />
            {label}
          </button>
        )
      })}
    </div>
  )
}

// ── Kochi patrol route waypoints (looping path) ────────────────
const KOCHI_PATROL_PATH = [
  [9.9312, 76.2673],  // MG Road, Kochi
  [9.9390, 76.2600],  // Ernakulam North
  [9.9517, 76.2701],  // Kaloor
  [9.9629, 76.2988],  // Edappally Junction
  [9.9748, 76.2801],  // Kakkanad
  [9.9550, 76.2970],  // Seaport-Airport Road
  [9.9440, 76.3100],  // InfoPark
  [9.9220, 76.3050],  // Thrikkakara
  [9.9100, 76.2900],  // Palarivattom
  [9.9200, 76.2750],  // Elamkulam
  [9.9312, 76.2673],  // back to start
]

// ── WS status badge ────────────────────────────────────────────
function WsStatusBadge({ status }) {
  const cfg = {
    connected:    { color: '#4ade80', label: 'WS LIVE',   Icon: Wifi },
    connecting:   { color: '#facc15', label: 'CONNECTING', Icon: Radio },
    disconnected: { color: '#94a3b8', label: 'OFFLINE',    Icon: WifiOff },
    error:        { color: '#f87171', label: 'WS ERROR',   Icon: WifiOff },
  }[status] ?? { color: '#94a3b8', label: status.toUpperCase(), Icon: WifiOff }

  return (
    <div className="flex items-center gap-1.5">
      <cfg.Icon size={10} style={{ color: cfg.color }} />
      <span className="font-mono text-[9px] tracking-widest" style={{ color: cfg.color }}>
        {cfg.label}
      </span>
    </div>
  )
}

// ── Patrol Simulation Control overlay ────────────────────────
function PatrolSimulator({ sendLocation, wsStatus }) {
  const [open, setOpen]         = useState(true)
  const [simulating, setSimulating] = useState(false)
  const [stepIdx, setStepIdx]   = useState(0)
  const [log, setLog]           = useState('')
  const intervalRef             = useRef(null)
  const stepRef                 = useRef(0)

  const startSim = () => {
    if (simulating) return
    setSimulating(true)
    stepRef.current = 0
    setStepIdx(0)
    setLog('Simulation started…')

    intervalRef.current = setInterval(() => {
      const idx  = stepRef.current % KOCHI_PATROL_PATH.length
      const [lat, lng] = KOCHI_PATROL_PATH[idx]
      sendLocation(lat, lng)
      setStepIdx(idx)
      setLog(`📍 Waypoint ${idx + 1}/${KOCHI_PATROL_PATH.length} — ${lat.toFixed(4)}, ${lng.toFixed(4)}`)
      stepRef.current += 1
    }, 3000)
  }

  const stopSim = () => {
    clearInterval(intervalRef.current)
    setSimulating(false)
    setLog('Simulation stopped.')
  }

  // Cleanup on unmount
  useEffect(() => () => clearInterval(intervalRef.current), [])

  return (
    <div
      id="patrol-sim-control"
      className="absolute top-3 right-3 z-[1000] w-72 rounded-2xl overflow-hidden"
      style={{
        background: 'rgba(15,23,42,0.92)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(59,130,246,0.3)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(59,130,246,0.1)',
      }}
    >
      {/* Header */}
      <button
        id="patrol-sim-toggle"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left transition-colors hover:bg-blue-500/10"
      >
        <div className="flex items-center gap-2">
          <Shield size={14} className="text-blue-400" />
          <span className="text-xs font-bold text-white tracking-wide">Patrol Simulation Control</span>
        </div>
        <div className="flex items-center gap-2">
          <WsStatusBadge status={wsStatus} />
          {open ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 animate-slide-in border-t border-slate-800">

          {/* Officer info */}
          <div className="mt-3 flex items-center gap-3 p-2.5 rounded-xl"
               style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)' }}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                 style={{ background: 'linear-gradient(135deg,#1d4ed8,#3b82f6)' }}>
              <Shield size={14} className="text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white truncate">Sub-Inspector Arjun Nair</p>
              <p className="text-[10px] text-slate-500 font-mono">BADGE: officer_101 · Kochi Route</p>
            </div>
          </div>

          {/* Waypoint progress */}
          {simulating && (
            <div>
              <div className="flex justify-between text-[10px] text-slate-500 mb-1 font-mono">
                <span>WAYPOINT</span>
                <span>{stepIdx + 1} / {KOCHI_PATROL_PATH.length}</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(51,65,85,0.6)' }}>
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${((stepIdx + 1) / KOCHI_PATROL_PATH.length) * 100}%`,
                    background: 'linear-gradient(90deg,#3b82f6,#60a5fa)',
                  }}
                />
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="grid grid-cols-2 gap-2">
            <button
              id="patrol-sim-start"
              onClick={startSim}
              disabled={simulating || wsStatus !== 'connected'}
              className="flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: simulating ? 'rgba(59,130,246,0.1)' : 'linear-gradient(135deg,#1d4ed8,#3b82f6)',
                color: simulating ? '#64748b' : 'white',
                boxShadow: simulating ? 'none' : '0 4px 16px rgba(59,130,246,0.35)',
              }}
            >
              <Play size={11} />
              Simulate
            </button>
            <button
              id="patrol-sim-stop"
              onClick={stopSim}
              disabled={!simulating}
              className="flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: !simulating ? 'rgba(239,68,68,0.05)' : 'rgba(239,68,68,0.15)',
                color: !simulating ? '#64748b' : '#f87171',
                border: '1px solid rgba(239,68,68,0.2)',
              }}
            >
              <Square size={11} />
              Stop
            </button>
          </div>

          {/* Status log */}
          {log && (
            <div className="px-2.5 py-2 rounded-xl text-[10px] font-mono leading-relaxed"
                 style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(51,65,85,0.4)', color: '#94a3b8' }}>
              {simulating && <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400 mr-1.5 animate-pulse" />}
              {log}
            </div>
          )}

          {wsStatus !== 'connected' && (
            <p className="text-[10px] text-amber-400 font-mono text-center">
              ⚠ Backend WebSocket offline – start the FastAPI server
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Build heatmap hotspots from incident list ──────────────────
// Groups incidents by proximity (0.1° grid), sums them into blobs.
function buildHotspots(incidents) {
  if (!incidents.length) return []
  const grid = {}
  incidents.forEach(inc => {
    const key = `${Math.round(inc.latitude * 10)}_${Math.round(inc.longitude * 10)}`
    if (!grid[key]) grid[key] = { lat: 0, lng: 0, count: 0 }
    grid[key].lat   += parseFloat(inc.latitude)
    grid[key].lng   += parseFloat(inc.longitude)
    grid[key].count += 1
  })
  const cells = Object.values(grid)
  const maxCount = Math.max(...cells.map(c => c.count), 1)
  return cells.map(c => ({
    lat:       c.lat / c.count,
    lng:       c.lng / c.count,
    intensity: Math.min(c.count / maxCount, 1),
    radius:    50 + (c.count / maxCount) * 80,
  }))
}

// ── Tile Providers (HD alternatives with 0 blur & 0 API key) ──
const TILE_PROVIDERS = {
  cartoDark: {
    id: 'cartoDark',
    name: 'CARTO Dark Matter',
    url: 'https://cartodb-basemaps-{s}.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png',
    subdomains: ['a', 'b', 'c', 'd'],
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
    maxZoom: 19
  },
  osm: {
    id: 'osm',
    name: 'OpenStreetMap (HD Street)',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    subdomains: ['a', 'b', 'c'],
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19
  },
  satellite: {
    id: 'satellite',
    name: 'Esri Satellite Imagery',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP',
    maxZoom: 18
  }
}

// ── Map panel (extracted so hooks can live at top level) ──────
function MapPanel({ incidents }) {
  const { officers, wsStatus, sendLocation } = usePatrolWebSocket('officer_101')
  const [mapMode, setMapMode] = useState('markers')  // 'markers' | 'heatmap'
  const [tileKey, setTileKey] = useState('cartoDark') // default to fastly CARTO Dark Matter
  const hotspots = mapMode === 'heatmap' ? buildHotspots(incidents) : []
  const activeTile = TILE_PROVIDERS[tileKey] || TILE_PROVIDERS.cartoDark

  return (
    <div
      className="flex-1 rounded-2xl overflow-hidden relative flex flex-col"
      style={{ boxShadow: '0 0 0 1px rgba(51,65,85,0.5), 0 24px 60px rgba(0,0,0,0.5)' }}
    >
      {/* Top Bar for Mode & Tile Theme Selectors */}
      <div className="absolute top-3 left-3 z-[1000] flex items-center gap-2">
        <MapModeToggle mode={mapMode} onChange={setMapMode} />

        {/* Tile Theme Switcher */}
        <div
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white"
          style={{
            background: 'rgba(10,15,30,0.88)',
            backdropFilter: 'blur(14px)',
            border: '1px solid rgba(51,65,85,0.5)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
          }}
        >
          <Layers size={12} className="text-blue-400" />
          <select
            value={tileKey}
            onChange={e => setTileKey(e.target.value)}
            className="bg-transparent text-xs text-slate-200 outline-none cursor-pointer"
          >
            {Object.values(TILE_PROVIDERS).map(p => (
              <option key={p.id} value={p.id} className="bg-slate-900 text-white">
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <MapContainer
        center={[10.8505, 76.2711]}
        zoom={7}
        style={{ width: '100%', height: '100%' }}
        zoomControl={true}
      >
        <TileLayer
          key={activeTile.id}
          url={activeTile.url}
          {...(activeTile.subdomains ? { subdomains: activeTile.subdomains } : {})}
          attribution={activeTile.attribution}
          maxZoom={activeTile.maxZoom}
        />

        {/* ── Mode-aware layer ── */}
        {mapMode === 'heatmap' && <HeatmapLayer hotspots={hotspots} />}

        {/* ── Incident markers (only in markers mode) ── */}
        {mapMode === 'markers' && incidents.map((inc) => (
          <Marker key={inc.id} position={[inc.latitude, inc.longitude]} icon={incidentIcon(inc.status)}>
            <Popup>
              <div style={{ minWidth: '200px', padding: '4px' }}>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <h4 style={{ margin:0, fontSize:'14px', fontWeight:700, color:'#f1f5f9', lineHeight:1.3 }}>
                    {inc.title}
                  </h4>
                  <span style={{
                    fontSize:'11px', fontWeight:700, padding:'2px 8px', borderRadius:'20px', whiteSpace:'nowrap',
                    color: STATUS_COLORS[inc.status] || '#94a3b8',
                    background: `${STATUS_COLORS[inc.status] || '#94a3b8'}22`,
                  }}>
                    {inc.status}
                  </span>
                </div>
                <p style={{ margin:'0 0 8px', fontSize:'12px', color:'#94a3b8', lineHeight:1.5 }}>
                  {inc.description}
                </p>
                <div style={{ display:'flex', alignItems:'center', gap:'6px', fontSize:'11px', color:'#64748b' }}>
                  <span>📍</span>
                  <span>{inc.district}</span>
                  <span style={{ margin:'0 4px' }}>·</span>
                  <span style={{ fontFamily:'monospace' }}>
                    {parseFloat(inc.latitude).toFixed(4)}, {parseFloat(inc.longitude).toFixed(4)}
                  </span>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* ── Patrol officer markers (always visible) ── */}
        {Object.entries(officers).map(([id, officer]) => (
          <Marker key={id} position={[officer.lat, officer.lng]} icon={patrolIcon}>
            <Popup>
              <div style={{ minWidth: '210px', padding: '4px' }}>
                {/* Officer header */}
                <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'10px' }}>
                  <div style={{
                    width:'36px', height:'36px', borderRadius:'50%', flexShrink:0,
                    background:'linear-gradient(135deg,#1d4ed8,#3b82f6)',
                    display:'flex', alignItems:'center', justifyContent:'center',
                  }}>
                    <span style={{ fontSize:'16px' }}>🛡</span>
                  </div>
                  <div>
                    <h4 style={{ margin:0, fontSize:'13px', fontWeight:700, color:'#f1f5f9', lineHeight:1.3 }}>
                      {officer.name}
                    </h4>
                    <div style={{ display:'flex', alignItems:'center', gap:'5px', marginTop:'2px' }}>
                      <div style={{ width:'6px', height:'6px', borderRadius:'50%', background:'#4ade80' }} />
                      <span style={{ fontSize:'10px', fontWeight:700, color:'#4ade80', letterSpacing:'0.08em' }}>
                        ON PATROL
                      </span>
                    </div>
                  </div>
                </div>

                {/* Details grid */}
                <div style={{
                  display:'grid', gridTemplateColumns:'1fr 1fr', gap:'6px',
                  padding:'8px', borderRadius:'8px',
                  background:'rgba(15,23,42,0.6)', border:'1px solid rgba(51,65,85,0.5)',
                  marginBottom:'8px',
                }}>
                  <div>
                    <div style={{ fontSize:'9px', color:'#64748b', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:'2px' }}>Badge</div>
                    <div style={{ fontSize:'11px', fontWeight:700, color:'#93c5fd', fontFamily:'monospace' }}>{id}</div>
                  </div>
                  <div>
                    <div style={{ fontSize:'9px', color:'#64748b', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:'2px' }}>Status</div>
                    <div style={{ fontSize:'11px', fontWeight:700, color:'#4ade80' }}>Active</div>
                  </div>
                  <div>
                    <div style={{ fontSize:'9px', color:'#64748b', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:'2px' }}>Latitude</div>
                    <div style={{ fontSize:'11px', color:'#e2e8f0', fontFamily:'monospace' }}>{officer.lat.toFixed(5)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize:'9px', color:'#64748b', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:'2px' }}>Longitude</div>
                    <div style={{ fontSize:'11px', color:'#e2e8f0', fontFamily:'monospace' }}>{officer.lng.toFixed(5)}</div>
                  </div>
                </div>

                <div style={{ display:'flex', alignItems:'center', gap:'5px', fontSize:'10px', color:'#475569' }}>
                  <span>🕐</span>
                  <span>Last update: {new Date(officer.last_updated).toLocaleTimeString('en-IN', { hour12: false })}</span>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* ── Map mode toggle (top-left) ── */}
      <MapModeToggle mode={mapMode} onChange={setMapMode} />

      {/* ── Heatmap legend (bottom-left, only in heatmap mode) ── */}
      {mapMode === 'heatmap' && <HeatmapLegend incidentCount={incidents.length} />}

      {/* ── Patrol Simulation Control overlay ── */}
      <PatrolSimulator sendLocation={sendLocation} wsStatus={wsStatus} />

      {/* ── Bottom-right counters ── */}
      <div
        className="absolute bottom-3 right-3 z-[1000] flex gap-2"
        style={{ pointerEvents: 'none' }}
      >
        <div className="glass rounded-xl px-3 py-2 text-xs text-slate-300 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
          <span>{incidents.length} Incidents</span>
        </div>
        <div
          className="glass rounded-xl px-3 py-2 text-xs flex items-center gap-2"
          style={{ color: Object.keys(officers).length > 0 ? '#4ade80' : '#64748b' }}
        >
          <Shield size={11} />
          <span>{Object.keys(officers).length} Officers Live</span>
        </div>
      </div>

    </div>
  )
}

// ── Main MapView component ─────────────────────────────────────
export default function MapView() {
  const [incidents, setIncidents] = useState([])
  const [showForm, setShowForm]   = useState(false)
  const [loading, setLoading]     = useState(false)
  const [fetching, setFetching]   = useState(false)
  const [error, setError]         = useState('')
  const [success, setSuccess]     = useState('')

  const [form, setForm] = useState({
    title: '', description: '', district: DISTRICTS[0],
    latitude: '', longitude: '',
  })

  const fetchIncidents = useCallback(async () => {
    setFetching(true)
    try {
      const res = await api.get('/api/incidents')
      setIncidents(res.data)
    } catch (e) {
      console.error('Failed to fetch incidents', e)
    } finally {
      setFetching(false)
    }
  }, [])

  useEffect(() => { fetchIncidents() }, [fetchIncidents])

  const handleUpdateIncidentStatus = async (incidentId, newStatus) => {
    try {
      await api.patch(`/api/incidents/${incidentId}`, { status: newStatus })
      setIncidents(prev => prev.map(inc => inc.id === incidentId ? { ...inc, status: newStatus } : inc))
    } catch (err) {
      console.error('Failed to update incident status', err)
    }
  }

  const handleChange = (e) => setForm(f => ({ ...f, [e.target.name]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(''); setSuccess(''); setLoading(true)
    try {
      await api.post('/api/incidents', {
        title: form.title,
        description: form.description,
        district: form.district,
        latitude: parseFloat(form.latitude),
        longitude: parseFloat(form.longitude),
      })
      setSuccess('Incident logged successfully!')
      setForm({ title:'', description:'', district:DISTRICTS[0], latitude:'', longitude:'' })
      await fetchIncidents()
      setTimeout(() => { setSuccess(''); setShowForm(false) }, 2000)
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to log incident.')
    } finally {
      setLoading(false)
    }
  }

  const statusClass = (s) => {
    if (s === 'Open') return 'status-open'
    if (s === 'Investigating') return 'status-investigating'
    return 'status-closed'
  }

  return (
    <div className="flex h-full gap-4">

      {/* ── Left sidebar ── */}
      <div className="w-80 shrink-0 flex flex-col gap-4">

        {/* Header / actions */}
        <div className="glass rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin size={18} className="text-blue-400" />
            <span className="font-semibold text-sm text-white">Incidents</span>
            <span className="px-2 py-0.5 rounded-full text-xs font-bold"
                  style={{ background: 'rgba(59,130,246,0.2)', color: '#60a5fa' }}>
              {incidents.length}
            </span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={fetchIncidents}
              title="Refresh"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-all"
            >
              <RefreshCw size={14} className={fetching ? 'animate-spin-slow' : ''} />
            </button>
            <button
              id="log-incident-btn"
              onClick={() => setShowForm(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={{
                background: showForm ? 'rgba(239,68,68,0.15)' : 'linear-gradient(135deg,#1d4ed8,#3b82f6)',
                color: showForm ? '#f87171' : 'white',
              }}
            >
              {showForm ? <X size={13} /> : <Plus size={13} />}
              {showForm ? 'Cancel' : 'Log Incident'}
            </button>
          </div>
        </div>

        {/* Log incident form */}
        {showForm && (
          <div className="glass rounded-xl p-4 animate-slide-in">
            <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <AlertTriangle size={14} className="text-amber-400" /> New Incident Report
            </h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1 uppercase tracking-wider">Title</label>
                <input name="title" value={form.title} onChange={handleChange} required
                  placeholder="Brief incident title"
                  className="w-full px-3 py-2 rounded-lg text-sm text-white placeholder-slate-600 outline-none"
                  style={{ background:'rgba(15,23,42,0.8)', border:'1px solid rgba(51,65,85,0.7)' }} />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1 uppercase tracking-wider">Description</label>
                <textarea name="description" value={form.description} onChange={handleChange} required rows={3}
                  placeholder="Detailed description…"
                  className="w-full px-3 py-2 rounded-lg text-sm text-white placeholder-slate-600 outline-none resize-none"
                  style={{ background:'rgba(15,23,42,0.8)', border:'1px solid rgba(51,65,85,0.7)' }} />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1 uppercase tracking-wider">District</label>
                <select name="district" value={form.district} onChange={handleChange}
                  className="w-full px-3 py-2 rounded-lg text-sm text-white outline-none"
                  style={{ background:'rgba(15,23,42,0.95)', border:'1px solid rgba(51,65,85,0.7)' }}>
                  {DISTRICTS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-slate-400 mb-1 uppercase tracking-wider">Latitude</label>
                  <div className="relative">
                    <Crosshair size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-600" />
                    <input name="latitude" value={form.latitude} onChange={handleChange} required type="number" step="any"
                      placeholder="10.85"
                      className="w-full pl-7 pr-2 py-2 rounded-lg text-sm text-white placeholder-slate-600 outline-none"
                      style={{ background:'rgba(15,23,42,0.8)', border:'1px solid rgba(51,65,85,0.7)' }} />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1 uppercase tracking-wider">Longitude</label>
                  <div className="relative">
                    <Crosshair size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-600" />
                    <input name="longitude" value={form.longitude} onChange={handleChange} required type="number" step="any"
                      placeholder="76.27"
                      className="w-full pl-7 pr-2 py-2 rounded-lg text-sm text-white placeholder-slate-600 outline-none"
                      style={{ background:'rgba(15,23,42,0.8)', border:'1px solid rgba(51,65,85,0.7)' }} />
                  </div>
                </div>
              </div>

              {error && (
                <p className="text-xs text-red-400 px-2 py-1.5 rounded-lg animate-fade-in"
                   style={{ background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.2)' }}>
                  {error}
                </p>
              )}
              {success && (
                <p className="text-xs text-green-400 px-2 py-1.5 rounded-lg animate-fade-in"
                   style={{ background:'rgba(74,222,128,0.1)', border:'1px solid rgba(74,222,128,0.2)' }}>
                  {success}
                </p>
              )}

              <button id="submit-incident" type="submit" disabled={loading}
                className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-50"
                style={{ background:'linear-gradient(135deg,#1d4ed8,#3b82f6)', boxShadow:'0 4px 16px rgba(59,130,246,0.3)' }}>
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    Logging…
                  </span>
                ) : 'Submit Report'}
              </button>
            </form>
          </div>
        )}

        {/* Incident list */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1 chat-scroll">
          {incidents.length === 0 && !fetching && (
            <div className="glass rounded-xl p-6 text-center">
              <MapPin size={28} className="mx-auto text-slate-600 mb-2" />
              <p className="text-sm text-slate-500">No incidents logged yet.</p>
            </div>
          )}
          {incidents.map((inc) => (
            <div key={inc.id}
                 className="glass rounded-xl p-3.5 cursor-default transition-all hover:border-blue-500/40 animate-fade-in"
                 style={{ borderColor: 'transparent' }}>
              <div className="flex items-start justify-between gap-2 mb-1">
                <span className="text-sm font-medium text-white leading-tight">{inc.title}</span>
                <select
                  value={inc.status}
                  onChange={(e) => handleUpdateIncidentStatus(inc.id, e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  className={`shrink-0 text-[11px] px-2 py-0.5 rounded-full font-semibold outline-none cursor-pointer border-0 ${statusClass(inc.status)}`}
                  style={{ background: 'rgba(15,23,42,0.9)' }}
                >
                  <option value="Open" className="bg-slate-900 text-red-400">Open</option>
                  <option value="Investigating" className="bg-slate-900 text-amber-400">Investigating</option>
                  <option value="Closed" className="bg-slate-900 text-green-400">Closed</option>
                </select>
              </div>
              <p className="text-xs text-slate-500 mb-1.5 line-clamp-2">{inc.description}</p>
              <div className="flex items-center gap-1.5 text-xs text-slate-600">
                <MapPin size={10} />
                <span>{inc.district}</span>
                <span className="mx-1">·</span>
                <span className="font-mono">{parseFloat(inc.latitude).toFixed(4)}, {parseFloat(inc.longitude).toFixed(4)}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="glass rounded-xl p-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-500">
          {Object.entries(STATUS_COLORS).map(([status, color]) => (
            <div key={status} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
              <span>{status}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <Shield size={10} className="text-blue-400" />
            <span className="text-blue-400">Patrol</span>
          </div>
        </div>
      </div>

      {/* ── Map panel ── */}
      <MapPanel incidents={incidents} />
    </div>
  )
}
