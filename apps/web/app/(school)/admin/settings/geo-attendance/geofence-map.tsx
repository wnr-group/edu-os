"use client";

import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Circle, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { destinationPoint, haversineMeters } from "@/lib/geo-attendance";

const CENTER_ICON = L.divIcon({
  className: "",
  html: `<svg width="30" height="30" viewBox="0 0 24 24" fill="#4F46E5" stroke="#fff" stroke-width="1.4"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3" fill="#fff" stroke="none"/></svg>`,
  iconSize: [30, 30],
  iconAnchor: [15, 28],
});

const HANDLE_ICON = L.divIcon({
  className: "",
  html: `<div style="width:14px;height:14px;border-radius:50%;background:#fff;border:2.5px solid #4F46E5;box-shadow:0 2px 6px rgba(29,78,216,.3)"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

interface GeofenceMapProps {
  centerLat: number;
  centerLng: number;
  radiusM: number;
  onCenterChange: (lat: number, lng: number) => void;
  onRadiusChange: (radiusM: number) => void;
  dropPinArmed: boolean;
  onPinDropped: () => void;
  flyToRequest?: { lat: number; lng: number } | null;
}

function ClickToDropPin({ armed, onCenterChange, onPinDropped }: { armed: boolean; onCenterChange: (lat: number, lng: number) => void; onPinDropped: () => void }) {
  useMapEvents({
    click(e) {
      if (!armed) return;
      onCenterChange(e.latlng.lat, e.latlng.lng);
      onPinDropped();
    },
  });
  return null;
}

function FlyToOnSelect({ request }: { request: { lat: number; lng: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (!request) return;
    map.flyTo([request.lat, request.lng], map.getZoom(), { animate: true, duration: 1 });
  }, [request, map]);
  return null;
}

export default function GeofenceMap({ centerLat, centerLng, radiusM, onCenterChange, onRadiusChange, dropPinArmed, onPinDropped, flyToRequest }: GeofenceMapProps) {
  const [dragging, setDragging] = useState(false);
  const handlePos = useMemo(() => destinationPoint(centerLat, centerLng, radiusM, 90), [centerLat, centerLng, radiusM]);

  return (
    <MapContainer center={[centerLat, centerLng]} zoom={16} style={{ height: 340, width: "100%", cursor: dropPinArmed ? "crosshair" : undefined }}>
      <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <ClickToDropPin armed={dropPinArmed} onCenterChange={onCenterChange} onPinDropped={onPinDropped} />
      <FlyToOnSelect request={flyToRequest ?? null} />
      <Circle center={[centerLat, centerLng]} radius={radiusM} pathOptions={{ color: "#4F46E5", weight: 2, dashArray: "6 6", fillColor: "#4F46E5", fillOpacity: 0.12 }} />
      <Marker
        position={[centerLat, centerLng]}
        icon={CENTER_ICON}
        draggable
        eventHandlers={{
          dragend: (e) => {
            const pos = e.target.getLatLng();
            onCenterChange(pos.lat, pos.lng);
          },
        }}
      />
      <Marker
        position={[handlePos.lat, handlePos.lng]}
        icon={HANDLE_ICON}
        draggable
        eventHandlers={{
          drag: () => setDragging(true),
          dragend: (e) => {
            setDragging(false);
            const pos = e.target.getLatLng();
            const newRadius = Math.round(haversineMeters(centerLat, centerLng, pos.lat, pos.lng));
            onRadiusChange(Math.max(20, newRadius));
          },
        }}
      />
      {dragging && null}
    </MapContainer>
  );
}
