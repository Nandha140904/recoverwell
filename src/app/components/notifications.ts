import { type Medication } from "./store";

// Parse the frequency string to figure out how many times per day & at which hours
export function parseTimesFromFrequency(frequency: string): number[] {
  const f = frequency.toLowerCase();

  // Handle common medical abbreviations normalization
  if (f === "od" || f === "daily" || f.includes("once") || f.includes("1 time")) {
    return [8]; // 8 AM
  }
  if (f === "bd" || f === "bid" || f.includes("twice") || f.includes("2 time") || f.includes("every 12")) {
    return [8, 20]; // 8 AM, 8 PM
  }
  if (f === "tds" || f === "tid" || f.includes("3 time") || f.includes("thrice") || f.includes("three time")) {
    return [8, 14, 20]; // 8 AM, 2 PM, 8 PM
  }
  if (f === "qid" || f.includes("4 time") || f.includes("every 6")) {
    return [6, 12, 18, 0]; // 6 AM, 12 PM, 6 PM, 12 AM
  }
  if (f.includes("every 8")) {
    return [8, 16, 0];
  }
  if (f.includes("every 4")) {
    return [8, 12, 16, 20, 0];
  }
  
  // Default fallback: once a day at 8 AM
  return [8];
}

// Request notification permission
export async function requestNotificationPermission(): Promise<boolean> {
  if (!("Notification" in window)) {
    console.warn("This browser does not support notifications.");
    return false;
  }
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;

  const permission = await Notification.requestPermission();
  return permission === "granted";
}

// Store notification timeouts so we can clear them
const notificationTimeouts: number[] = [];

export function clearAllMedicationNotifications() {
  notificationTimeouts.forEach((id) => clearTimeout(id));
  notificationTimeouts.length = 0;
}

// Schedule a single browser notification at an offset from now (ms)
function scheduleNotification(title: string, body: string, delayMs: number) {
  if (delayMs < 0) return;
  const id = window.setTimeout(() => {
    if (Notification.permission === "granted") {
      new Notification(title, {
        body,
        icon: "/favicon.ico",
        tag: title, // prevent duplicates
      });
    }
  }, delayMs);
  notificationTimeouts.push(id);
}

// Schedule today's and tomorrow's notifications for all medications
export function scheduleMedicationNotifications(medications: Medication[]) {
  clearAllMedicationNotifications();

  const now = new Date();

  medications.forEach((med) => {
    const times = parseTimesFromFrequency(med.frequency);

    // Schedule for today & next 2 days (demo — in a real app use service worker)
    for (let dayOffset = 0; dayOffset <= 1; dayOffset++) {
      times.forEach((hour) => {
        const target = new Date(now);
        target.setDate(now.getDate() + dayOffset);
        target.setHours(hour === 24 ? 0 : hour, 0, 0, 0);
        if (hour === 24) target.setDate(target.getDate() + 1);

        const delay = target.getTime() - now.getTime();
        if (delay > 0) {
          scheduleNotification(
            `💊 Medication Reminder`,
            `It's time to take your medication: ${med.name} - ${med.dosage}`,
            delay
          );
        }
      });
    }
  });
}

// Show an immediate test/confirmation notification
export function showImmediateNotification(medications: Medication[]) {
  if (Notification.permission === "granted" && medications.length > 0) {
    new Notification("✅ Medication Reminders Set!", {
      body: `You'll be reminded to take: ${medications.map((m) => m.name).join(", ")}. Check your schedule.`,
      icon: "/favicon.ico",
    });
  }
}
