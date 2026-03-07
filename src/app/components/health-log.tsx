import { useState, useEffect, useRef } from "react";
import { useRecovery, type HealthEntry } from "./store";
import {
  Plus,
  Thermometer,
  Weight,
  Activity,
  X,
  Heart,
  Bluetooth,
  Smartphone,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

const symptomOptions = [
  "Swelling", "Stiffness", "Pain at incision site", "Mild bruising",
  "Fatigue", "Nausea", "Dizziness", "Difficulty sleeping",
  "Redness around wound", "Drainage from wound", "Fever",
  "Loss of appetite", "Constipation", "Numbness", "Limited mobility",
];

const moodOptions: { value: HealthEntry["mood"]; emoji: string; label: string }[] = [
  { value: "great", emoji: "😊", label: "Great" },
  { value: "good", emoji: "🙂", label: "Good" },
  { value: "okay", emoji: "😐", label: "Okay" },
  { value: "poor", emoji: "😟", label: "Poor" },
  { value: "bad", emoji: "😣", label: "Bad" },
];

// ── Health API integration helpers ────────────────────────────────────────────

async function readHeartRateBluetooth(): Promise<number | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nav = navigator as any;
    if (!nav.bluetooth) return null;
    const device = await nav.bluetooth.requestDevice({
      filters: [{ services: ["heart_rate"] }],
    });
    const server = await device.gatt!.connect();
    const service = await server.getPrimaryService("heart_rate");
    const char = await service.getCharacteristic("heart_rate_measurement");
    const value = await char.readValue();
    const hr = value.getUint8(1);
    device.gatt!.disconnect();
    return hr;
  } catch {
    return null;
  }
}

// Google Fit REST API — reads today's step count (needs OAuth)
async function readGoogleFitSteps(): Promise<number | null> {
  try {
    if (typeof window === "undefined") return null;
    // @ts-expect-error google api not typed
    const gapi = window.gapi;
    if (!gapi) return null;
    const now = Date.now();
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const res = await gapi.client.fitness.users.dataset.aggregate({
      userId: "me",
      resource: {
        aggregateBy: [{ dataTypeName: "com.google.step_count.delta" }],
        bucketByTime: { durationMillis: 86400000 },
        startTimeMillis: startOfDay.getTime(),
        endTimeMillis: now,
      },
    });
    const bucket = res.result?.bucket?.[0];
    const value = bucket?.dataset?.[0]?.point?.[0]?.value?.[0]?.intVal;
    return typeof value === "number" ? value : null;
  } catch {
    return null;
  }
}

// Device Motion API — estimate step count from accelerometer
function useStepCounter() {
  const [steps, setSteps] = useState<number | null>(null);
  const stepCountRef = useRef(0);
  const lastMagnitude = useRef(0);
  const listening = useRef(false);

  const start = () => {
    if (listening.current) return;
    if (!window.DeviceMotionEvent) return;
    listening.current = true;
    stepCountRef.current = 0;
    window.addEventListener("devicemotion", handleMotion);
    setSteps(0);
  };

  const stop = () => {
    window.removeEventListener("devicemotion", handleMotion);
    listening.current = false;
  };

  const handleMotion = (e: DeviceMotionEvent) => {
    const acc = e.accelerationIncludingGravity;
    if (!acc) return;
    const mag = Math.sqrt((acc.x ?? 0) ** 2 + (acc.y ?? 0) ** 2 + (acc.z ?? 0) ** 2);
    if (Math.abs(mag - lastMagnitude.current) > 3) {
      stepCountRef.current++;
      setSteps(stepCountRef.current);
    }
    lastMagnitude.current = mag;
  };

  useEffect(() => () => stop(), []);
  return { steps, start, stop, listening: listening.current };
}

// ─────────────────────────────────────────────────────────────────────────────

