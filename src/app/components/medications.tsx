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
  const { data, updateMedicationLog, addMedications, updateMedicationStatus } = useRecovery();
  const [showAddModal, setShowAddModal] = useState(false);
  
  const [newMed, setNewMed] = useState({
    name: "",
    dosage: "",
    frequency: "Once daily",
    duration: "",
    instructions: "",
    startDate: new Date().toISOString().split('T')[0],
    endDate: "",
    reminderTimes: ["08:00"],
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

  const frequencyOptions = [
    "Once daily",
    "Twice daily",
    "Three times daily",
    "Four times daily",
    "Every 6 hours",
    "Every 8 hours",
    "Custom schedule",
  ];

  const handleFrequencyChange = (freq: string) => {
    let times: string[] = [];
    switch (freq) {
      case "Once daily": times = ["08:00"]; break;
      case "Twice daily": times = ["08:00", "20:00"]; break;
      case "Three times daily": times = ["08:00", "14:00", "20:00"]; break;
      case "Four times daily": times = ["06:00", "12:00", "18:00", "00:00"]; break;
      case "Every 6 hours": times = ["06:00", "12:00", "18:00", "00:00"]; break;
      case "Every 8 hours": times = ["08:00", "16:00", "00:00"]; break;
      case "Custom schedule": times = ["08:00"]; break;
      default: times = ["08:00"];
    }
    setNewMed(prev => ({ ...prev, frequency: freq, reminderTimes: times }));
  };

  const updateReminderTime = (index: number, time: string) => {
    const updated = [...newMed.reminderTimes];
    updated[index] = time;
    setNewMed(prev => ({ ...prev, reminderTimes: updated }));
  };

  const addReminderTime = () => {
    setNewMed(prev => ({ ...prev, reminderTimes: [...prev.reminderTimes, "12:00"] }));
  };

  const removeReminderTime = (index: number) => {
    if (newMed.reminderTimes.length <= 1) return;
    const updated = newMed.reminderTimes.filter((_, i) => i !== index);
    setNewMed(prev => ({ ...prev, reminderTimes: updated }));
  };

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

  const activeMeds = data.medications.filter((m) => m.isActive && m.status === "active");

  activeMeds.forEach((med) => {
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
            Professional medication tracking and scheduling.
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
            <p className="text-[12px] text-muted-foreground">Get precise clinical alerts for every dose.</p>
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
        <div className="bg-card rounded-xl border border-border p-4 shadow-sm group hover:border-emerald-200 transition-colors">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <p className="text-[12px] text-muted-foreground font-medium">Taken Today</p>
          </div>
          <p className="text-[22px] font-bold text-foreground">{takenDoses.length}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4 shadow-sm group hover:border-amber-200 transition-colors">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-amber-500" />
            <p className="text-[12px] text-muted-foreground font-medium">Pending Doses</p>
          </div>
          <p className="text-[22px] font-bold text-foreground">{pendingDoses.length}</p>
        </div>
      </div>

      {/* Daily Schedule */}
      <div className="space-y-4">
        <h2 className="text-[16px] font-semibold flex items-center gap-2 px-1">
           <Circle className="w-4 h-4 text-amber-500" />
           Your Schedule
        </h2>
        {schedule.length === 0 ? (
          <div className="text-center py-12 bg-muted/20 border border-dashed border-border rounded-2xl">
            <Pill className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-30" />
            <p className="text-[14px] text-foreground font-medium">No schedule for today</p>
            <p className="text-[12px] text-muted-foreground mt-1">Add medications to see your daily doses here.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {schedule.map((dose) => (
              <DoseCard 
                key={dose.id} 
                dose={dose} 
                onAction={() => dose.log?.takenAt ? handleUndoMedication(dose.medication.id, dose.time) : handleTakeMedication(dose.medication.id, dose.time)} 
                isTaken={!!dose.log?.takenAt}
              />
            ))}
          </div>
        )}
      </div>

      {/* Management Inventory */}
      <div className="pt-6 border-t border-border">
        <h2 className="text-[16px] font-semibold mb-4 px-1">Prescription Management</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data.medications.map(med => (
            <div key={med.id} className={`p-4 rounded-xl border flex flex-col gap-3 transition-all ${
              med.status === "active" ? "bg-card border-border shadow-sm" : "bg-muted/30 border-border opacity-70"
            }`}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    med.status === "active" ? "bg-primary/5" : "bg-muted"
                  }`}>
                    <Pill className={`w-5 h-5 ${med.status === "active" ? "text-primary" : "text-muted-foreground"}`} />
                  </div>
                  <div>
                    <h3 className="text-[14px] font-semibold text-foreground">{med.name}</h3>
                    <p className="text-[12px] text-muted-foreground">{med.dosage} • {med.frequency}</p>
                  </div>
                </div>
                <StatusBadge status={med.status} />
              </div>

              <div className="flex items-center gap-2 mt-1">
                <select 
                  value={med.status}
                  onChange={(e) => updateMedicationStatus(med.id, e.target.value as Medication["status"])}
                  className="flex-1 bg-background border border-border rounded-lg px-2 py-1.5 text-[12px] outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="completed">Completed</option>
                  <option value="stopped">Stopped</option>
                </select>
                {(med.startDate || med.endDate) && (
                  <div className="px-3 py-1.5 bg-muted rounded-lg text-[11px] font-medium text-muted-foreground whitespace-nowrap">
                    {med.startDate && `${med.startDate}`}
                    {med.endDate && ` → ${med.endDate}`}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-card rounded-3xl w-full max-w-lg p-7 border border-border shadow-2xl animate-in zoom-in-95 duration-200 overflow-y-auto max-h-[90vh]">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-[20px] font-bold text-foreground">Add Medication</h3>
                <p className="text-[13px] text-muted-foreground mt-0.5">Schedule your clinical doses.</p>
              </div>
              <button onClick={() => setShowAddModal(false)} className="p-2 hover:bg-muted rounded-full">
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
            
            <div className="space-y-5">
               <div className="space-y-4">
                 <div className="space-y-1.5">
                  <label className="text-[12px] font-bold text-foreground/80 ml-1">Medication Name</label>
                  <input 
                    type="text" 
                    value={newMed.name}
                    onChange={(e) => setNewMed({...newMed, name: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-border bg-input-background text-[15px] focus:ring-2 focus:ring-primary/20 outline-none"
                    placeholder="e.g. Lipitor"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[12px] font-bold text-foreground/80 ml-1">Dosage</label>
                    <input 
                      type="text" 
                      value={newMed.dosage}
                      onChange={(e) => setNewMed({...newMed, dosage: e.target.value})}
                      className="w-full px-4 py-3 rounded-xl border border-border bg-input-background text-[15px] outline-none"
                      placeholder="e.g. 10mg"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[12px] font-bold text-foreground/80 ml-1">Frequency</label>
                    <select 
                      value={newMed.frequency}
                      onChange={(e) => handleFrequencyChange(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-border bg-input-background text-[15px] outline-none"
                    >
                      {frequencyOptions.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Time Slots */}
              <div className="space-y-3 bg-muted/30 p-4 rounded-2xl border border-border">
                <div className="flex items-center justify-between">
                  <label className="text-[13px] font-bold text-foreground flex items-center gap-2">
                    <Clock className="w-4 h-4 text-primary" />
                    Time Slots
                  </label>
                  {newMed.frequency === "Custom schedule" && (
                    <button onClick={addReminderTime} className="text-[11px] font-bold text-primary">+ Add</button>
                  )}
                </div>
                
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {newMed.reminderTimes.map((time, idx) => (
                    <div key={idx} className="relative group">
                      <input 
                        type="time" 
                        value={time}
                        onChange={(e) => updateReminderTime(idx, e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-border bg-background text-[13px] outline-none"
                      />
                      {newMed.frequency === "Custom schedule" && newMed.reminderTimes.length > 1 && (
                        <button 
                          onClick={() => removeReminderTime(idx)}
                          className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* dates */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[12px] font-bold text-foreground/80 ml-1">Start Date</label>
                  <input 
                    type="date" 
                    value={newMed.startDate}
                    onChange={(e) => setNewMed({...newMed, startDate: e.target.value})}
                    className="w-full px-4 py-2.5 rounded-xl border border-border bg-input-background text-[14px]"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[12px] font-bold text-foreground/80 ml-1">End Date</label>
                  <input 
                    type="date" 
                    value={newMed.endDate}
                    onChange={(e) => setNewMed({...newMed, endDate: e.target.value})}
                    className="w-full px-4 py-2.5 rounded-xl border border-border bg-input-background text-[14px]"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[12px] font-bold text-foreground/80 ml-1">Instructions</label>
                <textarea 
                  value={newMed.instructions}
                  onChange={(e) => setNewMed({...newMed, instructions: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl border border-border bg-input-background text-[14px] h-20 outline-none"
                  placeholder="e.g. Take after food"
                />
              </div>

              <div className="flex gap-4 pt-2">
                <button 
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-3.5 rounded-2xl border border-border font-bold text-[14px] hover:bg-muted"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => {
                    if (!newMed.name) return;
                    addMedications([{
                      ...newMed,
                      status: "active" as const
                    }]);
                    setShowAddModal(false);
                    setNewMed({
                      name: "",
                      dosage: "",
                      frequency: "Once daily",
                      duration: "",
                      instructions: "",
                      startDate: new Date().toISOString().split('T')[0],
                      endDate: "",
                      reminderTimes: ["08:00"],
                    });
                  }}
                  className="flex-1 py-3.5 rounded-2xl bg-primary text-primary-foreground font-bold text-[14px] shadow-xl shadow-primary/20"
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

function StatusBadge({ status }: { status: Medication["status"] }) {
  const configs = {
    active: "bg-emerald-100 text-emerald-700 border-emerald-200",
    paused: "bg-amber-100 text-amber-700 border-amber-200",
    completed: "bg-blue-100 text-blue-700 border-blue-200",
    stopped: "bg-red-100 text-red-700 border-red-200",
  };
  
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold uppercase ${configs[status]}`}>
      {status}
    </span>
  );
}

function DoseCard({ 
  dose, 
  onAction, 
  isTaken 
}: { 
  dose: any; 
  onAction: () => void;
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
    <div className={`p-4 rounded-2xl border flex items-center justify-between gap-4 transition-all duration-300 group ${
      isTaken 
        ? "bg-emerald-50/40 border-emerald-200/40 opacity-70" 
        : isPast 
          ? "bg-amber-50/30 border-amber-200/30 shadow-sm" 
          : "bg-card border-border shadow-sm hover:border-primary/30"
    }`}>
      <div className="flex items-center gap-4 flex-1">
        <div className={`w-14 text-center ${isTaken ? "text-emerald-500" : isPast ? "text-amber-500" : "text-foreground"}`}>
          <p className="text-[14px] font-black tracking-tight">{displayTime}</p>
          <p className="text-[9px] font-bold opacity-50 uppercase">{ampm}</p>
        </div>
        <div className="w-px h-10 bg-border shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className={`text-[15px] font-bold truncate ${isTaken ? "line-through text-muted-foreground opacity-50" : "text-foreground"}`}>
              {medication.name}
            </h3>
            {medication.dosage && (
              <span className={`text-[9px] px-1.5 py-0.5 rounded font-black tracking-widest uppercase ${
                isTaken ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"
              }`}>
                {medication.dosage}
              </span>
            )}
          </div>
          <p className="text-[12px] text-muted-foreground truncate italic">
            {medication.instructions || "Standard intake"}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {isTaken && <CheckCircle2 className="w-5 h-5 text-emerald-500 animate-in zoom-in" />}
        <button
          onClick={onAction}
          className={`h-10 px-4 rounded-xl text-[12px] font-black uppercase tracking-wider transition-all shadow-sm ${
            isTaken 
              ? "bg-muted text-muted-foreground hover:bg-emerald-100 hover:text-emerald-700" 
              : isPast
                ? "bg-amber-500 text-white hover:bg-amber-600 shadow-amber-200"
                : "bg-primary text-primary-foreground hover:shadow-primary/20 active:scale-95"
          }`}
        >
          {isTaken ? "Undo" : "Take"}
        </button>
      </div>
    </div>
  );
}
