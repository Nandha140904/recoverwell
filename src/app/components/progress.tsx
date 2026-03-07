import { useRecovery } from "./store";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
} from "recharts";
import { TrendingDown, TrendingUp, Activity, Thermometer, Weight } from "lucide-react";
import { useState } from "react";

export function Progress() {
  const { data } = useRecovery();
  const [activeChart, setActiveChart] = useState<"pain" | "temp" | "weight">("pain");

  // Reverse entries for chronological order
  const entries = [...data.healthEntries].reverse();

  const chartData = entries.map((e) => ({
    date: e.date.slice(5), // MM-DD
    pain: e.painLevel,
    temp: e.temperature,
    weight: e.weight,
  }));

  // Calculate statistics
  const latestPain = entries[entries.length - 1]?.painLevel ?? 0;
  const firstPain = entries[0]?.painLevel ?? 0;
  const painImprovement = firstPain - latestPain;

  const latestTemp = entries[entries.length - 1]?.temperature ?? 0;
  const avgTemp = entries.reduce((sum, e) => sum + e.temperature, 0) / entries.length;

  const latestWeight = entries[entries.length - 1]?.weight ?? 0;
  const firstWeight = entries[0]?.weight ?? 0;
  const weightChange = latestWeight - firstWeight;

  // Symptom frequency
  const symptomCounts: Record<string, number> = {};
  data.healthEntries.forEach((e) => {
    e.symptoms.forEach((s) => {
      symptomCounts[s] = (symptomCounts[s] || 0) + 1;
    });
  });
  const topSymptoms = Object.entries(symptomCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  // Mood distribution
  const moodCounts: Record<string, number> = { great: 0, good: 0, okay: 0, poor: 0, bad: 0 };
  data.healthEntries.forEach((e) => {
    moodCounts[e.mood]++;
  });
  const moodData = Object.entries(moodCounts).map(([mood, count]) => ({ mood, count }));
  const moodEmoji: Record<string, string> = {
    great: "😊", good: "🙂", okay: "😐", poor: "😟", bad: "😣",
  };

  const chartConfigs = {
    pain: {
      dataKey: "pain",
      color: "#ef4444",
      label: "Pain Level",
      icon: <Activity className="w-5 h-5 text-red-500" />,
      domain: [0, 10],
    },
    temp: {
      dataKey: "temp",
      color: "#f59e0b",
      label: "Temperature (°F)",
      icon: <Thermometer className="w-5 h-5 text-amber-500" />,
      domain: [96, 102],
    },
    weight: {
      dataKey: "weight",
      color: "#3b82f6",
      label: "Weight (lbs)",
      icon: <Weight className="w-5 h-5 text-blue-500" />,
      domain: ["auto", "auto"] as [string, string],
    },
  };

  const config = chartConfigs[activeChart];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] text-foreground">Recovery Progress</h1>
        <p className="text-[14px] text-muted-foreground mt-1">
          Visualize your recovery trends and insights
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center justify-between mb-2">
            <Activity className="w-5 h-5 text-red-500" />
            {painImprovement > 0 ? (
              <TrendingDown className="w-4 h-4 text-emerald-500" />
            ) : (
              <TrendingUp className="w-4 h-4 text-red-500" />
            )}
          </div>
          <p className="text-[22px] text-foreground">{painImprovement > 0 ? "-" : "+"}{Math.abs(painImprovement)} pts</p>
          <p className="text-[12px] text-muted-foreground">Pain improvement since start</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center justify-between mb-2">
            <Thermometer className="w-5 h-5 text-amber-500" />
            <span className={`text-[11px] px-2 py-0.5 rounded-full ${
              latestTemp <= 99.5 ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
            }`}>
              {latestTemp <= 99.5 ? "Normal" : "Monitor"}
            </span>
          </div>
          <p className="text-[22px] text-foreground">{avgTemp.toFixed(1)}°F</p>
          <p className="text-[12px] text-muted-foreground">Average temperature</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center justify-between mb-2">
            <Weight className="w-5 h-5 text-blue-500" />
            {weightChange < 0 ? (
              <TrendingDown className="w-4 h-4 text-blue-500" />
            ) : (
              <TrendingUp className="w-4 h-4 text-blue-500" />
            )}
          </div>
          <p className="text-[22px] text-foreground">{weightChange > 0 ? "+" : ""}{weightChange.toFixed(1)} lbs</p>
          <p className="text-[12px] text-muted-foreground">Weight change since start</p>
        </div>
      </div>

      {/* Main Chart */}
      <div className="bg-card rounded-xl border border-border p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-2">
            {config.icon}
            <h3 className="text-[15px]">{config.label} Over Time</h3>
          </div>
          <div className="flex gap-2">
            {(["pain", "temp", "weight"] as const).map((key) => (
              <button
                key={key}
                onClick={() => setActiveChart(key)}
                className={`px-3 py-1.5 rounded-lg text-[12px] transition-colors ${
                  activeChart === key
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {key === "pain" ? "Pain" : key === "temp" ? "Temperature" : "Weight"}
              </button>
            ))}
          </div>
        </div>

        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: "#64748b" }}
                axisLine={{ stroke: "#e2e8f0" }}
              />
              <YAxis
                domain={config.domain as [number, number]}
                tick={{ fontSize: 11, fill: "#64748b" }}
                axisLine={{ stroke: "#e2e8f0" }}
              />
              <Tooltip
                contentStyle={{
                  fontSize: 12,
                  borderRadius: 8,
                  border: "1px solid #e2e8f0",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                }}
              />
              <Area
                type="monotone"
                dataKey={config.dataKey}
                stroke={config.color}
                fill={config.color}
                fillOpacity={0.1}
                strokeWidth={2}
                dot={{ r: 4, fill: config.color }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Two Column: Symptoms & Mood */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Symptoms */}
        <div className="bg-card rounded-xl border border-border p-5">
          <h3 className="text-[15px] mb-4">Most Reported Symptoms</h3>
          <div className="space-y-3">
            {topSymptoms.map(([symptom, count]) => (
              <div key={symptom}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[13px] text-foreground">{symptom}</span>
                  <span className="text-[12px] text-muted-foreground">{count} days</span>
                </div>
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${(count / data.healthEntries.length) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Mood Distribution */}
        <div className="bg-card rounded-xl border border-border p-5">
          <h3 className="text-[15px] mb-4">Mood Distribution</h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={moodData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="mood"
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  axisLine={{ stroke: "#e2e8f0" }}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  axisLine={{ stroke: "#e2e8f0" }}
                />
                <Tooltip
                  contentStyle={{
                    fontSize: 12,
                    borderRadius: 8,
                    border: "1px solid #e2e8f0",
                  }}
                />
                <Bar dataKey="count" fill="#0d9488" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-4 mt-3">
            {Object.entries(moodEmoji).map(([mood, emoji]) => (
              <div key={mood} className="text-center">
                <span className="text-[16px]">{emoji}</span>
                <p className="text-[10px] text-muted-foreground capitalize">{mood}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Risk Analysis */}
      <div className="bg-card rounded-xl border border-border p-5">
        <h3 className="text-[15px] mb-4">Risk Assessment Summary</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <RiskIndicator
            label="Infection Risk"
            level="low"
            reason="Temperature stable, no wound concerns"
          />
          <RiskIndicator
            label="Blood Clot Risk"
            level="low"
            reason="Taking aspirin, doing ankle exercises"
          />
          <RiskIndicator
            label="Nutritional Risk"
            level="moderate"
            reason="Hemoglobin slightly low, monitor iron intake"
          />
          <RiskIndicator
            label="Mobility Risk"
            level="low"
            reason="Pain decreasing, exercises progressing"
          />
        </div>
      </div>
    </div>
  );
}

function RiskIndicator({
  label,
  level,
  reason,
}: {
  label: string;
  level: "low" | "moderate" | "high";
  reason: string;
}) {
  const colors = {
    low: "border-emerald-200 bg-emerald-50",
    moderate: "border-amber-200 bg-amber-50",
    high: "border-red-200 bg-red-50",
  };
  const textColors = {
    low: "text-emerald-700",
    moderate: "text-amber-700",
    high: "text-red-700",
  };
  const dotColors = {
    low: "bg-emerald-500",
    moderate: "bg-amber-500",
    high: "bg-red-500",
  };

  return (
    <div className={`rounded-lg border p-3 ${colors[level]}`}>
      <div className="flex items-center gap-2 mb-1.5">
        <div className={`w-2 h-2 rounded-full ${dotColors[level]}`} />
        <span className={`text-[13px] ${textColors[level]}`}>
          {level.charAt(0).toUpperCase() + level.slice(1)}
        </span>
      </div>
      <p className="text-[13px] text-foreground">{label}</p>
      <p className="text-[11px] text-muted-foreground mt-0.5">{reason}</p>
    </div>
  );
}
