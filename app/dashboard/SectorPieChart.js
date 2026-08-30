'use client';
import { useState, useRef } from 'react';

const COLORS = { GVT: '#0a5fa8', PVT: '#b76e00', SEMI: '#6231a8' };
const SIZE = 260, CX = SIZE / 2, CY = SIZE / 2, R = 100;

function polarToXY(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx, cy, r, startAngle, endAngle) {
  const start = polarToXY(cx, cy, r, endAngle);
  const end = polarToXY(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y} Z`;
}

export default function SectorPieChart({ sectors }) {
  const [visible, setVisible] = useState(false);
  const svgRef = useRef(null);

  const slices = [
    { label: 'GVT', value: sectors.gvt.qb, pct: sectors.gvt.pct, color: COLORS.GVT },
    { label: 'PVT', value: sectors.pvt.qb, pct: sectors.pvt.pct, color: COLORS.PVT },
    { label: 'Semi-GVT', value: sectors.semi.qb, pct: sectors.semi.pct, color: COLORS.SEMI },
  ].filter((s) => s.value > 0);

  let cursor = 0;
  const arcs = slices.map((s) => {
    const startAngle = cursor * 360;
    const endAngle = (cursor + s.pct) * 360;
    cursor += s.pct;
    return { ...s, path: s.pct >= 0.999 ? null : arcPath(CX, CY, R, startAngle, endAngle), startAngle, endAngle };
  });

  function downloadPng() {
    const svg = svgRef.current;
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      const scale = 2; // sharper output
      const canvas = document.createElement('canvas');
      canvas.width = SIZE * scale; canvas.height = SIZE * scale;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'AR_Sector_Breakdown.png';
        a.click();
      });
    };
    img.src = url;
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <h4 style={{ margin: 0 }}>Sector Breakdown — Pie Chart</h4>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="secondary" onClick={() => setVisible((v) => !v)}>{visible ? 'Hide chart' : 'Show chart'}</button>
          {visible && <button onClick={downloadPng}>Download PNG</button>}
        </div>
      </div>

      {visible && (
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center', marginTop: 14 }}>
          <svg ref={svgRef} width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ background: '#fff' }}>
            {arcs.map((a) =>
              a.path ? (
                <path key={a.label} d={a.path} fill={a.color} stroke="#fff" strokeWidth={1.5} />
              ) : (
                <circle key={a.label} cx={CX} cy={CY} r={R} fill={a.color} />
              )
            )}
            <circle cx={CX} cy={CY} r={54} fill="#fff" />
            <text x={CX} y={CY - 4} textAnchor="middle" fontSize="12" fontWeight="700" fill="#0d1f17">Total</text>
            <text x={CX} y={CY + 14} textAnchor="middle" fontSize="11" fill="#5b6c64">
              {(sectors.total.qb).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </text>
          </svg>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
            {slices.map((s) => (
              <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: s.color, display: 'inline-block' }} />
                <span style={{ minWidth: 80, fontWeight: 600 }}>{s.label}</span>
                <span style={{ color: 'var(--ink-500)' }}>{(s.pct * 100).toFixed(1)}% · {s.value.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
