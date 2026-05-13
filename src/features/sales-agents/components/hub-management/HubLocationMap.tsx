import { useEffect, useRef } from 'react';
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { GeoSearchControl, OpenStreetMapProvider } from 'leaflet-geosearch';
import 'leaflet-geosearch/dist/geosearch.css';

import { cn } from '@/lib/utils';

import type { HubPinUpdate } from './types';

/**
 * OSM rarely indexes suite/unit numbers. Strip a leading "1404 ", "Unit 5, ", etc. so
 * Nominatim can match building or street (common PH office addresses).
 */
function stripLeadingSuiteForNominatim(raw: string): string {
  const t = raw.trim().replace(/\s+/g, ' ');
  if (!t) return t;
  const stripped = t
    .replace(
      /^(?:(?:unit|suite|rm|room|apt|ste|level|fl|floor|#)\s*)?\d{1,6}[A-Za-z]?(?:\s*[-/]\s*\d+)?\s*[,，]?\s+/i,
      '',
    )
    .trim();
  return stripped || t;
}

/** Nominatim search tuned for hub picking in the Philippines (same file as map). */
class PhilippinesHubNominatimProvider extends OpenStreetMapProvider {
  constructor() {
    const email = import.meta.env.VITE_NOMINATIM_EMAIL as string | undefined;
    super({
      params: {
        'accept-language': 'en',
        countrycodes: 'ph',
        viewbox: '115.8,21.65,127.35,4.2',
        bounded: 0,
        limit: 15,
        ...(email ? { email } : {}),
      },
    });
  }

  search(options: { query: string }) {
    const q = stripLeadingSuiteForNominatim(options.query);
    return super.search({ ...options, query: q });
  }
}

/** Shape returned by OpenStreetMapProvider / Nominatim (leaflet-geosearch). */
type OsmSearchResult = { x: number; y: number; label: string };

delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: string })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const DEFAULT_CENTER: [number, number] = [12.8797, 121.774];
const DEFAULT_ZOOM = 6;
const PIN_ZOOM = 17;

/** Southwest then northeast corners — maritime padding around the Philippine archipelago. */
const PHILIPPINES_MAX_BOUNDS: L.LatLngBoundsExpression = [
  [4.2, 115.8],
  [21.65, 127.35],
];

const philippinesBounds = L.latLngBounds(PHILIPPINES_MAX_BOUNDS);

function clampLatLngToPhilippines(lat: number, lng: number): [number, number] {
  const clamped = L.latLng(
    Math.min(philippinesBounds.getNorth(), Math.max(philippinesBounds.getSouth(), lat)),
    Math.min(philippinesBounds.getEast(), Math.max(philippinesBounds.getWest(), lng)),
  );
  return [clamped.lat, clamped.lng];
}

type HubLocationMapProps = {
  className?: string;
  /** When set, the draggable pin is shown and kept in sync (controlled). */
  latitude?: number | null;
  longitude?: number | null;
  /** Fires when the user picks a search result or finishes dragging the pin. */
  onPinChange: (update: HubPinUpdate) => void;
  /** When true (e.g. dialog just opened), Leaflet recomputes layout after becoming visible. */
  active?: boolean;
  /** Increment when a geocode result is applied so the map flies to the pin (not used for drag). */
  flyToTrigger?: number;
};

const GEOSEARCH_NOT_FOUND =
  'No results. OpenStreetMap may not list every suite or building name—try street + city (e.g. Trade Avenue, Muntinlupa), then drag the pin.';

function MapResize({ active }: { active: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (!active) return;
    const id = window.requestAnimationFrame(() => {
      map.invalidateSize();
      window.setTimeout(() => map.invalidateSize(), 200);
    });
    return () => window.cancelAnimationFrame(id);
  }, [active, map]);
  return null;
}

