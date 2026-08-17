import { useEffect, useRef, useState } from 'react';
import Icon from '../Icon';
import { useMapsLoader } from '../../hooks/useMapsLoader';

/* ══════════════════════════════════════════════════════════════════════════
   Where the kitchen actually is.

   A rider is sent to the pin, not to the address text, so the pin is the
   thing this component is really collecting. Three ways to place it — search,
   drag, or the device's own location — and each one fills the address fields
   underneath from what the map knows, leaving the partner to correct rather
   than to type.

   Tiles are OpenStreetMap's; only the search box is Google's, and the whole
   panel still works without it.
   ═══════════════════════════════════════════════════════════════════════ */

const TILES = {
  map: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
};

/* Visakhapatnam — where the company is, and where most first partners are. */
const FALLBACK = [16.932539, 81.752708];

const PIN_HTML = `
  <span class="ob-pin">
    <span class="ob-pin__dot"></span>
    <span class="ob-pin__tip"></span>
  </span>
`;

/* Nominatim's fields, mapped onto the four the form asks for. */
const addressFromOsm = data => {
  const a = data?.address;
  if (!a) return {};
  const area = [a.suburb || a.neighbourhood || a.village || '', a.subdistrict]
    .filter(Boolean).join(', ');

  return {
    ...(area && { area }),
    ...((a.city || a.town || a.county) && { city: a.city || a.town || a.county }),
    ...((a.amenity || a.shop || a.road) && { landmark: a.amenity || a.shop || a.road }),
    ...(a.house_number && { shopNo: a.house_number }),
    ...(data.display_name && { search: data.display_name }),
  };
};

/* Google returns the same information as a flat list of typed components. */
const addressFromPlace = place => {
  const part = type => place.address_components
    ?.find(c => c.types.includes(type))?.long_name || '';

  const locality = part('locality');
  const area = [part('sublocality') || part('sublocality_level_1'), locality]
    .filter(Boolean).join(', ');
  const street = [part('street_number'), part('route')].filter(Boolean).join(' ');

  return {
    ...(area && { area }),
    ...((locality || part('administrative_area_level_2')) && {
      city: locality || part('administrative_area_level_2'),
    }),
    ...(street && { shopNo: street }),
    ...(place.formatted_address && { search: place.formatted_address }),
  };
};

