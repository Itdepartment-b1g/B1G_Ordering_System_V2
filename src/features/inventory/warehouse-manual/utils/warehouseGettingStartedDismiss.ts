const STORAGE_KEY = "warehouse_getting_started_dismissed";

type DismissedMap = Record<string, true>;

function dismissKey(userId: string, companyId: string): string {
  return `${userId}:${companyId}`;
}

function readDismissedMap(): DismissedMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as DismissedMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeDismissedMap(map: DismissedMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Ignore quota or privacy-mode errors.
  }
}

export function isGettingStartedDismissed(
  userId?: string,
  companyId?: string
): boolean {
  if (!userId || !companyId) return false;
  const map = readDismissedMap();
  return map[dismissKey(userId, companyId)] === true;
}

export function dismissGettingStarted(userId: string, companyId: string): void {
  const map = readDismissedMap();
  map[dismissKey(userId, companyId)] = true;
  writeDismissedMap(map);
}
