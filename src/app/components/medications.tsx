import { useState, useEffect } from "react";
import { useRecovery, type Medication, type MedicationLog } from "./store";
import { parseTimesFromFrequency, requestNotificationPermission } from "./notifications";
import {
  Pill,
  CheckCircle2,
  Circle,
  Clock,
  AlertCircle,
  BellRing,
  X,
  Plus,
} from "lucide-react";

export function Medications() {
  const { data, updateMedicationLog, addMedications, deactivateMedication } = useRecovery();
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
  
  useEffect(() => {
    if ("Notification" in window) {
      setNotifPermission(Notification.permission);
    }
  }, []);

  const handleEnableNotifications = async () => {
    const granted = await requestNotificationPermission();
    setNotifPermission(granted ? "granted" : "denied");
  };

  const todayStr = new Date().toLocaleDateString('en-CA');

  interface Dose {
    id: string;
    medication: Medication;
    time: string;
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
          <h1 className="text-[22px] text-foreground font-semibold">Medications</h1>
          <p className="text-[14px] text-muted-foreground mt-1">
            Track your daily doses and manage your prescriptions.
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-[14px] font-medium hover:opacity-90 transition-all shadow-sm active:scale-95"
        >
          <Plus className="w-4 h-4" /> Add Medication
        </button>
      </div>

      {notifPermission !== "granted" && (
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <BellRing className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="text-[14px] font-medium text-foreground">Enable Reminders</h3>
            <p className="text-[12px] text-muted-foreground">Never miss a dose with browser notifications.</p>
          </div>
          <button
            onClick={handleEnableNotifications}
            className="px-4 py-1.5 bg-primary text-primary-foreground text-[12px] rounded-lg font-medium hover:opacity-90"
          >
            Enable
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-card rounded-xl border border-border p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <p className="text-[12px] text-muted-foreground font-medium">Taken Today</p>
          </div>
          <p className="text-[22px] font-bold">{takenDoses.length}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-amber-500" />
            <p className="text-[12px] text-muted-foreground font-medium">Pending</p>
          </div>
          <p className="text-[22px] font-bold">{pendingDoses.length}</p>
        </div>
      </div>

      {/* Main Schedule */}
      <div className="space-y-6">
        <div>
          <h2 className="text-[16px] font-semibold mb-3 flex items-center gap-2">
            <Circle className="w-4 h-4 text-amber-500" />
            Daily Schedule
          </h2>
          
          {schedule.length === 0 ? (
            <div className="text-center py-10 bg-muted/20 border border-dashed border-border rounded-xl">
              <Pill className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-50" />
              <p className="text-[13px] text-muted-foreground">No medications scheduled for today.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {schedule.map((dose) => (
                <DoseCard 
                  key={dose.id} 
                  dose={dose} 
                  onAction={() => dose.log?.takenAt ? handleUndoMedication(dose.medication.id, dose.time) : handleTakeMedication(dose.medication.id, dose.time)} 
                  actionLabel={dose.log?.takenAt ? "Undo" : "Mark Taken"}
                  isTaken={!!dose.log?.takenAt}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Active Inventory */}
      <div className="pt-6 border-t border-border">
        <h2 className="text-[16px] font-semibold mb-4">Manage Prescriptions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data.medications.filter(m => m.isActive).map(med => (
            <div key={med.id} className="p-4 bg-card border border-border rounded-xl flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/5 flex items-center justify-center">
                  <Pill className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-[14px] font-semibold">{med.name}</h3>
                  <p className="text-[12px] text-muted-foreground">{med.dosage} • {med.frequency}</p>
                </div>
              </div>
              <button 
                onClick={() => deactivateMedication(med.id)}
                className="px-3 py-1.5 rounded-lg border border-red-100 text-red-600 text-[12px] font-medium hover:bg-red-50"
              >
                Stop
              </button>
            </div>
          ))}
          {data.medications.filter(m => m.isActive).length === 0 && (
            <div className="col-span-full py-6 text-center bg-muted/10 border border-dashed border-border rounded-xl">
              <p className="text-[12px] text-muted-foreground">No active prescriptions.</p>
            </div>
          )}
        </div>
      </div>

      {/* Discontinued */}
      {data.medications.some(m => !m.isActive) && (
        <div className="pt-6">
          <h2 className="text-[16px] font-semibold text-muted-foreground mb-4">Treatment History</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 opacity-70">
            {data.medications.filter(m => !m.isActive).map(med => (
              <div key={med.id} className="p-4 bg-muted/30 border border-border rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-3 grayscale">
                  <Pill className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <h3 className="text-[14px] font-medium line-through">{med.name}</h3>
                    <p className="text-[11px] text-muted-foreground">{med.dosage} (Completed)</p>
                  </div>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-muted text-muted-foreground">STOPPED</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card rounded-2xl w-full max-w-md p-6 border border-border shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-[18px] font-bold">Add Medication</h3>
              <button onClick={() => setShowAddModal(false)}><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            
            <div className="space-y-4">
               <div className="space-y-1.5">
                <label className="text-[12px] font-semibold text-foreground ml-1">Medication Name</label>
                <input 
                  type="text" 
                  value={newMed.name}
                  onChange={(e) => setNewMed({...newMed, name: e.target.value})}
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-input-background text-[14px] focus:ring-2 focus:ring-primary/20"
                  placeholder="e.g. Lipitor"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[12px] font-semibold text-foreground ml-1">Dosage</label>
                  <input 
                    type="text" 
                    value={newMed.dosage}
                    onChange={(e) => setNewMed({...newMed, dosage: e.target.value})}
                    className="w-full px-4 py-2.5 rounded-xl border border-border bg-input-background text-[14px]"
                    placeholder="e.g. 10mg"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[12px] font-semibold text-foreground ml-1">Frequency</label>
                  <input 
                    type="text" 
                    value={newMed.frequency}
                    onChange={(e) => setNewMed({...newMed, frequency: e.target.value})}
                    className="w-full px-4 py-2.5 rounded-xl border border-border bg-input-background text-[14px]"
                    placeholder="e.g. BD"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[12px] font-semibold text-foreground ml-1">Reminder Times (HH:mm, HH:mm)</label>
                <input 
                  type="text" 
                  value={newMed.reminderTimes}
                  onChange={(e) => setNewMed({...newMed, reminderTimes: e.target.value})}
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-input-background text-[14px]"
                  placeholder="08:00, 20:00"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button 
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-border font-medium hover:bg-muted"
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
                  className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold shadow-lg shadow-primary/20"
                >
                  Add
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
  isTaken 
}: { 
  dose: any; 
  onAction: () => void;
  actionLabel: string;
  isTaken: boolean;
}) {
  const { medication, time, isPast } = dose;

  const [hourStr, minStr] = time.split(":");
  let hr = parseInt(hourStr, 10);
  const ampm = hr >= 12 ? "PM" : "AM";
  if (hr === 0) hr = 12;
  if (hr > 12) hr -= 12;
  const displayTime = `${hr}:${minStr} ${ampm}`;

  return (
    <div className={`p-4 rounded-xl border flex items-center justify-between gap-4 transition-all duration-300 ${
      isTaken ? "bg-emerald-50/50 border-emerald-200/50 opacity-80" : "bg-card border-border shadow-sm"
    }`}>
      <div className="flex items-center gap-4 flex-1">
        <div className={`w-14 text-center ${isTaken ? "text-emerald-500" : isPast ? "text-amber-500" : "text-foreground"}`}>
          <p className="text-[14px] font-bold">{displayTime}</p>
        </div>
        <div className="w-px h-8 bg-border shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className={`text-[15px] font-semibold truncate ${isTaken ? "line-through text-muted-foreground" : "text-foreground"}`}>
              {medication.name}
            </h3>
            {medication.dosage && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase ${
                isTaken ? "bg-emerald-100 text-emerald-700" : "bg-primary/10 text-primary"
              }`}>
                {medication.dosage}
              </span>
            )}
          </div>
          <p className="text-[12px] text-muted-foreground truncate">
            {medication.instructions || "Take as prescribed"}
          </p>
        </div>
      </div>
      <button
        onClick={onAction}
        className={`px-4 py-2 rounded-lg text-[12px] font-bold transition-all ${
          isTaken 
            ? "bg-muted text-muted-foreground hover:bg-muted/80" 
            : "bg-primary text-primary-foreground hover:shadow-md active:scale-95"
        }`}
      >
        {actionLabel}
      </button>
    </div>
  );
}
