import { useState, useEffect, useRef } from 'react';
import { Users, Zap, BarChart2, Key, RefreshCw, TrendingUp, Activity } from 'lucide-react';
import { useStore } from '../../store';
import { getAdminAnalytics } from '../../api/admin';

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, sub, color = '#10a37f' }) {
  return (
    <div className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: color + '22' }}>
          <Icon className="w-3.5 h-3.5" style={{ color }} />
        </div>
        <span className="text-xs text-[#555] font-medium">{label}</span>
      </div>
      <p className="text-2xl font-bold text-white tabular-nums">{value}</p>
      {sub && <p className="text-xs text-[#555] mt-1">{sub}</p>}
    </div>
  );
}

// ── SVG area/line chart ───────────────────────────────────────────────────────
function AreaChart({ data, valueKey, color = '#10a37f', height = 140 }) {
  const [tip, setTip] = useState(null);
  const svgRef = useRef(null);

  if (!data?.length) {
    return <p className="text-[#555] text-xs text-center py-10">No data for this period</p>;
  }

  const W = 560, PL = 42, PR = 8, PT = 10, PB = 22;
  const cW = W - PL - PR, cH = height - PT - PB;
  const values = data.map((d) => d[valueKey] || 0);
  const maxV = Math.max(...values, 1);

  const fmt = (v) => (v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M`
    : v >= 1_000 ? `${(v / 1_000).toFixed(0)}k` : v);

  const pts = data.map((d, i) => ({
    x: PL + (data.length === 1 ? cW / 2 : (i / (data.length - 1)) * cW),
    y: PT + (1 - (d[valueKey] || 0) / maxV) * cH,
    v: d[valueKey] || 0,
    id: d._id ?? '',
  }));

  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const area = `${line} L${pts[pts.length - 1].x.toFixed(1)},${height - PB} L${PL},${height - PB}Z`;

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({
    y: PT + f * cH,
    label: fmt(Math.round(maxV * (1 - f))),
  }));

  const labelStep = Math.max(1, Math.ceil(data.length / 8));
  const xLabels = pts.filter((_, i) => i % labelStep === 0 || i === pts.length - 1);

  const gradId = `ag-${valueKey}-${color.replace('#', '')}`;
  const segW = cW / Math.max(data.length, 1);

  return (
    <div className="relative select-none">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${height}`}
        className="w-full"
        style={{ height }}
        onMouseLeave={() => setTip(null)}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Horizontal grid lines */}
        {yTicks.map((t, i) => (
          <line key={i} x1={PL} y1={t.y} x2={W - PR} y2={t.y}
            stroke="#232323" strokeWidth="1" />
        ))}

        {/* Y-axis labels */}
        {yTicks.map((t, i) => (
          <text key={i} x={PL - 6} y={t.y + 3.5} textAnchor="end"
            fontSize="9" fill="#4a4a4a">{t.label}</text>
        ))}

        {/* Area fill */}
        <path d={area} fill={`url(#${gradId})`} />

        {/* Line */}
        <path d={line} fill="none" stroke={color} strokeWidth="1.5"
          strokeLinejoin="round" strokeLinecap="round" />

        {/* X-axis date labels */}
        {xLabels.map((p, i) => (
          <text key={i} x={p.x} y={height - 5} textAnchor="middle"
            fontSize="9" fill="#444">
            {typeof p.id === 'string' && p.id.includes('-') ? p.id.slice(5) : p.id}
          </text>
        ))}

        {/* Hover hit areas */}
        {pts.map((p, i) => (
          <rect
            key={i}
            x={p.x - segW / 2}
            y={PT}
            width={segW}
            height={cH}
            fill="transparent"
            onMouseEnter={() => setTip(p)}
          />
        ))}

        {/* Active indicator */}
        {tip && (
          <>
            <line x1={tip.x} y1={PT} x2={tip.x} y2={height - PB}
              stroke="#3a3a3a" strokeWidth="1" strokeDasharray="3 3" />
            <circle cx={tip.x} cy={tip.y} r="3.5" fill={color}
              stroke="#121212" strokeWidth="1.5" />

            {/* Tooltip box */}
            {(() => {
              const bx = tip.x < W / 2 ? tip.x + 8 : tip.x - 82;
              return (
                <g>
                  <rect x={bx} y={PT + 2} width={74} height={34} rx="5"
                    fill="#111" stroke="#2a2a2a" strokeWidth="1" />
                  <text x={bx + 37} y={PT + 15} textAnchor="middle"
                    fontSize="9" fill="#666">
                    {typeof tip.id === 'string' && tip.id.includes('-') ? tip.id.slice(5) : tip.id}
                  </text>
                  <text x={bx + 37} y={PT + 28} textAnchor="middle"
                    fontSize="11" fill="white" fontWeight="600">
                    {tip.v.toLocaleString()}
                  </text>
                </g>
              );
            })()}
          </>
        )}
      </svg>
    </div>
  );
}

