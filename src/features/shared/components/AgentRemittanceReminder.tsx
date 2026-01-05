import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/features/auth";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Clock } from "lucide-react";

// Reminder time: 6:30 PM every day.
// Adjust REMINDER_HOUR / REMINDER_MINUTE if remittance schedule changes.
const REMINDER_HOUR = 18;    // 24h format: 18 = 6 PM
const REMINDER_MINUTE = 30;  // 30 minutes

const STORAGE_KEY_PREFIX = "remittanceReminderAcknowledged";

export function AgentRemittanceReminder() {
  const { user } = useAuth();
  const [showReminder, setShowReminder] = useState(false);
  const hasPlayedSoundRef = useRef(false);

  useEffect(() => {
    // Only run for logged-in agents (both sales_agent and mobile_sales roles)
    if (!user || (user.role !== "mobile_sales")) return;

    const getTodayKey = () => new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const getStorageKey = () => `${STORAGE_KEY_PREFIX}:${getTodayKey()}`;

    const checkReminder = () => {
      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();

      // Check if it's past the reminder time (6:30 PM or later)
      const isPastReminderTime =
        currentHour > REMINDER_HOUR ||
        (currentHour === REMINDER_HOUR && currentMinute >= REMINDER_MINUTE);

      // Check if already acknowledged today
      const alreadyAcknowledged = localStorage.getItem(getStorageKey()) === "true";

      // Show reminder if it's past the time AND not yet acknowledged
      if (isPastReminderTime && !alreadyAcknowledged) {
        setShowReminder(true);
      }
    };

    // Clean up old storage keys (older than today)
    const cleanupOldKeys = () => {
      const todayKey = getTodayKey();
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(STORAGE_KEY_PREFIX) && !key.includes(todayKey)) {
          localStorage.removeItem(key);
        }
      }
    };

    // Run cleanup and check immediately on mount
    cleanupOldKeys();
    checkReminder();

    // Check every 30 seconds (in case user keeps the app open)
    const intervalId = setInterval(checkReminder, 30_000);

    return () => clearInterval(intervalId);
  }, [user]);

  // Play notification sound once when the reminder first appears
  useEffect(() => {
    if (!showReminder || hasPlayedSoundRef.current) return;

    // Point this to any short notification sound placed in your public folder,
    // e.g. public/notification.mp3 → URL = "/notification.mp3"
    const audio = new Audio("/notification.mp3");
    audio.volume = 0.8;
    audio.play().catch((err) => {
      // Ignore autoplay/permission errors; reminder dialog still shows
      console.warn("Notification sound could not be played:", err);
    });

    hasPlayedSoundRef.current = true;
  }, [showReminder]);

  const handleAcknowledge = () => {
    const todayKey = new Date().toISOString().slice(0, 10);
    const storageKey = `${STORAGE_KEY_PREFIX}:${todayKey}`;
    localStorage.setItem(storageKey, "true");
    setShowReminder(false);
  };

  // Don't render anything for non-agents
  if (!user || (user.role !== "mobile_sales")) return null;

  return (
    <AlertDialog open={showReminder} onOpenChange={(open) => {
      // Only allow closing via the button, not by clicking outside
      if (!open) return;
    }}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="h-12 w-12 rounded-full bg-amber-100 flex items-center justify-center">
              <Clock className="h-6 w-6 text-amber-600" />
            </div>
            <AlertDialogTitle className="text-xl">Daily Remittance Reminder</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-base leading-relaxed">
            <span className="font-medium text-foreground">It's time to remit!</span>
            <br /><br />
            Please remit your stocks and sold items now. Make sure your remittances are updated before the cut-off time.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction 
            onClick={handleAcknowledge}
            className="w-full sm:w-auto bg-amber-600 hover:bg-amber-700"
          >
            Okay, Got It
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

