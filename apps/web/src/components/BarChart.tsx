import React from 'react';

interface BarChartProps {
  measuredCpls: Array<{
    id: string;
    code: string;
    value: number;
  }>;
  cplFormTarget: number;
}

export const BarChart: React.FC<BarChartProps> = ({ measuredCpls, cplFormTarget }) => {
  return (
    <div className="glass-panel rounded-xl p-lg flex flex-col justify-between shadow-md">
      <div className="flex items-center justify-between mb-lg">
        <h4 className="font-headline-lg text-headline-lg text-on-surface font-bold">Rata-rata Nilai per CPL</h4>
        <span className="material-symbols-outlined text-outline">bar_chart</span>
      </div>
      
      <div className="h-[300px] flex items-center justify-center relative bg-white/[0.01] rounded-xl border border-white/5 shadow-inner">
        <svg className="w-full h-[260px] max-w-[800px]" viewBox="0 0 800 300" preserveAspectRatio="xMidYMid meet">
          {/* Grid Lines */}
          {[20, 80, 140, 200, 260].map((yVal, idx) => (
            <g key={yVal}>
              <line x1="40" y1={yVal} x2="780" y2={yVal} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
              <text x="5" y={yVal + 4} fill="#908fa0" fontSize="12" textAnchor="start">
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
            
            let fillCol = '#4edea3'; // Tercapai (green)
            if (cpl.value === 0) fillCol = '#464554'; // Belum Diukur (grey)
            else if (cpl.value < cplFormTarget) fillCol = '#ffb4ab'; // Tidak Tercapai (red)

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
                <text x={barX + barWidth / 2} y="280" fill="#908fa0" fontSize="10" fontWeight="bold" textAnchor="middle">
                  {cpl.code}
                </text>
                <title>{`${cpl.code}: ${cpl.value}%`}</title>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};
