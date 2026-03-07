import React, { createContext, useContext, useState, useEffect } from "react";
import { fetchWithTimeout } from "../lib/api";

export interface UserProfile {
  name: string;
  doctorName: string;
  doctorMobile: string;
  bloodGroup: string;
  mobile: string;
  passwordHash: string;
  isLoggedIn: boolean;
  hasUploadedDischarge: boolean;
}

export interface HealthEntry {
  id: string;
  date: string;
  temperature: number;
  weight: number;
  painLevel: number; // 0-10
  symptoms: string[];
  notes: string;
  mood: "great" | "good" | "okay" | "poor" | "bad";
}

export interface Medication {
  id: string;
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string;
  isActive: boolean;
  reminderTimes?: string[];
}

export interface MedicationLog {
  id: string;
  medicationId: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  takenAt: string | null;
}

export interface MedicalDocument {
  id: string;
  name: string;
  type: "discharge" | "lab" | "prescription" | "other";
  uploadDate: string;
  summary: string;
  keyFindings: string[];
  simplifiedExplanation: string;
  status: "analyzed" | "processing" | "failed";
}

export interface RecoveryData {
  surgeryType: string;
  surgeryDate: string;
  currentWeek: number;
  overallProgress: number; // 0-100
  riskLevel: "low" | "moderate" | "high";
  healthEntries: HealthEntry[];
  documents: MedicalDocument[];
  medications: Medication[];
  medicationLogs: MedicationLog[];
  userProfile: UserProfile | null;
  recoveryGuidance?: string;
}

interface RecoveryContextType {
  data: RecoveryData;
  addHealthEntry: (entry: Omit<HealthEntry, "id">) => void;
  addDocument: (doc: Omit<MedicalDocument, "id">) => void;
  addMedications: (meds: Omit<Medication, "id" | "isActive">[]) => void;
  updateMedicationLog: (medicationId: string, date: string, time: string, status: "taken" | "skipped") => void;
  updateRecoveryData: (updates: Partial<RecoveryData>) => void;
  setUserProfile: (profile: UserProfile) => void;
  loginAs: (profile: UserProfile) => void;
  markDischargeUploaded: () => void;
  deactivateMedication: (id: string) => void;
  deleteMedication: (id: string) => void;
  logout: () => void;
  applyCloudSync: (fullData: RecoveryData) => void;
}

const RecoveryContext = createContext<RecoveryContextType | undefined>(undefined);

const DATA_VERSION = "1.0.2";
const SYNC_DEBOUNCE_MS = 2000;

const defaultRecoveryData: RecoveryData = {
  surgeryType: "Total Knee Replacement",
  surgeryDate: "2024-03-01",
  currentWeek: 2,
  overallProgress: 35,
  riskLevel: "low",
  healthEntries: [],
  documents: [],
  medications: [],
  medicationLogs: [],
  userProfile: null,
};

export function RecoveryProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<RecoveryData>(() => {
    try {
      const storedVersion = localStorage.getItem("recoveryDataVersion");
      if (storedVersion !== DATA_VERSION) {
        localStorage.removeItem("recoveryData");
        localStorage.setItem("recoveryDataVersion", DATA_VERSION);
        return defaultRecoveryData;
      }
      const stored = localStorage.getItem("recoveryData");
      return stored ? JSON.parse(stored) : defaultRecoveryData;
    } catch {
      return defaultRecoveryData;
    }
  });

  // Debounced Sync Effect
  useEffect(() => {
    localStorage.setItem("recoveryData", JSON.stringify(data));
    localStorage.setItem("recoveryDataVersion", DATA_VERSION);

    if (!data.userProfile?.isLoggedIn || !data.userProfile?.mobile) return;

    const timer = setTimeout(async () => {
      try {
        await fetchWithTimeout("/api/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }, 8000);
        console.log("[Cloud] State synced successfully");
      } catch (err) {
        console.warn("[Cloud] Sync skipped or failed:", err);
      }
    }, SYNC_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [data]);

  const applyCloudSync = (fullData: RecoveryData) => {
    setData(fullData);
  };

  const addHealthEntry = (entry: Omit<HealthEntry, "id">) => {
    setData((prev) => ({
      ...prev,
      healthEntries: [
        { ...entry, id: Date.now().toString() },
        ...prev.healthEntries,
      ],
    }));
  };

  const addDocument = (doc: Omit<MedicalDocument, "id">) => {
    setData((prev) => ({
      ...prev,
      documents: [
        { ...doc, id: Date.now().toString() },
        ...prev.documents,
      ],
    }));
  };

  const addMedications = (meds: Omit<Medication, "id" | "isActive">[]) => {
    setData((prev) => {
      const newMeds = meds.map((m, i) => ({
        ...m,
        id: `${Date.now()}-${i}`,
        isActive: true,
      }));
      return { ...prev, medications: [...prev.medications, ...newMeds] };
    });
  };

  const updateMedicationLog = (medicationId: string, date: string, time: string, status: "taken" | "skipped") => {
    setData((prev) => {
      const existingLogIndex = prev.medicationLogs.findIndex(
        (l) => l.medicationId === medicationId && l.date === date && l.time === time
      );

      const updatedLogs = [...prev.medicationLogs];
      if (existingLogIndex >= 0) {
        updatedLogs[existingLogIndex] = {
          ...updatedLogs[existingLogIndex],
          takenAt: status === "taken" ? new Date().toISOString() : null,
        };
      } else {
        updatedLogs.push({
          id: Date.now().toString(),
          medicationId,
          date,
          time,
          takenAt: status === "taken" ? new Date().toISOString() : null,
        });
      }

      return { ...prev, medicationLogs: updatedLogs };
    });
  };

  const updateRecoveryData = (updates: Partial<RecoveryData>) => {
    setData((prev) => ({ ...prev, ...updates }));
  };

  const setUserProfile = (profile: UserProfile) => {
    setData((prev) => ({ ...prev, userProfile: profile }));
  };

  const markDischargeUploaded = () => {
    setData((prev) => ({
      ...prev,
      userProfile: prev.userProfile
        ? { ...prev.userProfile, hasUploadedDischarge: true }
        : null,
    }));
  };
  
  const deactivateMedication = (id: string) => {
    setData((prev) => ({
      ...prev,
      medications: prev.medications.map(m => m.id === id ? { ...m, isActive: false } : m)
    }));
  };

  const deleteMedication = (id: string) => {
    setData((prev) => ({
      ...prev,
      medications: prev.medications.filter(m => m.id !== id)
    }));
  };

  const loginAs = (profile: UserProfile) => {
    setData((prev) => ({ ...prev, userProfile: { ...profile, isLoggedIn: true } }));
  };

  const logout = () => {
    setData((prev) => ({ ...prev, userProfile: prev.userProfile ? { ...prev.userProfile, isLoggedIn: false } : null }));
  };

  return (
    <RecoveryContext.Provider value={{
      data, addHealthEntry, addDocument, addMedications, updateMedicationLog, updateRecoveryData,
      setUserProfile, loginAs, markDischargeUploaded, logout, applyCloudSync,
      deactivateMedication, deleteMedication
    }}>
      {children}
    </RecoveryContext.Provider>
  );
}

export function useRecovery() {
  const ctx = useContext(RecoveryContext);
  if (!ctx) throw new Error("useRecovery must be used within RecoveryProvider");
  return ctx;
}
