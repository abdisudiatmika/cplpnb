import React from 'react';

interface RadarChartProps {
  avgSikap: number;
  avgPengetahuan: number;
  avgKtmpUmum: number;
  avgKtmpKhusus: number;
}

export const RadarChart: React.FC<RadarChartProps> = ({
  avgSikap,
  avgPengetahuan,
  avgKtmpUmum,
  avgKtmpKhusus,
}) => {
  const rSikap = 160 * (avgSikap / 100);
  const rPengetahuan = 160 * (avgPengetahuan / 100);
  const rKtmpUmum = 160 * (avgKtmpUmum / 100);
  const rKtmpKhusus = 160 * (avgKtmpKhusus / 100);

  const points = `200,${200 - rSikap} ${200 + rPengetahuan},200 200,${200 + rKtmpUmum} ${200 - rKtmpKhusus},200`;

  return (
    <svg className="w-full max-w-[480px] h-[300px] relative z-10" viewBox="-120 0 640 400">
      {/* Grid Circles */}
      <circle cx="200" cy="200" fill="none" r="160" stroke="rgba(255,255,255,0.08)" strokeWidth="1"></circle>
      <circle cx="200" cy="200" fill="none" r="120" stroke="rgba(255,255,255,0.08)" strokeWidth="1"></circle>
      <circle cx="200" cy="200" fill="none" r="80" stroke="rgba(255,255,255,0.08)" strokeWidth="1"></circle>
      <circle cx="200" cy="200" fill="none" r="40" stroke="rgba(255,255,255,0.08)" strokeWidth="1"></circle>
      
      {/* Axis Lines */}
      <line stroke="rgba(255,255,255,0.08)" strokeWidth="1" x1="200" x2="200" y1="40" y2="360"></line>
      <line stroke="rgba(255,255,255,0.08)" strokeWidth="1" x1="40" x2="360" y1="200" y2="200"></line>
      
      {/* Realisation Shape */}
      <polygon 
        fill="rgba(99, 102, 241, 0.25)" 
        points={points} 
        stroke="#6366F1" 
        strokeWidth="2.5"
        className="transition-all duration-500 ease-in-out"
      ></polygon>
      
      {/* Target Shape */}
      <polygon 
        fill="none" 
        opacity="0.5" 
        points="200,60 360,200 200,340 40,200" 
        stroke="#06B6D4" 
        strokeDasharray="4" 
        strokeWidth="1.5"
      ></polygon>
      
      {/* Labels */}
      <text fill="#ffffff" fontSize="12" fontWeight="bold" textAnchor="middle" x="200" y="25">Sikap</text>
      <text fill="#ffffff" fontSize="12" fontWeight="bold" textAnchor="start" x="365" y="204">Pengetahuan</text>
      <text fill="#ffffff" fontSize="12" fontWeight="bold" textAnchor="middle" x="200" y="380">Keterampilan Umum</text>
      <text fill="#ffffff" fontSize="12" fontWeight="bold" textAnchor="end" x="35" y="204">Keterampilan Khusus</text>
    </svg>
  );
};
