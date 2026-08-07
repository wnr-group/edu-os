"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

export type AttendanceSummary = {
  markedCount: number;
  totalCount: number;
};

interface AttendanceChartProps {
  data: AttendanceSummary;
}

const COLOR_MAP: Record<string, string> = {
  Marked: "#10b981",
  Pending: "#e5e7eb",
};

export function AttendanceChart({ data }: AttendanceChartProps) {
  const { markedCount, totalCount } = data;
  const pendingCount = Math.max(totalCount - markedCount, 0);
  const percent = totalCount > 0 ? Math.round((markedCount / totalCount) * 100) : 0;

  const chartData = [
    { name: "Marked", value: markedCount },
    { name: "Pending", value: pendingCount || (totalCount === 0 ? 1 : 0) }, // keep the ring visible when nothing's relevant today
  ];

  return (
    <div className="flex flex-col items-center">
      <div className="relative">
        <ResponsiveContainer width={180} height={180}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={80}
              dataKey="value"
              startAngle={90}
              endAngle={-270}
            >
              {chartData.map((entry) => (
                <Cell key={entry.name} fill={COLOR_MAP[entry.name]} />
              ))}
            </Pie>
            <Tooltip formatter={(value) => typeof value === "number" ? `${value}` : value} />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-2xl font-bold text-foreground">{percent}%</span>
        </div>
      </div>
      <p className="mt-2 text-sm font-medium text-foreground">
        {totalCount === 0 ? "No classes scheduled today" : `${markedCount} of ${totalCount} classes`}
      </p>
      {totalCount > 0 && <p className="text-xs text-muted-foreground">marked attendance today</p>}
      <div className="flex gap-4 mt-2">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
          <span className="text-xs text-muted-foreground">Marked ({markedCount})</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-gray-300" />
          <span className="text-xs text-muted-foreground">Pending ({pendingCount})</span>
        </div>
      </div>
    </div>
  );
}