import React from 'react';

interface MappingItem {
  cpl_code: string;
  cpl_average: number;
  cpl_target: number;
}

interface CourseRadarChartProps {
  mappings: MappingItem[];
}

export const CourseRadarChart: React.FC<CourseRadarChartProps> = ({ mappings }) => {
  const N = mappings.length;
  if (N < 3) return null;

  const cx = 200;
  const cy = 180;
  const R = 110;

  // Calculate angles and points
  const angles = Array.from({ length: N }, (_, i) => (2 * Math.PI * i) / N - Math.PI / 2);

  // Helper to get coordinates
  const getCoordinates = (r: number, angle: number) => {
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    return { x, y };
  };

  // Realisation polygon points
  const realizationPoints = angles.map((angle, i) => {
    const r = R * (Math.max(0, Math.min(100, mappings[i].cpl_average)) / 100);
    const { x, y } = getCoordinates(r, angle);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  // Target polygon points
  const targetPoints = angles.map((angle, i) => {
    const r = R * (Math.max(0, Math.min(100, mappings[i].cpl_target)) / 100);
    const { x, y } = getCoordinates(r, angle);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  // Grid levels (25%, 50%, 75%, 100%)
  const gridLevels = [0.25, 0.5, 0.75, 1];

  return (
    <div className="w-full flex justify-center items-center">
      <svg className="w-full max-w-[400px] h-[320px] relative z-10" viewBox="0 0 400 360">
        {/* Grid Concentric Polygons */}
        {gridLevels.map((level, idx) => {
          const points = angles.map(angle => {
            const { x, y } = getCoordinates(R * level, angle);
            return `${x.toFixed(1)},${y.toFixed(1)}`;
          }).join(' ');
          
          return (
            <polygon
              key={idx}
              points={points}
              fill="none"
              stroke="#E2E8F0"
              strokeWidth="1"
              strokeDasharray={idx < 3 ? "2 2" : "none"}
            />
          );
        })}

        {/* Concentric Circle grids for additional guidelines */}
        {gridLevels.map((level, idx) => (
          <circle
            key={`circle-${idx}`}
            cx={cx}
            cy={cy}
            r={R * level}
            fill="none"
            stroke="#F1F5F9"
            strokeWidth="0.5"
          />
        ))}

        {/* Axis Lines */}
        {angles.map((angle, i) => {
          const outer = getCoordinates(R, angle);
          return (
            <line
              key={i}
              x1={cx}
              y1={cy}
              x2={outer.x.toFixed(1)}
              y2={outer.y.toFixed(1)}
              stroke="#CBD5E1"
              strokeWidth="1"
            />
          );
        })}

        {/* Target Shape (Cyan dashed line) */}
        <polygon
          points={targetPoints}
          fill="none"
          stroke="#06B6D4"
          strokeWidth="1.5"
          strokeDasharray="4 4"
          opacity="0.6"
        />

        {/* Realisation Shape (Indigo fill and border) */}
        <polygon
          points={realizationPoints}
          fill="rgba(99, 102, 241, 0.2)"
          stroke="#6366F1"
          strokeWidth="2.5"
          className="transition-all duration-500 ease-in-out"
        />

        {/* Data Points (Dots on vertices) */}
        {angles.map((angle, i) => {
          const r = R * (Math.max(0, Math.min(100, mappings[i].cpl_average)) / 100);
          const pt = getCoordinates(r, angle);
          return (
            <circle
              key={`dot-${i}`}
              cx={pt.x.toFixed(1)}
              cy={pt.y.toFixed(1)}
              r="4"
              fill="#6366F1"
              stroke="#FFFFFF"
              strokeWidth="1.5"
            />
          );
        })}

        {/* Labels */}
        {angles.map((angle, i) => {
          const pt = getCoordinates(R + 15, angle);
          const cos = Math.cos(angle);
          
          let textAnchor: 'middle' | 'start' | 'end' = 'middle';
          if (cos > 0.15) textAnchor = 'start';
          else if (cos < -0.15) textAnchor = 'end';

          return (
            <g key={i}>
              {/* Backing for text readability */}
              <text
                x={pt.x.toFixed(1)}
                y={pt.y.toFixed(1)}
                textAnchor={textAnchor}
                fill="#FFFFFF"
                fontSize="10"
                fontWeight="bold"
                stroke="#FFFFFF"
                strokeWidth="3"
                paintOrder="stroke"
              >
                {mappings[i].cpl_code} ({mappings[i].cpl_average}%)
              </text>
              <text
                x={pt.x.toFixed(1)}
                y={pt.y.toFixed(1)}
                textAnchor={textAnchor}
                fill="#475569"
                fontSize="10"
                fontWeight="bold"
              >
                {mappings[i].cpl_code} ({mappings[i].cpl_average}%)
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};
