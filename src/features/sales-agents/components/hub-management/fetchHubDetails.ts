import { supabase } from '@/lib/supabase';

export type HubDetails = {
  id: string;
  hub_name: string;
  hub_location: string | null;
  latitude: number;
  longitude: number;
  radius_meter: number;
};

export async function fetchHubDetails(hubId: string): Promise<HubDetails> {
  const { data, error } = await supabase
    .from('hubs')
    .select('id, hub_name, hub_location, latitude, longitude, radius_meter')
    .eq('id', hubId)
    .single();

  if (error) throw error;
  return data as HubDetails;
}
