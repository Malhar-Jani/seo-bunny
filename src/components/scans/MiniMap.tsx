'use client';
import { MapPin } from 'lucide-react';
// Load tiles only when someone opens the full map, rather than for every table row.
export function MiniMap({ lat, lng, rank, onEnlarge }: { lat: number; lng: number; rank?: number | null; onEnlarge: (lat: number, lng: number, rank: number | null | undefined) => void }) {
    return <button type="button" className="coordinate-preview" aria-label={`View map at ${lat.toFixed(4)}, ${lng.toFixed(4)}`} onClick={e => { e.stopPropagation(); onEnlarge(lat,lng,rank); }}><MapPin size={17}/><span>View map</span></button>;
}
