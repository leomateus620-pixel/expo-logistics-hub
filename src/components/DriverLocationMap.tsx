import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface DriverLocationMapProps {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  speed?: number | null;
  driverName?: string;
  className?: string;
  routePolyline?: [number, number][];
  destLatLng?: [number, number];
  destLabel?: string;
}

export default function DriverLocationMap({ latitude, longitude, accuracy, speed, driverName, className, routePolyline, destLatLng, destLabel }: DriverLocationMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const polylineRef = useRef<L.Polyline | null>(null);
  const destMarkerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    if (!mapRef.current) return;

    if (!mapInstanceRef.current) {
      mapInstanceRef.current = L.map(mapRef.current, {
        zoomControl: false,
        attributionControl: false,
      }).setView([latitude, longitude], 13);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
      }).addTo(mapInstanceRef.current);

      // Driver icon
      const carIcon = L.divIcon({
        html: `<div style="background:hsl(142,50%,35%);width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);font-size:14px;">🚗</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        className: '',
      });

      markerRef.current = L.marker([latitude, longitude], { icon: carIcon })
        .addTo(mapInstanceRef.current);

      if (driverName) {
        markerRef.current.bindTooltip(driverName, { permanent: false, direction: 'top', offset: [0, -16] });
      }

      if (accuracy && accuracy < 500) {
        circleRef.current = L.circle([latitude, longitude], {
          radius: accuracy,
          color: 'hsl(142,50%,35%)',
          fillColor: 'hsl(142,50%,35%)',
          fillOpacity: 0.08,
          weight: 1,
        }).addTo(mapInstanceRef.current);
      }
    } else {
      mapInstanceRef.current.setView([latitude, longitude], mapInstanceRef.current.getZoom());
      markerRef.current?.setLatLng([latitude, longitude]);
      if (circleRef.current && accuracy) {
        circleRef.current.setLatLng([latitude, longitude]);
        circleRef.current.setRadius(accuracy);
      }
    }

    // Route polyline
    if (routePolyline && routePolyline.length > 1 && mapInstanceRef.current) {
      if (polylineRef.current) {
        polylineRef.current.setLatLngs(routePolyline);
      } else {
        polylineRef.current = L.polyline(routePolyline, {
          color: 'hsl(142,50%,35%)',
          weight: 3,
          opacity: 0.6,
          dashArray: '8 6',
        }).addTo(mapInstanceRef.current);
      }
    }

    // Destination marker
    if (destLatLng && mapInstanceRef.current) {
      const destIcon = L.divIcon({
        html: `<div style="background:hsl(0,72%,51%);width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);font-size:12px;">📍</div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
        className: '',
      });
      if (destMarkerRef.current) {
        destMarkerRef.current.setLatLng(destLatLng);
      } else {
        destMarkerRef.current = L.marker(destLatLng, { icon: destIcon })
          .addTo(mapInstanceRef.current);
        if (destLabel) {
          destMarkerRef.current.bindTooltip(destLabel, { permanent: false, direction: 'top', offset: [0, -14] });
        }
      }

      // Fit bounds to include driver + destination
      const bounds = L.latLngBounds([
        [latitude, longitude],
        destLatLng,
      ]);
      mapInstanceRef.current.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
    }
  }, [latitude, longitude, accuracy, driverName, routePolyline, destLatLng, destLabel]);

  // Cleanup
  useEffect(() => {
    return () => {
      mapInstanceRef.current?.remove();
      mapInstanceRef.current = null;
      markerRef.current = null;
      circleRef.current = null;
      polylineRef.current = null;
      destMarkerRef.current = null;
    };
  }, []);

  return (
    <div className={className}>
      <div ref={mapRef} className="w-full h-full rounded-lg" style={{ minHeight: 180 }} />
      {speed != null && speed > 0 && (
        <div className="absolute bottom-2 left-2 bg-background/90 backdrop-blur-sm rounded-md px-2 py-1 text-[10px] font-medium border shadow-sm">
          {Math.round(speed * 3.6)} km/h
        </div>
      )}
    </div>
  );
}
