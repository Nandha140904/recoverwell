import { useState, useRef } from "react";
import { useRecovery, type MedicalDocument, type Medication } from "./store";
import { scheduleMedicationNotifications } from "./notifications";
import {
  FileText,
  Upload,
  FlaskConical,
  Pill,
  Scan,
  FileCheck,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle2,
  X,
  Brain,
} from "lucide-react";

interface GeminiDocAnalysis {
  summary: string;
  keyFindings: string[];
  simplifiedExplanation: string;
  medications: Omit<Medication, "id" | "isActive">[];
}

async function analyseGeneralDocument(
  fileBase64: string,
  mimeType: string,
  docType: string
): Promise<GeminiDocAnalysis | null> {
  try {
    const res = await fetch("/api/analyse-general", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileBase64, mimeType, docType }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      if (errData?.error?.includes("API key")) {
        throw new Error("INVALID_API_KEY");
      }
      console.error("General Analysis API error:", res.status, errData);
      return null;
    }

    return await res.json();
  } catch (err) {
    console.error("Gemini General Analyse Error:", err);
    return null;
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function getGeminiMimeType(file: File): string {
  if (file.type === "application/pdf" || file.name.endsWith(".pdf")) return "application/pdf";
  if (file.type.startsWith("image/")) return file.type;
  if (file.name.endsWith(".jpg") || file.name.endsWith(".jpeg")) return "image/jpeg";
  if (file.name.endsWith(".png")) return "image/png";
  if (file.name.endsWith(".webp")) return "image/webp";
  return "application/pdf";
}

// ─────────────────────────────────────────────────────────────────────────────

const typeConfig = {
  discharge: { icon: FileCheck, color: "text-blue-600 bg-blue-50", label: "Discharge Summary" },
  lab: { icon: FlaskConical, color: "text-purple-600 bg-purple-50", label: "Lab Report" },
  prescription: { icon: Pill, color: "text-emerald-600 bg-emerald-50", label: "Prescription" },
  radiology: { icon: Scan, color: "text-amber-600 bg-amber-50", label: "Radiology Report" },
  other: { icon: FileText, color: "text-slate-600 bg-slate-50", label: "General Document" },
};

export function Documents() {
  const { data, addDocument, addMedications } = useRecovery();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | MedicalDocument["type"]>("all");

  const [showUpload, setShowUpload] = useState(false);
  const [uploadType, setUploadType] = useState<MedicalDocument["type"]>("lab");
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filtered = filter === "all" ? data.documents : data.documents.filter((d) => d.type === filter);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 20 * 1024 * 1024) {
        setErrorMsg("File must be smaller than 20MB.");
        return;
      }
      setSelectedFile(file);
      setErrorMsg("");
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      if (file.size > 20 * 1024 * 1024) {
        setErrorMsg("File must be smaller than 20MB.");
        return;
      }
      setSelectedFile(file);
      setErrorMsg("");
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setErrorMsg("Please select a file to upload.");
      return;
    }

    setUploading(true);
    setErrorMsg("");

    try {
      const base64 = await fileToBase64(selectedFile);
      const mime = getGeminiMimeType(selectedFile);
      
      const analysis = await analyseGeneralDocument(base64, mime, typeConfig[uploadType].label);

      if (!analysis) {
        throw new Error("AI analysis failed to return a proper format.");
      }

      addDocument({
        name: selectedFile.name,
        type: uploadType,
        uploadDate: new Date().toISOString().split("T")[0],
        summary: analysis.summary || "Summary not available.",
        keyFindings: Array.isArray(analysis.keyFindings) ? analysis.keyFindings : ["No findings extracted."],
        simplifiedExplanation: analysis.simplifiedExplanation || "Explanation not available.",
        status: "analyzed",
      });

      if (Array.isArray(analysis.medications) && analysis.medications.length > 0) {
        addMedications(analysis.medications);
        if (Notification.permission === "granted") {
          // Schedule the newly updated comprehensive list (data.medications + the ones just returned but mocked mapped)
          scheduleMedicationNotifications([...data.medications, ...analysis.medications.map((m,i) => ({...m, id: Date.now()+""+i, isActive: true}))]);
        }
      }

      setShowUpload(false);
      setSelectedFile(null);
    } catch (err: any) {
      console.error(err);
      if (err.message === "INVALID_API_KEY") {
        setErrorMsg("Your Gemini AI Key is invalid. Please get a free key from aistudio.google.com and update GEMINI_API_KEY in the code.");
      } else {
        setErrorMsg("Failed to analyze the document. Please try again.");
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[22px] text-foreground">Medical Documents</h1>
          <p className="text-[14px] text-muted-foreground mt-1">
            Upload and analyze your medical reports
          </p>
        </div>
        <button
          onClick={() => { setShowUpload(true); setSelectedFile(null); setErrorMsg(""); }}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity text-[14px]"
        >
          <Upload className="w-4 h-4" />
          Upload
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {[
          { key: "all", label: "All" },
          { key: "discharge", label: "Discharge" },
          { key: "lab", label: "Lab Reports" },
          { key: "prescription", label: "Prescriptions" },
          { key: "radiology", label: "Radiology" },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key as typeof filter)}
            className={`px-3 py-1.5 rounded-lg text-[13px] transition-colors ${
              filter === f.key
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Document List */}
      <div className="space-y-3">
        {filtered.map((doc) => {
          const config = typeConfig[doc.type];
          const Icon = config.icon;
          const isExpanded = expandedId === doc.id;

          return (
            <div
              key={doc.id}
              className="bg-card rounded-xl border border-border overflow-hidden"
            >
              <button
                onClick={() => setExpandedId(isExpanded ? null : doc.id)}
                className="w-full flex items-center gap-4 p-4 text-left hover:bg-muted/30 transition-colors"
                style={{ alignItems: "center" }}
              >
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${config.color} shrink-0`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] text-foreground truncate font-medium">{doc.name}</p>
                  <p className="text-[12px] text-muted-foreground mt-0.5">
                    {config.label} • Uploaded {doc.uploadDate}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded flex items-center gap-1 ${
                      doc.status === "analyzed"
                        ? "bg-emerald-50 text-emerald-600"
                        : "bg-amber-50 text-amber-600"
                    }`}
                  >
                    {doc.status === "analyzed" && <Brain className="w-3 h-3" />}
                    {doc.status === "analyzed" ? "AI Analyzed" : "Processing"}
                  </span>
                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  )}
                </div>
              </button>

              {isExpanded && (
                <div className="px-4 pb-4 border-t border-border">
                  <div className="pt-4 space-y-4">
                    {/* Summary */}
                    <div>
                      <p className="text-[12px] text-muted-foreground font-medium mb-1">Summary</p>
                      <p className="text-[13px] text-foreground">{doc.summary}</p>
                    </div>

                    {/* Key Findings */}
                    <div>
                      <p className="text-[12px] text-muted-foreground font-medium mb-2">Key Findings</p>
                      <div className="space-y-1.5">
                        {doc.keyFindings.map((finding, i) => (
                          <div key={i} className="flex items-start gap-2">
                            <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                            <span className="text-[13px] text-foreground">{finding}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Simplified Explanation */}
                    <div className="bg-secondary rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertCircle className="w-4 h-4 text-primary" />
                        <p className="text-[13px] text-primary font-medium">Simplified Explanation</p>
                      </div>
                      <p className="text-[13px] text-foreground leading-relaxed">
                        {doc.simplifiedExplanation}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 border border-dashed border-border rounded-xl">
          <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-50" />
          <p className="text-[14px] text-foreground font-medium">No documents yet</p>
          <p className="text-[12px] text-muted-foreground mt-1">
            Upload your medical reports to have AI explain them.
          </p>
        </div>
      )}

      {/* Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-card rounded-xl w-full max-w-md p-6 border border-border">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[16px] font-medium text-foreground">Upload & Analyze Document</h3>
              <button
                onClick={() => setShowUpload(false)}
                className="p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground rounded transition-colors"
                disabled={uploading}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[13px] text-muted-foreground block mb-1.5">Document Type</label>
                <select
                  value={uploadType}
                  onChange={(e) => setUploadType(e.target.value as MedicalDocument["type"])}
                  disabled={uploading}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-input-background text-[14px] outline-none focus:border-primary transition-colors disabled:opacity-50"
                >
                  <option value="discharge">Discharge Summary</option>
                  <option value="lab">Lab Report</option>
                  <option value="prescription">Prescription</option>
                  <option value="radiology">Radiology Report</option>
                </select>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                className="hidden"
                onChange={handleFileSelect}
                disabled={uploading}
              />

              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => !uploading && fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
                  dragOver
                    ? "border-primary bg-primary/5"
                    : selectedFile
                    ? "border-emerald-500/50 bg-emerald-500/5"
                    : "border-border hover:border-primary/50 hover:bg-muted/30"
                } ${uploading ? "opacity-50 pointer-events-none" : ""}`}
              >
                {selectedFile ? (
                  <>
                    <FileCheck className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                    <p className="text-[13px] text-foreground font-medium truncate px-4">
                      {selectedFile.name}
                    </p>
                    <p className="text-[11px] text-emerald-600 mt-1">Ready to analyze</p>
                  </>
                ) : (
                  <>
                    <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-[13px] text-foreground font-medium">
                      Drop your file here, or click to browse
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Supports PDF, JPG, PNG (max 20MB)
                    </p>
                  </>
                )}
              </div>

              {errorMsg && (
                <p className="text-[12px] text-destructive text-center bg-destructive/10 py-2 rounded-lg">
                  {errorMsg}
                </p>
              )}

              <button
                onClick={handleUpload}
                disabled={uploading || !selectedFile}
                className="w-full py-2.5 flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-lg text-[14px] font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {uploading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                    AI is Analyzing...
                  </>
                ) : (
                  <>
                    <Brain className="w-4 h-4" />
                    Analyze with AI
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
