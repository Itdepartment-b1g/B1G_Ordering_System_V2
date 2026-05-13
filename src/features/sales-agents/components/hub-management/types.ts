import type { Hub } from '@/types/database.types';

/** Payload when the pin moves or a geocode result is chosen (OpenStreetMap / Nominatim via leaflet-geosearch). */
export type HubPinUpdate = {
  latitude: number;
  longitude: number;
  /** Display name from Nominatim when the update came from search (optional after drag). */
  resolvedLabel?: string;
  source: 'geocode' | 'drag';
};

/** Hub row from list query (coordinates omitted in UI and select). */
export type HubRow = Omit<Hub, "latitude" | "longitude"> & {
  profiles?: { full_name: string } | null;
  /** Resolved from `assigned_team_leader_id` → profiles (embed in list query). */
  assigned_team_leader?: { id: string; full_name: string } | null;
};
