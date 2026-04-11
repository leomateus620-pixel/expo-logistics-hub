import { useEffect, useRef, memo } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

interface NavigationMap3DProps {
  latitude: number;
  longitude: number;
  heading: number;
  speed?: number | null;
  routePolyline?: [number, number][];
  destLatLng?: [number, number];
  className?: string;
}

function NavigationMap3DInner({
  latitude,
  longitude,
  heading,
  speed,
  routePolyline,
  destLatLng,
  className,
}: NavigationMap3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerEl = useRef<HTMLDivElement | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const destMarkerRef = useRef<maplibregl.Marker | null>(null);
  const animFrameRef = useRef<number>(0);

  // Dynamic zoom based on speed
  const getZoom = (spd: number | null | undefined) => {
    if (!spd || spd <= 0) return 16;
    const kmh = spd * 3.6;
    if (kmh > 100) return 14;
    if (kmh > 60) return 14.5;
    if (kmh > 30) return 15;
    return 16;
  };

  // Initialize map
  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          'osm-tiles': {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenStreetMap',
          },
        },
        layers: [
          {
            id: 'osm-tiles',
            type: 'raster',
            source: 'osm-tiles',
            minzoom: 0,
            maxzoom: 19,
          },
        ],
      },
      center: [longitude, latitude],
      zoom: 16,
      pitch: 60,
      bearing: heading,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: true, showZoom: false }), 'top-right');

    mapRef.current = map;

    // Vehicle marker
    const el = document.createElement('div');
    el.innerHTML = `
      <div style="width:36px;height:36px;display:flex;align-items:center;justify-content:center;">
        <div style="width:32px;height:32px;background:hsl(142,50%,35%);border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid white;box-shadow:0 2px 12px rgba(0,0,0,0.4);font-size:16px;">
          🚗
        </div>
      </div>
    `;
    markerEl.current = el;
    markerRef.current = new maplibregl.Marker({ element: el, anchor: 'center' })
      .setLngLat([longitude, latitude])
      .addTo(map);

    // Destination marker
    if (destLatLng) {
      const destEl = document.createElement('div');
      destEl.innerHTML = `
        <div style="width:28px;height:28px;background:hsl(0,72%,51%);border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);font-size:13px;">📍</div>
      `;
      destMarkerRef.current = new maplibregl.Marker({ element: destEl, anchor: 'center' })
        .setLngLat([destLatLng[1], destLatLng[0]])
        .addTo(map);
    }

    // Add route after style loads
    map.on('load', () => {
      if (routePolyline && routePolyline.length > 1) {
        map.addSource('route', {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: routePolyline.map(([lat, lng]) => [lng, lat]),
            },
          },
        });
        map.addLayer({
          id: 'route-line',
          type: 'line',
          source: 'route',
          paint: {
            'line-color': 'hsl(142, 50%, 35%)',
            'line-width': 5,
            'line-opacity': 0.8,
          },
          layout: {
            'line-cap': 'round',
            'line-join': 'round',
          },
        });
      }
    });

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      destMarkerRef.current = null;
    };
  }, []); // Init once

  // Smooth camera follow
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markerRef.current?.setLngLat([longitude, latitude]);

    // Offset center slightly south so road ahead is visible
    const offsetLat = latitude + 0.001 * Math.cos((heading * Math.PI) / 180);
    const offsetLng = longitude + 0.001 * Math.sin((heading * Math.PI) / 180);

    map.easeTo({
      center: [offsetLng, offsetLat],
      bearing: heading,
      zoom: getZoom(speed),
      pitch: 60,
      duration: 1000,
      easing: (t) => t * (2 - t), // ease-out quad
    });
  }, [latitude, longitude, heading, speed]);

  // Update route polyline
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !routePolyline || routePolyline.length < 2) return;

    const source = map.getSource('route') as maplibregl.GeoJSONSource | undefined;
    if (source) {
      source.setData({
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: routePolyline.map(([lat, lng]) => [lng, lat]),
        },
      });
    }
  }, [routePolyline]);

  // Update dest marker
  useEffect(() => {
    if (destLatLng && destMarkerRef.current) {
      destMarkerRef.current.setLngLat([destLatLng[1], destLatLng[0]]);
    }
  }, [destLatLng]);

  return <div ref={containerRef} className={className} style={{ minHeight: 200 }} />;
}

export default memo(NavigationMap3DInner);