// ── Stacked bar chart (web vs API) ────────────────────────────────────────────
function StackedBarChart({ data, height = 100 }) {
  const [tip, setTip] = useState(null);

  if (!data?.length) {
    return <p className="text-[#555] text-xs text-center py-6">No data</p>;
  }

  const totals = data.map((d) => (d.webReqs || 0) + (d.apiReqs || 0));
  const maxV = Math.max(...totals, 1);

  const barW = 100 / data.length;

  return (
    <div className="relative select-none">
      <div className="flex items-end gap-0.5" style={{ height }}>
        {data.map((d, i) => {
          const web = d.webReqs || 0;
          const api = d.apiReqs || 0;
          const total = web + api;
          const pct = (total / maxV) * 100;
          const webPct = total ? (web / total) * 100 : 50;
          const label = typeof d._id === 'string' && d._id.includes('-') ? d._id.slice(5) : d._id;

          return (
            <div
              key={i}
              className="flex-1 flex flex-col justify-end group relative cursor-default"
              style={{ height: '100%' }}
              onMouseEnter={() => setTip({ i, web, api, id: d._id, label })}
              onMouseLeave={() => setTip(null)}
            >
              <div className="w-full overflow-hidden rounded-t-sm"
                style={{ height: `${Math.max(pct, 2)}%` }}>
                <div className="w-full" style={{ height: `${webPct}%`, background: '#10a37f', opacity: 0.85 }} />
                <div className="w-full" style={{ height: `${100 - webPct}%`, background: '#a78bfa', opacity: 0.85 }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Sparse X labels */}
      <div className="flex mt-1">
        {data.map((d, i) => {
          const step = Math.max(1, Math.ceil(data.length / 8));
          const show = i % step === 0 || i === data.length - 1;
          const label = typeof d._id === 'string' && d._id.includes('-') ? d._id.slice(5) : d._id;
          return (
            <div key={i} className="flex-1 text-center">
              {show && <span className="text-[9px] text-[#444]">{label}</span>}
            </div>
          );
        })}
      </div>

      {/* Tooltip */}
      {tip && (
        <div className="absolute top-0 left-0 pointer-events-none z-10"
          style={{ left: `${(tip.i / data.length) * 100}%`, transform: 'translateX(-50%)' }}>
          <div className="bg-[#111] border border-[#2a2a2a] rounded-lg px-2.5 py-2 text-xs whitespace-nowrap shadow-xl -translate-y-full mb-1">
            <p className="text-[#555] mb-1">{typeof tip.id === 'string' ? tip.id : tip.id}</p>
            <p className="text-[#10a37f]">Web: <span className="text-white font-semibold">{tip.web.toLocaleString()}</span></p>
            <p className="text-[#a78bfa]">API: <span className="text-white font-semibold">{tip.api.toLocaleString()}</span></p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Donut chart ───────────────────────────────────────────────────────────────
function DonutChart({ slices, size = 80 }) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (!total) return null;

  const R = 28, cx = size / 2, cy = size / 2;
  const circumference = 2 * Math.PI * R;

  let offset = 0;
  const arcs = slices.map((s) => {
    const pct = s.value / total;
    const dash = pct * circumference;
    const arc = { ...s, dash, gap: circumference - dash, offset: offset * circumference };
    offset += pct;
    return arc;
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="#2a2a2a" strokeWidth="10" />
      {arcs.map((a, i) => (
        <circle
          key={i}
          cx={cx} cy={cy} r={R}
          fill="none"
          stroke={a.color}
          strokeWidth="10"
          strokeDasharray={`${a.dash} ${a.gap}`}
          strokeDashoffset={-a.offset}
          strokeOpacity="0.85"
          style={{ transform: 'rotate(-90deg)', transformOrigin: `${cx}px ${cy}px` }}
        />
      ))}
    </svg>
  );
}

// ── Horizontal bar (model/user ranking) ──────────────────────────────────────
function RankedBars({ rows, valueKey = 'tokens', labelKey, colorA = '#10a37f', colorB }) {
  if (!rows?.length) return <p className="text-[#555] text-xs text-center py-6">No data</p>;
  const max = Math.max(...rows.map((r) => r[valueKey] || 0), 1);

  return (
    <div className="space-y-2.5">
      {rows.map((r, i) => {
        const pct = ((r[valueKey] || 0) / max) * 100;
        const hue = colorB
          ? `color-mix(in srgb, ${colorA} ${100 - (i / rows.length) * 60}%, ${colorB})`
          : colorA;
        return (
          <div key={i} className="flex items-center gap-3">
            <span className="text-xs text-[#444] w-4 text-right tabular-nums shrink-0">{i + 1}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-[#adadad] truncate">{r[labelKey] || '—'}</span>
                <span className="text-xs text-[#555] tabular-nums ml-2 shrink-0">
                  {(r[valueKey] || 0).toLocaleString()}
                </span>
              </div>
              <div className="w-full bg-[#252525] rounded-full h-1.5">
                <div
                  className="h-1.5 rounded-full transition-all"
                  style={{ width: `${pct}%`, background: colorA, opacity: 0.75 + 0.25 * (1 - i / rows.length) }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main tab ──────────────────────────────────────────────────────────────────
export default function AnalyticsTab() {
  const { token } = useStore();
  const [data,    setData]    = useState(null);
  const [days,    setDays]    = useState(30);
  const [metric,  setMetric]  = useState('tokens');  // 'tokens' | 'requests'
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  const load = (d = days) => {
    setLoading(true);
    getAdminAnalytics(token, d)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [token, days]);

  if (loading) return (
    <div className="flex items-center justify-center gap-2 py-20 text-[#555]">
      <RefreshCw className="w-5 h-5 animate-spin" /> Loading analytics…
    </div>
  );

  if (error) return (
    <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">{error}</p>
  );

  const s   = data?.summary ?? {};
  const daily = data?.dailyUsage ?? [];

  // Aggregate web vs API totals from daily data
  const totalWeb = daily.reduce((a, d) => a + (d.webReqs || 0), 0);
  const totalApi = daily.reduce((a, d) => a + (d.apiReqs || 0), 0);

  return (
    <div className="space-y-6">

      {/* ── Period + metric controls ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#555]">Period:</span>
          {[7, 14, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors
                ${days === d ? 'bg-[#10a37f] text-white' : 'bg-[#2a2a2a] text-[#8e8ea0] hover:text-white'}`}
            >
              {d}d
            </button>
          ))}
        </div>
        <button
          onClick={() => load(days)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs text-[#555]
                     hover:text-white hover:bg-[#2a2a2a] transition-colors"
        >
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard icon={Users}      label="Total users"
          value={s.totalUsers ?? 0}
          sub={`${s.activeUsers ?? 0} active · ${s.pendingUsers ?? 0} pending`} />
        <StatCard icon={Zap}        label={`Tokens (${s.days}d)`}
          value={(s.periodTokens ?? 0).toLocaleString()}
          sub={`${(s.periodRequests ?? 0).toLocaleString()} requests`} />
        <StatCard icon={Key}        label="Active API keys"
          value={s.activeKeys ?? 0}  color="#a78bfa" />
        <StatCard icon={TrendingUp} label="Avg tokens / req"
          value={s.periodRequests ? Math.round(s.periodTokens / s.periodRequests).toLocaleString() : '—'}
          color="#f59e0b" />
        <StatCard icon={Activity}   label="Web requests"
          value={totalWeb.toLocaleString()}
          sub="direct UI usage"       color="#10a37f" />
        <StatCard icon={BarChart2}  label="API requests"
          value={totalApi.toLocaleString()}
          sub="via API key"           color="#a78bfa" />
      </div>

      {/* ── Daily trend chart ── */}
      <div className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-xl p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white">Daily trend</h3>
          <div className="flex gap-1">
            {[
              { key: 'tokens',   label: 'Tokens',   color: '#10a37f' },
              { key: 'requests', label: 'Requests', color: '#60a5fa' },
            ].map(({ key, label, color }) => (
              <button
                key={key}
                onClick={() => setMetric(key)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5
                  ${metric === key ? 'text-white' : 'text-[#555] hover:text-[#8e8ea0]'}`}
                style={metric === key ? { background: color + '33', color } : {}}
              >
                <span className="w-2 h-2 rounded-full inline-block shrink-0" style={{ background: color }} />
                {label}
              </button>
            ))}
          </div>
        </div>
        <AreaChart
          data={daily}
          valueKey={metric}
          color={metric === 'tokens' ? '#10a37f' : '#60a5fa'}
          height={140}
        />
      </div>

      {/* ── Web vs API source breakdown ── */}
      {(totalWeb + totalApi) > 0 && (
        <div className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-xl p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">Request sources</h3>
            <div className="flex items-center gap-3 text-xs text-[#555]">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm inline-block bg-[#10a37f]" /> Web UI
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm inline-block bg-[#a78bfa]" /> API key
              </span>
            </div>
          </div>
          <div className="flex items-start gap-6">
            {/* Donut + totals */}
            <div className="flex items-center gap-4 shrink-0">
              <DonutChart
                size={88}
                slices={[
                  { value: totalWeb, color: '#10a37f' },
                  { value: totalApi, color: '#a78bfa' },
                ]}
              />
              <div className="space-y-2 text-xs">
                <div>
                  <p className="text-[#10a37f] font-semibold">{totalWeb.toLocaleString()}</p>
                  <p className="text-[#555]">Web ({totalWeb + totalApi ? Math.round((totalWeb / (totalWeb + totalApi)) * 100) : 0}%)</p>
                </div>
                <div>
                  <p className="text-[#a78bfa] font-semibold">{totalApi.toLocaleString()}</p>
                  <p className="text-[#555]">API ({totalWeb + totalApi ? Math.round((totalApi / (totalWeb + totalApi)) * 100) : 0}%)</p>
                </div>
              </div>
            </div>

            {/* Stacked daily bars */}
            <div className="flex-1 min-w-0">
              <StackedBarChart data={daily} height={88} />
            </div>
          </div>
        </div>
      )}

      {/* ── Top users + model usage ── */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-xl p-4">
          <h3 className="text-sm font-semibold text-white mb-4">Top users — tokens</h3>
          <RankedBars
            rows={data?.topUsers ?? []}
            labelKey="username"
            valueKey="tokens"
            colorA="#10a37f"
          />
        </div>

        <div className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-xl p-4">
          <h3 className="text-sm font-semibold text-white mb-4">Model usage — requests</h3>
          <RankedBars
            rows={data?.modelUsage ?? []}
            labelKey="_id"
            valueKey="requests"
            colorA="#60a5fa"
          />
        </div>
      </div>

      {/* ── API key activity ── */}
      {data?.apiKeyActivity?.length > 0 && (
        <div className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-xl p-4">
          <h3 className="text-sm font-semibold text-white mb-4">API key activity</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#2a2a2a]">
                  {['Key', 'Requests', 'Tokens'].map((h) => (
                    <th key={h} className="text-left text-xs text-[#555] font-medium pb-2 pr-4">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e1e1e]">
                {data.apiKeyActivity.map((k, i) => (
                  <tr key={i} className="hover:bg-[#252525] transition-colors">
                    <td className="py-2.5 pr-4">
                      <p className="text-white text-xs font-medium">{k.keyName || '—'}</p>
                      <p className="text-[#555] text-xs font-mono">{k.keyPrefix}</p>
                    </td>
                    <td className="py-2.5 pr-4 text-[#8e8ea0] text-xs tabular-nums">
                      {k.requests.toLocaleString()}
                    </td>
                    <td className="py-2.5 text-[#8e8ea0] text-xs tabular-nums">
                      {k.tokens.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
