import { MapContainer, TileLayer, Marker, Popup, useMap, GeoJSON } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { WarRoomClient } from '../hooks/useWarRoomClients';
import { getMarkerColor } from '../utils/markerColors';
import { useEffect, useMemo, useRef } from 'react';
import { useCityBoundaries } from '../hooks/useCityBoundaries';

// Fix for default marker icon issue in React Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface WarRoomMapProps {
  clients: WarRoomClient[];
  cityHolders?: Map<string, string>; // City Name -> Holder Name
  onClientClick: (client: WarRoomClient) => void;
  // Callback when city status changes (selected/deselected)
  onCityStatusChange?: (city: string, isSelected: boolean) => void;
}

// Create custom colored marker icon
const createCustomIcon = (color: string) => {
  return L.divIcon({
    className: 'custom-map-marker',
    html: `
      <svg width="32" height="42" viewBox="0 0 32 42" xmlns="http://www.w3.org/2000/svg">
        <path 
          d="M16 0C7.163 0 0 7.163 0 16c0 13 16 26 16 26s16-13 16-26C32 7.163 24.837 0 16 0z" 
          fill="${color}"
          stroke="#fff"
          stroke-width="2"
        />
        <circle cx="16" cy="16" r="6" fill="#fff" opacity="0.8"/>
      </svg>
    `,
    iconSize: [32, 42],
    iconAnchor: [16, 42],
    popupAnchor: [0, -42],
  });
};

// Generate a consistent color for a string (Agent Name)
const stringToColor = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  // Use HSL for better colors (pastel-ish)
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 70%, 60%)`;
};

// Component to handle map bounds
function MapBounds({ clients }: { clients: WarRoomClient[] }) {
  const map = useMap();

  useEffect(() => {
    if (clients.length > 0) {
      const bounds = L.latLngBounds(
        clients.map(client => [client.location_latitude, client.location_longitude])
      );
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
    }
  }, [clients, map]);

  return null;
}

export function WarRoomMap({ clients, cityHolders, onClientClick, onCityStatusChange }: WarRoomMapProps) {
  // Default center: Philippines
  const defaultCenter: [number, number] = [12.8797, 121.7740];
  const defaultZoom = 6;
  
  const { data: cityBoundaries } = useCityBoundaries();

  // Create a ref for the callback to ensure persistent event listeners use the latest version
  const onCityStatusChangeRef = useRef(onCityStatusChange);
  useEffect(() => {
    onCityStatusChangeRef.current = onCityStatusChange;
  }, [onCityStatusChange]);

  // Normalize city name for matching
  const normalizeCity = (name: string) => {
    return name.toLowerCase()
      .trim()
      .replace(/^city of\s+/i, '') // Remove "City of" prefix
      .replace(/\s+city$/i, '');   // Remove "City" suffix
  };

  // Filter and style GeoJSON
  const filteredGeoJSON = useMemo(() => {
    if (!cityBoundaries || !cityHolders || cityHolders.size === 0) return null;

    // Create a normalized map for faster lookup
    const normalizedHolders = new Map<string, string>();
    const normalizedToDbName = new Map<string, string>();

    cityHolders.forEach((holder, city) => {
      const norm = normalizeCity(city);
      normalizedHolders.set(norm, holder);
      normalizedToDbName.set(norm, city);
    });

    const features = cityBoundaries.features.filter((feature: any) => {
      // geoBoundaries uses 'shapeName' or 'shapeISO' or 'ADM3_EN'
      const rawName = feature.properties.shapeName || feature.properties.ADM3_EN || feature.properties.name || '';
      const normalizedName = normalizeCity(rawName);
      
      // Check for exact match or normalized match
      // We store the matched holder in the feature properties for easier access later
      if (normalizedHolders.has(normalizedName)) {
        feature.properties._holder = normalizedHolders.get(normalizedName);
        feature.properties._dbName = rawName; // Keep original name
        feature.properties._originalDbCity = normalizedToDbName.get(normalizedName); // Store DB name for filtering
        return true;
      }
      return false;
    });

    return {
      type: 'FeatureCollection',
      features
    };
  }, [cityBoundaries, cityHolders]);

  const geoJSONStyle = (feature: any) => {
    const rawName = feature.properties._dbName || feature.properties.shapeName || feature.properties.ADM3_EN || feature.properties.name || '';
    // Use normalized city name for color generation to ensure matching with pins
    const color = stringToColor(normalizeCity(rawName));

    return {
      fillColor: color,
      weight: 2,
      opacity: 1,
      color: color, // Border color
      dashArray: '3',
      fillOpacity: 0.2
    };
  };

  const onEachFeature = (feature: any, layer: L.Layer) => {
    const cityName = feature.properties.shapeName || feature.properties.ADM3_EN || feature.properties.name || '';
    const holder = feature.properties._holder || 'Unknown';
    
    layer.bindPopup(`
      <div class="p-1">
        <h4 class="font-bold text-sm">${cityName}</h4>
        <p class="text-xs text-muted-foreground">Held by: ${holder}</p>
        <p class="text-[10px] text-blue-500 mt-1 italic">Click to filter</p>
      </div>
    `);

    // Use popup events to drive selection logic
    layer.on({
      popupopen: () => {
        if (feature.properties._originalDbCity) {
           onCityStatusChangeRef.current?.(feature.properties._originalDbCity, true);
        }
      },
      popupclose: () => {
        if (feature.properties._originalDbCity) {
           onCityStatusChangeRef.current?.(feature.properties._originalDbCity, false);
        }
      }
    });
  };

  // Create a stable key for the GeoJSON component
  const geoJsonKey = cityHolders ? Array.from(cityHolders.entries()).map(([k,v]) => `${k}:${v}`).join(',') : 'empty';

  return (
    <MapContainer
      center={defaultCenter}
      zoom={defaultZoom}
      style={{ height: '100%', width: '100%', zIndex: 0 }}
      scrollWheelZoom={true}
      className="map-container"
    >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        />
        
        <MapBounds clients={clients} />

        {filteredGeoJSON && (
          <GeoJSON 
            key={geoJsonKey} // Force re-render when holders change
            data={filteredGeoJSON as any}
            style={geoJSONStyle}
            onEachFeature={onEachFeature}
          />
        )}

        {clients.map((client) => {
          // Use city color for the pin to match the polygon
          // Normalize the city name to ensure it matches the GeoJSON color logic
          const cityColor = client.city ? stringToColor(normalizeCity(client.city)) : '#6b7280'; // Gray default
          const customIcon = createCustomIcon(cityColor);

          return (
            <Marker
              key={client.id}
              position={[client.location_latitude, client.location_longitude]}
              icon={customIcon}
              eventHandlers={{
                click: () => onClientClick(client),
              }}
            >
              <Popup>
                <div className="p-2">
                  <h3 className="font-semibold text-lg">{client.name}</h3>
                  <p className="text-sm text-muted-foreground">{client.company}</p>
                  <div className="mt-2 text-sm">
                    <p><strong>Type:</strong> {client.account_type}</p>
                    <p>
                      <strong>Brands:</strong>{' '}
                      {client.brand_names && client.brand_names.length > 0 
                        ? client.brand_names.join(', ') 
                        : 'None'}
                    </p>
                    <p><strong>Location:</strong> {client.city}</p>
                  </div>
                  <p className="text-xs text-blue-600 mt-2 cursor-pointer hover:underline">
                    Click marker for full details
                  </p>
                </div>
              </Popup>
            </Marker>
          );
        })}
    </MapContainer>
  );
}

