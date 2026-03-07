import { useRecovery } from "./store";
import {
  Thermometer,
  Weight,
  Activity,
  AlertTriangle,
  CheckCircle2,
  TrendingDown,
  Clock,
  Droplets,
  Pill,
  ArrowRight,
  Bell,
} from "lucide-react";
import { Link } from "react-router";
import { parseTimesFromFrequency } from "./notifications";

export function Dashboard() {
  const { data, updateMedicationLog } = useRecovery();
  const latest = data.healthEntries[0];
  const previous = data.healthEntries[1];

  const tempTrend = latest && previous ? latest.temperature - previous.temperature : 0;
  const painTrend = latest && previous ? latest.painLevel - previous.painLevel : 0;

  const riskColor = {
    low: "text-emerald-600 bg-emerald-50",
    moderate: "text-amber-600 bg-amber-50",
    high: "text-red-600 bg-red-50",
  };

  const moodEmoji = {
    great: "😊",
    good: "🙂",
    okay: "😐",
    poor: "😟",
    bad: "😣",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-[22px] text-foreground">
          Welcome back, {data.userProfile?.name?.split(" ")[0] || "Patient"}
        </h1>
        <p className="text-[14px] text-muted-foreground mt-1">
          {data.surgeryType} — Week {data.currentWeek} of recovery
          {data.userProfile?.doctorName && (
            <span> • Dr. {data.userProfile.doctorName}</span>
          )}
        </p>
      </div>

      {/* Risk Banner */}
      <div
        className={`rounded-xl p-4 flex items-center gap-3 ${
          data.riskLevel === "low"
            ? "bg-emerald-50 border border-emerald-200"
            : data.riskLevel === "moderate"
            ? "bg-amber-50 border border-amber-200"
            : "bg-red-50 border border-red-200"
        }`}
      >
        {data.riskLevel === "low" ? (
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
        ) : (
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
        )}
        <div>
          <p className={`text-[14px] ${riskColor[data.riskLevel].split(" ")[0]}`}>
            Risk Level: {data.riskLevel.charAt(0).toUpperCase() + data.riskLevel.slice(1)}
          </p>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            {data.riskLevel === "low"
              ? "Your recovery indicators are within normal range. Keep up the good progress!"
              : "Some indicators need attention. Consider consulting your healthcare provider."}
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<Thermometer className="w-5 h-5 text-orange-500" />}
          label="Temperature"
          value={latest ? `${latest.temperature}°F` : "—"}
          trend={tempTrend !== 0 ? `${tempTrend > 0 ? "+" : ""}${tempTrend.toFixed(1)}°F` : "Stable"}
          trendUp={tempTrend > 0}
        />
        <StatCard
          icon={<Weight className="w-5 h-5 text-blue-500" />}
          label="Weight"
          value={latest ? `${latest.weight} lbs` : "—"}
          trend={latest && previous ? `${(latest.weight - previous.weight).toFixed(1)} lbs` : "—"}
          trendUp={(latest?.weight ?? 0) > (previous?.weight ?? 0)}
        />
        <StatCard
          icon={<Activity className="w-5 h-5 text-red-500" />}
          label="Pain Level"
          value={latest ? `${latest.painLevel}/10` : "—"}
          trend={painTrend !== 0 ? `${painTrend > 0 ? "+" : ""}${painTrend} pts` : "Stable"}
          trendUp={painTrend > 0}
          invertTrend
        />
        <StatCard
          icon={<div className="text-[20px]">{latest ? moodEmoji[latest.mood] : "—"}</div>}
          label="Today's Mood"
          value={latest ? latest.mood.charAt(0).toUpperCase() + latest.mood.slice(1) : "—"}
          trend="Self-reported"
        />
      </div>

      {/* Progress Bar */}
      <div className="bg-card rounded-xl border border-border p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[15px]">Overall Recovery Progress</h3>
          <span className="text-[14px] text-primary">{data.overallProgress}%</span>
        </div>
        <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-500"
            style={{ width: `${data.overallProgress}%` }}
          />
        </div>
        <div className="flex justify-between mt-2 text-[11px] text-muted-foreground">
          <span>Surgery Day</span>
          <span>Full Recovery</span>
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Today's Reminders */}
        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[15px]">Today's Reminders</h3>
            <Link
              to="/dashboard/medications"
              className="text-[12px] text-primary flex items-center gap-1 hover:underline"
            >
              Manage <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-3">
            {(() => {
              const todayStr = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
              const currentHour = new Date().getHours();
              const doses: { medId: string; medName: string; time: string; hour: number; done: boolean }[] = [];

              data.medications.filter(m => m.isActive).forEach(med => {
                const times = med.reminderTimes && med.reminderTimes.length > 0 
                  ? med.reminderTimes 
                  : parseTimesFromFrequency(med.frequency).map(h => `${(h === 24 ? 0 : h).toString().padStart(2, "0")}:00`);

                times.forEach(timeStr => {
                  const [h] = timeStr.split(":").map(Number);
                  const log = data.medicationLogs.find(
                    l => l.medicationId === med.id && l.date === todayStr && l.time === timeStr
                  );
                  doses.push({
                    medId: med.id,
                    medName: med.name + (med.dosage ? ` ${med.dosage}` : ""),
                    time: timeStr,
                    hour: h,
                    done: !!log?.takenAt
                  });
                });
              });

              doses.sort((a, b) => a.hour - b.hour);

              if (doses.length === 0) {
                return (
                  <div className="py-8 text-center border border-dashed border-border rounded-lg">
                    <p className="text-[13px] text-muted-foreground">No medications for today.</p>
                  </div>
                );
              }

              return doses.slice(0, 5).map((dose, idx) => {
                // Formatting time (e.g. 08:00 -> 8:00 AM)
                const [hourStr, minStr] = dose.time.split(":");
                let hr = parseInt(hourStr, 10);
                const ampm = hr >= 12 ? "PM" : "AM";
                if (hr === 0) hr = 12;
                if (hr > 12) hr -= 12;
                const displayTime = `${hr}:${minStr} ${ampm}`;

                return (
                  <ReminderItem
                    key={`${dose.medId}-${dose.time}-${idx}`}
                    icon={<Pill className="w-4 h-4 text-purple-500" />}
                    title={dose.medName}
                    time={displayTime}
                    done={dose.done}
                    onToggle={() => {
                      updateMedicationLog(dose.medId, todayStr, dose.time, dose.done ? "skipped" : "taken");
                    }}
                  />
                );
              });
            })()}

            {/* Other standard reminders */}
            <ReminderItem
              icon={<Droplets className="w-4 h-4 text-blue-500" />}
              title="Hydration Goal: 8 glasses of water"
              time="Self-report in symptoms log"
            />
            <ReminderItem
              icon={<Activity className="w-4 h-4 text-emerald-500" />}
              title="Gentle Range-of-Motion Exercises"
              time="15 minutes — Afternoons"
            />
          </div>
        </div>

        {/* Recent Symptoms */}
        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[15px]">Recent Symptoms</h3>
            <Link
              to="/dashboard/health-log"
              className="text-[12px] text-primary flex items-center gap-1 hover:underline"
            >
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-3">
            {data.healthEntries.slice(0, 4).map((entry) => (
              <div
                key={entry.id}
                className="flex items-start gap-3 pb-3 border-b border-border last:border-0 last:pb-0"
              >
                <div className="text-[18px] mt-0.5">{moodEmoji[entry.mood]}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] text-foreground">{entry.date}</p>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {entry.symptoms.map((s) => (
                      <span
                        key={s}
                        className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
                <span className="text-[12px] text-muted-foreground shrink-0">
                  Pain: {entry.painLevel}/10
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link
          to="/health-log"
          className="bg-card rounded-xl border border-border p-4 hover:border-primary transition-colors group"
        >
          <Activity className="w-5 h-5 text-primary mb-2" />
          <p className="text-[14px]">Log Today's Health</p>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            Record your symptoms and vitals
          </p>
        </Link>
        <Link
          to="/documents"
          className="bg-card rounded-xl border border-border p-4 hover:border-primary transition-colors group"
        >
          <TrendingDown className="w-5 h-5 text-primary mb-2" />
          <p className="text-[14px]">Upload Document</p>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            Analyze medical reports
          </p>
        </Link>
        <Link
          to="/recovery"
          className="bg-card rounded-xl border border-border p-4 hover:border-primary transition-colors group"
        >
          <TrendingDown className="w-5 h-5 text-primary mb-2" />
          <p className="text-[14px]">Recovery Guide</p>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            View personalized recommendations
          </p>
        </Link>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  trend,
  trendUp,
  invertTrend,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  trend?: string;
  trendUp?: boolean;
  invertTrend?: boolean;
}) {
  const isNeutral = trend === "Stable" || trend === "Self-reported" || trend === "—";
  const isGood = invertTrend ? !trendUp : !trendUp;

  return (
    <div className="bg-card rounded-xl border border-border p-4">
      <div className="flex items-center justify-between mb-3">
        {icon}
        {trend && !isNeutral && (
          <span
            className={`text-[11px] px-2 py-0.5 rounded-full ${
              isGood ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
            }`}
          >
            {trend}
          </span>
        )}
        {isNeutral && (
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
            {trend}
          </span>
        )}
      </div>
      <p className="text-[20px] text-foreground">{value}</p>
      <p className="text-[12px] text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

function ReminderItem({
  icon,
  title,
  time,
  done,
  onToggle,
}: {
  icon: React.ReactNode;
  title: string;
  time: string;
  done?: boolean;
  onToggle?: () => void;
}) {
  return (
    <div className={`flex items-start gap-3 p-2 rounded-lg transition-colors ${done ? "bg-muted/30" : "hover:bg-muted/50"}`}>
      <div className="mt-1">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className={`text-[13px] truncate ${done ? "line-through text-muted-foreground" : "text-foreground font-medium"}`}>
          {title}
        </p>
        <p className="text-[11px] text-muted-foreground">{time}</p>
      </div>
      <button 
        onClick={(e) => { e.preventDefault(); onToggle?.(); }}
        className={`shrink-0 w-6 h-6 rounded-full border flex items-center justify-center transition-all ${
          done 
            ? "bg-emerald-500 border-emerald-500 text-white" 
            : "border-border hover:border-primary text-transparent"
        }`}
      >
        <CheckCircle2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}