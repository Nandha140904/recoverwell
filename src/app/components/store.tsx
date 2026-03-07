import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
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
  painLevel: number;
  symptoms: string[];
  notes: string;
  mood: "great" | "good" | "okay" | "poor" | "bad";
}

export interface MedicalDocument {
  id: string;
  name: string;
  type: "discharge" | "lab" | "prescription" | "radiology";
  uploadDate: string;
  summary: string;
  keyFindings: string[];
  simplifiedExplanation: string;
  status: "analyzed" | "processing";
}

export interface Medication {
  id: string;
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions?: string;
  isActive: boolean;
  reminderTimes?: string[]; // Custom hours (HH:mm)
}

export interface MedicationLog {
  id: string;
  medicationId: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  takenAt: string | null; // ISO string if taken
}

export interface RecoveryData {
  surgeryType: string;
  surgeryDate: string;
  currentWeek: number;
  overallProgress: number;
  riskLevel: "low" | "moderate" | "high";
  healthEntries: HealthEntry[];
  documents: MedicalDocument[];
  medications: Medication[];
  medicationLogs: MedicationLog[];
  userProfile: UserProfile | null;
  recoveryGuidance?: string; // AI generated markdown or JSON
}

const defaultRecoveryData: RecoveryData = {
  surgeryType: "",
  surgeryDate: "",
  currentWeek: 0,
  overallProgress: 0,
  riskLevel: "low",
  healthEntries: [],
  documents: [],
  medications: [],
  medicationLogs: [],
  userProfile: null,
};

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
  logout: () => void;
  applyCloudSync: (fullData: RecoveryData) => void;
}

const RecoveryContext = createContext<RecoveryContextType | null>(null);

// Bump this version whenever we need to wipe stale localStorage data.
const DATA_VERSION = "4";

export function RecoveryProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<RecoveryData>(() => {
    try {
      // If the stored version doesn't match, reset to defaults so old dummy
      // data doesn't bypass the sign-in / onboarding flow.
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

  useEffect(() => {
    localStorage.setItem("recoveryData", JSON.stringify(data));
    localStorage.setItem("recoveryDataVersion", DATA_VERSION);

    // Auto-sync non-empty profiles to the server
    if (data.userProfile?.mobile) {
      fetchWithTimeout(
        "/api/sync",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        },
        5000
      ).catch((error) => console.log("Cloud sync skipped", error));
    }
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

      const logs = [...prev.medicationLogs];
      if (existingLogIndex >= 0) {
        logs[existingLogIndex] = {
          ...logs[existingLogIndex],
          takenAt: status === "taken" ? new Date().toISOString() : null,
        };
      } else {
        logs.push({
          id: `${Date.now()}-${Math.random()}`,
          medicationId,
          date,
          time,
          takenAt: status === "taken" ? new Date().toISOString() : null,
        });
      }

      return { ...prev, medicationLogs: logs };
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

  const loginAs = (profile: UserProfile) => {
    setData((prev) => ({ ...prev, userProfile: { ...profile, isLoggedIn: true } }));
  };

  const logout = () => {
    setData((prev) => ({ ...prev, userProfile: prev.userProfile ? { ...prev.userProfile, isLoggedIn: false } : null }));
  };

  return (
    <RecoveryContext.Provider value={{
      data, addHealthEntry, addDocument, addMedications, updateMedicationLog, updateRecoveryData,
      setUserProfile, loginAs, markDischargeUploaded, logout, applyCloudSync
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
