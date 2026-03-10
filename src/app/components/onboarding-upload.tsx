import { useState, useRef } from "react";
import { useNavigate } from "react-router";
import * as pdfjsLib from "pdfjs-dist";

// Fix for PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
import { useRecovery, type Medication } from "./store";
import {
  requestNotificationPermission,
  scheduleMedicationNotifications,
  showImmediateNotification,
} from "./notifications";
import { extractTextFromMedicalFile } from "../lib/extraction";
import {
  HeartPulse,
  Upload,
  FileText,
  CheckCircle2,
  Loader2,
  Pill,
  AlertCircle,
  ArrowRight,
  X,
  Plus,
  Bell,
  BellOff,
  FilePlus2,
  Sparkles,
  Brain,
} from "lucide-react";

interface GeminiMed {
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions?: string;
  reminderTimes?: string[];
}

interface GeminiAnalysis {
  diagnosis: string;
  medications: GeminiMed[];
  labResults: string;
  doctorRecommendations: string;
  dietInstructions: string;
  warningSigns: string;
}

async function analyseWithGroq(
  extraText: string
): Promise<GeminiAnalysis> {
  if (!extraText || extraText.trim() === "") {
    throw new Error("No readable text found in the document to analyze.");
  }

  const prompt = `You are a world-class AI medical document analyzer. Analyze the provided clinical document text and extract the following structured medical insights.
  
  EXTRACTED DOCUMENT TEXT:
  ---
  ${extraText}
  ---

  Return ONLY a valid JSON object in this EXACT format (no markdown formatting blocks, no extra text):
  {
    "diagnosis": "The primary diagnosis or condition identified (e.g. Type 2 Diabetes, Post-Appendectomy).",
    "medications": [
      {
        "name": "Medication name",
        "dosage": "e.g. 500mg or 2 units",
        "frequency": "e.g. Twice daily / Once daily at night",
        "duration": "e.g. 5 days / Ongoing",
        "instructions": "e.g. Take after food / Do not drive"
      }
    ],
    "labResults": "Detailed summary of key lab results, levels, or radiological findings.",
    "doctorRecommendations": "Specific post-op or clinical recommendations given by the physician.",
    "dietInstructions": "Any strict diet, hydration, or food instructions requested.",
    "warningSigns": "Specific medical red flags or warning signs mentioned that require immediate action."
  }

  IMPORTANT:
  - If a field is not found in the text, use "None provided".
  - If multiple diagnoses exist, list them clearly.
  - For medications, normalize frequencies (e.g. BD to Twice daily).`;

  const res = await fetch("/api/ai-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }]
    }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    if (errData?.error?.includes("API key")) throw new Error("INVALID_API_KEY");
    throw new Error(errData.error || "The AI service encountered an issue. Please try again.");
  }

  const responseData = await res.json();
  const content = responseData.choices?.[0]?.message?.content || "{}";
  let data: any = {};
  try {
    data = JSON.parse(content);
  } catch(e) {
    console.warn("Failed to parse JSON", content);
  }
  
  const guidanceParts = [];
  if (data.diagnosis) guidanceParts.push(`### Diagnosis\n${data.diagnosis}`);
  if (data.doctorRecommendations && !data.doctorRecommendations.includes("None provided")) guidanceParts.push(`### Doctor's Recommendations\n${data.doctorRecommendations}`);
  if (data.dietInstructions && !data.dietInstructions.includes("None provided")) guidanceParts.push(`### Diet Instructions\n${data.dietInstructions}`);
  if (data.warningSigns && !data.warningSigns.includes("None provided")) guidanceParts.push(`### Warning Signs\n${data.warningSigns}`);
  if (data.labResults && !data.labResults.includes("None provided")) guidanceParts.push(`### Lab Results\n${data.labResults}`);

  return {
    diagnosis: data.diagnosis || "None provided",
    medications: Array.isArray(data.medications) ? data.medications : [],
    labResults: data.labResults || "None provided",
    doctorRecommendations: data.doctorRecommendations || "None provided",
    dietInstructions: data.dietInstructions || "None provided",
    warningSigns: data.warningSigns || "None provided",
  };
}