export function HealthLog() {
  const { data, addHealthEntry } = useRecovery();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    temperature: "",
    weight: "",
    painLevel: 5,
    symptoms: [] as string[],
    notes: "",
    mood: "okay" as HealthEntry["mood"],
    heartRate: "",
    bloodPressure: "",
    oxygenSat: "",
  });

  // Health integration state
  const [hrLoading, setHrLoading] = useState(false);
  const [hrStatus, setHrStatus] = useState<"idle" | "connected" | "error">("idle");
  const [stepsLoading, setStepsLoading] = useState(false);
  const stepCounter = useStepCounter();
  const [liveSteps, setLiveSteps] = useState<number | null>(null);

  const handleSubmit = () => {
    if (!form.temperature || !form.weight) return;
    const notes = [
      form.notes,
      form.heartRate ? `Heart rate: ${form.heartRate} bpm` : "",
      form.bloodPressure ? `Blood pressure: ${form.bloodPressure}` : "",
      form.oxygenSat ? `SpO2: ${form.oxygenSat}%` : "",
      liveSteps !== null ? `Steps today: ${liveSteps}` : "",
    ]
      .filter(Boolean)
      .join(" | ");

    addHealthEntry({
      date: new Date().toISOString().split("T")[0],
      temperature: parseFloat(form.temperature),
      weight: parseFloat(form.weight),
      painLevel: form.painLevel,
      symptoms: form.symptoms,
      notes,
      mood: form.mood,
    });

    setForm({ temperature: "", weight: "", painLevel: 5, symptoms: [], notes: "", mood: "okay", heartRate: "", bloodPressure: "", oxygenSat: "" });
    setLiveSteps(null);
    stepCounter.stop();
    setShowForm(false);
  };

  const toggleSymptom = (s: string) => {
    setForm((prev) => ({
      ...prev,
      symptoms: prev.symptoms.includes(s)
        ? prev.symptoms.filter((x) => x !== s)
        : [...prev.symptoms, s],
    }));
  };

  const handleReadHeartRate = async () => {
    setHrLoading(true);
    const hr = await readHeartRateBluetooth();
    if (hr) {
      setForm((prev) => ({ ...prev, heartRate: hr.toString() }));
      setHrStatus("connected");
    } else {
      setHrStatus("error");
    }
    setHrLoading(false);
  };

  const handleReadGoogleFitSteps = async () => {
    setStepsLoading(true);
    const s = await readGoogleFitSteps();
    setLiveSteps(s);
    setStepsLoading(false);
  };

  const handleStartMotionSteps = () => {
    stepCounter.start();
  };

  useEffect(() => {
    if (stepCounter.steps !== null) {
      setLiveSteps(stepCounter.steps);
    }
  }, [stepCounter.steps]);

  const moodEmoji: Record<string, string> = {
    great: "😊", good: "🙂", okay: "😐", poor: "😟", bad: "😣",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[22px] text-foreground">Daily Health Log</h1>
          <p className="text-[14px] text-muted-foreground mt-1">
            Track your recovery indicators daily
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity text-[14px]"
        >
          <Plus className="w-4 h-4" />
          New Entry
        </button>
      </div>

      {/* Entry Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-card rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-[16px]">Log Today's Health</h3>
              <button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-5">
              {/* ── Health App Integration Banner ── */}
              <div className="bg-secondary rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-primary" />
                  <p className="text-[13px] text-foreground font-medium">Import from Health Device</p>
                </div>

                {/* Bluetooth Heart Rate */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Heart className="w-4 h-4 text-red-500" />
                    <div>
                      <p className="text-[12px] text-foreground">Heart Rate Monitor</p>
                      <p className="text-[11px] text-muted-foreground">Bluetooth BLE device</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {hrStatus === "connected" && (
                      <span className="text-[11px] text-emerald-600 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> {form.heartRate} bpm
                      </span>
                    )}
                    {hrStatus === "error" && (
                      <span className="text-[11px] text-destructive flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> Not found
                      </span>
                    )}
                    <button
                      onClick={handleReadHeartRate}
                      disabled={hrLoading}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary/10 text-primary text-[11px] hover:bg-primary/20 transition-colors"
                    >
                      {hrLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Bluetooth className="w-3 h-3" />}
                      {hrLoading ? "Connecting…" : "Connect"}
                    </button>
                  </div>
                </div>

                {/* Step Counter */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-blue-500" />
                    <div>
                      <p className="text-[12px] text-foreground">Step Counter</p>
                      <p className="text-[11px] text-muted-foreground">Motion sensor or Google Fit</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {liveSteps !== null && (
                      <span className="text-[11px] text-emerald-600 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> {liveSteps} steps
                      </span>
                    )}
                    <button
                      onClick={handleReadGoogleFitSteps}
                      disabled={stepsLoading}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary/10 text-primary text-[11px] hover:bg-primary/20 transition-colors"
                    >
                      {stepsLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Smartphone className="w-3 h-3" />}
                      {stepsLoading ? "Reading…" : "Google Fit"}
                    </button>
                    <button
                      onClick={handleStartMotionSteps}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-secondary border border-border text-[11px] hover:bg-muted transition-colors"
                    >
                      <Activity className="w-3 h-3" /> Motion
                    </button>
                  </div>
                </div>
              </div>

              {/* ── Vitals ── */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[13px] text-muted-foreground block mb-1.5">
                    Temperature (°F)
                  </label>
                  <div className="relative">
                    <Thermometer className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                    <input type="number" step="0.1" value={form.temperature}
                      onChange={(e) => setForm({ ...form, temperature: e.target.value })}
                      placeholder="98.6"
                      className="w-full pl-10 pr-3 py-2 rounded-lg border border-border bg-input-background text-[14px]"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[13px] text-muted-foreground block mb-1.5">
                    Weight (kg)
                  </label>
                  <div className="relative">
                    <Weight className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                    <input type="number" step="0.1" value={form.weight}
                      onChange={(e) => setForm({ ...form, weight: e.target.value })}
                      placeholder="70"
                      className="w-full pl-10 pr-3 py-2 rounded-lg border border-border bg-input-background text-[14px]"
                    />
                  </div>
                </div>
                {/* Heart Rate (manual override) */}
                <div>
                  <label className="text-[13px] text-muted-foreground block mb-1.5">
                    Heart Rate (bpm)
                  </label>
                  <div className="relative">
                    <Heart className="w-4 h-4 text-red-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input type="number" value={form.heartRate}
                      onChange={(e) => setForm({ ...form, heartRate: e.target.value })}
                      placeholder="72"
                      className="w-full pl-10 pr-3 py-2 rounded-lg border border-border bg-input-background text-[14px]"
                    />
                  </div>
                </div>
                {/* SpO2 */}
                <div>
                  <label className="text-[13px] text-muted-foreground block mb-1.5">
                    SpO₂ (%)
                  </label>
                  <input type="number" min="80" max="100" value={form.oxygenSat}
                    onChange={(e) => setForm({ ...form, oxygenSat: e.target.value })}
                    placeholder="98"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-input-background text-[14px]"
                  />
                </div>
                {/* Blood Pressure */}
                <div className="col-span-2">
                  <label className="text-[13px] text-muted-foreground block mb-1.5">
                    Blood Pressure (systolic/diastolic)
                  </label>
                  <input type="text" value={form.bloodPressure}
                    onChange={(e) => setForm({ ...form, bloodPressure: e.target.value })}
                    placeholder="120/80"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-input-background text-[14px]"
                  />
                </div>
              </div>

              {/* Pain Level */}
              <div>
                <label className="text-[13px] text-muted-foreground block mb-1.5">
                  Pain Level: {form.painLevel}/10
                </label>
                <div className="flex items-center gap-3">
                  <span className="text-[12px] text-emerald-600">0</span>
                  <input type="range" min="0" max="10" value={form.painLevel}
                    onChange={(e) => setForm({ ...form, painLevel: parseInt(e.target.value) })}
                    className="flex-1 accent-primary"
                  />
                  <span className="text-[12px] text-red-600">10</span>
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                  <span>No pain</span><span>Worst pain</span>
                </div>
              </div>

              {/* Mood */}
              <div>
                <label className="text-[13px] text-muted-foreground block mb-2">How are you feeling?</label>
                <div className="flex gap-2">
                  {moodOptions.map((m) => (
                    <button key={m.value} onClick={() => setForm({ ...form, mood: m.value })}
                      className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-lg border transition-colors ${
                        form.mood === m.value ? "border-primary bg-secondary" : "border-border hover:border-muted-foreground"
                      }`}
                    >
                      <span className="text-[20px]">{m.emoji}</span>
                      <span className="text-[11px] text-muted-foreground">{m.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Symptoms */}
              <div>
                <label className="text-[13px] text-muted-foreground block mb-2">Symptoms</label>
                <div className="flex flex-wrap gap-2">
                  {symptomOptions.map((s) => (
                    <button key={s} onClick={() => toggleSymptom(s)}
                      className={`px-3 py-1 rounded-full text-[12px] border transition-colors ${
                        form.symptoms.includes(s)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "border-border text-muted-foreground hover:border-muted-foreground"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="text-[13px] text-muted-foreground block mb-1.5">Notes</label>
                <textarea value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="How was your day? Any observations…"
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-input-background text-[14px] resize-none"
                />
              </div>

              <button
                onClick={handleSubmit}
                disabled={!form.temperature || !form.weight}
                className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg text-[14px] hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                Save Entry
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Entries List ── */}
      {data.healthEntries.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Activity className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-[15px]">No health entries yet</p>
          <p className="text-[13px] mt-1">Tap "New Entry" to log today's health.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.healthEntries.map((entry) => (
            <div key={entry.id} className="bg-card rounded-xl border border-border p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-[20px]">{moodEmoji[entry.mood]}</span>
                  <div>
                    <p className="text-[14px] text-foreground">{entry.date}</p>
                    <p className="text-[12px] text-muted-foreground capitalize">{entry.mood} mood</p>
                  </div>
                </div>
                <div className={`px-2.5 py-1 rounded-lg text-[12px] ${
                  entry.painLevel <= 3 ? "bg-emerald-50 text-emerald-600"
                  : entry.painLevel <= 6 ? "bg-amber-50 text-amber-600"
                  : "bg-red-50 text-red-600"
                }`}>
                  Pain: {entry.painLevel}/10
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 mb-3">
                <div className="bg-muted rounded-lg p-2.5 text-center">
                  <Thermometer className="w-3.5 h-3.5 text-orange-500 mx-auto mb-1" />
                  <p className="text-[13px] text-foreground">{entry.temperature}°F</p>
                  <p className="text-[10px] text-muted-foreground">Temp</p>
                </div>
                <div className="bg-muted rounded-lg p-2.5 text-center">
                  <Weight className="w-3.5 h-3.5 text-blue-500 mx-auto mb-1" />
                  <p className="text-[13px] text-foreground">{entry.weight} kg</p>
                  <p className="text-[10px] text-muted-foreground">Weight</p>
                </div>
                <div className="bg-muted rounded-lg p-2.5 text-center">
                  <Activity className="w-3.5 h-3.5 text-red-500 mx-auto mb-1" />
                  <p className="text-[13px] text-foreground">{entry.painLevel}/10</p>
                  <p className="text-[10px] text-muted-foreground">Pain</p>
                </div>
              </div>

              {entry.symptoms.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {entry.symptoms.map((s) => (
                    <span key={s} className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{s}</span>
                  ))}
                </div>
              )}

              {entry.notes && (
                <p className="text-[12px] text-muted-foreground italic">"{entry.notes}"</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
