import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { AutoComplete, Input, Space, Button, Tag } from 'antd';
import { EnvironmentOutlined, AimOutlined } from '@ant-design/icons';
import 'leaflet/dist/leaflet.css';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';

// Fix the default Leaflet marker icon: bundlers don't pick up the relative URLs Leaflet uses
// internally, so we re-bind the icon to URLs Vite resolves at build time.
const DefaultIcon = L.icon({
  iconRetinaUrl, iconUrl, shadowUrl,
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

type Props = {
  latitude?: number | null;
  longitude?: number | null;
  onChange: (lat: number | null, lng: number | null) => void;
  height?: number;
};

type SearchHit = {
  display_name: string;
  lat: string;
  lon: string;
  place_id: number;
  type?: string;
};

const DEFAULT_CENTER: [number, number] = [25.276987, 55.296249]; // Dubai-ish; reasonable Indian Ocean / GCC fallback

/// Inline map picker with search. Click the map or drag the marker to set coordinates;
/// type into the search box to geocode an address through Nominatim (OSM's free geocoder).
/// Use the parent form's setFieldsValue in `onChange` to keep the lat/lng inputs in sync.
export function LocationPickerField({ latitude, longitude, onChange, height = 320 }: Props) {
  const hasCoords = typeof latitude === 'number' && typeof longitude === 'number'
    && Number.isFinite(latitude) && Number.isFinite(longitude);

  // Browser-located fallback. Triggered once on mount when no coords are set so the user opens
  // straight to "where I am" rather than a generic world view. Falls back to DEFAULT_CENTER if
  // geolocation is denied / unavailable.
  const [autoCenter, setAutoCenter] = useState<[number, number] | null>(null);
  useEffect(() => {
    if (hasCoords || autoCenter) return;
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setAutoCenter([pos.coords.latitude, pos.coords.longitude]),
      () => {},
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 60_000 },
    );
  }, [hasCoords, autoCenter]);

  const center: [number, number] = hasCoords
    ? [latitude!, longitude!]
    : (autoCenter ?? DEFAULT_CENTER);
  const initialZoom = hasCoords ? 16 : (autoCenter ? 14 : 4);

  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<number | null>(null);

  // Debounced Nominatim search. Public endpoint - polite usage: 300ms debounce + 5 result cap.
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (!query || query.trim().length < 3) { setHits([]); return; }
    debounceRef.current = window.setTimeout(async () => {
      setSearching(true);
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(query)}`,
          { headers: { 'Accept-Language': navigator.language || 'en' } });
        const data = (await r.json()) as SearchHit[];
        setHits(Array.isArray(data) ? data : []);
      } catch {
        setHits([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => { if (debounceRef.current) window.clearTimeout(debounceRef.current); };
  }, [query]);

  const options = useMemo(() => hits.map((h) => ({
    value: `${h.place_id}`,
    label: <span style={{ fontSize: 12 }}>{h.display_name}</span>,
    hit: h,
  })), [hits]);

  const useGeolocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => onChange(round(pos.coords.latitude), round(pos.coords.longitude)),
      () => {},
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  return (
    <div>
      <Space.Compact style={{ inlineSize: '100%', marginBlockEnd: 8 }}>
        <AutoComplete
          style={{ flex: 1 }}
          options={options}
          value={query}
          onChange={(v) => setQuery(v)}
          onSelect={(_, opt) => {
            const hit = (opt as unknown as { hit: SearchHit }).hit;
            const lat = round(parseFloat(hit.lat));
            const lng = round(parseFloat(hit.lon));
            setQuery(hit.display_name);
            onChange(lat, lng);
          }}
          notFoundContent={searching ? 'Searching…' : query.length >= 3 ? 'No matches' : null}
        >
          <Input
            placeholder="Search address - e.g. Hakimi Masjid, Dubai"
            prefix={<EnvironmentOutlined style={{ color: 'var(--jm-gray-400)' }} />}
            allowClear
          />
        </AutoComplete>
        <Button icon={<AimOutlined />} onClick={useGeolocation} title="Use my current location" />
      </Space.Compact>

      <div style={{ blockSize: height, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--jm-border)' }}>
        <MapContainer center={center} zoom={initialZoom} style={{ blockSize: '100%', inlineSize: '100%' }}>
          {/* CartoDB Voyager: English labels worldwide and shows building footprints at zoom 16+.
              The standard OSM tile.openstreetmap.org localises labels to whatever language the
              region uses (Arabic in the Gulf, etc.) which made building names unreadable. */}
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            subdomains={['a', 'b', 'c', 'd']}
            maxZoom={20}
          />
          <SizeFix />
          <FlyTo center={hasCoords ? [latitude!, longitude!] : autoCenter} />
          <ClickToPlace onPick={(lat, lng) => onChange(round(lat), round(lng))} />
          {hasCoords && (
            <Marker
              position={[latitude!, longitude!]}
              draggable
              eventHandlers={{
                dragend: (e) => {
                  const m = e.target as L.Marker;
                  const ll = m.getLatLng();
                  onChange(round(ll.lat), round(ll.lng));
                },
              }}
            />
          )}
        </MapContainer>
      </div>

      <div style={{ marginBlockStart: 6, fontSize: 12, color: 'var(--jm-gray-500)' }}>
        {hasCoords
          ? <Space>
              <Tag color="green" className="jm-tnum">{latitude!.toFixed(6)}, {longitude!.toFixed(6)}</Tag>
              <a onClick={() => onChange(null, null)}>Clear</a>
            </Space>
          : <span>Search above, click anywhere on the map, or drag a marker to set coordinates.</span>}
      </div>
    </div>
  );
}

function ClickToPlace({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

// When the map mounts inside a tab that wasn't initially visible (or any container that
// resizes after first render), Leaflet computes its size against a 0×0 box and never bothers
// to fetch tiles. invalidateSize after mount + on container resize fixes the empty blue map.
function SizeFix() {
  const map = useMap();
  useEffect(() => {
    const fire = () => map.invalidateSize();
    // Fire a few times - covers immediate mount, post-layout, and any late tab transition.
    const t1 = window.setTimeout(fire, 0);
    const t2 = window.setTimeout(fire, 200);
    const t3 = window.setTimeout(fire, 600);
    const ro = new ResizeObserver(fire);
    const container = map.getContainer();
    ro.observe(container);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      ro.disconnect();
    };
  }, [map]);
  return null;
}

// Recenters the map when the parent's coordinates change. Uses setView (synchronous, no
// animation) instead of flyTo because flyTo's per-frame pixel projection threw
// "Invalid LatLng (NaN, NaN)" when the container was hidden mid-animation - which is exactly
// what happens when the user switches between admin tabs (the prior tab goes display:none and
// the map's getSize() drops to 0x0). We also bail out when center is missing/non-finite or the
// container itself has zero size, both of which would produce the same NaN crash.
function FlyTo({ center }: { center: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (!center) return;
    if (!Number.isFinite(center[0]) || !Number.isFinite(center[1])) return;
    const size = map.getSize();
    if (size.x === 0 || size.y === 0) return;
    map.setView(center, Math.max(map.getZoom(), 14), { animate: false });
  }, [center, map]);
  return null;
}

function round(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}
