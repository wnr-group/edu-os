"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

export type TermFee = {
  term: string;
  range: string;
  collected: number;
  due: number;
};

interface FeeCollectionChartProps {
  data: TermFee[];
}

export function FeeCollectionChart({ data }: FeeCollectionChartProps) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="term" tick={{ fontSize: 12 }} />
        <YAxis
          tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
          tick={{ fontSize: 12 }}
        />
        <Tooltip
          formatter={(value) =>
            typeof value === "number" ? `₹${value.toLocaleString("en-IN")}` : value
          }
          labelFormatter={(label, payload) => {
            const range = payload?.[0]?.payload?.range;
            return range ? `${label} (${range})` : label;
          }}
        />
        <Legend />
        <Bar dataKey="collected" name="Collected" fill="#6366f1" radius={[4, 4, 0, 0]} />
        <Bar dataKey="due" name="Due" fill="#e0e7ff" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}