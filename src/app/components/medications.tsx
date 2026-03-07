import { useState, useEffect } from "react";
import { useRecovery, type Medication, type MedicationLog } from "./store";
import { parseTimesFromFrequency, requestNotificationPermission } from "./notifications";
import {
  Pill,
  CheckCircle2,
  Circle,
  Clock,
  AlertCircle,
  Bell,
  BellRing,
} from "lucide-react";

export function Medications() {
  const { data, updateMedicationLog, addMedications } = useRecovery();
  const [showAddModal, setShowAddModal] = useState(false);
  const [newMed, setNewMed] = useState({
    name: "",
    dosage: "",
    frequency: "Twice daily",
    duration: "",
    instructions: "",
    reminderTimes: "08:00, 20:00",
  });
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | "default">("default");
  
  // Update permission status on mount
  useEffect(() => {
    if ("Notification" in window) {
      setNotifPermission(Notification.permission);
    }
  }, []);

  const handleEnableNotifications = async () => {
    const granted = await requestNotificationPermission();
    if (granted) {
      setNotifPermission("granted");
    } else {
      setNotifPermission("denied");
    }
  };

  const todayStr = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD

  // Generate today's schedule
  interface Dose {
    id: string; // unique key
    medication: Medication;
    time: string; // HH:mm
    hour: number;
    log: MedicationLog | undefined;
    isPast: boolean;
  }

  const currentHour = new Date().getHours();
  
  const schedule: Dose[] = [];

  data.medications.filter((m) => m.isActive).forEach((med) => {
    const times = med.reminderTimes && med.reminderTimes.length > 0
      ? med.reminderTimes
      : parseTimesFromFrequency(med.frequency).map(h => `${(h % 24).toString().padStart(2, "0")}:00`);

    times.forEach((timeStr) => {
      const actualHour = parseInt(timeStr.split(":")[0], 10);
      
      const log = data.medicationLogs.find(
        (l) => l.medicationId === med.id && l.date === todayStr && l.time === timeStr
      );

      schedule.push({
        id: `${med.id}-${timeStr}`,
        medication: med,
        time: timeStr,
        hour: actualHour,
        log,
        isPast: actualHour <= currentHour,
      });
    });
  });

  // Sort by time
  schedule.sort((a, b) => a.hour - b.hour);

  const pendingDoses = schedule.filter((d) => !d.log?.takenAt);
  const takenDoses = schedule.filter((d) => d.log?.takenAt);

  const handleTakeMedication = (medicationId: string, time: string) => {
    updateMedicationLog(medicationId, todayStr, time, "taken");
  };

  const handleUndoMedication = (medicationId: string, time: string) => {
    updateMedicationLog(medicationId, todayStr, time, "skipped");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[22px] text-foreground">Medications</h1>
          <p className="text-[14px] text-muted-foreground mt-1">
            Track and manage your daily prescriptions.
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-[14px] font-medium hover:opacity-90 transition-opacity"
        >
          Add Medication
        </button>
      </div>

      {notifPermission !== "granted" && (
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 flex items-start gap-4">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <BellRing className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="text-[14px] font-medium text-foreground">Turn on Medication Reminders</h3>
            <p className="text-[13px] text-muted-foreground mt-0.5">
              Allow browser notifications so we can remind you when it's time to take your pills.
            </p>
          </div>
          <button
            onClick={handleEnableNotifications}
            className="px-4 py-2 bg-primary text-primary-foreground text-[13px] rounded-lg hover:opacity-90 transition-opacity whitespace-nowrap"
          >
            Enable
          </button>
        </div>
      )}

      {/* Overview Cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-emerald-500" />
            <p className="text-[13px] text-muted-foreground font-medium">Taken Today</p>
          </div>
          <p className="text-[24px] text-foreground font-medium">{takenDoses.length}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-4 h-4 text-amber-500" />
            <p className="text-[13px] text-muted-foreground font-medium">Pending Doses</p>
          </div>
          <p className="text-[24px] text-foreground font-medium">{pendingDoses.length}</p>
        </div>
      </div>

      {data.medications.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-border rounded-xl">
          <Pill className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-50" />
          <p className="text-[14px] text-foreground font-medium">No active medications</p>
          <p className="text-[12px] text-muted-foreground mt-1">
            Upload your prescriptions or discharge summary in the Documents tab to add them automatically.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* TO TAKE */}
          <div>
            <h2 className="text-[15px] font-medium text-foreground mb-3 flex items-center gap-2">
              <Circle className="w-4 h-4 text-amber-500" />
              To Take
            </h2>
            {pendingDoses.length === 0 ? (
              <p className="text-[13px] text-muted-foreground p-4 bg-muted/30 rounded-lg text-center border border-dashed border-border">
                You're all caught up for today! 🎉
              </p>
            ) : (
              <div className="space-y-3">
                {pendingDoses.map((dose) => (
                  <DoseCard 
                    key={dose.id} 
                    dose={dose} 
                    onAction={() => handleTakeMedication(dose.medication.id, dose.time)} 
                    actionLabel="Mark Taken"
                    actionType="primary"
                  />
                ))}
              </div>
            )}
          </div>

          {/* COMPLETED */}
          {takenDoses.length > 0 && (
            <div>
              <h2 className="text-[15px] font-medium text-foreground mb-3 flex items-center gap-2 text-emerald-600">
                <CheckCircle2 className="w-4 h-4" />
                Completed
              </h2>
              <div className="space-y-3">
                {takenDoses.map((dose) => (
                  <DoseCard 
                    key={dose.id} 
                    dose={dose} 
                    onAction={() => handleUndoMedication(dose.medication.id, dose.time)} 
                    actionLabel="Undo"
                    actionType="muted"
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      {/* Add Medication Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-card rounded-xl w-full max-w-md p-6 border border-border">
            <h3 className="text-[16px] font-medium mb-4">Add Custom Medication</h3>
            <div className="space-y-4">
              <div>
                <label className="text-[12px] text-muted-foreground block mb-1">Name</label>
                <input 
                  type="text" 
                  value={newMed.name}
                  onChange={(e) => setNewMed({...newMed, name: e.target.value})}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-input-background text-[14px]"
                  placeholder="e.g. Paracetamol"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[12px] text-muted-foreground block mb-1">Dosage</label>
                  <input 
                    type="text" 
                    value={newMed.dosage}
                    onChange={(e) => setNewMed({...newMed, dosage: e.target.value})}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-input-background text-[14px]"
                    placeholder="e.g. 500mg"
                  />
                </div>
                <div>
                  <label className="text-[12px] text-muted-foreground block mb-1">Frequency</label>
                  <input 
                    type="text" 
                    value={newMed.frequency}
                    onChange={(e) => setNewMed({...newMed, frequency: e.target.value})}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-input-background text-[14px]"
                    placeholder="e.g. Twice daily"
                  />
                </div>
              </div>
              <div>
                <label className="text-[12px] text-muted-foreground block mb-1">Reminder Times (HH:mm, HH:mm...)</label>
                <input 
                  type="text" 
                  value={newMed.reminderTimes}
                  onChange={(e) => setNewMed({...newMed, reminderTimes: e.target.value})}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-input-background text-[14px]"
                  placeholder="08:00, 20:00"
                />
              </div>
              <div className="flex gap-3 mt-2">
                <button 
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2 rounded-lg border border-border hover:bg-muted text-[14px]"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => {
                    if (!newMed.name) return;
                    addMedications([{
                      name: newMed.name,
                      dosage: newMed.dosage,
                      frequency: newMed.frequency,
                      duration: newMed.duration,
                      instructions: newMed.instructions,
                      reminderTimes: newMed.reminderTimes.split(",").map(t => t.trim()).filter(Boolean)
                    }]);
                    setShowAddModal(false);
                    setNewMed({ name: "", dosage: "", frequency: "Twice daily", duration: "", instructions: "", reminderTimes: "08:00, 20:00" });
                  }}
                  className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground font-medium text-[14px]"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DoseCard({ 
  dose, 
  onAction, 
  actionLabel, 
  actionType 
}: { 
  dose: any; 
  onAction: () => void;
  actionLabel: string;
  actionType: "primary" | "muted";
}) {
  const { medication, time, isPast } = dose;

  // Formatting time (e.g. 08:00 -> 8:00 AM)
  const [hourStr, minStr] = time.split(":");
  let hr = parseInt(hourStr, 10);
  const ampm = hr >= 12 ? "PM" : "AM";
  if (hr === 0) hr = 12;
  if (hr > 12) hr -= 12;
  const displayTime = `${hr}:${minStr} ${ampm}`;

  const primaryBtn = "bg-primary text-primary-foreground hover:opacity-90 border-transparent";
  const mutedBtn = "bg-muted text-muted-foreground hover:bg-muted/80 border-border";

  return (
    <div className={`p-4 rounded-xl border flex items-center justify-between gap-4 transition-colors ${actionType === "muted" ? "border-emerald-500/30 bg-emerald-500/5 opacity-80" : "border-border bg-card"}`}>
      <div className="flex-1 min-w-0 flex items-start gap-4">
        {/* Time block */}
        <div className={`w-16 text-center pt-1 ${actionType === "muted" ? "text-emerald-600" : isPast ? "text-amber-600" : "text-foreground"}`}>
          <p className="text-[15px] font-semibold">{displayTime}</p>
        </div>

        {/* Divider */}
        <div className="w-px h-10 bg-border shrink-0 self-center" />

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className={`text-[15px] font-medium truncate ${actionType === 'muted' ? 'text-foreground/80 line-through decoration-emerald-500/50' : 'text-foreground'}`}>
              {medication.name}
            </h3>
            {medication.dosage && (
              <span className={`text-[11px] px-1.5 py-0.5 rounded ${actionType === 'muted' ? 'bg-emerald-500/20 text-emerald-700' : 'bg-primary/10 text-primary'}`}>
                {medication.dosage}
              </span>
            )}
          </div>
          <p className="text-[12px] text-muted-foreground mt-0.5 truncate">
            {medication.instructions || "Take as prescribed"}
          </p>
        </div>
      </div>

      <button
        onClick={onAction}
        className={`shrink-0 px-4 py-2 border rounded-lg text-[13px] font-medium transition-colors ${actionType === "primary" ? primaryBtn : mutedBtn}`}
      >
        {actionLabel}
      </button>
    </div>
  );
}
