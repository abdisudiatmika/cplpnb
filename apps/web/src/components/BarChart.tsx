import React from 'react';

interface BarChartProps {
  measuredCpls: Array<{
    id: string;
    code: string;
    value: number;
  }>;
}

export const BarChart: React.FC<BarChartProps> = ({ measuredCpls }) => {
  return (
    <div className="glass-panel rounded-xl p-lg flex flex-col justify-between shadow-md">
      <div className="flex items-center justify-between mb-lg">
        <h4 className="font-headline-lg text-headline-lg text-on-surface font-bold">Rata-rata Nilai per CPL</h4>
        <span className="material-symbols-outlined text-outline">bar_chart</span>
      </div>
      
      <div className="h-[300px] flex items-center justify-center relative bg-white/[0.01] rounded-xl border border-slate-200 shadow-inner">
        <svg className="w-full h-[260px] max-w-[800px]" viewBox="0 -35 800 335" preserveAspectRatio="xMidYMid meet">
          {/* Grid Lines */}
          {[20, 80, 140, 200, 260].map((yVal, idx) => (
            <g key={yVal}>
              <line x1="40" y1={yVal} x2="780" y2={yVal} stroke="#E2E8F0" strokeWidth="1" />
              <text x="5" y={yVal + 4} fill="#64748B" fontSize="12" textAnchor="start">
                {100 - idx * 25}
              </text>
            </g>
          ))}

          {/* Bars */}
          {measuredCpls.map((cpl, i) => {
            const barWidth = Math.max(12, (700 / measuredCpls.length) * 0.6);
            const spacing = 740 / measuredCpls.length;
            const barX = 40 + i * spacing + (spacing - barWidth) / 2;
            const barHeight = (cpl.value / 100) * 240;
            const barY = 260 - barHeight;
            
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
                
                {/* Custom Hover Tooltip */}
                <g className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                  <rect
                    x={barX + barWidth / 2 - 22}
                    y={barY - 26}
                    width="44"
                    height="18"
                    rx="4"
                    fill="#1E293B"
                  />
                  <text
                    x={barX + barWidth / 2}
                    y={barY - 13}
                    fill="#FFFFFF"
                    fontSize="10"
                    fontWeight="bold"
                    textAnchor="middle"
                  >
                    {cpl.value}%
                  </text>
                </g>

                <title>{`${cpl.code}: ${cpl.value}%`}</title>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};
