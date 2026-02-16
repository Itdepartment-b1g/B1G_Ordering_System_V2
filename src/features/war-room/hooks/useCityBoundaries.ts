
import { useQuery } from '@tanstack/react-query';

const GEOJSON_URL = '/ph-municipalities.json';

export function useCityBoundaries() {
  return useQuery({
    queryKey: ['ph-city-boundaries'],
    queryFn: async () => {
      const response = await fetch(GEOJSON_URL);
      if (!response.ok) {
        throw new Error('Failed to fetch city boundaries');
      }
      return response.json();
    },
    staleTime: Infinity, // Never stale since it's a static file
    refetchOnWindowFocus: false,
    refetchOnMount: false
  });
}