export default function LocationPicker({ lat, lng, search, onSearch, onPlace }) {
  const isLoaded = useMapsLoader(import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '');
  const [view, setView] = useState('map');
  const [locating, setLocating] = useState(false);

  const mapEl = useRef(null);
  const searchEl = useRef(null);
  const map = useRef(null);
  const marker = useRef(null);
  const tiles = useRef(null);

  /* The map is built once and outlives every re-render, so its listeners must
     read the current callbacks rather than the ones that existed at build. */
  const latest = useRef({ onPlace, onSearch });
  latest.current = { onPlace, onSearch };

  const reverseGeocode = async (pointLat, pointLng) => {
    try {
      const res = await fetch(
        'https://nominatim.openstreetmap.org/reverse?format=json'
        + `&lat=${pointLat}&lon=${pointLng}&zoom=18&addressdetails=1`,
      );
      const data = await res.json();
      const patch = addressFromOsm(data);
      if (Object.keys(patch).length) latest.current.onPlace(patch);
    } catch (err) {
      /* The pin is placed either way; only the auto-filled address is lost. */
      console.warn('[LocationPicker] Reverse geocoding failed:', err);
    }
  };

  useEffect(() => {
    if (!isLoaded || !mapEl.current || map.current) return undefined;

    const L = window.L;
    if (!L) return undefined;

    const start = [Number(lat) || FALLBACK[0], Number(lng) || FALLBACK[1]];

    const instance = L.map(mapEl.current, { zoomControl: false, attributionControl: false })
      .setView(start, 15);
    tiles.current = L.tileLayer(TILES[view], { maxZoom: 19 }).addTo(instance);

    const pin = L.marker(start, {
      draggable: true,
      icon: L.divIcon({
        html: PIN_HTML, className: 'ob-pin-wrap', iconSize: [30, 34], iconAnchor: [15, 34],
      }),
    }).addTo(instance);

    const place = ({ lat: pLat, lng: pLng }) => {
      latest.current.onPlace({ lat: pLat.toFixed(6), lng: pLng.toFixed(6) });
      reverseGeocode(pLat, pLng);
    };

    pin.on('dragend', () => place(pin.getLatLng()));
    instance.on('click', e => {
      if (!e.latlng) return;
      pin.setLatLng(e.latlng);
      place(e.latlng);
    });

    map.current = instance;
    marker.current = pin;

    const google = window.google;
    if (google?.maps?.places && searchEl.current) {
      const auto = new google.maps.places.Autocomplete(searchEl.current, {
        types: ['geocode', 'establishment'],
      });
      auto.addListener('place_changed', () => {
        const picked = auto.getPlace();
        const point = picked?.geometry?.location;
        if (!point) return;

        const pLat = point.lat();
        const pLng = point.lng();
        instance.setView([pLat, pLng], 17);
        pin.setLatLng([pLat, pLng]);
        latest.current.onPlace({
          lat: pLat.toFixed(6), lng: pLng.toFixed(6), ...addressFromPlace(picked),
        });
      });
    }

    return () => {
      instance.remove();
      map.current = null;
      marker.current = null;
      tiles.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded]);

  /* Swapping the tile layer, rather than the map, keeps the pin and the zoom
     exactly where the partner left them. */
  useEffect(() => {
    const L = window.L;
    if (!L || !map.current) return;
    if (tiles.current) map.current.removeLayer(tiles.current);
    tiles.current = L.tileLayer(TILES[view], { maxZoom: 19 }).addTo(map.current);
  }, [view]);

  const useMyLocation = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setLocating(false);
        const { latitude, longitude } = pos.coords;
        map.current?.setView([latitude, longitude], 17);
        marker.current?.setLatLng([latitude, longitude]);
        onPlace({ lat: latitude.toFixed(6), lng: longitude.toFixed(6) });
        reverseGeocode(latitude, longitude);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  return (
    <>
      <div className="ob-map">
        <div ref={mapEl} className="ob-map__canvas" />

        <div className="ob-map__ui">
          <div className="ob-map__search">
            <Icon name="search" className="ob-ico" />
            <input
              ref={searchEl} type="text" value={search}
              onChange={e => onSearch(e.target.value)}
              placeholder={isLoaded ? 'Search an area, street or landmark' : 'Loading the map…'}
            />
          </div>

          <div className="ob-map__zoom">
            <button type="button" onClick={() => map.current?.zoomIn()} aria-label="Zoom in">
              <Icon name="plus" className="ob-ico" />
            </button>
            <button type="button" onClick={() => map.current?.zoomOut()} aria-label="Zoom out">
              <Icon name="minus" className="ob-ico" />
            </button>
          </div>

          <button type="button" className="ob-map__locate" onClick={useMyLocation}>
            <Icon name="track" className="ob-ico" />
            {locating ? 'Locating…' : 'Use my location'}
          </button>

          <div className="ob-map__view">
            {['map', 'satellite'].map(mode => (
              <button
                key={mode} type="button"
                className={view === mode ? 'is-on' : undefined}
                onClick={() => setView(mode)}
              >
                {mode === 'map' ? 'Map' : 'Satellite'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="ob-grid ob-grid--2">
        <label className="ob-field">
          <span className="ob-label">GPS latitude</span>
          <input type="text" className="ob-input is-read" value={lat} readOnly placeholder="Drop the pin" />
        </label>
        <label className="ob-field">
          <span className="ob-label">GPS longitude</span>
          <input type="text" className="ob-input is-read" value={lng} readOnly placeholder="Drop the pin" />
        </label>
      </div>
    </>
  );
}