function FlyToPin({
  latitude,
  longitude,
  flyToTrigger,
}: {
  latitude: number;
  longitude: number;
  /** Increments only when a geocode result is chosen (not on drag). */
  flyToTrigger: number;
}) {
  const map = useMap();

  useEffect(() => {
    if (flyToTrigger <= 0) return;
    const [lat, lng] = clampLatLngToPhilippines(latitude, longitude);
    map.flyTo([lat, lng], PIN_ZOOM, { duration: 0.6 });
  }, [flyToTrigger, latitude, longitude, map]);

  return null;
}

function GeosearchIntegration({
  onResult,
}: {
  onResult: (result: OsmSearchResult) => void;
}) {
  const map = useMap();
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  useEffect(() => {
    const provider = new PhilippinesHubNominatimProvider();

    const searchControl = GeoSearchControl({
      provider,
      style: 'bar',
      showMarker: false,
      showPopup: false,
      autoComplete: true,
      maxSuggestions: 10,
      searchLabel: 'Search address in the Philippines',
      notFoundMessage: GEOSEARCH_NOT_FOUND,
      marker: {
        draggable: false,
        icon: new L.Icon.Default(),
      },
      maxMarkers: 1,
      retainZoomLevel: false,
      animateZoom: true,
      zoomLevel: PIN_ZOOM,
    });

    map.addControl(searchControl);

    const onShowLocation = (ev: L.LeafletEvent & { location?: OsmSearchResult }) => {
      const loc = ev.location;
      if (!loc || typeof loc.y !== 'number' || typeof loc.x !== 'number') return;
      onResultRef.current(loc);
    };

    map.on('geosearch/showlocation', onShowLocation as L.LeafletEventHandlerFn);

    return () => {
      map.off('geosearch/showlocation', onShowLocation as L.LeafletEventHandlerFn);
      map.removeControl(searchControl);
    };
  }, [map]);

  return null;
}

export function HubLocationMap({
  className,
  latitude,
  longitude,
  onPinChange,
  active = true,
  flyToTrigger = 0,
}: HubLocationMapProps) {
  const hasPin =
    latitude != null &&
    longitude != null &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude);

  const handleGeocode = (result: OsmSearchResult) => {
    const [lat, lng] = clampLatLngToPhilippines(result.y, result.x);
    onPinChange({
      latitude: lat,
      longitude: lng,
      resolvedLabel: result.label,
      source: 'geocode',
    });
  };

  return (
    <div
      className={cn(
        'hub-location-map relative overflow-hidden rounded-md border bg-muted/30',
        '[&_.leaflet-control-geosearch]:max-w-[min(100%,320px)]',
        '[&_.leaflet-control-geosearch_form_input]:h-9 [&_.leaflet-control-geosearch_form_input]:rounded-md',
        className,
      )}
    >
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={DEFAULT_ZOOM}
        className="h-full min-h-[280px] w-full"
        scrollWheelZoom
        maxBounds={PHILIPPINES_MAX_BOUNDS}
        maxBoundsViscosity={1}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapResize active={active} />
        <GeosearchIntegration onResult={handleGeocode} />
        {hasPin && (
          <>
            <FlyToPin
              latitude={latitude!}
              longitude={longitude!}
              flyToTrigger={flyToTrigger}
            />
            <Marker
              position={[latitude!, longitude!]}
              draggable
              eventHandlers={{
                dragend: (e) => {
                  const ll = e.target.getLatLng();
                  const [lat, lng] = clampLatLngToPhilippines(ll.lat, ll.lng);
                  e.target.setLatLng([lat, lng]);
                  onPinChange({
                    latitude: lat,
                    longitude: lng,
                    source: 'drag',
                  });
                },
              }}
            />
          </>
        )}
      </MapContainer>
      <p className="pointer-events-none absolute bottom-2 left-2 right-2 rounded bg-background/90 px-2 py-1 text-center text-[11px] leading-snug text-muted-foreground shadow-sm sm:text-xs">
        Philippines only (Nominatim). Suite numbers and some towers are not always in the map—search street + city if needed, then drag the pin.
      </p>
    </div>
  );
}