// ── File helpers ──────────────────────────────────────────────────────────────

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the "data:...;base64," prefix — Gemini wants the bare b64 string
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function getGeminiMimeType(file: File): string {
  if (file.type === "application/pdf" || file.name.endsWith(".pdf"))
    return "application/pdf";
  if (file.type.startsWith("image/")) return file.type;
  if (file.name.endsWith(".jpg") || file.name.endsWith(".jpeg")) return "image/jpeg";
  if (file.name.endsWith(".png")) return "image/png";
  if (file.name.endsWith(".webp")) return "image/webp";
  return "application/pdf";
}

// ─────────────────────────────────────────────────────────────────────────────

export function OnboardingUpload() {
  const navigate = useNavigate();
  const { data, addDocument, markDischargeUploaded, addMedications, updateRecoveryData } = useRecovery();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<"upload" | "analyzing" | "medications" | "complete">("upload");
  const [fileName, setFileName] = useState("");
  const [fileSize, setFileSize] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [analysisStage, setAnalysisStage] = useState(0);
  const [analysisError, setAnalysisError] = useState("");
  const [extractedCount, setExtractedCount] = useState(0);

  const [medications, setMedications] = useState<Medication[]>([]);
  const [notifStatus, setNotifStatus] = useState<"idle" | "granted" | "denied">("idle");
  const [showAddMed, setShowAddMed] = useState(false);
  const [newMed, setNewMed] = useState({ 
    name: "", 
    dosage: "", 
    frequency: "", 
    duration: "", 
    instructions: "",
    reminderTimes: "" // Comma separated string for UI
  });
  const [newMedErrors, setNewMedErrors] = useState<Record<string, string>>({});

  // ── Stage labels ────────────────────────────────────────────────────────────
  const analysisLabels = [
    "Reading document…",
    "Sending to AI for analysis…",
    "Extracting medications & dosages…",
    "Building your recovery plan…",
  ];

  const processFile = async (file: File) => {
    if (file.size > 20 * 1024 * 1024) {
      setAnalysisError("File too large. Please upload a file under 20 MB.");
      return;
    }

    const sizeKB = (file.size / 1024).toFixed(0);
    const sizeMB = file.size / (1024 * 1024);
    setFileName(file.name);
    setFileSize(sizeMB >= 1 ? `${sizeMB.toFixed(1)} MB` : `${sizeKB} KB`);
    setAnalysisError("");
    setStep("analyzing");
    setAnalysisStage(0);

    const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

    // Stage 0 → 1: reading
    await delay(600);
    setAnalysisStage(1);

    // Convert to base64 and call Gemini
    try {
      const base64 = await fileToBase64(file);
      const mimeType = getGeminiMimeType(file);
      
      // Generate extraText via pdf.js if it's a PDF
      setAnalysisStage(1);
      const extractedText = await extractTextFromMedicalFile(file);
      
      if (!extractedText || extractedText.trim().length < 10) {
        throw new Error("The document appears to be unreadable or contains no medical text. Please try with a clearer photo or PDF.");
      }

      setAnalysisStage(2);
      const raw = await analyseWithGroq(extractedText);

      setAnalysisStage(3);
      await delay(500);

      const meds: Medication[] = raw.medications.map((m, i) => ({
        id: `${Date.now()}-${i}`,
        name: m.name ?? "Unknown",
        dosage: m.dosage ?? "",
        frequency: m.frequency ?? "As prescribed",
        duration: m.duration ?? "",
        instructions: m.instructions ?? "",
        isActive: true,
        status: "active",
        reminderTimes: m.reminderTimes && m.reminderTimes.length > 0 ? m.reminderTimes : undefined,
      }));

      // Build recovery guidance from AI response components
      const guidance = `**Doctor's Recommendations:**\n${raw.doctorRecommendations}\n\n**Diet Instructions:**\n${raw.dietInstructions}\n\n**Warning Signs:**\n${raw.warningSigns}`;
      
      // Store AI results in global state
      updateRecoveryData({ 
        recoveryGuidance: guidance,
        surgeryType: raw.diagnosis && !raw.diagnosis.includes("None provided") ? raw.diagnosis : "Post-Surgery Recovery",
        surgeryDate: new Date().toISOString().split('T')[0] // Use today as default surgery date if not found
      });

      setExtractedCount(meds.length);
      setMedications(meds);
      setStep("medications");
    } catch (err: any) {
      console.error("Analysis error:", err);
      if (err.message === "INVALID_API_KEY") {
        setAnalysisError("Your Google Gemini API key is missing or invalid. Please check your configuration.");
      } else {
        setAnalysisError(err.message || "Failed to analyze the document. You can add your medications manually below.");
      }
      setExtractedCount(0);
      setMedications([]);
      setStep("medications");
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const validateNewMed = () => {
    const errs: Record<string, string> = {};
    if (!newMed.name.trim()) errs.name = "Medication name is required";
    if (!newMed.dosage.trim()) errs.dosage = "Dosage is required";
    if (!newMed.frequency.trim()) errs.frequency = "Frequency is required";
    setNewMedErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const addMedication = () => {
    if (!validateNewMed()) return;
    
    // Parse reminder times from "08:00, 20:00" to ["08:00", "20:00"]
    const times = newMed.reminderTimes
      ? newMed.reminderTimes.split(",").map(t => t.trim()).filter(t => /^([01]\d|2[0-3]):?([0-5]\d)$/.test(t))
      : undefined;

    const med: Medication = {
      id: Date.now().toString(),
      name: newMed.name,
      dosage: newMed.dosage,
      frequency: newMed.frequency,
      duration: newMed.duration,
      reminderTimes: times,
      instructions: newMed.instructions || "",
      isActive: true,
      status: "active",
    };

    setMedications((prev) => [...prev, med]);
    setNewMed({ name: "", dosage: "", frequency: "", duration: "", instructions: "", reminderTimes: "" });
    setNewMedErrors({});
    setShowAddMed(false);
  };

  const removeMedication = (id: string) =>
    setMedications((prev) => prev.filter((m) => m.id !== id));

  const handleEnableNotifications = async () => {
    const granted = await requestNotificationPermission();
    setNotifStatus(granted ? "granted" : "denied");
  };

  const handleComplete = () => {
    setStep("complete");

    addDocument({
      name: `Discharge Summary — ${fileName}`,
      type: "discharge",
      uploadDate: new Date().toISOString().split("T")[0],
      summary: `Discharge summary uploaded. Attending doctor: Dr. ${data.userProfile?.doctorName}. Blood Group: ${data.userProfile?.bloodGroup}.`,
      keyFindings: [
        `Patient: ${data.userProfile?.name}`,
        `Doctor: Dr. ${data.userProfile?.doctorName}`,
        `Blood Group: ${data.userProfile?.bloodGroup}`,
        medications.length > 0
          ? `Medications (${medications.length}): ${medications.map((m) => `${m.name} ${m.dosage}`).join(", ")}`
          : "No medications recorded",
      ],
      simplifiedExplanation:
        "Your discharge summary has been saved and medications have been recorded.",
      status: "analyzed",
    });

    if (medications.length > 0) {
      addDocument({
        name: "Medication Plan (AI extracted)",
        type: "prescription",
        uploadDate: new Date().toISOString().split("T")[0],
        summary: "Medication plan extracted by AI from discharge summary.",
        keyFindings: medications.map(
          (m) =>
            `${m.name}${m.dosage ? ` ${m.dosage}` : ""} — ${m.frequency}${m.duration ? ` for ${m.duration}` : ""}${m.instructions ? ` (${m.instructions})` : ""}`
        ),
        simplifiedExplanation: `You have ${medications.length} medication(s). Follow your doctor's schedule carefully.`,
        status: "analyzed",
      });

      if (notifStatus === "granted") {
        scheduleMedicationNotifications(medications);
        showImmediateNotification(medications);
      }
      
      addMedications(medications);
    }

    markDischargeUploaded();
    setTimeout(() => navigate("/dashboard"), 2500);
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-background p-4"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center mx-auto mb-3 shadow-lg shadow-primary/20">
            <HeartPulse className="w-6 h-6 text-primary-foreground" />
          </div>
          <h1 className="text-[20px] text-foreground">
            Welcome, {data.userProfile?.name?.split(" ")[0]}!
          </h1>
          <p className="text-[13px] text-muted-foreground mt-1">
            Let's set up your recovery profile
          </p>
        </div>

        <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">

          {/* ── UPLOAD ── */}
          {step === "upload" && (
            <div className="p-6 space-y-5">
              <div>
                <h2 className="text-[17px] text-foreground">Upload Your Discharge Summary</h2>
                <p className="text-[13px] text-muted-foreground mt-1">
                  Upload your hospital discharge PDF or photo. Our AI will automatically read and
                  extract all medications and instructions.
                </p>
              </div>

              {/* AI badge */}
              <div className="bg-secondary rounded-lg p-3 flex items-start gap-2.5">
                <Brain className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-[12px] text-foreground font-medium">Powered by Google Gemini AI</p>
                  <ul className="text-[12px] text-muted-foreground mt-0.5 space-y-0.5">
                    <li>• Reads PDFs, scanned documents &amp; photos</li>
                    <li>• Extracts medicine names, dosages &amp; frequencies</li>
                    <li>• Understands medical abbreviations (BD, TDS, OD…)</li>
                    <li>• Schedules daily medication reminders</li>
                  </ul>
                </div>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                className="hidden"
                onChange={handleFileInputChange}
              />

              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
                  dragOver
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50 hover:bg-muted/30"
                }`}
              >
                <div className="w-14 h-14 rounded-full bg-secondary flex items-center justify-center mx-auto mb-3">
                  <Upload className="w-6 h-6 text-primary" />
                </div>
                <p className="text-[14px] text-foreground font-medium">
                  Drop your discharge summary here
                </p>
                <p className="text-[12px] text-muted-foreground mt-1">
                  or click to browse files
                </p>
                <p className="text-[11px] text-muted-foreground mt-3 opacity-70">
                  PDF, JPG, PNG, WEBP — max 20 MB
                </p>
              </div>

              {/* Doctor profile preview */}
              <div className="bg-muted rounded-lg p-4 grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[11px] text-muted-foreground">Doctor</p>
                  <p className="text-[13px] text-foreground">Dr. {data.userProfile?.doctorName}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">Blood Group</p>
                  <p className="text-[13px] text-foreground">{data.userProfile?.bloodGroup}</p>
                </div>
              </div>
            </div>
          )}

          {/* ── ANALYSING ── */}
          {step === "analyzing" && (
            <div className="p-6 py-14 text-center space-y-5">
              <div className="relative">
                <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mx-auto">
                  <Brain className="w-7 h-7 text-primary" />
                </div>
                {/* Orbiting pulse ring */}
                <div className="absolute inset-0 w-16 h-16 mx-auto rounded-full border-2 border-primary/30 animate-ping" />
              </div>

              <div>
                <h2 className="text-[18px] text-foreground">AI Analysing Document</h2>
                <p className="text-[13px] text-muted-foreground mt-1">
                  <span className="text-foreground">{fileName}</span>{" "}
                  {fileSize && <span>({fileSize})</span>}
                </p>
              </div>

              {/* Stage steps */}
              <div className="max-w-xs mx-auto space-y-3 pt-2 text-left">
                {analysisLabels.map((label, i) => (
                  <AnalysisStep
                    key={i}
                    label={label}
                    done={analysisStage > i}
                    active={analysisStage === i}
                  />
                ))}
              </div>

              <div className="flex items-center justify-center gap-2 pt-1">
                <Loader2 className="w-4 h-4 text-primary animate-spin" />
                <span className="text-[12px] text-muted-foreground">{analysisLabels[analysisStage]}</span>
              </div>
            </div>
          )}

          {/* ── MEDICATIONS REVIEW ── */}
          {step === "medications" && (
            <div className="p-6 space-y-5">
              {/* Header */}
              <div className="flex items-start gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                  extractedCount > 0 ? "bg-emerald-50" : analysisError ? "bg-amber-50" : "bg-muted"
                }`}>
                  {extractedCount > 0 ? (
                    <Sparkles className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-amber-500" />
                  )}
                </div>
                <div>
                  <h2 className="text-[17px] text-foreground">
                    {extractedCount > 0
                      ? `${extractedCount} Medication${extractedCount === 1 ? "" : "s"} Extracted by AI`
                      : "Review Your Medications"}
                  </h2>
                  <p className="text-[12px] text-muted-foreground mt-0.5">
                    {extractedCount > 0
                      ? "AI extracted these from your document. Review, edit or add more as needed."
                      : analysisError
                      ? analysisError
                      : "No medications detected automatically. Add them manually from your discharge summary."}
                  </p>
                </div>
              </div>

              {/* Uploaded file badge */}
              <div className="flex items-center gap-2 px-3 py-2 bg-muted rounded-lg">
                <FilePlus2 className="w-4 h-4 text-primary shrink-0" />
                <p className="text-[12px] text-foreground truncate flex-1">{fileName}</p>
                {fileSize && (
                  <span className="text-[11px] text-muted-foreground shrink-0">{fileSize}</span>
                )}
                {extractedCount > 0 && (
                  <span className="ml-1 flex items-center gap-1 text-[11px] text-emerald-600 shrink-0">
                    <Brain className="w-3 h-3" /> AI
                  </span>
                )}
              </div>

              {/* Medication list */}
              {medications.length > 0 ? (
                <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                  {medications.map((med) => (
                    <div
                      key={med.id}
                      className="flex items-start gap-3 p-3 rounded-lg border border-border bg-muted/30"
                    >
                      <div className="w-9 h-9 rounded-lg bg-purple-50 flex items-center justify-center shrink-0 mt-0.5">
                        <Pill className="w-4 h-4 text-purple-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-[14px] text-foreground font-medium">{med.name}</p>
                          {med.dosage && (
                            <span className="text-[11px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                              {med.dosage}
                            </span>
                          )}
                        </div>
                        <p className="text-[12px] text-muted-foreground mt-0.5">
                          {med.frequency}
                          {med.duration ? ` • ${med.duration}` : ""}
                        </p>
                        {med.instructions && (
                          <p className="text-[11px] text-amber-600 mt-0.5 italic">
                            ⚠ {med.instructions}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => removeMedication(med.id)}
                        className="p-1 hover:bg-muted rounded shrink-0"
                      >
                        <X className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border p-6 text-center">
                  <Pill className="w-7 h-7 text-muted-foreground mx-auto mb-2 opacity-50" />
                  <p className="text-[13px] text-muted-foreground">
                    No medications yet. Add them from your discharge summary below.
                  </p>
                </div>
              )}

              {/* Add medication form */}
              {!showAddMed ? (
                <button
                  onClick={() => setShowAddMed(true)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-border rounded-lg text-[13px] text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                >
                  <Plus className="w-4 h-4" /> Add / Correct Medication
                </button>
              ) : (
                <div className="border border-border rounded-xl p-4 space-y-3 bg-muted/20">
                  <div className="flex items-center justify-between">
                    <p className="text-[13px] text-foreground font-medium">Add Medication</p>
                    <button
                      onClick={() => { setShowAddMed(false); setNewMedErrors({}); }}
                      className="p-1 hover:bg-muted rounded"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <input
                        type="text"
                        placeholder="Medication name *"
                        value={newMed.name}
                        onChange={(e) => {
                          setNewMed({ ...newMed, name: e.target.value });
                          if (newMedErrors.name) setNewMedErrors({ ...newMedErrors, name: "" });
                        }}
                        className={`w-full px-3 py-2 rounded-lg border bg-input-background text-[13px] transition-colors ${
                          newMedErrors.name ? "border-destructive" : "border-border focus:border-primary"
                        }`}
                      />
                      {newMedErrors.name && (
                        <p className="text-[11px] text-destructive mt-1">{newMedErrors.name}</p>
                      )}
                    </div>
                    <div>
                      <input
                        type="text"
                        placeholder="Dosage (e.g. 500mg) *"
                        value={newMed.dosage}
                        onChange={(e) => {
                          setNewMed({ ...newMed, dosage: e.target.value });
                          if (newMedErrors.dosage) setNewMedErrors({ ...newMedErrors, dosage: "" });
                        }}
                        className={`w-full px-3 py-2 rounded-lg border bg-input-background text-[13px] transition-colors ${
                          newMedErrors.dosage ? "border-destructive" : "border-border focus:border-primary"
                        }`}
                      />
                      {newMedErrors.dosage && (
                        <p className="text-[11px] text-destructive mt-1">{newMedErrors.dosage}</p>
                      )}
                    </div>
                    <div>
                      <input
                        type="text"
                        placeholder="Frequency (e.g. Twice daily) *"
                        value={newMed.frequency}
                        onChange={(e) => {
                          setNewMed({ ...newMed, frequency: e.target.value });
                          if (newMedErrors.frequency) setNewMedErrors({ ...newMedErrors, frequency: "" });
                        }}
                        className={`w-full px-3 py-2 rounded-lg border bg-input-background text-[13px] transition-colors ${
                          newMedErrors.frequency ? "border-destructive" : "border-border focus:border-primary"
                        }`}
                      />
                      {newMedErrors.frequency && (
                        <p className="text-[11px] text-destructive mt-1">{newMedErrors.frequency}</p>
                      )}
                    </div>
                    <input
                      type="text"
                      placeholder="Duration (e.g. 7 days)"
                      value={newMed.duration}
                      onChange={(e) => setNewMed({ ...newMed, duration: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-input-background text-[13px] focus:border-primary transition-colors"
                    />
                    <div className="col-span-2">
                       <input
                        type="text"
                        placeholder="Reminder Times (e.g. 08:00, 20:00)"
                        value={newMed.reminderTimes}
                        onChange={(e) => setNewMed({ ...newMed, reminderTimes: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-border bg-input-background text-[13px] focus:border-primary transition-colors"
                      />
                      <p className="text-[10px] text-muted-foreground mt-1 px-1">
                        Optional. Enter comma-separated 24h times (HH:mm). If empty, we'll use frequency.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={addMedication}
                    className="w-full py-2 bg-primary text-primary-foreground rounded-lg text-[13px] hover:opacity-90 transition-opacity"
                  >
                    Add Medication
                  </button>
                </div>
              )}

              {/* Notification opt-in */}
              <div
                className={`rounded-xl p-4 flex items-start gap-3 transition-colors ${
                  notifStatus === "granted"
                    ? "bg-emerald-50 border border-emerald-200"
                    : notifStatus === "denied"
                    ? "bg-destructive/5 border border-destructive/20"
                    : "bg-secondary border border-border"
                }`}
              >
                {notifStatus === "granted" ? (
                  <Bell className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : notifStatus === "denied" ? (
                  <BellOff className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                ) : (
                  <Bell className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                )}
                <div className="flex-1">
                  {notifStatus === "granted" ? (
                    <>
                      <p className="text-[13px] text-emerald-700 font-medium">Medication reminders enabled!</p>
                      <p className="text-[12px] text-emerald-600 mt-0.5">
                        You'll get browser notifications per your doctor's schedule.
                      </p>
                    </>
                  ) : notifStatus === "denied" ? (
                    <>
                      <p className="text-[13px] text-destructive font-medium">Notifications blocked</p>
                      <p className="text-[12px] text-muted-foreground mt-0.5">
                        Enable notifications in browser settings for medication reminders.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-[13px] text-foreground font-medium">Enable Medication Reminders</p>
                      <p className="text-[12px] text-muted-foreground mt-0.5">
                        Get browser reminders per your doctor's medication schedule.
                      </p>
                      <button
                        onClick={handleEnableNotifications}
                        className="mt-2 text-[12px] text-primary font-medium hover:underline"
                      >
                        Allow Notifications →
                      </button>
                    </>
                  )}
                </div>
              </div>

              <button
                onClick={handleComplete}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary text-primary-foreground rounded-lg text-[14px] font-medium hover:opacity-90 transition-opacity"
              >
                Confirm &amp; Start Recovery
                <ArrowRight className="w-4 h-4" />
              </button>

              {medications.length === 0 && (
                <p className="text-center text-[12px] text-muted-foreground">
                  You can skip medications for now and add them later from the Documents page.
                </p>
              )}
            </div>
          )}

          {/* ── COMPLETE ── */}
          {step === "complete" && (
            <div className="p-6 py-14 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto animate-bounce">
                <CheckCircle2 className="w-8 h-8 text-emerald-500" />
              </div>
              <h2 className="text-[18px] text-foreground">You're All Set!</h2>
              <p className="text-[13px] text-muted-foreground">
                Your recovery profile is ready
                {notifStatus === "granted" && medications.length > 0
                  ? " and medication reminders have been scheduled"
                  : ""}
                . Redirecting…
              </p>
              {notifStatus === "granted" && medications.length > 0 && (
                <div className="bg-emerald-50 rounded-lg px-4 py-2 inline-flex items-center gap-2">
                  <Bell className="w-4 h-4 text-emerald-600" />
                  <p className="text-[12px] text-emerald-700">
                    {medications.length} reminder{medications.length > 1 ? "s" : ""} active
                  </p>
                </div>
              )}
              <div className="flex justify-center pt-2">
                <Loader2 className="w-5 h-5 text-primary animate-spin" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Tiny helper components ────────────────────────────────────────────────────

function AnalysisStep({
  label,
  done,
  active,
}: {
  label: string;
  done?: boolean;
  active?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5">
      {done ? (
        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
      ) : active ? (
        <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0" />
      ) : (
        <div className="w-4 h-4 rounded-full border-2 border-border shrink-0" />
      )}
      <span
        className={`text-[13px] ${
          done ? "text-foreground" : active ? "text-primary" : "text-muted-foreground"
        }`}
      >
        {label}
      </span>
    </div>
  );
}
