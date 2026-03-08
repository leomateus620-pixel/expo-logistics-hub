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
}

export default function DriverLocationMap({ latitude, longitude, accuracy, speed, driverName, className }: DriverLocationMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);

  useEffect(() => {
    if (!mapRef.current) return;

    if (!mapInstanceRef.current) {
      mapInstanceRef.current = L.map(mapRef.current, {
        zoomControl: false,
        attributionControl: false,
      }).setView([latitude, longitude], 15);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
      }).addTo(mapInstanceRef.current);

      // Custom car icon
      const carIcon = L.divIcon({
        html: `<div style="background:hsl(142,50%,35%);width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);font-size:16px;">🚗</div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        className: '',
      });

      markerRef.current = L.marker([latitude, longitude], { icon: carIcon })
        .addTo(mapInstanceRef.current);

      if (driverName) {
        markerRef.current.bindTooltip(driverName, { permanent: true, direction: 'top', offset: [0, -20] });
      }

      if (accuracy) {
        circleRef.current = L.circle([latitude, longitude], {
          radius: accuracy,
          color: 'hsl(142,50%,35%)',
          fillColor: 'hsl(142,50%,35%)',
          fillOpacity: 0.1,
          weight: 1,
        }).addTo(mapInstanceRef.current);
      }
    } else {
      // Update existing map
      mapInstanceRef.current.setView([latitude, longitude], mapInstanceRef.current.getZoom());
      markerRef.current?.setLatLng([latitude, longitude]);
      if (circleRef.current && accuracy) {
        circleRef.current.setLatLng([latitude, longitude]);
        circleRef.current.setRadius(accuracy);
      }
    }
  }, [latitude, longitude, accuracy, driverName]);

  // Cleanup
  useEffect(() => {
    return () => {
      mapInstanceRef.current?.remove();
      mapInstanceRef.current = null;
      markerRef.current = null;
      circleRef.current = null;
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
