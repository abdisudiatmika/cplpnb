import React from 'react';

interface BarChartProps {
  measuredCpls: Array<{
    id: string;
    code: string;
    value: number;
  }>;
  title?: string;
}

export const BarChart: React.FC<BarChartProps> = ({ measuredCpls, title = 'Rata-rata Nilai per CPL' }) => {
  const chartLeft = 58;
  const chartRight = 980;
  const chartBottom = 260;
  const plotWidth = chartRight - chartLeft;
  const targetY = chartBottom - (75 / 100) * 240;

  return (
    <div className="glass-panel rounded-xl p-lg flex flex-col justify-between shadow-md">
      <div className="flex items-center justify-between mb-lg">
        <h4 className="font-headline-lg text-headline-lg text-on-surface font-bold">{title}</h4>
        <span className="material-symbols-outlined text-outline">bar_chart</span>
      </div>
      
      <div className="h-[330px] flex items-center justify-center relative bg-white rounded-xl border border-slate-200 shadow-inner px-md">
        {measuredCpls.length === 0 ? <p className="text-on-surface-variant">Belum ada CPL terukur.</p> : <svg className="w-full h-[290px]" viewBox="0 -35 1000 335" preserveAspectRatio="xMidYMid meet" aria-label="Grafik rata-rata nilai CPL dengan target 75">
          {/* Grid Lines */}
          {[20, 80, 140, 200, 260].map((yVal, idx) => (
            <g key={yVal}>
              <line x1={chartLeft} y1={yVal} x2={chartRight} y2={yVal} stroke="#E2E8F0" strokeWidth="1" />
              <text x="12" y={yVal + 4} fill="#64748B" fontSize="12" textAnchor="start">
                {100 - idx * 25}
              </text>
            </g>
          ))}

          <line x1={chartLeft} y1={targetY} x2={chartRight} y2={targetY} stroke="#DC2626" strokeWidth="1.5" strokeDasharray="7 5" />
          <text x={chartRight - 4} y={targetY - 7} fill="#DC2626" fontSize="11" fontWeight="bold" textAnchor="end">Target 75</text>
          <text x="14" y="145" fill="#64748B" fontSize="11" fontWeight="bold" textAnchor="middle" transform="rotate(-90 14 145)">Nilai (%)</text>

          {/* Bars */}
          {measuredCpls.map((cpl, i) => {
            const spacing = plotWidth / measuredCpls.length;
            const barWidth = Math.max(28, Math.min(78, spacing * 0.58));
            const barX = chartLeft + i * spacing + (spacing - barWidth) / 2;
            const barHeight = (cpl.value / 100) * 240;
            const barY = chartBottom - barHeight;
            
            let fillCol = '#10b981'; // Sangat kompeten (Exemplary)
            if (cpl.value === 0) fillCol = '#64748b'; // Belum Diukur (slate)
            else if (cpl.value >= 75) fillCol = '#3b82f6'; // Kompeten (Competent) (blue)
            else if (cpl.value >= 60) fillCol = '#f59e0b'; // Berkembang (Developing) (amber)
            else fillCol = '#ef4444'; // Tidak memuaskan (Unsatisfactory) (red)

            return (
              <g key={cpl.id} className="group cursor-pointer">
                <rect 
                  x={barX} 
                  y={barY} 
                  width={barWidth} 
                  height={barHeight} 
                  fill={fillCol}
                  rx="4"
                  className="transition-all duration-300 hover:brightness-110"
                />
                <text x={barX + barWidth / 2} y="280" fill="#64748B" fontSize="10" fontWeight="bold" textAnchor="middle">
                  {cpl.code}
                </text>
                <text x={barX + barWidth / 2} y={Math.max(-2, barY - 8)} fill="#334155" fontSize="11" fontWeight="bold" textAnchor="middle">{cpl.value}</text>

                <title>{`${cpl.code}: ${cpl.value}%`}</title>
              </g>
            );
          })}
        </svg>}
      </div>
    </div>
  );
};
