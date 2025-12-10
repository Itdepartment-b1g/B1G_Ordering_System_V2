import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { WarRoomClient } from '../hooks/useWarRoomClients';
import { getMarkerColor } from '../utils/markerColors';
import { useEffect } from 'react';

// Fix for default marker icon issue in React Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface WarRoomMapProps {
  clients: WarRoomClient[];
  onClientClick: (client: WarRoomClient) => void;
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

export function WarRoomMap({ clients, onClientClick }: WarRoomMapProps) {
  // Default center: Philippines
  const defaultCenter: [number, number] = [12.8797, 121.7740];
  const defaultZoom = 6;

  return (
    <div className="relative h-full w-full rounded-lg overflow-hidden shadow-lg">
      <MapContainer
        center={defaultCenter}
        zoom={defaultZoom}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={true}
        className="z-0"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        <MapBounds clients={clients} />

        {clients.map((client) => {
          const markerColor = getMarkerColor(client.account_type, client.has_forge);
          const customIcon = createCustomIcon(markerColor);

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
                    <p><strong>Forge:</strong> {client.has_forge ? 'Yes' : 'No'}</p>
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
    </div>
  );
}

