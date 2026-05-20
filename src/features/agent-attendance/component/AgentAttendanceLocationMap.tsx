import { useEffect } from 'react';
import { Circle, MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: string })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

function MapResizeAndFit({
  agentLat,
  agentLng,
  hubLat,
  hubLng,
}: {
  agentLat: number;
  agentLng: number;
  hubLat: number;
  hubLng: number;
}) {
  const map = useMap();

  useEffect(() => {
    const a = L.latLng(agentLat, agentLng);
    const h = L.latLng(hubLat, hubLng);
    const metersApart = map.distance(a, h);

    const id = requestAnimationFrame(() => {
      try {
        if (metersApart < 8) {
          map.setView(a, 18, { animate: false });
        } else {
          const bounds = L.latLngBounds(a, h);
          map.fitBounds(bounds, { padding: [48, 48], maxZoom: 17, animate: false });
        }
      } catch {
        try {
          map.setView(a, 16, { animate: false });
        } catch {
          /* map unmounted */
        }
      }
      requestAnimationFrame(() => {
        try {
          map.invalidateSize();
        } catch {
          /* map unmounted */
        }
      });
    });

    return () => cancelAnimationFrame(id);
  }, [map, agentLat, agentLng, hubLat, hubLng]);

  return null;
}

export type AgentAttendanceLocationMapProps = {
  className?: string;
  agentLatitude: number;
  agentLongitude: number;
  hubLatitude: number;
  hubLongitude: number;
  hubRadiusMeter: number;
  hubName: string;
};

/**
 * Map during time-in: your position, hub marker, and a clear geofence circle (`hubRadiusMeter` meters).
 */
export function AgentAttendanceLocationMap({
  className,
  agentLatitude,
  agentLongitude,
  hubLatitude,
  hubLongitude,
  hubRadiusMeter,
  hubName,
}: AgentAttendanceLocationMapProps) {
  const safeRadiusM =
    Number.isFinite(hubRadiusMeter) && hubRadiusMeter > 0 && hubRadiusMeter < 5_000_000
      ? hubRadiusMeter
      : 100;

  const center: [number, number] = [agentLatitude, agentLongitude];

  return (
    <div
      className={className}
      style={{ minHeight: 220 }}
    >
      <MapContainer
        center={center}
        zoom={16}
        className="h-[220px] w-full rounded-lg border z-0"
        scrollWheelZoom
        attributionControl
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapResizeAndFit
          agentLat={agentLatitude}
          agentLng={agentLongitude}
          hubLat={hubLatitude}
          hubLng={hubLongitude}
        />
        <Circle
          center={[hubLatitude, hubLongitude]}
          radius={safeRadiusM}
          pathOptions={{
            color: '#1d4ed8',
            fillColor: '#2563eb',
            fillOpacity: 0.28,
            weight: 3,
            opacity: 0.95,
          }}
          interactive={false}
        />
        <Marker position={[hubLatitude, hubLongitude]}>
          <Popup>
            <strong>{hubName}</strong>
            <br />
            <span style={{ fontSize: 11, opacity: 0.8 }}>Hub · {Math.round(safeRadiusM)} m radius</span>
          </Popup>
        </Marker>
        <Marker position={[agentLatitude, agentLongitude]}>
          <Popup>
            <strong>Your location</strong>
            <br />
            <span style={{ fontSize: 11, opacity: 0.8 }}>
              {agentLatitude.toFixed(5)}, {agentLongitude.toFixed(5)}
            </span>
          </Popup>
        </Marker>
      </MapContainer>
    </div>
  );
}
