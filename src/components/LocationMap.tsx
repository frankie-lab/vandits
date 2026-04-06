import React, { useEffect, useRef, useCallback, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import 'leaflet.markercluster';
import 'leaflet.heat';
import { useLocationsStore } from '@/store/locations-store';
import { GeoLocation } from '@/types/location';
import { motion } from 'framer-motion';
import { Maximize2, MapPin, Flame, CircleDot, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { MapThemeToggle, MapTheme, MAP_TILE_LAYERS } from './MapThemeToggle';
import { MapScaleBar } from './MapScaleBar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useMapCenterConfig, MapCenterConfig } from './MapCenterSettings';
import { toast } from 'sonner';
import { playEnrichmentComplete } from '@/lib/sounds';
import { usePermissions } from '@/hooks/use-permissions';
import { supabase } from '@/integrations/supabase/client';
import { getLucideSvgString, getMapMarkerHtml, getStopTypeIconKey } from '@/lib/icon-utils';

// Extend L namespace for heat layer
declare module 'leaflet' {
 function heatLayer(latlngs: Array<[number, number, number?]>, options?: {
 minOpacity?: number;
 maxZoom?: number;
 max?: number;
 radius?: number;
 blur?: number;
 gradient?: { [key: number]: string };
 }): L.Layer;
}

type ViewMode = 'heatmap' | 'markers';

// Fix for default marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
 iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
 iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
 shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Escala cromática según estado de enriquecimiento/criterio
// Verde = Estado final (cumple criterios actuales) - NO requiere actualización
// Azul = Pendiente de nuevo criterio (enriquecido pero criterios han cambiado)
// Gris = Importado (tiene descripción original pero sin ficha IA)
// Naranja = Vacío/Duplicado (sin ficha IA ni descripción)
type CriteriaStatus = 'current' | 'previous' | 'unknown' | 'new';

// Timestamp de criterios para determinar "verde" vs "azul"
const CRITERIA_STORAGE_KEY = 'geodata-enrichment-criteria';

function loadCriteriaTimestamp(): number {
 try {
 const stored = localStorage.getItem(CRITERIA_STORAGE_KEY);
 if (stored) {
 const parsed = JSON.parse(stored);
 return parsed._updatedAt || 0;
 }
 } catch (e) {}
 return 0;
}

// Determina si la ficha cumple el criterio actual (basado en fecha de actualización)
function meetsEnrichmentCriteria(location: GeoLocation, criteriaTimestamp: number): boolean {
 if (!location.enrichedData?.descripcion) return false;
 
  // Si no hay timestamp guardado, todas las fichas con enrichedData son "current"
 if (criteriaTimestamp === 0) return true;
 
  // Comparar fecha de actualización de la location con fecha de criterios
 const locationUpdatedAt = location.updatedAt instanceof Date 
 ? location.updatedAt.getTime() 
 : new Date(location.updatedAt).getTime();
 
 return locationUpdatedAt >= criteriaTimestamp;
}

const getCriteriaColor = (
 location: GeoLocation,
 criteriaTimestamp: number
): { color: string; gradient: string; status: CriteriaStatus } => {
  // 1. Verde - Estado final (cumple todos los criterios actuales)
 if (location.enrichedData?.descripcion) {
 if (meetsEnrichmentCriteria(location, criteriaTimestamp)) {
 return {
 color: 'hsl(142, 76%, 36%)',
 gradient: 'linear-gradient(135deg, hsl(142, 76%, 42%), hsl(142, 71%, 32%))',
 status: 'current',
 };
 }

    // 2. Azul - Pendiente de nuevo criterio (enriquecido pero no cumple)
 return {
 color: 'hsl(217, 91%, 60%)',
 gradient: 'linear-gradient(135deg, hsl(217, 91%, 65%), hsl(217, 91%, 50%))',
 status: 'previous',
 };
 }

  // 3. Gris - Importado (tiene descripción original pero sin ficha IA)
 if (location.description && location.description.trim().length > 0) {
 return {
 color: 'hsl(220, 9%, 46%)',
 gradient: 'linear-gradient(135deg, hsl(220, 9%, 56%), hsl(220, 9%, 40%))',
 status: 'unknown',
 };
 }

  // 4. Naranja - Vacío (sin ficha IA ni descripción)
 return {
 color: 'hsl(24, 95%, 53%)',
 gradient: 'linear-gradient(135deg, hsl(24, 95%, 58%), hsl(24, 95%, 45%))',
 status: 'new',
 };
};

// Inline function to calculate visit relevance grade
// Avoids circular imports and keeps popup generation self-contained
interface VisitRelevanceInfo {
 grade: 'oro' | 'plata' | 'bronce' | 'reciente';
 label: string;
 color: string;
 bgColor: string;
 borderColor: string;
 daysAgo: number;
 verificationType: 'checkin' | 'photo';
}

function calculateVisitRelevanceInline(
 visitedVerifiedAt?: string,
 oldestPhotoDate?: string
): VisitRelevanceInfo | null {
 if (!visitedVerifiedAt && !oldestPhotoDate) return null;

 const checkinDate = visitedVerifiedAt ? new Date(visitedVerifiedAt) : null;
 const photoDate = oldestPhotoDate ? new Date(oldestPhotoDate) : null;

 let verificationDate: Date;
 let verificationType: 'checkin' | 'photo';

 if (checkinDate && photoDate) {
 if (checkinDate <= photoDate) {
 verificationDate = checkinDate;
 verificationType = 'checkin';
 } else {
 verificationDate = photoDate;
 verificationType = 'photo';
 }
 } else if (checkinDate) {
 verificationDate = checkinDate;
 verificationType = 'checkin';
 } else if (photoDate) {
 verificationDate = photoDate;
 verificationType = 'photo';
 } else {
 return null;
 }

 const now = new Date();
 const diffMs = now.getTime() - verificationDate.getTime();
 const daysAgo = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  // Classification by age
 if (daysAgo >= 1095) {
    // > 3 years = Gold
 return {
 grade: 'oro',
 label: 'Veterano',
 color: '#b45309',
 bgColor: 'linear-gradient(135deg, #fef3c7, #fcd34d)',
 borderColor: '#f59e0b',
 daysAgo,
 verificationType,
 };
 } else if (daysAgo >= 365) {
    // 1-3 years = Silver
 return {
 grade: 'plata',
 label: 'Consolidado',
 color: '#475569',
 bgColor: 'linear-gradient(135deg, #f1f5f9, #cbd5e1)',
 borderColor: '#94a3b8',
 daysAgo,
 verificationType,
 };
 } else if (daysAgo >= 90) {
    // 3 months - 1 year = Bronze
 return {
 grade: 'bronce',
 label: 'Confirmado',
 color: '#9a3412',
 bgColor: 'linear-gradient(135deg, #fed7aa, #fdba74)',
 borderColor: '#fb923c',
 daysAgo,
 verificationType,
 };
 } else {
    // < 3 months = Recent
 return {
 grade: 'reciente',
 label: '🆕 Reciente',
 color: '#166534',
 bgColor: 'linear-gradient(135deg, #dcfce7, #bbf7d0)',
 borderColor: '#86efac',
 daysAgo,
 verificationType,
 };
 }
}

function formatTimeAgoInline(daysAgo: number): string {
 if (daysAgo >= 365) {
 const years = Math.floor(daysAgo / 365);
 return `hace ${years} año${years > 1 ? 's' : ''}`;
 } else if (daysAgo >= 30) {
 const months = Math.floor(daysAgo / 30);
 return `hace ${months} mes${months > 1 ? 'es' : ''}`;
 } else if (daysAgo >= 7) {
 const weeks = Math.floor(daysAgo / 7);
 return `hace ${weeks} semana${weeks > 1 ? 's' : ''}`;
 } else if (daysAgo > 0) {
 return `hace ${daysAgo} día${daysAgo > 1 ? 's' : ''}`;
 } else {
 return 'hoy';
 }
}

// Helper to calculate distance in meters between two coordinates
function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
 const R = 6371000; // Earth radius in meters
 const dLat = (lat2 - lat1) * Math.PI / 180;
 const dLng = (lng2 - lng1) * Math.PI / 180;
 const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
 Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
 Math.sin(dLng/2) * Math.sin(dLng/2);
 const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
 return R * c;
}

function toLeafletLatLng(coord: L.LatLngExpression): L.LatLng {
 if (Array.isArray(coord)) {
 return L.latLng(coord[0], coord[1]);
 }

 return L.latLng((coord as L.LatLng).lat, (coord as L.LatLng).lng);
}

function createFlightArcCoords(map: L.Map, coords: L.LatLngExpression[]): L.LatLngExpression[] {
 if (coords.length < 2) return coords;

 const start = toLeafletLatLng(coords[0]);
 const end = toLeafletLatLng(coords[coords.length - 1]);
 const startPoint = map.project(start);
 const endPoint = map.project(end);
 const dx = endPoint.x - startPoint.x;
 const dy = endPoint.y - startPoint.y;
 const distancePx = Math.hypot(dx, dy);

 if (!Number.isFinite(distancePx) || distancePx < 24) {
 return [start, end];
 }

 let perpX = -dy / distancePx;
 let perpY = dx / distancePx;

 if (perpY > 0) {
 perpX *= -1;
 perpY *= -1;
 }

 const arcHeight = Math.min(140, Math.max(36, distancePx * 0.22));
 const controlPoint = L.point(
 (startPoint.x + endPoint.x) / 2 + perpX * arcHeight,
 (startPoint.y + endPoint.y) / 2 + perpY * arcHeight,
 );

 const steps = Math.min(48, Math.max(24, Math.round(distancePx / 18)));
 const arcCoords: L.LatLngExpression[] = [];

 for (let i = 0; i <= steps; i++) {
 const t = i / steps;
 const oneMinusT = 1 - t;
 const x = oneMinusT * oneMinusT * startPoint.x + 2 * oneMinusT * t * controlPoint.x + t * t * endPoint.x;
 const y = oneMinusT * oneMinusT * startPoint.y + 2 * oneMinusT * t * controlPoint.y + t * t * endPoint.y;
 const point = map.unproject(L.point(x, y));
 arcCoords.push([point.lat, point.lng]);
 }

 return arcCoords;
}

function calculateSegmentBearing(from: L.LatLngExpression, to: L.LatLngExpression): number {
 const start = toLeafletLatLng(from);
 const end = toLeafletLatLng(to);
 const dLng = (end.lng - start.lng) * Math.PI / 180;
 const y = Math.sin(dLng) * Math.cos(end.lat * Math.PI / 180);
 const x = Math.cos(start.lat * Math.PI / 180) * Math.sin(end.lat * Math.PI / 180) -
   Math.sin(start.lat * Math.PI / 180) * Math.cos(end.lat * Math.PI / 180) * Math.cos(dLng);

 return Math.atan2(y, x) * 180 / Math.PI;
}

// Load community reviews for a curator location
async function loadCommunityReviews(locationId: string, curatorId: string) {
 const container = document.querySelector(`.community-reviews-container[data-location-id="${locationId}"]`) as HTMLElement;
 const formContainer = document.querySelector(`.community-form-container[data-location-id="${locationId}"]`) as HTMLElement;
 const warningContainer = document.querySelector(`.community-distance-warning[data-location-id="${locationId}"]`) as HTMLElement;
 
 if (!container) return;
 
 try {
    // Get current user
 const { data: { user } } = await supabase.auth.getUser();
 
    // Get curator's validation radius
 let validationRadius = 500; // default
 if (curatorId) {
 const { data: curator } = await supabase
 .from('curators')
 .select('validation_radius_meters')
 .eq('id', curatorId)
 .single();
 if (curator?.validation_radius_meters) {
 validationRadius = curator.validation_radius_meters;
 }
 }
 
    // Get location coordinates
 const { data: location } = await supabase
 .from('locations')
 .select('latitude, longitude')
 .eq('id', locationId)
 .single();
 
    // Fetch reviews
 const { data: reviews, error } = await supabase
 .from('curator_location_reviews')
 .select('*')
 .eq('location_id', locationId)
 .order('created_at', { ascending: false });
 
 if (error) throw error;
 
    // Fetch profiles for reviewers
 const userIds = [...new Set((reviews || []).map(r => r.user_id))];
 const { data: profiles } = userIds.length > 0 
 ? await supabase.from('profiles').select('id, display_name, avatar_url').in('id', userIds)
 : { data: [] };
 
 const profilesMap = new Map((profiles || []).map(p => [p.id, p]));
 
    // Calculate average community rating
 const ratings = (reviews || []).filter(r => r.rating).map(r => r.rating as number);
 const avgRating = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;
 
    // Build reviews HTML
 let reviewsHtml = '';
 
 if (ratings.length > 0) {
 reviewsHtml += `
 <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px; padding: 8px; background: #fffbeb; border-radius: 8px;">
 <div style="display: flex; align-items: center; gap: 2px;">
 ${[1,2,3,4,5].map(star => `<span style="font-size: 14px; color: ${star <= Math.round(avgRating) ? '#f59e0b' : '#d1d5db'};">${star <= Math.round(avgRating) ? '' : ''}</span>`).join('')}
 </div>
 <span style="font-size: 11px; color: #92400e; font-weight: 500;">${avgRating.toFixed(1)} (${ratings.length} valoración${ratings.length !== 1 ? 'es' : ''})</span>
 </div>
 `;
 }
 
 if (reviews && reviews.length > 0) {
 reviewsHtml += `<div style="max-height: 150px; overflow-y: auto;">`;
 for (const review of reviews.slice(0, 5)) {
 const profile = profilesMap.get(review.user_id);
 const userName = profile?.display_name || 'Usuario';
 const userAvatar = profile?.avatar_url;
 const date = new Date(review.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
 
 reviewsHtml += `
 <div style="padding: 8px; background: #f9fafb; border-radius: 6px; margin-bottom: 6px; font-size: 11px;">
 <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
 ${userAvatar 
 ? `<img src="${userAvatar}" style="width: 20px; height: 20px; border-radius: 50%; object-fit: cover;" />`
 : `<div style="width: 20px; height: 20px; border-radius: 50%; background: #e5e7eb; display: flex; align-items: center; justify-content: center; font-size: 10px;"></div>`
 }
 <span style="font-weight: 500; color: #374151;">${userName}</span>
 <span style="color: #9ca3af; font-size: 10px;">${date}</span>
 ${review.rating ? `<span style="margin-left: auto; color: #f59e0b;">${''.repeat(review.rating)}${''.repeat(5-review.rating)}</span>` : ''}
 </div>
 ${review.comment ? `<p style="margin: 0; color: #6b7280; line-height: 1.4;">${review.comment}</p>` : ''}
 </div>
 `;
 }
 reviewsHtml += `</div>`;
 
 if (reviews.length > 5) {
 reviewsHtml += `<p style="margin: 4px 0 0 0; font-size: 10px; color: #9ca3af; text-align: center;">+${reviews.length - 5} más</p>`;
 }
 } else {
 reviewsHtml = `<p style="text-align: center; font-size: 11px; color: #9ca3af; padding: 10px 0;">Aún no hay valoraciones de la comunidad</p>`;
 }
 
 container.innerHTML = reviewsHtml;
 
    // Update the weighted rating in the popup header
 const weightedContainer = document.querySelector(`.weighted-rating-container[data-location-id="${locationId}"]`) as HTMLElement;
 if (weightedContainer) {
 const aiRating = parseFloat(weightedContainer.dataset.aiRating || '0');
 const communityRating = avgRating;
 
      // Calculate weighted rating: 50% AI + 50% Community
      // If no community ratings, show only AI rating
 let weightedRating: number;
 let breakdownText: string;
 
 if (ratings.length > 0) {
 weightedRating = (aiRating * 0.5) + (communityRating * 0.5);
 breakdownText = `(IA: ${aiRating.toFixed(1)} | Com: ${communityRating.toFixed(1)})`;
 } else {
 weightedRating = aiRating;
 breakdownText = `(Solo IA: ${aiRating.toFixed(1)})`;
 }
 
      // Update stars
 const starsContainer = weightedContainer.querySelector('.weighted-rating-stars');
 if (starsContainer) {
 starsContainer.innerHTML = [1,2,3,4,5].map(star => 
 `<span style="font-size: 14px; line-height: 1; color: ${star <= Math.round(weightedRating) ? '#16a34a' : '#d1d5db'};">${star <= Math.round(weightedRating) ? '' : ''}</span>`
 ).join('');
 }
 
      // Update value
 const valueEl = weightedContainer.querySelector('.weighted-rating-value') as HTMLElement;
 if (valueEl) {
 valueEl.textContent = weightedRating > 0 ? weightedRating.toFixed(1) : '-';
 }
 
      // Update breakdown
 const breakdownEl = weightedContainer.querySelector('.weighted-rating-breakdown') as HTMLElement;
 if (breakdownEl) {
 breakdownEl.textContent = breakdownText;
 breakdownEl.style.display = 'inline';
 }
 
      // Update title
 weightedContainer.title = `Rating ponderado: ${weightedRating.toFixed(1)} ${breakdownText}`;
 }
 
    // Check if user can leave a review (is logged in and is within distance)
 if (!user) {
 if (warningContainer) {
 warningContainer.innerHTML = `
 <div style="background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px; font-size: 10px; color: #6b7280; text-align: center;">
 <p style="margin: 0;">Inicia sesión para validar este lugar</p>
 </div>
 `;
 warningContainer.style.display = 'block';
 }
 return;
 }
 
    // Check if user already reviewed
 const existingReview = reviews?.find(r => r.user_id === user.id);
 if (existingReview) {
 if (warningContainer) {
 warningContainer.innerHTML = `
 <div style="background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 10px; font-size: 10px; color: #166534; text-align: center;">
 <p style="margin: 0;"> Ya has validado este lugar</p>
 </div>
 `;
 warningContainer.style.display = 'block';
 }
 return;
 }
 
    // Check distance using browser geolocation
 if (location && navigator.geolocation) {
 navigator.geolocation.getCurrentPosition(
 (position) => {
 const distance = calculateDistance(
 position.coords.latitude,
 position.coords.longitude,
 location.latitude,
 location.longitude
 );
 
 if (distance <= validationRadius) {
            // Show form
 if (formContainer) formContainer.style.display = 'block';
 if (warningContainer) warningContainer.style.display = 'none';
 } else {
            // Show distance warning
 if (formContainer) formContainer.style.display = 'none';
 if (warningContainer) {
 const distanceText = warningContainer.querySelector('.distance-text') as HTMLElement;
 const requiredDistanceEl = warningContainer.querySelector('.required-distance') as HTMLElement;
 if (distanceText) {
 distanceText.innerHTML = `Estás a ${Math.round(distance)}m. Debes acercarte a menos de ${validationRadius}m.`;
 }
 if (requiredDistanceEl) {
 requiredDistanceEl.textContent = String(validationRadius);
 }
 warningContainer.style.display = 'block';
 }
 }
 },
 () => {
          // Geolocation error - show warning
 if (warningContainer) {
 warningContainer.innerHTML = `
 <div style="background: #fef3c7; border: 1px solid #fcd34d; border-radius: 8px; padding: 10px; font-size: 10px; color: #92400e;">
 <p style="margin: 0;">Activa la geolocalización para validar este lugar</p>
 </div>
 `;
 warningContainer.style.display = 'block';
 }
 },
 { enableHighAccuracy: true, timeout: 5000 }
 );
 }
 } catch (err) {
 console.error('Error loading community reviews:', err);
 container.innerHTML = `<p style="color: #dc2626; font-size: 11px; text-align: center;">Error al cargar valoraciones</p>`;
 }
}

// Submit a community review
async function submitCommunityReview(locationId: string) {
 const ratingContainer = document.querySelector(`.community-rating-input[data-location-id="${locationId}"]`) as HTMLElement;
 const commentInput = document.querySelector(`.community-comment-input[data-location-id="${locationId}"]`) as HTMLTextAreaElement;
 const submitBtn = document.querySelector(`[data-action="submit-community-review"][data-location-id="${locationId}"]`) as HTMLButtonElement;
 
 const rating = parseInt(ratingContainer?.dataset.selectedRating || '0');
 const comment = commentInput?.value?.trim() || '';
 
 if (rating === 0) {
 toast.error('Selecciona una valoración');
 return;
 }
 
 try {
 const { data: { user } } = await supabase.auth.getUser();
 if (!user) {
 toast.error('Debes iniciar sesión');
 return;
 }
 
    // Disable button
 if (submitBtn) {
 submitBtn.disabled = true;
 submitBtn.innerHTML = `
 <svg class="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
 <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
 </svg>
 Enviando...
 `;
 }
 
 const { error } = await supabase
 .from('curator_location_reviews')
 .insert({
 location_id: locationId,
 user_id: user.id,
 rating,
 comment: comment || null,
 confirmed_exists: true
 });
 
 if (error) throw error;
 
 toast.success('¡Gracias por tu valoración!');
 
    // Reload reviews
 const curatorId = document.querySelector(`.community-content[data-location-id="${locationId}"]`)?.getAttribute('data-curator-id') || '';
 await loadCommunityReviews(locationId, curatorId);
 
 } catch (err) {
 console.error('Error submitting review:', err);
 toast.error('Error al enviar valoración');
 
    // Re-enable button
 if (submitBtn) {
 submitBtn.disabled = false;
 submitBtn.innerHTML = `
 <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
 <path d="M20 6 9 17l-5-5"/>
 </svg>
 Confirmar y enviar
 `;
 }
 }
}

// Lucide icon SVG paths for curator markers (24x24 viewBox)
const CURATOR_ICON_PATHS: Record<string, string> = {
 'map-pin': 'M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
 'target': 'M22 12h-4 M6 12H2 M12 6V2 M12 22v-4 M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12Z M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
 'compass': 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10Z M16.24 7.76l-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12Z',
 'star': 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2Z',
 'flag': 'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z M4 22v-7',
 'heart': 'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z',
 'mountain': 'M8 3l4 8 5-5 5 15H2L8 3Z',
 'trees': 'M10 10v.2A3 3 0 0 1 8.9 16v0H5v0h0a3 3 0 0 1-1-5.8V10a3 3 0 0 1 6 0Z M7 16v6 M13.9 7.6A5.5 5.5 0 0 1 19 13v0a3 3 0 0 1-3 3h0 M14 16v6',
 'waves': 'M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1 M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1 M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1',
 'sun': 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z M12 2v2 M12 20v2 M4.93 4.93l1.41 1.41 M17.66 17.66l1.41 1.41 M2 12h2 M20 12h2 M6.34 17.66l-1.41 1.41 M19.07 4.93l-1.41 1.41',
 'leaf': 'M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12',
 'flower': 'M12 7.5a4.5 4.5 0 1 1 4.5 4.5M12 7.5A4.5 4.5 0 1 0 7.5 12M12 7.5V9m-4.5 3a4.5 4.5 0 1 0 4.5 4.5M7.5 12H9m7.5 0a4.5 4.5 0 1 1-4.5 4.5m4.5-4.5H15m-3 4.5V15 M12 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
 'shell': 'M14.34 9.59a8 8 0 0 0-5.66-2.32c-1.02 0-1.99.19-2.89.54A6.93 6.93 0 0 0 2 14c0 3.87 3.13 7 7 7a7 7 0 0 0 6.93-6.05c.4-.9.64-1.87.64-2.95a8 8 0 0 0-2.32-5.66L14.5 6.5',
 'bird': 'M16 7h.01 M3.4 18H12a8 8 0 0 0 8-8V7a4 4 0 0 0-7.28-2.3L2 20 M20 7l2 5-2 2',
 'building': 'M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2 M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2 M10 6h4 M10 10h4 M10 14h4 M10 18h4',
 'landmark': 'M3 22h18 M6 18v-7 M10 18v-7 M14 18v-7 M18 18v-7 M12 2l8 6H4l8-6Z',
 'church': 'M10 9h4 M12 7v5 M14 22v-4a2 2 0 0 0-4 0v4 M18 22V5.618a1 1 0 0 0-.553-.894l-4.553-2.277a2 2 0 0 0-1.788 0L6.553 4.724A1 1 0 0 0 6 5.618V22 M18 22H6 M6 12H2v8h4 M22 12h-4v8h4',
 'castle': 'M22 20v-9H2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2Z M18 11V4H6v7 M15 22v-4a3 3 0 0 0-6 0v4 M22 11V9 M2 11V9 M6 4V2 M10 4V2 M14 4V2 M18 4V2',
 'home': 'M9 22V12h6v10 M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
 'anchor': 'M12 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M12 8v14 M5 12H2a10 10 0 0 0 20 0h-3',
 'camera': 'M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
 'palette': 'M12 22C6.5 22 2 17.5 2 12S6.5 2 12 2s10 4.5 10 10c0 .926-.126 1.822-.361 2.672A3.5 3.5 0 0 1 18.5 18H17a4 4 0 0 0-4 4v0h-1Z M12 8a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1Z M17 12a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1Z M8 10a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1Z M9 15a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1Z',
 'music': 'M9 18V5l12-2v13 M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z M21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
 'book': 'M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20 M9 10h6',
 'gem': 'M6 3h12l4 6-10 13L2 9Z M11 3l1 10 M6 3l6 10 6-10 M2 9h20',
 'crown': 'M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.735H5.81a1 1 0 0 1-.957-.735L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294Z M5 21h14',
 'utensils': 'M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2 M7 2v20 M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7',
 'wine': 'M8 22h8 M12 22v-7 M12 15a7 7 0 0 0 7-7c0-2-1-4-3-5H8c-2 1-3 3-3 5a7 7 0 0 0 7 7Z',
 'coffee': 'M17 8h1a4 4 0 0 1 0 8h-1 M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8Z M6 2v4 M10 2v4 M14 2v4',
 'fish': 'M6.5 12c.94-3.46 4.94-6 8.5-6 3.56 0 6.06 2.54 7 6-.94 3.47-3.44 6-7 6-3.56 0-7.56-2.53-8.5-6Z M2.5 12H6.5 M12 12a2 2 0 1 0 4 0 2 2 0 0 0-4 0Z',
 'car': 'M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2 M7 17a2 2 0 1 0 4 0 2 2 0 0 0-4 0Z M15 17a2 2 0 1 0 4 0 2 2 0 0 0-4 0Z',
 'fuel': 'M3 22V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v17 M13 10h1a2 2 0 0 1 2 2v2q0 2 2 2c1.5 0 2-.5 2-2V8l-2-2 M3 22h12 M7 10h4 M7 6h4',
 'plane': 'M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2Z',
 'ship': 'M2 21c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1 M19.38 20A11.6 11.6 0 0 0 21 14l-9-4-9 4c0 2.9.94 5.34 2.81 7.76 M19 13V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6 M12 10v4 M12 2v3',
 'train': 'M4 11V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v5 M4 21a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2 M9 21v-4 M15 21v-4 M4 8h16 M4 12h16 M8 17h.01 M16 17h.01',
 'footprints': 'M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z M16 17h4 M4 13h4',
 'tent': 'M3.5 21L14 3 M20.5 21 14 3 M14 21V3 M3.5 21h17 M4 14l10 0',
 'bike': 'M5 19a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z M19 19a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z M12 19l-3-9 3 0 4-5 M17 6l-4 5h3l3 9',
 'sparkles': 'M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z M20 3v4 M22 5h-4 M4 17v2 M5 18H3',
 'hotel': 'M10 22v-6.57 M2 10l10-7 10 7 M6 22V7 M18 22V7 M10 15h4 M18 15h2a2 2 0 0 1 2 2v3 M2 15h2',
 'hospital': 'M12 6v4 M14 8h-4 M6 20v2 M18 20v2 M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-2.5a.5.5 0 0 1-.4-.2l-1.9-2.5a1 1 0 0 0-.8-.4H9.6a1 1 0 0 0-.8.4L6.9 5.8a.5.5 0 0 1-.4.2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2Z',
 'store': 'M2 7l1.41-4.6A2 2 0 0 1 5.32 1h13.36a2 2 0 0 1 1.91 1.4L22 7 M4 7v13a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7 M2 7h20 M22 7a5 5 0 0 1-5 5 5 5 0 0 1-5-5 5 5 0 0 1-5 5 5 5 0 0 1-5-5 M12 22v-9',
 'info': 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10Z M12 16v-4 M12 8h.01',
 'wifi': 'M12 20h.01 M5 12.859a10 10 0 0 1 14 0 M8.5 16.429a5 5 0 0 1 7 0',
 'plug': 'M12 22v-5 M9 8V2 M15 8V2 M18 8v5a6 6 0 0 1-12 0V8Z',
  // Custom campervan/RV icon for camping areas
 'campervan': 'M2 17h20 M2 12h3l2-4h10l2 4h3 M5 12v5 M19 12v5 M7 8V6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2 M14 8v-1a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1 M6 17a2 2 0 1 0 4 0 M14 17a2 2 0 1 0 4 0 M9 20c.5.5 1.2 1 2.5 1s2.5-1 3-1.5',
};

// Generate a consistent hue from userId for unique user colors
function getUserHue(userId?: string): number {
 if (!userId) return 217; // Default blue
 let hash = 0;
 for (let i = 0; i < userId.length; i++) {
 hash = userId.charCodeAt(i) + ((hash << 5) - hash);
 }
  // Generate hue in range avoiding green (owned) and red (empty)
  // Use ranges: 180-280 (cyan-blue-purple) and 300-360 (magenta-pink)
 const normalizedHash = Math.abs(hash) % 160;
 return normalizedHash < 100 ? 180 + normalizedHash : 200 + normalizedHash;
}

// Extract initials from owner name
function getOwnerInitials(ownerName?: string): string {
 if (!ownerName) return '?';
 const parts = ownerName.trim().split(/\s+/);
 if (parts.length >= 2) {
 return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
 }
 return ownerName.slice(0, 2).toUpperCase();
}

const createCustomIcon = (
 isSelected: boolean,
 isFocused: boolean,
 isEnriched: boolean = false,
 location?: GeoLocation,
 criteriaTimestamp: number = 0,
 isRecentlyEnriched: boolean = false,
 isOwn: boolean = true,
 ownerInfo?: { ownerName?: string; ownerId?: string; curatorId?: string; curatorIcon?: string; curatorColor?: string }
) => {
  // Pin sizes - larger when focused/selected/recently enriched
 const pinHeight = isRecentlyEnriched ? 44 : isFocused ? 40 : isSelected ? 36 : 28;
 const pinWidth = pinHeight * 0.7;
 const dotSize = pinHeight * 0.25;

  // Get color based on criteria status
 const criteriaStatus = location
 ? getCriteriaColor(location, criteriaTimestamp)
 : {
 color: 'hsl(0, 72%, 51%)',
 gradient: 'linear-gradient(135deg, hsl(0, 72%, 56%), hsl(0, 84%, 45%))',
 status: 'new' as CriteriaStatus,
 };

  // Adjust brightness for selection/focus
 let gradient = criteriaStatus.gradient;
 if (isFocused) {
 gradient = criteriaStatus.gradient.replace('42%', '52%').replace('36%', '46%').replace('56%', '66%').replace('65%', '75%');
 } else if (isSelected) {
 gradient = criteriaStatus.gradient.replace('42%', '48%').replace('36%', '40%').replace('56%', '62%').replace('65%', '70%');
 }
 
  // Glow effect colors by status
 const glowColors: Record<CriteriaStatus, string> = {
 current: 'rgba(34, 197, 94, 0.5)',
 previous: 'rgba(59, 130, 246, 0.5)',
 unknown: 'rgba(107, 114, 128, 0.4)',
 new: 'rgba(239, 68, 68, 0.4)',
 };
 const glowColor = glowColors[criteriaStatus.status];
 
  // Animation style for recently enriched or focused
 const animationStyle = isRecentlyEnriched 
 ? 'animation: enriched-celebrate 3.5s ease-out;'
 : isFocused 
 ? 'animation: pulse 1s ease-in-out infinite;' 
 : '';
 
  // Shadow based on state
 const shadow = isFocused || isSelected || isRecentlyEnriched 
 ? `drop-shadow(0 3px 6px rgba(0,0,0,0.4)) drop-shadow(0 0 ${isRecentlyEnriched ? '10px' : '6px'} ${glowColor})`
 : 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))';

  // For curator locations
 if (ownerInfo?.curatorId) {
    // Check if location is enriched
 const locationIsEnriched = isEnriched || location?.enrichedData?.descripcion;
 
    // NON-ENRICHED curator points: always show simple gray map-pin
 if (!locationIsEnriched) {
 const grayColor = '#94a3b8'; // Tailwind slate-400
 const iconPath = CURATOR_ICON_PATHS['map-pin'];
 const simplePinSize = isFocused ? 32 : isSelected ? 30 : 26;
 
 return L.divIcon({
 className: `custom-marker-curator-default${isRecentlyEnriched ? ' recently-enriched' : ''}`,
 html: `
 <div style="
 width: ${simplePinSize}px;
 height: ${simplePinSize}px;
 position: relative;
 filter: drop-shadow(0 1px 2px rgba(0,0,0,0.25));
 ${animationStyle}
 ">
 <svg width="${simplePinSize}" height="${simplePinSize}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
 <path d="${iconPath}" 
 fill="none" 
 stroke="${grayColor}" 
 stroke-width="2" 
 stroke-linecap="round" 
 stroke-linejoin="round"/>
 </svg>
 </div>
 `,
 iconSize: [simplePinSize, simplePinSize],
 iconAnchor: [simplePinSize / 2, simplePinSize],
 popupAnchor: [0, -simplePinSize + 4],
 });
 }
 
    // ENRICHED curator points: show curator icon with color
    // Check if it's a valid Lucide icon name (not an emoji or 'map-pin')
 const isValidLucideIcon = ownerInfo.curatorIcon && 
 ownerInfo.curatorIcon !== 'map-pin' && 
 CURATOR_ICON_PATHS[ownerInfo.curatorIcon];
 
 const curatorColor = ownerInfo.curatorColor || '#14b8a6'; // Default teal
 const curatorColorLight = adjustHslLightness(curatorColor, 15);
 const iconName = isValidLucideIcon ? ownerInfo.curatorIcon! : 'map-pin';
 const iconPath = CURATOR_ICON_PATHS[iconName] || CURATOR_ICON_PATHS['map-pin'];
 const iconSize = pinHeight * 0.35;
 
 return L.divIcon({
 className: `custom-marker-curator${isRecentlyEnriched ? ' recently-enriched' : ''}`,
 html: `
 <div style="
 width: ${pinWidth}px;
 height: ${pinHeight}px;
 position: relative;
 filter: ${shadow};
 ${animationStyle}
 ">
 <svg width="${pinWidth}" height="${pinHeight}" viewBox="0 0 24 36" fill="none" xmlns="http://www.w3.org/2000/svg">
 <defs>
 <linearGradient id="curatorPinGrad-${location?.id || 'default'}" x1="0%" y1="0%" x2="100%" y2="100%">
 <stop offset="0%" style="stop-color:${curatorColorLight}" />
 <stop offset="100%" style="stop-color:${curatorColor}" />
 </linearGradient>
 </defs>
 <!-- Pin shape - teardrop -->
 <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 24 12 24s12-15 12-24c0-6.627-5.373-12-12-12z" 
 fill="url(#curatorPinGrad-${location?.id || 'default'})" 
 stroke="white" 
 stroke-width="1.5"/>
 <!-- Inner circle background -->
 <circle cx="12" cy="12" r="${dotSize + 2}" fill="white" fill-opacity="0.95"/>
 <!-- Lucide icon -->
 <g transform="translate(${12 - iconSize/2}, ${12 - iconSize/2}) scale(${iconSize/24})">
 <path d="${iconPath}" 
 fill="none" 
 stroke="${curatorColor}" 
 stroke-width="2" 
 stroke-linecap="round" 
 stroke-linejoin="round"/>
 </g>
 </svg>
 </div>
 `,
 iconSize: [pinWidth, pinHeight],
 iconAnchor: [pinWidth / 2, pinHeight],
 popupAnchor: [0, -pinHeight + 4],
 });
 }


  // For followed users' locations: circular marker with initials and unique color per user
 if (!isOwn) {
 const circleSize = isRecentlyEnriched ? 32 : isFocused ? 30 : isSelected ? 28 : 24;
 const userHue = getUserHue(ownerInfo?.ownerId);
 const initials = getOwnerInitials(ownerInfo?.ownerName);
 const fontSize = circleSize * 0.38;
 
    // Use user-specific color instead of criteria status color for followed users
 const userColor = `hsl(${userHue}, 65%, 45%)`;
 const userColorLight = `hsl(${userHue}, 65%, 55%)`;
 
 return L.divIcon({
 className: 'custom-marker-circle',
 html: `
 <div style="
 width: ${circleSize}px;
 height: ${circleSize}px;
 position: relative;
 filter: ${shadow};
 ${animationStyle}
 ">
 <svg width="${circleSize}" height="${circleSize}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
 <defs>
 <linearGradient id="circleGrad-${location?.id || 'default'}" x1="0%" y1="0%" x2="100%" y2="100%">
 <stop offset="0%" style="stop-color:${userColorLight}" />
 <stop offset="100%" style="stop-color:${userColor}" />
 </linearGradient>
 </defs>
 <!-- Circle shape for followed users -->
 <circle cx="12" cy="12" r="11" 
 fill="url(#circleGrad-${location?.id || 'default'})" 
 stroke="white" 
 stroke-width="1.5"/>
 <!-- Initials text -->
 <text x="12" y="12" 
 text-anchor="middle" 
 dominant-baseline="central" 
 fill="white" 
 font-size="${fontSize}" 
 font-weight="600" 
 font-family="system-ui, sans-serif"
 style="letter-spacing: -0.5px;">${initials}</text>
 </svg>
 </div>
 `,
 iconSize: [circleSize, circleSize],
 iconAnchor: [circleSize / 2, circleSize / 2],
 popupAnchor: [0, -circleSize / 2],
 });
 }

  // Non-enriched own locations: small simple circle
 if (criteriaStatus.status === 'unknown' || criteriaStatus.status === 'new') {
 const circleSize = isFocused ? 18 : isSelected ? 16 : 12;
 const statusColor = criteriaStatus.color;
 const statusColorLight = adjustHslLightness(statusColor, 15);
 
 return L.divIcon({
 className: `custom-marker-dot${isRecentlyEnriched ? ' recently-enriched' : ''}`,
 html: `
 <div style="
 width: ${circleSize}px;
 height: ${circleSize}px;
 position: relative;
 filter: drop-shadow(0 1px 3px rgba(0,0,0,0.3));
 ${animationStyle}
 ">
 <svg width="${circleSize}" height="${circleSize}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
 <defs>
 <linearGradient id="dotGrad-${location?.id || 'default'}" x1="0%" y1="0%" x2="100%" y2="100%">
 <stop offset="0%" style="stop-color:${statusColorLight}" />
 <stop offset="100%" style="stop-color:${statusColor}" />
 </linearGradient>
 </defs>
 <circle cx="12" cy="12" r="11" 
 fill="url(#dotGrad-${location?.id || 'default'})" 
 stroke="white" 
 stroke-width="2"/>
 </svg>
 </div>
 `,
 iconSize: [circleSize, circleSize],
 iconAnchor: [circleSize / 2, circleSize / 2],
 popupAnchor: [0, -circleSize / 2],
 });
 }

  // Classic pin/teardrop shape using SVG (for own enriched locations)
 return L.divIcon({
 className: `custom-marker${isRecentlyEnriched ? ' recently-enriched' : ''}`,
 html: `
 <div style="
 width: ${pinWidth}px;
 height: ${pinHeight}px;
 position: relative;
 filter: ${shadow};
 ${animationStyle}
 ">
 <svg width="${pinWidth}" height="${pinHeight}" viewBox="0 0 24 36" fill="none" xmlns="http://www.w3.org/2000/svg">
 <defs>
 <linearGradient id="pinGrad-${location?.id || 'default'}" x1="0%" y1="0%" x2="100%" y2="100%">
 <stop offset="0%" style="stop-color:${criteriaStatus.color.replace('36%', '50%').replace('51%', '60%').replace('53%', '62%').replace('60%', '70%')}" />
 <stop offset="100%" style="stop-color:${criteriaStatus.color}" />
 </linearGradient>
 </defs>
 <!-- Pin shape - teardrop -->
 <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 24 12 24s12-15 12-24c0-6.627-5.373-12-12-12z" 
 fill="url(#pinGrad-${location?.id || 'default'})" 
 stroke="white" 
 stroke-width="1.5"/>
 <!-- Inner circle -->
 <circle cx="12" cy="12" r="${dotSize}" fill="white" fill-opacity="0.95"/>
 </svg>
 </div>
 `,
 iconSize: [pinWidth, pinHeight],
 iconAnchor: [pinWidth / 2, pinHeight],
 popupAnchor: [0, -pinHeight + 4],
 });
};

// Helper to adjust HSL color lightness
function adjustHslLightness(color: string, amount: number): string {
  // Handle hex colors
 if (color.startsWith('#')) {
 const hex = color.slice(1);
 const r = parseInt(hex.slice(0, 2), 16) / 255;
 const g = parseInt(hex.slice(2, 4), 16) / 255;
 const b = parseInt(hex.slice(4, 6), 16) / 255;
 
 const max = Math.max(r, g, b);
 const min = Math.min(r, g, b);
 let h = 0, s = 0;
 const l = (max + min) / 2;
 
 if (max !== min) {
 const d = max - min;
 s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
 switch (max) {
 case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
 case g: h = ((b - r) / d + 2) / 6; break;
 case b: h = ((r - g) / d + 4) / 6; break;
 }
 }
 
 const newL = Math.min(100, Math.max(0, l * 100 + amount));
 return `hsl(${Math.round(h * 360)}, ${Math.round(s * 100)}%, ${Math.round(newL)}%)`;
 }
 
  // Handle hsl colors
 const hslMatch = color.match(/hsl\(\s*(\d+)\s*,\s*(\d+)%?\s*,\s*(\d+)%?\s*\)/i);
 if (hslMatch) {
 const h = parseInt(hslMatch[1]);
 const s = parseInt(hslMatch[2]);
 const l = parseInt(hslMatch[3]);
 const newL = Math.min(100, Math.max(0, l + amount));
 return `hsl(${h}, ${s}%, ${newL}%)`;
 }
 
 return color;
}

// Helper para crear links de filtro
function createFilterLink(value: string, type: 'zone' | 'region' | 'country' | 'continent'): string {
 return `<a href="#" class="filter-link" data-filter-type="${type}" data-filter-value="${value}" style="color: #6b7280; text-decoration: none; transition: color 0.15s;" onmouseover="this.style.color='#0ea5e9';this.style.textDecoration='underline'" onmouseout="this.style.color='#6b7280';this.style.textDecoration='none'">${value}</a>`;
}

// Parsear localización en partes clicables
function parseLocalizacionToLinks(localizacion: string, location: GeoLocation): string {
  // Si tenemos datos estructurados, usarlos
 const parts: string[] = [];
 
 if (location.zone) parts.push(createFilterLink(location.zone, 'zone'));
 if (location.region) parts.push(createFilterLink(location.region, 'region'));
 if (location.country) parts.push(createFilterLink(location.country, 'country'));
 if (location.continent) parts.push(createFilterLink(location.continent, 'continent'));
 
 if (parts.length > 0) {
 return parts.join(', ');
 }
 
  // Fallback: usar la localización tal cual
 return localizacion;
}

// Helper function to build image section with visibility logic
function buildImageSection(
 location: GeoLocation,
 enriched: any,
 ownership: { isOwn: boolean; isFollowing?: boolean; ownerName?: string; curatorId?: string; curatorIcon?: string; curatorColor?: string; curatorAvatar?: string }
): string {
  // For curator points: prioritize enriched image, then curator avatar, then icon
 if (ownership.curatorId) {
 const curatorIcon = ownership.curatorIcon || 'map-pin';
 const curatorColor = ownership.curatorColor || '#14b8a6';
 const iconPath = CURATOR_ICON_PATHS[curatorIcon] || CURATOR_ICON_PATHS['map-pin'];
 
    // Priority: 1) AI enriched image 2) Curator avatar 3) Icon only
 const imageUrl = enriched?.imagen || ownership.curatorAvatar;
 
 if (imageUrl) {
      // Show image with curator icon overlay
 return `<div style="margin: 0 -12px 0 -12px; position: relative;">
 <div style="width: 100%; height: 160px; position: relative; overflow: hidden;">
 <img src="${imageUrl}" alt="${enriched?.imagen ? 'Ubicación' : 'Curador'}" style="width: 100%; height: 100%; object-fit: cover;" />
 <!-- Curator icon overlay in corner -->
 <div style="
 position: absolute;
 bottom: 8px;
 right: 8px;
 width: 40px;
 height: 40px;
 background: rgba(255,255,255,0.95);
 border-radius: 50%;
 display: flex;
 align-items: center;
 justify-content: center;
 box-shadow: 0 2px 8px rgba(0,0,0,0.2);
 border: 2px solid ${curatorColor};
 ">
 <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
 <path d="${iconPath}" 
 fill="none" 
 stroke="${curatorColor}" 
 stroke-width="2" 
 stroke-linecap="round" 
 stroke-linejoin="round"/>
 </svg>
 </div>
 </div>
 </div>`;
 } else {
      // No image: show gradient with centered icon
 return `<div style="margin: 0 -12px 0 -12px; position: relative;">
 <div style="width: 100%; height: 120px; background: linear-gradient(135deg, ${curatorColor}20, ${curatorColor}40); display: flex; align-items: center; justify-content: center;">
 <div style="
 width: 64px;
 height: 64px;
 background: rgba(255,255,255,0.95);
 border-radius: 50%;
 display: flex;
 align-items: center;
 justify-content: center;
 box-shadow: 0 4px 12px rgba(0,0,0,0.15);
 border: 3px solid ${curatorColor};
 ">
 <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
 <path d="${iconPath}" 
 fill="none" 
 stroke="${curatorColor}" 
 stroke-width="2" 
 stroke-linecap="round" 
 stroke-linejoin="round"/>
 </svg>
 </div>
 </div>
 </div>`;
 }
 }

  // Regular locations: user/followed logic
 const userImageUrl = location.customData?.user_image_url as string | undefined;
 const userImageVisibility = (location.customData?.user_image_visibility as string) || 'private';
 const aiImage = enriched?.imagen;
 
  // La foto del usuario solo se muestra si:
  // 1. Es el propietario (ownership.isOwn)
  // 2. Es pública (visibility === 'public')
  // 3. Es para seguidores (visibility === 'followers') y el viewer es seguidor
 const canSeeUserImage = userImageUrl && (
 ownership.isOwn || 
 userImageVisibility === 'public' || 
 (userImageVisibility === 'followers' && ownership.isFollowing)
 );
 
 const displayImage = canSeeUserImage ? userImageUrl : aiImage;
 const fallbackImage = aiImage || '';
 const locationName = enriched?.nombre_lugar || location.name;
 
 let imageHtml = '';
 if (displayImage) {
 imageHtml = `<img src="${displayImage}" alt="${locationName}" style="width: 100%; height: 160px; object-fit: cover;" onerror="this.src='${fallbackImage}'" />`;
 } else {
 imageHtml = `<div style="width: 100%; height: 100px; background: linear-gradient(135deg, #f3f4f6, #e5e7eb); display: flex; align-items: center; justify-content: center;">
 <span style="color: #9ca3af; font-size: 12px;">Sin imagen</span>
 </div>`;
 }
 
 let buttonHtml = '';
 if (ownership.isOwn) {
 const hasUserImage = !!userImageUrl;
 buttonHtml = `
 <div style="position: absolute; bottom: 12px; right: 16px; display: flex; gap: 8px;">
 ${hasUserImage ? `
 <button 
 class="popup-action-btn" 
 data-action="delete-photo" 
 data-location-id="${location.id}"
 style="display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; padding: 0; background: none; color: white; border: none; cursor: pointer; transition: all 0.15s; filter: drop-shadow(0 1px 3px rgba(0,0,0,0.6));"
 onmouseover="this.style.transform='scale(1.15)'"
 onmouseout="this.style.transform='scale(1)'"
 title="Eliminar mi foto"
 >
 <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
 <path d="M3 6h18"/>
 <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
 <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
 </svg>
 </button>
 ` : ''}
 <button 
 class="popup-action-btn" 
 data-action="upload-photo" 
 data-location-id="${location.id}"
 data-location-name="${locationName}"
 style="display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; padding: 0; background: none; color: white; border: none; cursor: pointer; transition: all 0.15s; filter: drop-shadow(0 1px 3px rgba(0,0,0,0.6));"
 onmouseover="this.style.transform='scale(1.15)'"
 onmouseout="this.style.transform='scale(1)'"
 title="${hasUserImage ? 'Cambiar foto' : 'Añadir foto'}"
 >
 <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
 <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
 <circle cx="12" cy="13" r="4"/>
 </svg>
 </button>
 </div>`;
 }
 
 return `<div style="margin: 0 -12px 0 -12px; position: relative;">
 ${imageHtml}
 ${buttonHtml}
 </div>`;
}



function createPopupContent(
 location: GeoLocation, 
 criteriaTimestamp: number = 0,
 ownership?: { isOwn: boolean; isFollowing?: boolean; ownerName?: string; curatorId?: string; curatorIcon?: string; curatorColor?: string; curatorAvatar?: string },
 canEnrich: boolean = false
): string {
  // Check if regeneration is allowed (only if criteria changed since last update)
 const locationUpdatedAt = location.updatedAt ? new Date(location.updatedAt).getTime() : 0;
 const canRegenerate = canEnrich && (!location.enrichedData || locationUpdatedAt < criteriaTimestamp);
 const enriched = location.enrichedData;
 const hasClassification = !!enriched?.clasificacion?.codigo;
 
  // Ownership indicator
 const isOwn = ownership?.isOwn ?? true;
 const ownerName = ownership?.ownerName;
 const isCuratorPoint = !!ownership?.curatorId;
 
  // Get status color for the status bar
 const statusInfo = getCriteriaColor(location, criteriaTimestamp);
 const statusLabels: Record<CriteriaStatus, string> = {
 current: 'Completado',
 previous: 'Pendiente actualizar',
 unknown: 'Sin ficha IA',
 new: 'Sin procesar',
 };
 
  // Ownership badge HTML con fecha de registro
 const formatRegistrationDate = (date: Date | string): string => {
 const d = date instanceof Date ? date : new Date(date);
 if (isNaN(d.getTime())) return '';
 const day = String(d.getDate()).padStart(2, '0');
 const month = String(d.getMonth() + 1).padStart(2, '0');
 const year = d.getFullYear();
 return `${day}/${month}/${year}`;
 };
 
 const registrationDate = isOwn ? formatRegistrationDate(location.createdAt) : '';
 
 const ownershipBadgeHtml = `
 <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 2px;">
 <div style="
 display: inline-flex;
 align-items: center;
 gap: 4px;
 padding: 2px 8px;
 background: ${isOwn ? 'linear-gradient(135deg, #dbeafe, #bfdbfe)' : 'linear-gradient(135deg, #fef3c7, #fde68a)'};
 border-radius: 12px;
 font-size: 10px;
 font-weight: 500;
 color: ${isOwn ? '#1e40af' : '#92400e'};
 ">
 <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
 ${isOwn 
 ? '<circle cx="12" cy="8" r="4"/><path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/>'
 : '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>'
 }
 </svg>
 ${isOwn ? 'Mi punto' : `De ${ownerName || 'seguido'}`}
 </div>
 ${isOwn && registrationDate ? `
 <div style="font-size: 9px; color: #6b7280; display: flex; align-items: center; gap: 3px;" title="Fecha en que añadiste este punto a tu red">
 <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
 <circle cx="12" cy="12" r="10"/>
 <polyline points="12 6 12 12 16 14"/>
 </svg>
 Añadido ${registrationDate}
 </div>
 ` : ''}
 </div>
 `;
 
  // Status bar HTML - colored line at the top
 const statusBarHtml = `
 <div style="
 height: 6px;
 background: ${statusInfo.gradient};
 margin: 0 -12px 0 -12px;
 border-radius: 8px 8px 0 0;
 box-shadow: 0 2px 4px rgba(0,0,0,0.1);
 "></div>
 `;
 
  // Progress bar container (hidden by default, shown via JS when action starts)
 const progressBarHtml = `
 <div id="popup-progress-${location.id}" style="display: none; margin-bottom: 12px;">
 <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
 <span id="popup-progress-label-${location.id}" style="font-size: 11px; color: #6b7280;">Procesando...</span>
 <span id="popup-progress-percent-${location.id}" style="font-size: 11px; font-weight: 500; color: #374151;">0%</span>
 </div>
 <div style="height: 6px; background: #e5e7eb; border-radius: 3px; overflow: hidden;">
 <div id="popup-progress-bar-${location.id}" style="height: 100%; width: 0%; background: linear-gradient(90deg, #8b5cf6, #7c3aed); border-radius: 3px; transition: width 0.3s ease;"></div>
 </div>
 </div>
 `;
 
  // Get existing notes and visited status from customData
  // Support both legacy (notes in customData) and new system (has_notes flag)
 const existingNotes = location.customData?.notes || '';
 const hasNotes = !!existingNotes || location.customData?.has_notes === 'true';
 const isVisited = location.customData?.visited === 'true';
 
  // Calculate visit relevance grade based on oldest verification date
 const visitRelevance = isVisited ? calculateVisitRelevanceInline(
 location.customData?.visited_verified_at,
 location.customData?.oldest_geotagged_photo_date
 ) : null;

  // Action buttons HTML - minimal size with bottom spacing
  // Master/Admin can enrich ANY location, regular users only their own
 const canEditLocation = canEnrich; // Master/Admin can enrich any point
 const canEditOwn = isOwn; // For notes button - only on own locations
  // Admin warning for editing others' points (NOT shown for curator points)
 const adminEditWarning = (canEditLocation && !isOwn && !isCuratorPoint) ? `
 <div style="display: flex; align-items: center; gap: 6px; padding: 8px 10px; margin-bottom: 8px; background: linear-gradient(135deg, #fef3c7, #fde68a); border: 1px solid #f59e0b; border-radius: 6px; font-size: 10px; color: #92400e;">
 <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink: 0;">
 <path d="M12 9v4m0 4h.01M5.07 19H19a2 2 0 0 0 1.75-2.95L13.75 4a2 2 0 0 0-3.5 0L3.25 16.05A2 2 0 0 0 5.07 19z"/>
 </svg>
 <span><strong>Modo Admin:</strong> Puedes editar este punto de ${ownerName || 'otro usuario'}</span>
 </div>
 ` : '';

 const actionButtonsHtml = `
 ${progressBarHtml}
 ${(canEditLocation && !isOwn && !isCuratorPoint) ? adminEditWarning : ''}
 <div style="display: flex; gap: 4px; margin-top: 8px; padding-top: 8px; padding-bottom: 6px; border-top: 1px solid #e5e7eb;">
 ${isCuratorPoint ? `
 <!-- Para curadores: mostrar fecha de enriquecimiento en lugar de botón -->
 <div style="flex: 2; display: flex; align-items: center; justify-content: center; gap: 4px; padding: 6px 10px; background: #f0fdf4; color: #166534; border: none; border-radius: 4px; font-size: 11px; font-weight: 500;">
 <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
 <circle cx="12" cy="12" r="10"/>
 <polyline points="12 6 12 12 16 14"/>
 </svg>
 Enriquecido ${location.updatedAt ? formatRegistrationDate(location.updatedAt) : ''}
 </div>
 ` : `
 ${canEditLocation ? `
 <button 
 class="popup-action-btn" 
 data-action="enrich" 
 data-location-id="${location.id}"
 ${!canRegenerate ? 'disabled' : ''}
 style="flex: 2; display: flex; align-items: center; justify-content: center; gap: 4px; padding: 6px 10px; background: ${canRegenerate ? 'linear-gradient(135deg, #8b5cf6, #7c3aed)' : '#f0fdf4'}; color: ${canRegenerate ? 'white' : '#166534'}; border: none; border-radius: 4px; font-size: 11px; font-weight: 600; cursor: ${canRegenerate ? 'pointer' : 'default'}; transition: all 0.15s; opacity: ${canRegenerate ? '1' : '0.9'};"
 ${canRegenerate ? `onmouseover="this.style.transform='translateY(-1px)';this.style.boxShadow='0 4px 12px rgba(139, 92, 246, 0.4)'" onmouseout="this.style.transform='none';this.style.boxShadow='none'"` : ''}
 title="${!canRegenerate ? 'Ficha actualizada según criterios actuales' : (enriched ? 'Regenerar ficha completa con IA' : 'Generar ficha completa con IA')}"
 >
 ${!canRegenerate ? `
 <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
 <polyline points="20 6 9 17 4 12"></polyline>
 </svg>
 Enriquecido
 ` : `
 <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
 <path d="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3z"/>
 </svg>
 ${enriched ? 'Re-enriquecer' : 'Enriquecer'}
 `}
 </button>
 ` : ''}
 `}
 ${canEditOwn ? `
 <button 
 class="popup-action-btn" 
 data-action="add-notes" 
 data-location-id="${location.id}"
 style="flex: ${canEditLocation ? '1' : '1'}; display: flex; align-items: center; justify-content: center; gap: 3px; padding: 4px 6px; background: ${hasNotes ? '#fef3c7' : '#f3f4f6'}; color: ${hasNotes ? '#92400e' : '#374151'}; border: none; border-radius: 3px; font-size: 10px; font-weight: 500; cursor: pointer; transition: all 0.15s;"
 onmouseover="this.style.background='${hasNotes ? '#fde68a' : '#e5e7eb'}';this.style.transform='translateY(-1px)'"
 onmouseout="this.style.background='${hasNotes ? '#fef3c7' : '#f3f4f6'}';this.style.transform='none'"
 title="${hasNotes ? 'Editar notas' : 'Añadir notas'}"
 >
 <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
 <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
 <polyline points="14 2 14 8 20 8"/>
 <line x1="16" y1="13" x2="8" y2="13"/>
 <line x1="16" y1="17" x2="8" y2="17"/>
 <line x1="10" y1="9" x2="8" y2="9"/>
 </svg>
 Notas
 </button>
 <button 
 class="popup-action-btn" 
 data-action="delete-location" 
 data-location-id="${location.id}"
 data-location-name="${location.name}"
 style="display: flex; align-items: center; justify-content: center; padding: 4px 8px; background: #fef2f2; color: #dc2626; border: none; border-radius: 3px; cursor: pointer; transition: all 0.15s;"
 onmouseover="this.style.background='#fee2e2';this.style.transform='translateY(-1px)'"
 onmouseout="this.style.background='#fef2f2';this.style.transform='none'"
 title="Mover a la papelera"
 >
 <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
 <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
 </svg>
 </button>
 ` : ''}
 </div>
 `;
 
  // Build "Add to collection" button for followed users' locations (NOT for curator points)
 const addToCollectionBtnHtml = (!isOwn && !isCuratorPoint) ? `
 <button 
 class="popup-action-btn" 
 data-action="add-to-collection" 
 data-location-id="${location.id}"
 data-location-name="${location.name}"
 style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 10px 16px; background: linear-gradient(135deg, #16a34a, #22c55e); color: white; border: none; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s; margin-bottom: 12px; box-shadow: 0 2px 8px rgba(22, 163, 74, 0.3);"
 onmouseover="this.style.transform='translateY(-1px)';this.style.boxShadow='0 4px 12px rgba(22, 163, 74, 0.4)'"
 onmouseout="this.style.transform='none';this.style.boxShadow='0 2px 8px rgba(22, 163, 74, 0.3)'"
 title="Añadir este punto a tu colección personal"
 >
 <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
 <path d="M12 5v14M5 12h14"/>
 </svg>
 Añadir a mi colección
 </button>
 ` : '';
 
  // Si tiene ficha enriquecida, mostrarla sin tabs
 if (enriched) {
 const localizacionLinks = parseLocalizacionToLinks(enriched.localizacion, location);
 const popupId = `popup-${location.id.slice(0, 8)}`;

 const ownershipInfo = {
 isOwn,
 ownerName,
 isFollowing: ownership?.isFollowing,
 curatorId: ownership?.curatorId,
 curatorIcon: ownership?.curatorIcon,
 curatorColor: ownership?.curatorColor,
 curatorAvatar: ownership?.curatorAvatar,
 };

    // No inline scripts - usamos event delegation

 return `
 <div id="${popupId}" style="min-width: 300px; max-width: 360px; font-family: 'Inter', system-ui, sans-serif; position: relative;">
 ${statusBarHtml}
 
 <!-- Imagen con botón de cámara para propietarios -->
 ${buildImageSection(location, enriched, ownershipInfo)}
 
 <div style="padding: 12px 16px 8px 16px;">
 <!-- Nombre + Badge propiedad -->
 <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; margin-bottom: 4px;">
 <h3 style="margin: 0; font-size: 16px; font-weight: 600; color: #1a1a1a; line-height: 1.3; flex: 1;">
 ${enriched.nombre_lugar}
 </h3>
 ${ownershipBadgeHtml}
 </div>
 
 <!-- Localización links -->
 <p style="margin: 0 0 10px 0; font-size: 11px; line-height: 1.4; color: #6b7280;">
 ${localizacionLinks}
 </p>
 
 <!-- Botón para añadir a colección (solo para puntos de seguidos) -->
 ${addToCollectionBtnHtml}
 
 <!-- Índice IA (siempre visible) + Botones de interacción (NO para curadores) -->
 <div style="display: flex; flex-direction: column; align-items: center; gap: 6px; margin-bottom: 10px; padding: 8px; background: #f9fafb; border-radius: 8px;">
 ${!isCuratorPoint ? `
 <!-- Warning de validación (oculto por defecto) -->
 <div id="visit-validation-warning-${location.id}" style="display: none; width: 100%; padding: 8px; background: linear-gradient(135deg, #fef3c7, #fde68a); border: 1px solid #fcd34d; border-radius: 8px; margin-bottom: 4px;">
 <p style="margin: 0 0 4px 0; font-size: 11px; font-weight: 600; color: #92400e;">No se puede validar la visita</p>
 <p id="visit-distance-text-${location.id}" style="margin: 0 0 6px 0; font-size: 10px; color: #a16207;"></p>
 <div style="font-size: 9px; color: #78350f; border-top: 1px solid #fcd34d; padding-top: 6px;">
 <p style="margin: 0 0 3px 0; font-weight: 500;">Criterios de validación:</p>
 <ul style="margin: 0; padding-left: 14px;">
 <li>Estar a menos de 500m del lugar</li>
 <li>Subir una foto con geolocalización (EXIF GPS)</li>
 </ul>
 </div>
 </div>
 ` : ''}
 
 <div style="display: flex; align-items: center; justify-content: center; gap: 8px; flex-wrap: wrap;">
 ${isCuratorPoint ? `
 <!-- Rating ponderado para puntos de curador (50% IA + 50% comunidad) -->
 <div 
 class="weighted-rating-container" 
 data-location-id="${location.id}" 
 data-ai-rating="${enriched.indice_interes || 0}"
 style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; background: linear-gradient(135deg, #f0fdf4, #dcfce7); border: 1px solid #86efac; border-radius: 12px;"
 title="Rating ponderado: 50% IA + 50% Comunidad"
 >
 <span style="font-size: 10px; font-weight: 500; color: #166534;">Valoración</span>
 <span class="weighted-rating-stars" style="display: inline-flex; gap: 1px;">
 ${[1,2,3,4,5].map(star => `<span style="font-size: 14px; line-height: 1; color: ${star <= (enriched.indice_interes || 0) ? '#16a34a' : '#d1d5db'};">${star <= (enriched.indice_interes || 0) ? '' : ''}</span>`).join('')}
 </span>
 <span class="weighted-rating-value" style="font-size: 10px; font-weight: 600; color: #166534;">${enriched.indice_interes ? enriched.indice_interes.toFixed(1) : '-'}</span>
 <span class="weighted-rating-breakdown" style="font-size: 9px; color: #6b7280; display: none;">(IA: ${enriched.indice_interes || '-'} | Com: -)</span>
 </div>
 ` : `
 ${enriched.indice_interes ? `
 <div style="display: inline-flex; align-items: center; gap: 2px; padding: 3px 8px; background: linear-gradient(135deg, #fef3c7, #fde68a); border-radius: 12px;" title="${enriched.indice_interes_notas || 'Índice de interés IA'}">
 ${[1,2,3,4,5].map(star => `<span style="font-size: 14px; line-height: 1; color: ${star <= enriched.indice_interes ? '#b45309' : '#d1d5db'};">${star <= enriched.indice_interes ? '' : ''}</span>`).join('')}
 </div>
 ` : ''}
 `}
 
 ${!isCuratorPoint ? `
 ${isVisited && visitRelevance ? `
 <span 
 style="display: inline-flex; align-items: center; gap: 3px; padding: 2px 6px; background: ${visitRelevance.bgColor}; color: ${visitRelevance.color}; border: 1px solid ${visitRelevance.borderColor}; border-radius: 10px; font-size: 9px; font-weight: 500;"
 title="${visitRelevance.label} - Verificado ${visitRelevance.verificationType === 'photo' ? '' : ''} ${formatTimeAgoInline(visitRelevance.daysAgo)}"
 >
 ${visitRelevance.label}
 </span>
 ` : ''}
 <button 
 class="popup-action-btn" 
 data-action="toggle-visited" 
 data-location-id="${location.id}"
 style="display: inline-flex; align-items: center; gap: 3px; padding: 3px 8px; background: ${isVisited ? '#dcfce7' : (!isOwn ? '#eff6ff' : '#fff')}; color: ${isVisited ? '#166534' : (!isOwn ? '#1d4ed8' : '#6b7280')}; border: 1px solid ${isVisited ? '#86efac' : (!isOwn ? '#93c5fd' : '#e5e7eb')}; border-radius: 12px; font-size: 10px; font-weight: 500; cursor: pointer; transition: all 0.15s;"
 title="${isVisited ? 'Click para desmarcar' : (!isOwn ? 'Se añadirá a tu colección automáticamente' : 'Requiere estar a menos de 500m o subir foto con GPS')}"
 >
 <svg width="10" height="10" viewBox="0 0 24 24" fill="${isVisited ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
 <path d="M20 6 9 17l-5-5"/>
 </svg>
 ${isVisited ? 'Visitado' : (!isOwn ? '+ Adoptar y Visitar' : 'Visitado')}
 </button>
 
 ${(visitRelevance || canEditLocation) ? `
 <div style="display: inline-flex; align-items: center; gap: 2px;" title="Tu valoración personal${!visitRelevance && canEditLocation ? ' (Admin)' : ''}">
 ${[1,2,3,4,5].map(star => `
 <button 
 class="popup-action-btn" 
 data-action="set-rating" 
 data-location-id="${location.id}"
 data-rating="${star}"
 style="background: none; border: none; padding: 0; cursor: pointer; font-size: 14px; line-height: 1; transition: transform 0.1s; color: ${parseInt(location.customData?.user_rating || '0') >= star ? '#f59e0b' : '#d1d5db'};"
 title="Valorar ${star} estrella${star > 1 ? 's' : ''}"
 >${parseInt(location.customData?.user_rating || '0') >= star ? '' : ''}</button>
 `).join('')}
 ${location.customData?.user_rating ? `
 <button 
 class="popup-action-btn" 
 data-action="clear-rating" 
 data-location-id="${location.id}"
 style="background: none; border: none; padding: 0 0 0 3px; cursor: pointer; font-size: 10px; color: #9ca3af;"
 title="Quitar valoración"
 ></button>
 ` : ''}
 </div>
 ` : ''}
 ` : ''}
 </div>
 </div>
 
 <!-- Punto destacado - H3 sin fondo -->
 <div style="clear: both; display: block; margin: 0 0 12px 0;">
 <h3 style="margin: 0; font-size: 13px; color: #1f2937; font-weight: 600; line-height: 1.45;">
 ${enriched.punto_destacado}
 </h3>
 </div>
 
 <!-- Descripción - P normal en contenedor con scroll -->
 <div style="clear: both; display: block; margin: 0 0 12px 0; max-height: 160px; overflow-y: auto; overflow-x: hidden;">
 <p style="margin: 0; font-size: 13px; color: #374151; line-height: 1.6;">
 ${enriched.descripcion}
 </p>
 </div>
 
 <!-- Observación (si existe) - P italic sin fondo -->
 ${enriched.observacion ? `
 <div style="clear: both; display: block; margin: 0 0 12px 0;">
 <p style="margin: 0; font-size: 12px; color: #6b7280; font-style: italic; line-height: 1.5;">
 ${enriched.observacion}
 </p>
 </div>
 ` : ''}
 
 <!-- Web referencia (antes de etiquetas) -->
 ${enriched.datos_clave?.web_referencia ? `
 <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 8px 0;" />
 <div style="display: flex; align-items: center; gap: 8px; padding: 8px 10px; background: #f0f9ff; border-radius: 8px;">
 <span style="font-size: 11px; color: #6b7280; flex-shrink: 0;">Web:</span>
 <a href="${enriched.datos_clave.web_referencia.startsWith('http') ? enriched.datos_clave.web_referencia : 'https://' + enriched.datos_clave.web_referencia}" target="_blank" style="color: #0369a1; font-size: 11px; word-break: break-all; text-decoration: none; flex: 1;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">
 ${enriched.datos_clave.web_referencia}
 </a>
 </div>
 <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 8px 0;" />
 ` : ''}
 
 <!-- Separador antes de etiquetas -->
 <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 8px 0;" />
 
 <!-- Etiquetas geográficas -->
 ${enriched.etiquetas_geograficas?.length ? `
 <div style="display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 8px;">
 ${enriched.etiquetas_geograficas.map(tag => `
 <span class="filter-link" data-filter-type="tag" data-filter-value="${tag.replace('#', '')}" style="background: #e0f2fe; color: #0369a1; padding: 3px 10px; border-radius: 12px; font-size: 11px; cursor: pointer; transition: background 0.15s;" onmouseover="this.style.background='#bae6fd'" onmouseout="this.style.background='#e0f2fe'">
 #${tag.replace('#', '').replace(/\s+/g, '')}
 </span>
 `).join('')}
 </div>
 <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 8px 0;" />
 ` : ''}
 
 <!-- Clasificación tags (NO para curadores) -->
 ${!isCuratorPoint && enriched.clasificacion?.codigo ? `
 <div style="display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 8px;">
 ${enriched.clasificacion.categoria_principal ? `
 <span class="filter-link" data-filter-type="searchTerm" data-filter-value="${enriched.clasificacion.categoria_principal.replace(/^\d+\.\s*/, '')}" style="background: #eef2ff; color: #4338ca; padding: 3px 10px; border-radius: 12px; font-size: 11px; cursor: pointer; transition: background 0.15s;" onmouseover="this.style.background='#e0e7ff'" onmouseout="this.style.background='#eef2ff'">
 #${enriched.clasificacion.categoria_principal.replace(/^\d+\.\s*/, '').replace(/\s+/g, '')}
 </span>
 ` : ''}
 ${enriched.clasificacion.subcategoria ? `
 <span class="filter-link" data-filter-type="searchTerm" data-filter-value="${enriched.clasificacion.subcategoria.replace(/^\d+\.\d+\s*/, '')}" style="background: #eef2ff; color: #4338ca; padding: 3px 10px; border-radius: 12px; font-size: 11px; cursor: pointer; transition: background 0.15s;" onmouseover="this.style.background='#e0e7ff'" onmouseout="this.style.background='#eef2ff'">
 #${enriched.clasificacion.subcategoria.replace(/^\d+\.\d+\s*/, '').replace(/\s+/g, '')}
 </span>
 ` : ''}
 ${enriched.clasificacion.tipo_especifico ? `
 <span class="filter-link" data-filter-type="searchTerm" data-filter-value="${enriched.clasificacion.tipo_especifico.replace(/^\d+\.\d+\.\d+\s*/, '')}" style="background: #eef2ff; color: #4338ca; padding: 3px 10px; border-radius: 12px; font-size: 11px; cursor: pointer; transition: background 0.15s;" onmouseover="this.style.background='#e0e7ff'" onmouseout="this.style.background='#eef2ff'">
 #${enriched.clasificacion.tipo_especifico.replace(/^\d+\.\d+\.\d+\s*/, '').replace(/\s+/g, '')}
 </span>
 ` : ''}
 </div>
 <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 8px 0;" />
 ` : ''}
 
 <!-- Hashtags temáticos (NO para curadores) -->
 ${!isCuratorPoint && enriched.etiquetas?.length ? `
 <div style="display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 8px;">
 ${enriched.etiquetas.filter(tag => !enriched.etiquetas_geograficas?.some(gt => gt.toLowerCase() === tag.toLowerCase())).map(tag => `
 <span class="filter-link" data-filter-type="tag" data-filter-value="${tag.replace('#', '')}" style="background: #f3e8ff; color: #7c3aed; padding: 3px 10px; border-radius: 12px; font-size: 11px; cursor: pointer; transition: background 0.15s;" onmouseover="this.style.background='#e9d5ff'" onmouseout="this.style.background='#f3e8ff'">
 #${tag.replace('#', '').replace(/\s+/g, '')}
 </span>
 `).join('')}
 </div>
 ` : ''}
 
 <!-- Sección colapsable: Descripción original KML (NO para curadores) -->
 ${!isCuratorPoint && location.description ? `
 <div style="border-top: 1px solid #e5e7eb; margin-top: 4px;">
 <button class="popup-toggle-original" data-popup-id="${popupId}" style="width: 100%; display: flex; align-items: center; justify-content: space-between; padding: 10px 0; background: none; border: none; cursor: pointer; color: #6b7280; font-size: 12px; font-weight: 500;">
 <span> Descripción original</span>
 <svg class="toggle-arrow-original" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="transition: transform 0.2s;">
 <polyline points="6 9 12 15 18 9"></polyline>
 </svg>
 </button>
 
 <div class="original-content" data-popup-id="${popupId}" style="display: none;">
 <div style="background: #f9fafb; border-radius: 8px; padding: 10px; font-size: 12px; color: #4b5563; line-height: 1.5; max-height: 150px; overflow-y: auto; white-space: pre-wrap;">
 ${location.description}
 </div>
 </div>
 </div>
 ` : ''}
 
 <!-- Sección de Validación Comunitaria (solo para curadores) -->
 ${isCuratorPoint ? `
 <div style="border-top: 1px solid #e5e7eb; margin-top: 4px;">
 <button class="popup-toggle-community" data-popup-id="${popupId}" style="width: 100%; display: flex; align-items: center; justify-content: space-between; padding: 10px 0; background: none; border: none; cursor: pointer; color: #6b7280; font-size: 12px; font-weight: 500;">
 <span>Validación comunitaria</span>
 <svg class="toggle-arrow-community" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="transition: transform 0.2s;">
 <polyline points="6 9 12 15 18 9"></polyline>
 </svg>
 </button>
 
 <div class="community-content" data-popup-id="${popupId}" data-location-id="${location.id}" data-curator-id="${ownership?.curatorId || ''}" style="display: none;">
 <!-- Contenedor para reviews existentes (se cargará dinámicamente) -->
 <div class="community-reviews-container" data-location-id="${location.id}" style="margin-bottom: 10px;">
 <div style="display: flex; align-items: center; justify-content: center; padding: 16px; color: #9ca3af; font-size: 11px;">
 <svg class="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;">
 <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
 </svg>
 Cargando...
 </div>
 </div>
 
 <!-- Formulario de validación (oculto por defecto, se muestra si está cerca) -->
 <div class="community-form-container" data-location-id="${location.id}" style="display: none;">
 <div style="background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 12px;">
 <p style="margin: 0 0 8px 0; font-size: 11px; font-weight: 600; color: #166534;">¡Estás cerca! Valida este lugar</p>
 
 <!-- Rating -->
 <div style="margin-bottom: 8px;">
 <label style="font-size: 10px; color: #6b7280; display: block; margin-bottom: 4px;">Tu valoración:</label>
 <div class="community-rating-input" data-location-id="${location.id}" style="display: flex; gap: 2px;">
 ${[1,2,3,4,5].map(star => `
 <button 
 class="community-rating-star" 
 data-rating="${star}"
 style="background: none; border: none; padding: 0; cursor: pointer; font-size: 18px; color: #d1d5db; transition: color 0.1s;"
 ></button>
 `).join('')}
 </div>
 </div>
 
 <!-- Comentario -->
 <div style="margin-bottom: 8px;">
 <label style="font-size: 10px; color: #6b7280; display: block; margin-bottom: 4px;">Comentario (opcional):</label>
 <textarea 
 class="community-comment-input" 
 data-location-id="${location.id}"
 placeholder="¿Qué te pareció este lugar?"
 style="width: 100%; padding: 8px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 11px; resize: none; min-height: 50px; font-family: inherit;"
 ></textarea>
 </div>
 
 <!-- Botón enviar -->
 <button 
 class="popup-action-btn community-submit-btn" 
 data-action="submit-community-review"
 data-location-id="${location.id}"
 style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 4px; padding: 8px; background: linear-gradient(135deg, #16a34a, #22c55e); color: white; border: none; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer; transition: all 0.15s;"
 onmouseover="this.style.transform='translateY(-1px)'"
 onmouseout="this.style.transform='none'"
 >
 <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
 <path d="M20 6 9 17l-5-5"/>
 </svg>
 Confirmar y enviar
 </button>
 </div>
 </div>
 
 <!-- Mensaje si está lejos -->
 <div class="community-distance-warning" data-location-id="${location.id}" style="display: none;">
 <div style="background: #fef3c7; border: 1px solid #fcd34d; border-radius: 8px; padding: 10px; font-size: 10px; color: #92400e;">
 <p style="margin: 0 0 4px 0; font-weight: 600;">Acércate para validar</p>
 <p class="distance-text" style="margin: 0;">Debes estar a menos de <span class="required-distance">500</span>m de este lugar para poder validarlo.</p>
 </div>
 </div>
 </div>
 </div>
 ` : ''}
 
 <!-- Fuentes - siempre visibles fuera de datos técnicos -->
 ${enriched.fuentes && Array.isArray(enriched.fuentes) && enriched.fuentes.length > 0 ? `
 <div style="border-top: 1px solid #e5e7eb; margin-top: 8px; padding-top: 8px;">
 <div style="font-size: 10px; color: #6b7280;">
 <div style="display: flex; align-items: center; gap: 4px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; font-weight: 500;">
 <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
 <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
 <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
 </svg>
 Fuentes
 </div>
 <div style="max-height: 80px; overflow-y: auto; background: #f9fafb; padding: 8px 10px; border-radius: 8px;">
 ${enriched.fuentes.map(f => {
                  // Try to make URLs clickable
 const urlMatch = f.match(/(https?:\/\/[^\s]+)/);
 if (urlMatch) {
 const url = urlMatch[1];
 const domain = url.replace(/^https?:\/\//, '').split('/')[0];
 return `<div style="margin-bottom: 4px; display: flex; align-items: flex-start; gap: 4px;">
 <span style="color: #9ca3af;">•</span>
 <a href="${url}" target="_blank" rel="noopener noreferrer" style="color: #6b7280; text-decoration: none; word-break: break-all;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">${domain}</a>
 </div>`;
 }
 return `<div style="margin-bottom: 4px; display: flex; align-items: flex-start; gap: 4px;"><span style="color: #9ca3af;">•</span><span>${f}</span></div>`;
 }).join('')}
 </div>
 </div>
 </div>
 ` : ''}
 
 <!-- Sección colapsable: Datos técnicos -->
 <div style="border-top: 1px solid #e5e7eb; margin-top: 4px;">
 <button class="popup-toggle-tech" data-popup-id="${popupId}" style="width: 100%; display: flex; align-items: center; justify-content: space-between; padding: 10px 0; background: none; border: none; cursor: pointer; color: #6b7280; font-size: 12px; font-weight: 500;">
 <span>Datos técnicos</span>
 <svg class="toggle-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="transition: transform 0.2s;">
 <polyline points="6 9 12 15 18 9"></polyline>
 </svg>
 </button>
 
 <div class="tech-content" data-popup-id="${popupId}" style="display: none;">
 <!-- Datos clave table -->
 ${enriched.datos_clave ? `
 <div style="background: #f9fafb; border-radius: 8px; padding: 10px; margin-bottom: 10px; font-size: 12px;">
 <div style="display: grid; gap: 6px;">
 ${enriched.datos_clave.tipo ? `
 <div style="display: flex; justify-content: space-between;">
 <span style="color: #6b7280;">Tipo</span>
 <span class="filter-link" data-filter-type="searchTerm" data-filter-value="${enriched.datos_clave.tipo}" style="color: #1f2937; font-weight: 500; cursor: pointer;">${enriched.datos_clave.tipo}</span>
 </div>
 ` : ''}
 ${enriched.datos_clave.dimension_principal ? `
 <div style="display: flex; justify-content: space-between;">
 <span style="color: #6b7280;">Dimensión</span>
 <span style="color: #1f2937; font-weight: 500;">${enriched.datos_clave.dimension_principal}</span>
 </div>
 ` : ''}
 ${enriched.datos_clave.acceso ? `
 <div style="display: flex; justify-content: space-between;">
 <span style="color: #6b7280;">Acceso</span>
 <span style="color: #1f2937; font-weight: 500; text-align: right; max-width: 55%;">${enriched.datos_clave.acceso}</span>
 </div>
 ` : ''}
 ${enriched.datos_clave.estado_proteccion ? `
 <div style="display: flex; justify-content: space-between;">
 <span style="color: #6b7280;">Protección</span>
 <span style="color: #1f2937; font-weight: 500; text-align: right; max-width: 55%;">${enriched.datos_clave.estado_proteccion}</span>
 </div>
 ` : ''}
 ${enriched.datos_clave.coordenadas ? `
 <div style="display: flex; justify-content: space-between;">
 <span style="color: #6b7280;">Coordenadas</span>
 <span style="color: #1f2937; font-family: monospace; font-size: 10px;">${enriched.datos_clave.coordenadas}</span>
 </div>
 ` : ''}
 </div>
 </div>
 ` : ''}
 
 <!-- Fecha de actualización de la ficha -->
 ${locationUpdatedAt > 0 ? `
 <div style="display: flex; align-items: center; gap: 4px; font-size: 9px; color: #9ca3af; margin-top: 8px; padding-top: 8px; border-top: 1px dashed #e5e7eb;">
 <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
 <circle cx="12" cy="12" r="10"/>
 <polyline points="12 6 12 12 16 14"/>
 </svg>
 <span>Ficha IA actualizada: ${new Date(locationUpdatedAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}${criteriaTimestamp > 0 && locationUpdatedAt >= criteriaTimestamp ? '' : ''}</span>
 </div>
 ` : ''}
 </div>
 </div>
 
 <!-- Botones de acción siempre visibles al pie -->
 ${actionButtonsHtml}
 </div>
 </div>
 `;
 }
 
  // Fallback: mostrar datos originales
  // Build ownership info for image section
 const ownershipInfo = {
 isOwn,
 ownerName,
 isFollowing: ownership?.isFollowing,
 curatorId: ownership?.curatorId,
 curatorIcon: ownership?.curatorIcon,
 curatorColor: ownership?.curatorColor,
 curatorAvatar: ownership?.curatorAvatar,
 };
 
  // Filter out user_image_url and user_image_visibility from custom data display
 const filteredCustomData = Object.entries(location.customData || {})
 .filter(([key]) => !['user_image_url', 'user_image_visibility', 'has_notes', 'notes', 'visited', 'user_rating'].includes(key));
 
 const customDataHtml = filteredCustomData
 .slice(0, 6)
 .map(([key, value]) => `
 <div style="display: flex; gap: 8px; padding: 4px 0; border-bottom: 1px solid #f0f0f0;">
 <span style="color: #666; font-size: 12px; min-width: 80px; font-weight: 500;">${key}</span>
 <span style="color: #333; font-size: 12px; flex: 1;">${value}</span>
 </div>
 `).join('');

 const moreDataCount = filteredCustomData.length - 6;

 return `
 <div style="min-width: 280px; max-width: 350px; font-family: 'Inter', system-ui, sans-serif;">
 ${statusBarHtml}
 
 <!-- Imagen con botón de cámara para propietarios (también en popup sin ficha IA) -->
 ${buildImageSection(location, null, ownershipInfo)}
 
 <div style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb;">
 <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; margin-bottom: 4px;">
 <h3 style="margin: 0; font-size: 16px; font-weight: 600; color: #1a1a1a; line-height: 1.3; flex: 1;">
 ${location.name}
 </h3>
 ${ownershipBadgeHtml}
 </div>
 <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px;">
 ${location.continent ? `<span class="filter-link" data-filter-type="continent" data-filter-value="${location.continent}" style="background: #e0f2fe; color: #0369a1; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 500; cursor: pointer; transition: background 0.15s;" onmouseover="this.style.background='#bae6fd'" onmouseout="this.style.background='#e0f2fe'">${location.continent}</span>` : ''}
 ${location.country ? `<span class="filter-link" data-filter-type="country" data-filter-value="${location.country}" style="background: #dcfce7; color: #166534; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 500; cursor: pointer; transition: background 0.15s;" onmouseover="this.style.background='#bbf7d0'" onmouseout="this.style.background='#dcfce7'">${location.country}</span>` : ''}
 ${location.region ? `<span class="filter-link" data-filter-type="region" data-filter-value="${location.region}" style="background: #fef3c7; color: #92400e; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 500; cursor: pointer; transition: background 0.15s;" onmouseover="this.style.background='#fde68a'" onmouseout="this.style.background='#fef3c7'">${location.region}</span>` : ''}
 ${location.zone ? `<span class="filter-link" data-filter-type="zone" data-filter-value="${location.zone}" style="background: #f3e8ff; color: #7c3aed; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 500; cursor: pointer; transition: background 0.15s;" onmouseover="this.style.background='#e9d5ff'" onmouseout="this.style.background='#f3e8ff'">${location.zone}</span>` : ''}
 </div>
 
 <!-- Botón para añadir a colección (solo para puntos de seguidos, NO curadores) -->
 ${(!isOwn && !isCuratorPoint) ? `
 <button 
 class="popup-action-btn" 
 data-action="add-to-collection" 
 data-location-id="${location.id}"
 data-location-name="${location.name}"
 style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 10px 16px; background: linear-gradient(135deg, #16a34a, #22c55e); color: white; border: none; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s; margin-top: 12px; box-shadow: 0 2px 8px rgba(22, 163, 74, 0.3);"
 onmouseover="this.style.transform='translateY(-1px)';this.style.boxShadow='0 4px 12px rgba(22, 163, 74, 0.4)'"
 onmouseout="this.style.transform='none';this.style.boxShadow='0 2px 8px rgba(22, 163, 74, 0.3)'"
 title="Añadir este punto a tu colección personal"
 >
 <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
 <path d="M12 5v14M5 12h14"/>
 </svg>
 Añadir a mi colección
 </button>
 ` : ''}
 
 <!-- Botón Visitado + Rating (también en popup sin ficha IA) - NO para curadores -->
 ${!isCuratorPoint ? `
 <div style="display: flex; flex-direction: column; align-items: center; gap: 6px; margin-top: 10px; padding: 8px; background: #f9fafb; border-radius: 8px;">
 <div style="display: flex; align-items: center; justify-content: center; gap: 8px; flex-wrap: wrap;">
 ${isVisited && visitRelevance ? `
 <span 
 style="display: inline-flex; align-items: center; gap: 3px; padding: 2px 6px; background: ${visitRelevance.bgColor}; color: ${visitRelevance.color}; border: 1px solid ${visitRelevance.borderColor}; border-radius: 10px; font-size: 9px; font-weight: 500;"
 title="${visitRelevance.label}"
 >
 ${visitRelevance.label}
 </span>
 ` : ''}
 <button 
 class="popup-action-btn" 
 data-action="toggle-visited" 
 data-location-id="${location.id}"
 style="display: inline-flex; align-items: center; gap: 3px; padding: 3px 8px; background: ${isVisited ? '#dcfce7' : (!isOwn ? '#eff6ff' : '#fff')}; color: ${isVisited ? '#166534' : (!isOwn ? '#1d4ed8' : '#6b7280')}; border: 1px solid ${isVisited ? '#86efac' : (!isOwn ? '#93c5fd' : '#e5e7eb')}; border-radius: 12px; font-size: 10px; font-weight: 500; cursor: pointer; transition: all 0.15s;"
 title="${isVisited ? 'Click para desmarcar' : (!isOwn ? 'Se añadirá a tu colección automáticamente' : 'Marcar como visitado')}"
 >
 <svg width="10" height="10" viewBox="0 0 24 24" fill="${isVisited ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
 <path d="M20 6 9 17l-5-5"/>
 </svg>
 ${isVisited ? 'Visitado' : (!isOwn ? '+ Adoptar y Visitar' : 'Visitado')}
 </button>
 
 ${(visitRelevance || canEditLocation) ? `
 <div style="display: inline-flex; align-items: center; gap: 2px;" title="Tu valoración personal${!visitRelevance && canEditLocation ? ' (Admin)' : ''}">
 ${[1,2,3,4,5].map(star => `
 <button 
 class="popup-action-btn" 
 data-action="set-rating" 
 data-location-id="${location.id}"
 data-rating="${star}"
 style="background: none; border: none; padding: 0; cursor: pointer; font-size: 14px; transition: transform 0.1s; color: ${parseInt(location.customData?.user_rating || '0') >= star ? '#f59e0b' : '#d1d5db'};"
 title="Valorar ${star} estrella${star > 1 ? 's' : ''}"
 >${parseInt(location.customData?.user_rating || '0') >= star ? '' : ''}</button>
 `).join('')}
 ${location.customData?.user_rating ? `
 <button 
 class="popup-action-btn" 
 data-action="clear-rating" 
 data-location-id="${location.id}"
 style="background: none; border: none; padding: 0 0 0 3px; cursor: pointer; font-size: 10px; color: #9ca3af;"
 title="Quitar valoración"
 ></button>
 ` : ''}
 </div>
 ` : ''}
 </div>
 </div>
 ` : ''}
 </div>
 
 ${location.description ? `
 <div style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; background: #fafafa;">
 <p style="margin: 0; font-size: 13px; color: #4b5563; line-height: 1.5; white-space: pre-wrap; max-height: 150px; overflow-y: auto;">
 ${location.description}
 </p>
 </div>
 ` : ''}
 
 <div style="padding: 12px 16px;">
 <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 8px;">
 <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2">
 <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
 <circle cx="12" cy="10" r="3"></circle>
 </svg>
 <span style="font-size: 12px; color: #6b7280;">
 ${location.coordinates.lat.toFixed(6)}, ${location.coordinates.lng.toFixed(6)}
 </span>
 </div>
 
 ${customDataHtml ? `
 <div style="margin-top: 12px;">
 <div style="font-size: 11px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">
 Datos adicionales
 </div>
 ${customDataHtml}
 ${moreDataCount > 0 ? `<div style="font-size: 11px; color: #9ca3af; padding-top: 8px;">+${moreDataCount} campos más</div>` : ''}
 </div>
 ` : ''}
 
 ${actionButtonsHtml}
 </div>
 </div>
 `;
}

export function LocationMap() {
 const mapRef = useRef<L.Map | null>(null);
 const mapContainerRef = useRef<HTMLDivElement>(null);
 const markersRef = useRef<Map<string, L.Marker>>(new Map());
 const locationsRef = useRef<Map<string, GeoLocation>>(new Map());
 const markerClusterRef = useRef<L.MarkerClusterGroup | null>(null);
 const tileLayerRef = useRef<L.TileLayer | null>(null);
 const homeMarkerRef = useRef<L.Marker | null>(null);
 const userLocationMarkerRef = useRef<L.Marker | null>(null);
 const userLocationCircleRef = useRef<L.Circle | null>(null);
 const prevLocationsCountRef = useRef<number>(0);
  const routeLayersRef = useRef<L.Layer[]>([]);
  const routeGroupRef = useRef<L.LayerGroup | null>(null);
  const advisorPreviewGroupRef = useRef<L.LayerGroup | null>(null);
 const prevFilterKeyRef = useRef<string>('');
 const [showZoomButton, setShowZoomButton] = useState(false);
 const [viewMode, setViewMode] = useState<ViewMode>('markers');
 const heatLayerRef = useRef<L.Layer | null>(null);
 const [mapTheme, setMapTheme] = useState<MapTheme>('light');
  // showCenterSettings removed - now in UserProfileEditor
 const [userLocation, setUserLocation] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
 
  // Measurement units preference
 const [measurementUnits, setMeasurementUnits] = useState<'metric' | 'imperial' | 'auto'>(() => {
 const stored = localStorage.getItem('geodata-measurement-units');
 return (stored as 'metric' | 'imperial' | 'auto') || 'metric';
 });
 
  // Map center config from database/localStorage
 const { config: mapCenterConfig, loading: mapCenterLoading } = useMapCenterConfig();
 
  // Track recently enriched locations for animation
 const [recentlyEnrichedIds, setRecentlyEnrichedIds] = useState<Set<string>>(new Set());
  // Track previous enrichment state: store description length to detect actual content changes
 const previousEnrichmentStateRef = useRef<Map<string, number>>(new Map());

  // Force marker refresh when the "Criterios de Actualización" change
 const [criteriaVersion, setCriteriaVersion] = useState(0);
 
  // Force update counter for realtime and store updates
 const [forceUpdateCount, setForceUpdateCount] = useState(0);
 
  // Map center config version to trigger re-centering
 const [centerConfigVersion, setCenterConfigVersion] = useState(0);

 useEffect(() => {
 const handleCriteriaChanged = () => setCriteriaVersion((v) => v + 1);
 const handleRealtimeUpdate = () => setForceUpdateCount((v) => v + 1);
 
    // Listen for toolbar map control events
 const handleViewModeChange = (e: Event) => {
 const mode = (e as CustomEvent).detail?.mode;
 if (mode === 'markers' || mode === 'heatmap') {
 setViewMode(mode);
 }
 };
 
 const handleGoHome = () => {
 if (mapRef.current && mapCenterConfig?.homeLocation) {
 mapRef.current.setView(
 [mapCenterConfig.homeLocation.lat, mapCenterConfig.homeLocation.lng],
 12,
 { animate: true }
 );
 toast.success(`Centrando en ${mapCenterConfig.homeLocation.name || 'ubicación base'}`);
 } else if (mapRef.current && locations.length > 0) {
        // Fallback: zoom to all locations
 const bounds = L.latLngBounds(locations.map(l => [l.coordinates.lat, l.coordinates.lng]));
 mapRef.current.fitBounds(bounds, { padding: [50, 50], animate: true });
 }
 };
 
 const handleSetTheme = (e: Event) => {
 const customEvent = e as CustomEvent<{ theme: MapTheme }>;
 if (customEvent.detail?.theme) {
 setMapTheme(customEvent.detail.theme);
 }
 };
 
 const handleFitBounds = (e: Event) => {
 const customEvent = e as CustomEvent<{ 
 bounds: [[number, number], [number, number]];
 padding?: [number, number];
 maxZoom?: number;
 }>;
 if (customEvent.detail?.bounds && mapRef.current) {
 const { bounds, padding = [50, 50], maxZoom = 18 } = customEvent.detail;
 const latLngBounds = L.latLngBounds(
 [bounds[0][0], bounds[0][1]],
 [bounds[1][0], bounds[1][1]]
 );
 mapRef.current.fitBounds(latLngBounds, { 
 padding, 
 maxZoom,
 animate: true 
 });
 }
 };
 
 const handleMeasurementUnitsChanged = (e: Event) => {
 const customEvent = e as CustomEvent<{ units: 'metric' | 'imperial' | 'auto' }>;
 if (customEvent.detail?.units) {
 setMeasurementUnits(customEvent.detail.units);
 }
 };
 
    // Handler to refresh curator visibility zoom levels when settings change
 const handleCuratorVisibilityUpdate = () => {
 import('@/integrations/supabase/client').then(({ supabase }) => {
 supabase
 .from('curators')
 .select('id, min_visibility_zoom')
 .eq('is_active', true)
 .then(({ data }) => {
 if (data) {
 const zoomMap = new Map<string, number | null>();
 data.forEach(c => zoomMap.set(c.id, c.min_visibility_zoom));
 setCuratorVisibilityZooms(zoomMap);
 }
 });
 });
 };
 
 window.addEventListener('enrichment-criteria-changed', handleCriteriaChanged);
 window.addEventListener('location-realtime-update', handleRealtimeUpdate);
 window.addEventListener('store-updated', handleRealtimeUpdate);
 window.addEventListener('map-view-mode', handleViewModeChange);
 window.addEventListener('map-go-home', handleGoHome);
 window.addEventListener('map-set-theme', handleSetTheme);
 window.addEventListener('map-fit-bounds', handleFitBounds);
 window.addEventListener('curator-info-updated', handleRealtimeUpdate);
 window.addEventListener('curator-info-updated', handleCuratorVisibilityUpdate);
 window.addEventListener('measurement-units-changed', handleMeasurementUnitsChanged);
 
  let lastRouteSegCount = 0;

  const highlightSelectedRouteGroup = (groupId: string) => {
    (window as any).__selectedRouteGroup = groupId;

    routeLayersRef.current.forEach((layer: any) => {
      if (!layer._routeGroup || layer._baseOpacity == null || typeof layer.setStyle !== 'function') return;

      if (layer._routeGroup === groupId) {
        layer.setStyle({ opacity: 1, weight: layer._baseWeight + 2 });
      } else {
        layer.setStyle({ opacity: 0.15, weight: layer._baseWeight });
      }
    });
  };

  const dispatchRouteLayerSelection = (layer: any) => {
    if (layer._routeGroup) {
      highlightSelectedRouteGroup(layer._routeGroup);
    }

    if (layer._alternativeMode) {
      window.dispatchEvent(new CustomEvent('route-alternative-selected', {
        detail: { mode: layer._alternativeMode, label: layer._alternativeLabel },
      }));
      return;
    }

    if (layer._routeId) {
      window.dispatchEvent(new CustomEvent('map-route-selected', { detail: { routeId: layer._routeId } }));
      return;
    }
  };

  const handleMapRouteClick = (e: L.LeafletMouseEvent) => {
    if (!mapRef.current) return;

    const clickPoint = mapRef.current.latLngToContainerPoint(e.latlng);
    let bestAlternativeLayer: any = null;
    let bestAlternativeDistance = Infinity;
    let bestOtherLayer: any = null;
    let bestOtherDistance = Infinity;

    routeLayersRef.current.forEach((layer: any) => {
      const routeLayer = layer as any;
      if (!routeLayer || typeof routeLayer.closestLayerPoint !== 'function') return;
      if (!routeLayer._routeGroup && !routeLayer._alternativeMode && !routeLayer._routeId) return;

      const closestPoint = routeLayer.closestLayerPoint(clickPoint);
      if (!closestPoint) return;

      const distance = clickPoint.distanceTo(closestPoint);
      const hitTargetWeight = Number(routeLayer._hitTargetWeight || routeLayer._baseWeight || 0);
      const threshold = Math.max(hitTargetWeight / 2 + 4, 12);
      if (distance > threshold) return;

      if (routeLayer._alternativeMode) {
        if (distance < bestAlternativeDistance) {
          bestAlternativeDistance = distance;
          bestAlternativeLayer = routeLayer;
        }
        return;
      }

      if (distance < bestOtherDistance) {
        bestOtherDistance = distance;
        bestOtherLayer = routeLayer;
      }
    });

    const bestLayer = bestAlternativeLayer || bestOtherLayer;
    if (bestLayer) {
      dispatchRouteLayerSelection(bestLayer);
    }
  };

  const handleShowRoute = (e: Event) => {
  const segments = (e as CustomEvent).detail?.segments;
  const routeStops = (e as CustomEvent).detail?.stops as any[] | undefined;
       // Remove previous route layers — instant via LayerGroup
  if (routeGroupRef.current) {
    routeGroupRef.current.clearLayers();
  }
  routeLayersRef.current = [];
  
  const isNewRoute = !segments || segments.length !== lastRouteSegCount;
  lastRouteSegCount = segments?.length || 0;

   if (!segments || !Array.isArray(segments) || segments.length === 0 || !mapRef.current) return;
  
  // Ensure layer group exists
  if (!routeGroupRef.current) {
    routeGroupRef.current = L.layerGroup().addTo(mapRef.current);
  }
  
  const allBounds: L.LatLng[] = [];
  
    // Detect round trip robustly: either explicit return segments OR route ends near where it starts
    let firstPoint: L.LatLng | null = null;
    let finalPoint: L.LatLng | null = null;

    for (const seg of segments) {
     if (!seg.geometry?.coordinates || seg.geometry.coordinates.length === 0) continue;
     const firstCoord = seg.geometry.coordinates[0];
     firstPoint = L.latLng(firstCoord[1], firstCoord[0]);
     break;
    }

    for (let i = segments.length - 1; i >= 0; i--) {
     const seg = segments[i];
     if (!seg.geometry?.coordinates || seg.geometry.coordinates.length === 0) continue;
     const lastCoord = seg.geometry.coordinates[seg.geometry.coordinates.length - 1];
     finalPoint = L.latLng(lastCoord[1], lastCoord[0]);
     break;
    }

    const closesBackToOrigin = !!(firstPoint && finalPoint && firstPoint.distanceTo(finalPoint) < 2500);
    const isRoundTrip = segments.some((s: any) => s.isReturnLeg === true) || closesBackToOrigin;
    
    let turningPoint: L.LatLng | null = null;
    let turningStageNumber: number | null = null;
    let lastSegmentEndPoint: L.LatLng | null = finalPoint;
    
    // Group segments by stage for visual separation
    const segmentsByStage: Map<number, { seg: any; idx: number }[]> = new Map();
    for (let si = 0; si < segments.length; si++) {
      const seg = segments[si];
      if (!seg.geometry?.coordinates) continue;
      const stageNum = seg.stageNumber || 1;
      if (!segmentsByStage.has(stageNum)) segmentsByStage.set(stageNum, []);
      segmentsByStage.get(stageNum)!.push({ seg, idx: si });
    }

    const stageKeys = Array.from(segmentsByStage.keys()).sort((a, b) => a - b);
    const stageSummaries = stageKeys.map((stageNum) => {
      const stageSegs = segmentsByStage.get(stageNum)!;
      let distance = 0;
      let endPoint: L.LatLng | null = null;

      for (const { seg } of stageSegs) {
        distance += Number(seg.distance || 0);
        const coords = seg.geometry.coordinates;
        if (coords?.length) {
          const lastCoord = coords[coords.length - 1];
          endPoint = L.latLng(lastCoord[1], lastCoord[0]);
        }
      }

      return {
        stageNumber: stageNum,
        distance,
        endPoint,
        explicitReturn: stageSegs[0]?.seg.isReturnLeg === true,
      };
    });

    if (isRoundTrip && stageSummaries.length > 0) {
      const totalRouteDistance = stageSummaries.reduce((sum, stage) => sum + stage.distance, 0);
      let cumulativeDistance = 0;
      let maxRouteDistanceFromOrigin = -1;

      for (const stage of stageSummaries) {
        cumulativeDistance += stage.distance;
        const routeDistanceFromOrigin = totalRouteDistance > 0
          ? Math.min(cumulativeDistance, totalRouteDistance - cumulativeDistance)
          : cumulativeDistance;

        if (routeDistanceFromOrigin > maxRouteDistanceFromOrigin && stage.endPoint) {
          maxRouteDistanceFromOrigin = routeDistanceFromOrigin;
          turningPoint = stage.endPoint;
          turningStageNumber = stage.stageNumber;
        }
      }

      if (!turningPoint) {
        const explicitReturnIdx = stageSummaries.findIndex((stage) => stage.explicitReturn);
        const fallbackStage = explicitReturnIdx > 0
          ? stageSummaries[explicitReturnIdx - 1]
          : stageSummaries[stageSummaries.length - 1];
        turningPoint = fallbackStage?.endPoint || null;
        turningStageNumber = fallbackStage?.stageNumber ?? null;
      }
    }

    // Draw each stage as a separate polyline group with gap markers between stages
    
    for (const stageNum of stageKeys) {
      const stageSegs = segmentsByStage.get(stageNum)!;
      
      for (const { seg } of stageSegs) {
        const rawCoords: L.LatLngExpression[] = seg.geometry.coordinates.map((c: number[]) => [c[1], c[0]]);
        
        const isFlightSeg = seg.transportMode === 'flight';
        const isFerrySeg = seg.transportMode === 'ferry';
        const coords = isFlightSeg && mapRef.current
          ? createFlightArcCoords(mapRef.current, rawCoords)
          : rawCoords;

        coords.forEach((c: any) => allBounds.push(L.latLng(c[0], c[1])));

        if (coords.length > 0) {
          const lc = coords[coords.length - 1] as any;
          lastSegmentEndPoint = L.latLng(lc[0] ?? lc.lat, lc[1] ?? lc.lng);
        }

        const isReturn = isRoundTrip && turningStageNumber !== null
          ? stageNum > turningStageNumber
          : seg.isReturnLeg === true;
        const defaultColor = isReturn ? '#e84d0e' : '#2563eb';
        const color = seg.routeColor || (isFlightSeg ? '#9333ea' : isFerrySeg ? '#0891b2' : defaultColor);

        if (coords.length > 0 && mapRef.current) {
          const isAlternative = seg.isAlternative === true;
          const isAltDrivingLeg = isAlternative && !isFlightSeg && !isFerrySeg;
          const baseWeight = isAlternative ? (isAltDrivingLeg ? 2.5 : 3) : isFlightSeg ? 3 : isReturn ? 3.5 : 4;
          const baseOpacity = isAlternative ? 0.55 : isFlightSeg ? 0.7 : isReturn ? 0.8 : 0.95;
          const altGroupId = seg.alternativeMode || seg.alternativeLabel || null;
          const segGroupId = isAlternative ? (altGroupId || `alt-${stageNum}`) : 'primary';

          // Wide near-invisible polyline for reliable hover/click capture
          const hitAreaWeight = Math.max(baseWeight + 14, 18);
          const hitArea = L.polyline(coords, {
            color,
            weight: hitAreaWeight,
            opacity: 0.01,
            lineCap: 'round',
            lineJoin: 'round',
            className: 'leaflet-route-hit-area',
            interactive: true,
          }).addTo(routeGroupRef.current!);

          const polyline = L.polyline(coords, {
            color,
            weight: baseWeight,
            opacity: baseOpacity,
            lineCap: 'round',
            lineJoin: 'round',
            dashArray: isFlightSeg ? '6, 8' : isFerrySeg ? '4, 6' : isAltDrivingLeg ? '3, 5' : isReturn ? '8, 6' : undefined,
            interactive: true,
          }).addTo(routeGroupRef.current!);

          // Store metadata for group selection
          (polyline as any)._routeGroup = segGroupId;
          (polyline as any)._baseWeight = baseWeight;
          (polyline as any)._baseOpacity = baseOpacity;
          (polyline as any)._altLabel = isAlternative ? (seg.alternativeLabel || null) : null;
          (polyline as any)._alternativeMode = isAlternative ? (seg.alternativeMode || null) : null;
          (polyline as any)._alternativeLabel = isAlternative ? (seg.alternativeLabel || null) : null;
          (polyline as any)._routeId = seg.routeId || null;
          (polyline as any)._hitTargetWeight = hitAreaWeight;

          (hitArea as any)._routeGroup = segGroupId;
          (hitArea as any)._baseWeight = baseWeight;
          (hitArea as any)._baseOpacity = baseOpacity;
          (hitArea as any)._altLabel = isAlternative ? (seg.alternativeLabel || null) : null;
          (hitArea as any)._alternativeMode = isAlternative ? (seg.alternativeMode || null) : null;
          (hitArea as any)._alternativeLabel = isAlternative ? (seg.alternativeLabel || null) : null;
          (hitArea as any)._routeId = seg.routeId || null;
          (hitArea as any)._hitTargetWeight = hitAreaWeight;

          // Hover highlight for ALL routes
          const onMouseOver = () => {
            polyline.setStyle({ opacity: 1, weight: baseWeight + 3 });
            if (isAlternative && seg.alternativeLabel) {
              window.dispatchEvent(new CustomEvent('route-alternative-hover', { detail: { label: seg.alternativeLabel } }));
            }
          };
          const onMouseOut = () => {
            if (isAlternative && seg.alternativeLabel) {
              window.dispatchEvent(new CustomEvent('route-alternative-hover', { detail: { label: null } }));
            }
            const selected = (window as any).__selectedRouteGroup;
            if (selected && selected !== segGroupId) {
              polyline.setStyle({ opacity: 0.15, weight: baseWeight });
            } else if (selected === segGroupId) {
              polyline.setStyle({ opacity: 1, weight: baseWeight + 2 });
            } else {
              polyline.setStyle({ opacity: baseOpacity, weight: baseWeight });
            }
          };
          polyline.on('mouseover', onMouseOver);
          polyline.on('mouseout', onMouseOut);
          hitArea.on('mouseover', onMouseOver);
          hitArea.on('mouseout', onMouseOut);

          // Click to select this route group — dim all others + notify app
          const onRouteClick = (evt?: any) => {
            if (evt?.originalEvent) {
              L.DomEvent.stop(evt.originalEvent);
            }
            dispatchRouteLayerSelection(polyline as any);
          };
          polyline.on('click', onRouteClick);
          hitArea.on('click', onRouteClick);
          hitArea.bringToFront();
 
          if (isAlternative && seg.alternativeMode) {
            const altLabel = seg.alternativeLabel || seg.alternativeMode;
            polyline.bindTooltip(`${altLabel} — clic para seleccionar`, { sticky: true, direction: 'top' });
            hitArea.bindTooltip(`${altLabel} — clic para seleccionar`, { sticky: true, direction: 'top' });
          }
 
          routeLayersRef.current.push(hitArea);
 
          routeLayersRef.current.push(polyline);

          // Add transport mode icon at midpoint of flight/ferry arcs
          if ((isFlightSeg || isFerrySeg) && coords.length >= 2) {
            const midIdx = Math.floor(coords.length / 2);
            const midCoord = coords[midIdx] as any;
            const prevCoord = coords[Math.max(midIdx - 1, 0)] as any;
            const nextCoord = coords[Math.min(midIdx + 1, coords.length - 1)] as any;
            if (midCoord && prevCoord && nextCoord) {
              const midLat = midCoord[0] ?? midCoord.lat;
              const midLng = midCoord[1] ?? midCoord.lng;
              const bearing = calculateSegmentBearing(prevCoord, nextCoord);
              const emoji = isFlightSeg ? '✈' : '⛴';
              const rotation = isFlightSeg ? bearing - 90 : bearing - 90;

              const modeIcon = L.divIcon({
                className: '',
                html: `<div style="
                  transform: rotate(${rotation}deg);
                  font-size: ${isAlternative ? '16' : '20'}px;
                  line-height: 1;
                  color: ${color};
                  opacity: ${isAlternative ? '0.6' : '1'};
                  filter: drop-shadow(0 1px 2px rgba(0,0,0,0.4));
                ">${emoji}</div>`,
                iconSize: [24, 24],
                iconAnchor: [12, 12],
              });
              const marker = L.marker([midLat, midLng], { icon: modeIcon, interactive: isAlternative }).addTo(routeGroupRef.current!);
              if (isAlternative && seg.alternativeMode) {
                marker.on('click', () => {
                  window.dispatchEvent(new CustomEvent('route-alternative-selected', { detail: { mode: seg.alternativeMode, label: seg.alternativeLabel } }));
                });
              }
              routeLayersRef.current.push(marker);
            }
          }

          // Add port/airport endpoint markers for ferry/flight segments
          if ((isFlightSeg || isFerrySeg) && !isAlternative && coords.length >= 2) {
            const startCoord = rawCoords[0] as any;
            const endCoord = rawCoords[rawCoords.length - 1] as any;
            const startLat = startCoord[0] ?? startCoord.lat;
            const startLng = startCoord[1] ?? startCoord.lng;
            const endLat = endCoord[0] ?? endCoord.lat;
            const endLng = endCoord[1] ?? endCoord.lng;

            const emoji = isFlightSeg ? '✈️' : '⚓';
            const bgColor = isFlightSeg ? '#9333ea' : '#0891b2';
            const label = isFlightSeg ? 'Aeropuerto' : 'Puerto';

            // Start endpoint
            const startIcon = L.divIcon({
              className: '',
              html: `<div style="
                display:flex;align-items:center;justify-content:center;
                width:26px;height:26px;border-radius:50%;
                background:${bgColor};border:2px solid white;
                box-shadow:0 1px 4px rgba(0,0,0,0.3);
                font-size:13px;line-height:1;
              ">${emoji}</div>`,
              iconSize: [26, 26],
              iconAnchor: [13, 13],
            });
            const startMarker = L.marker([startLat, startLng], { icon: startIcon, interactive: true, zIndexOffset: 9100 }).addTo(routeGroupRef.current!);
            startMarker.bindTooltip(`${label} de salida`, { direction: 'top', offset: [0, -14] });
            routeLayersRef.current.push(startMarker);

            // End endpoint
            const endIcon = L.divIcon({
              className: '',
              html: `<div style="
                display:flex;align-items:center;justify-content:center;
                width:26px;height:26px;border-radius:50%;
                background:${bgColor};border:2px solid white;
                box-shadow:0 1px 4px rgba(0,0,0,0.3);
                font-size:13px;line-height:1;
              ">${emoji}</div>`,
              iconSize: [26, 26],
              iconAnchor: [13, 13],
            });
            const endMarker = L.marker([endLat, endLng], { icon: endIcon, interactive: true, zIndexOffset: 9100 }).addTo(routeGroupRef.current!);
            endMarker.bindTooltip(`${label} de llegada`, { direction: 'top', offset: [0, -14] });
            routeLayersRef.current.push(endMarker);
          }
        }
      }

      // Add stage label at midpoint of the stage
      if (stageKeys.length > 1 && mapRef.current) {
        // Collect all coords from this stage for the label position
        const allStageCoords: L.LatLngExpression[] = [];
        for (const { seg: s } of stageSegs) {
          if (s.geometry?.coordinates) {
            allStageCoords.push(...s.geometry.coordinates.map((c: number[]) => [c[1], c[0]] as L.LatLngExpression));
          }
        }
        const isReturn = isRoundTrip && turningStageNumber !== null
          ? stageNum > turningStageNumber
          : stageSegs[0]?.seg.isReturnLeg === true;
        const stageColor = stageSegs[0]?.seg.routeColor || (isReturn ? '#e84d0e' : '#2563eb');

        if (allStageCoords.length > 0) {
          const midIdx = Math.floor(allStageCoords.length / 2);
          const midCoord = allStageCoords[midIdx] as any;
          if (midCoord) {
            const midPos = L.latLng(midCoord[0] ?? midCoord.lat, midCoord[1] ?? midCoord.lng);
            const labelIcon = L.divIcon({
              className: '',
              html: `<div style="
                display:flex;align-items:center;gap:2px;
                padding:1px 6px;border-radius:10px;
                background:${stageColor};color:white;
                font-size:9px;font-weight:700;
                white-space:nowrap;
                box-shadow:0 1px 3px rgba(0,0,0,0.3);
                border:1.5px solid white;
              ">${isReturn ? '↩' : '→'} E${stageNum}</div>`,
              iconSize: [40, 18],
              iconAnchor: [20, 9],
            });
            const labelMarker = L.marker(midPos, { icon: labelIcon, interactive: false, zIndexOffset: 8000 }).addTo(routeGroupRef.current!);
            routeLayersRef.current.push(labelMarker);
          }
        }
      }
    }

    // Draw waypoint markers along the route (intermediate points from segments)
    // Each segment's start point = a waypoint
    const drawnWaypointPositions: string[] = [];
    for (let si = 0; si < segments.length; si++) {
      const seg = segments[si];
      if (!seg.geometry?.coordinates?.length) continue;
      const startCoord = seg.geometry.coordinates[0];
      if (!startCoord || startCoord.length < 2) continue;
      const posKey = `${startCoord[1].toFixed(3)},${startCoord[0].toFixed(3)}`;
      if (drawnWaypointPositions.includes(posKey)) continue;
      drawnWaypointPositions.push(posKey);
      
      // Skip first (origin) and determine if it's an intermediate
      if (si === 0) continue; // origin already marked by the green pin/start icon
      
      const wpPos = L.latLng(startCoord[1], startCoord[0]);
      const wpIcon = L.divIcon({
        className: '',
        html: `<div style="
          display:flex;align-items:center;justify-content:center;
          width:18px;height:18px;border-radius:50%;
          background:hsl(var(--primary));border:2px solid white;
          box-shadow:0 1px 3px rgba(0,0,0,0.3);
          font-size:8px;font-weight:700;color:white;
        ">${si}</div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });
      if (mapRef.current) {
        const wpMarker = L.marker(wpPos, { icon: wpIcon, interactive: false, zIndexOffset: 8500 }).addTo(routeGroupRef.current!);
        routeLayersRef.current.push(wpMarker);
      }
    }
    
    // Round trip → flag at the point with max real route distance from origin; One-way → final destination
    const flagPosition = isRoundTrip ? turningPoint : lastSegmentEndPoint;
   
   if (flagPosition && mapRef.current) {
    const flagIcon = L.divIcon({
     className: '',
     html: `<div style="
      display:flex;align-items:center;justify-content:center;
      width:36px;height:36px;border-radius:50%;
      background:#dc2626;border:3px solid white;
      box-shadow:0 2px 8px rgba(0,0,0,0.4);
      z-index:9999;
     ">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
       <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
       <line x1="4" y1="22" x2="4" y2="15"/>
      </svg>
     </div>`,
     iconSize: [36, 36],
     iconAnchor: [18, 18],
    });
    const marker = L.marker(flagPosition, { icon: flagIcon, interactive: false, zIndexOffset: 9999 }).addTo(routeGroupRef.current!);
    routeLayersRef.current.push(marker);
    }

    // Stage break markers (overnight/rest stops)
    const stageBreaks = (segments as any)._stageBreaks;
    if (stageBreaks && Array.isArray(stageBreaks) && mapRef.current) {
     for (const sb of stageBreaks) {
      const pos = sb.lat != null && sb.lng != null
        ? L.latLng(sb.lat, sb.lng)
        : (() => {
            const seg = segments[sb.segmentIndex];
            if (!seg?.geometry?.coordinates?.length) return null;
            const lastCoord = seg.geometry.coordinates[seg.geometry.coordinates.length - 1];
            return L.latLng(lastCoord[1], lastCoord[0]);
          })();
      if (!pos) continue;
      const hours = Math.round(sb.cumulativeDuration / 3600 * 10) / 10;
      const isReturn = isRoundTrip && turningStageNumber !== null
        ? sb.stageNumber > turningStageNumber
        : sb.isReturnLeg === true;
      const bgColor = isReturn ? '#ea580c' : '#f59e0b';
      const stageIcon = L.divIcon({
       className: '',
       html: `<div style="
        display:flex;align-items:center;justify-content:center;
        width:28px;height:28px;border-radius:50%;
        background:${bgColor};border:2px solid white;
        box-shadow:0 1px 4px rgba(0,0,0,0.3);
        font-size:11px;font-weight:700;color:white;
       ">🛏️</div>`,
       iconSize: [28, 28],
       iconAnchor: [14, 14],
      });
      const label = isReturn ? 'Vuelta' : 'Ida';
      const stageMarker = L.marker(pos, { icon: stageIcon, interactive: true, zIndexOffset: 9000 }).addTo(routeGroupRef.current!);
      stageMarker.bindTooltip(`Parada ${label} · Etapa ${sb.stageNumber} · ${hours}h conducción`, { direction: 'top', offset: [0, -16] });
      routeLayersRef.current.push(stageMarker);
     }
    }

    // Render persisted route stops (ports, airports, overnight, etc.)
    if (routeStops && Array.isArray(routeStops) && routeStops.length > 0 && mapRef.current) {
      const stopColors: Record<string, string> = {
        overnight: '#f59e0b',
        port: '#0891b2',
        airport: '#9333ea',
        refuel: '#ef4444',
        rest: '#22c55e',
        scenic: '#ec4899',
        custom: '#6b7280',
      };
      const stopEmojis: Record<string, string> = {
        overnight: '🏨',
        port: '⚓',
        airport: '✈️',
        refuel: '⛽',
        rest: '☕',
        scenic: '📸',
        custom: '📍',
      };

      for (const stop of routeStops) {
        const pos = L.latLng(stop.latitude, stop.longitude);
        const color = stopColors[stop.stopType] || '#6b7280';
        const emoji = stop.icon || stopEmojis[stop.stopType] || '📍';
        allBounds.push(pos);

        const stopIcon = L.divIcon({
          className: '',
          html: `<div style="
            display:flex;align-items:center;justify-content:center;
            width:32px;height:32px;border-radius:50%;
            background:${color};border:2.5px solid white;
            box-shadow:0 2px 6px rgba(0,0,0,0.35);
            font-size:16px;line-height:1;
          ">${emoji}</div>`,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        });

        const stopMarker = L.marker(pos, { icon: stopIcon, interactive: true, zIndexOffset: 9200 }).addTo(routeGroupRef.current!);
        const tooltipParts = [stop.name];
        if (stop.arrivalEstimate) tooltipParts.push(`Llegada: ${stop.arrivalEstimate}`);
        if (stop.departureEstimate) tooltipParts.push(`Salida: ${stop.departureEstimate}`);
        stopMarker.bindTooltip(tooltipParts.join(' · '), { direction: 'top', offset: [0, -18] });
        routeLayersRef.current.push(stopMarker);
      }
    }
  
   if (allBounds.length > 0 && mapRef.current && isNewRoute) {
   mapRef.current.fitBounds(L.latLngBounds(allBounds), { padding: [60, 60], animate: true });
   }
  };
 
  const handleClearRoute = () => {
   if (routeGroupRef.current) {
     routeGroupRef.current.clearLayers();
   }
   routeLayersRef.current = [];
  };

  // ─── Advisor preview: approximate arcs for AI recommendation segments ───
  const handleShowAdvisorPreview = (e: Event) => {
    const { segments } = (e as CustomEvent).detail || {};
    if (!mapRef.current) return;

    // Ensure layer group exists
    if (!advisorPreviewGroupRef.current) {
      advisorPreviewGroupRef.current = L.layerGroup().addTo(mapRef.current);
    }
    advisorPreviewGroupRef.current.clearLayers();

    if (!segments || !Array.isArray(segments) || segments.length === 0) return;

    const modeColors: Record<string, string> = {
      driving: '#3b82f6',
      car: '#3b82f6',
      camper_van: '#3b82f6',
      motorhome: '#3b82f6',
      ferry: '#0891b2',
      flight: '#9333ea',
      walking: '#22c55e',
      bicycle: '#f59e0b',
      train: '#6366f1',
    };

    const allBounds: L.LatLng[] = [];

    for (const seg of segments) {
      if (!seg.fromLat || !seg.toLat) continue;

      const from = L.latLng(seg.fromLat, seg.fromLng);
      const to = L.latLng(seg.toLat, seg.toLng);
      allBounds.push(from, to);

      // Generate arc points for visual appeal
      const numPoints = 30;
      const coords: L.LatLngExpression[] = [];
      for (let i = 0; i <= numPoints; i++) {
        const f = i / numPoints;
        const lat = seg.fromLat + (seg.toLat - seg.fromLat) * f;
        const lng = seg.fromLng + (seg.toLng - seg.fromLng) * f;
        coords.push([lat, lng]);
      }

      const modeKey = (seg.mode || 'driving').toLowerCase().replace(/[^a-z_]/g, '');
      const color = modeColors[modeKey] || '#6b7280';
      const isSea = modeKey === 'ferry' || modeKey === 'flight';

      const polyline = L.polyline(coords, {
        color,
        weight: 3.5,
        opacity: 0.7,
        dashArray: isSea ? '8, 8' : undefined,
        lineCap: 'round',
        interactive: false,
      }).addTo(advisorPreviewGroupRef.current!);

      // Add mode label at midpoint
      const midIdx = Math.floor(coords.length / 2);
      const midCoord = coords[midIdx] as [number, number];
      if (midCoord && seg.modeLabel) {
        const icon = L.divIcon({
          className: 'advisor-preview-label',
          html: `<div style="background:${color};color:white;padding:2px 6px;border-radius:10px;font-size:10px;font-weight:600;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,0.3)">${seg.modeLabel}</div>`,
          iconAnchor: [0, 0],
        });
        L.marker(midCoord, { icon, interactive: false }).addTo(advisorPreviewGroupRef.current!);
      }
    }

    if (allBounds.length > 0) {
      mapRef.current.fitBounds(L.latLngBounds(allBounds), { padding: [80, 80], animate: true });
    }
  };

  const handleClearAdvisorPreview = () => {
    if (advisorPreviewGroupRef.current) {
      advisorPreviewGroupRef.current.clearLayers();
    }
  };
 
  window.addEventListener('map-show-route', handleShowRoute);
  window.addEventListener('map-clear-route', handleClearRoute);
  window.addEventListener('map-show-advisor-preview', handleShowAdvisorPreview);
  window.addEventListener('map-clear-advisor-preview', handleClearAdvisorPreview);
   mapRef.current?.on('click', handleMapRouteClick);

 // Hover highlight: when user hovers an alternative in the sidebar, highlight it on map
 const handleAlternativeHover = (e: Event) => {
   const label = (e as CustomEvent).detail?.label;
   routeLayersRef.current.forEach((layer: any) => {
     if (layer._routeGroup == null || layer._baseOpacity == null) return;
     if (!label) {
       // Reset all to defaults
       layer.setStyle({ opacity: layer._baseOpacity, weight: layer._baseWeight });
     } else if (layer._routeGroup === 'primary') {
       // Dim primary when hovering an alternative
       layer.setStyle({ opacity: 0.2, weight: layer._baseWeight });
     } else if (layer._altLabel === label) {
       // Highlight the hovered alternative
       layer.setStyle({ opacity: 1, weight: layer._baseWeight + 3 });
     } else {
       // Dim other alternatives
       layer.setStyle({ opacity: 0.15, weight: layer._baseWeight });
     }
   });
 };
 window.addEventListener('route-alternative-hover', handleAlternativeHover);

 const handleResetView = () => {
 if (!mapRef.current) return;
 if (locations.length > 0) {
 const bounds = L.latLngBounds(locations.map(l => [l.coordinates.lat, l.coordinates.lng]));
 mapRef.current.fitBounds(bounds, { padding: [50, 50], animate: true });
 } else {
 mapRef.current.setView([20, 0], 3);
 }
 };
 window.addEventListener('map-reset-view', handleResetView);
 
 return () => {
 window.removeEventListener('enrichment-criteria-changed', handleCriteriaChanged);
 window.removeEventListener('location-realtime-update', handleRealtimeUpdate);
 window.removeEventListener('store-updated', handleRealtimeUpdate);
 window.removeEventListener('map-view-mode', handleViewModeChange);
 window.removeEventListener('map-go-home', handleGoHome);
 window.removeEventListener('map-set-theme', handleSetTheme);
 window.removeEventListener('map-fit-bounds', handleFitBounds);
 window.removeEventListener('curator-info-updated', handleRealtimeUpdate);
 window.removeEventListener('curator-info-updated', handleCuratorVisibilityUpdate);
 window.removeEventListener('measurement-units-changed', handleMeasurementUnitsChanged);
  window.removeEventListener('map-show-route', handleShowRoute);
  window.removeEventListener('map-clear-route', handleClearRoute);
  window.removeEventListener('map-show-advisor-preview', handleShowAdvisorPreview);
  window.removeEventListener('map-clear-advisor-preview', handleClearAdvisorPreview);
 window.removeEventListener('map-reset-view', handleResetView);
 window.removeEventListener('route-alternative-hover', handleAlternativeHover);
  mapRef.current?.off('click', handleMapRouteClick);
 };
 }, [mapCenterConfig]);

 const criteriaTimestamp = React.useMemo(() => loadCriteriaTimestamp(), [criteriaVersion]);
 const criteriaKey = React.useMemo(() => String(criteriaTimestamp), [criteriaTimestamp]);

 const { 
 selectedLocations, 
 toggleLocationSelection, 
 getFilteredLocations,
 focusedLocationId,
 setFocusedLocation,
 setFilters,
 filters,
 selectedDocument,
 getLocationOwnership,
 documents, // Subscribe directly to documents for reactivity
 } = useLocationsStore();
 
  // Get current user ID for ownership detection
 const [currentUserId, setCurrentUserId] = useState<string | null>(null);
 
  // Curator visibility zoom cache
 const [curatorVisibilityZooms, setCuratorVisibilityZooms] = useState<Map<string, number | null>>(new Map());
 
  // Get admin status for enrichment permissions (only master/admin can enrich)
 const { isAdmin } = usePermissions();
 const canEnrichLocations = isAdmin();
 
 useEffect(() => {
 import('@/integrations/supabase/client').then(({ supabase }) => {
 supabase.auth.getSession().then(({ data: { session } }) => {
 setCurrentUserId(session?.user?.id || null);
 });
 
      // Load all curators' visibility zoom levels
 supabase
 .from('curators')
 .select('id, min_visibility_zoom')
 .eq('is_active', true)
 .then(({ data }) => {
 if (data) {
 const zoomMap = new Map<string, number | null>();
 data.forEach(c => zoomMap.set(c.id, c.min_visibility_zoom));
 setCuratorVisibilityZooms(zoomMap);
 }
 });
 });
 }, []);
 
 const locations = getFilteredLocations();
  // Compute allLocations from documents (reactive) instead of calling getAllLocations()
 const allLocations = React.useMemo(() => 
 documents.flatMap(doc => doc.locations), 
 [documents]
 );
 const totalLocations = allLocations.length;

  // Generate a key from current filters to detect changes
 const filterKey = JSON.stringify({
 continent: filters.continent,
 country: filters.country,
 region: filters.region,
 zone: filters.zone,
 tag: filters.tag,
 placeType: filters.placeType,
 onlyEnriched: filters.onlyEnriched,
 searchTerm: filters.searchTerm,
 });

  // Generate a key that changes when enrichment data OR criteria change
  // Use selectedDocument.locations to ensure we detect changes from the store
  // Also include forceUpdateCount to trigger updates from realtime/store events
 const enrichmentKey = React.useMemo(() => {
 if (!selectedDocument) return `${criteriaKey}-${forceUpdateCount}`;

 return selectedDocument.locations.reduce((acc, loc) => {
 const ed = loc.enrichedData;
 const cd = loc.customData;
      // Note: user_rating, user_image_url, and enriched imagen are excluded from this key
      // because these updates are handled in-place by their respective event handlers
      // (rating-updated, photo-updated). Including them here would cause full popup 
      // regeneration which loses scroll position and causes visual glitches.
 const signature = ed
 ? [
 ed.descripcion?.length || 0,
            // Note: ed.imagen is excluded - handled by photo-updated event
 ed.datos_clave?.web_referencia ? 1 : 0,
 ed.etiquetas?.length || 0,
 ed.datos_clave?.tipo ? 1 : 0,
 ed.datos_clave?.acceso ? 1 : 0,
 ed.datos_clave?.estado_proteccion ? 1 : 0,
 ed.clasificacion?.codigo || 'nc',
 loc.continent ? 1 : 0,
 loc.country ? 1 : 0,
 loc.region ? 1 : 0,
            // Include visited but NOT user_rating or user_image (handled in-place)
 cd?.visited || '0',
 ].join(':')
 : `orig:${loc.description?.length || 0}:${cd?.visited || '0'}`;

 return acc + loc.id.slice(0, 4) + signature;
 }, `${criteriaKey}-${selectedDocument.locations.length}-${forceUpdateCount}-`);
 }, [selectedDocument?.locations, criteriaKey, selectedDocument, forceUpdateCount]);

  // Zoom to bounds function - fits all points in view
  // zoomOffset: 0 = fit all, 1 = one level closer (outer points outside view)
 const zoomToBounds = useCallback((immediate: boolean = false, zoomOffset: number = 0) => {
 if (!mapRef.current || locations.length === 0) return;
 
 const bounds = L.latLngBounds(
 locations.map(loc => [loc.coordinates.lat, loc.coordinates.lng] as [number, number])
 );
 
 if (immediate) {
      // Immediate fit without animation (for initial load)
 mapRef.current.fitBounds(bounds, { 
 padding: [50, 50], 
 maxZoom: 16,
 });
 
      // Apply zoom offset after fitting
 if (zoomOffset > 0) {
 const currentZoom = mapRef.current.getZoom();
 mapRef.current.setZoom(currentZoom + zoomOffset);
 }
 } else {
      // Animated fly for user interactions
 mapRef.current.flyToBounds(bounds, { 
 padding: [50, 50], 
 maxZoom: 16,
 duration: 0.8 
 });
 }
 
 setShowZoomButton(false);
 }, [locations]);

  // Apply map center based on user configuration
 const applyMapCenter = useCallback((immediate: boolean = true, config?: MapCenterConfig) => {
 if (!mapRef.current) return;
 
 const centerConfig = config || mapCenterConfig;
 console.log('Applying map center config:', centerConfig);
 
 if (centerConfig.mode === 'home' && centerConfig.homeLocation) {
      // Center on home location
 const { lat, lng } = centerConfig.homeLocation;
 if (immediate) {
 mapRef.current.setView([lat, lng], 12);
 } else {
 mapRef.current.flyTo([lat, lng], 12, { duration: 0.8 });
 }
      // Then zoom to show points with offset
 if (locations.length > 0) {
 setTimeout(() => zoomToBounds(immediate, 1), immediate ? 50 : 800);
 }
 } else if (centerConfig.mode === 'geolocation') {
      // Use GPS location
 if (navigator.geolocation) {
 navigator.geolocation.getCurrentPosition(
 (position) => {
 const { latitude, longitude } = position.coords;
 if (immediate) {
 mapRef.current?.setView([latitude, longitude], 12);
 } else {
 mapRef.current?.flyTo([latitude, longitude], 12, { duration: 0.8 });
 }
            // Then zoom to show points with offset
 if (locations.length > 0) {
 setTimeout(() => zoomToBounds(immediate, 1), immediate ? 50 : 800);
 }
 },
 (error) => {
 console.error('Geolocation error:', error);
 toast.error('No se pudo obtener tu ubicación GPS');
            // Fallback to auto
 if (locations.length > 0) {
 zoomToBounds(immediate, 1);
 }
 },
 { enableHighAccuracy: true, timeout: 10000 }
 );
 } else {
        // Fallback to auto
 if (locations.length > 0) {
 zoomToBounds(immediate, 1);
 }
 }
 } else {
      // Auto mode - zoom to show all points
 if (locations.length > 0) {
 zoomToBounds(immediate, 1);
 }
 }
 }, [locations, zoomToBounds, mapCenterConfig]);

  // Create home marker icon
 const createHomeMarkerIcon = useCallback(() => {
 return L.divIcon({
 className: 'home-marker-icon',
 html: `
 <div style="
 width: 24px;
 height: 24px;
 display: flex;
 align-items: center;
 justify-content: center;
 background: linear-gradient(135deg, hsl(142, 76%, 36%), hsl(142, 71%, 28%));
 border-radius: 50%;
 border: 2px solid white;
 box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
 ">
 <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
 <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
 <polyline points="9 22 9 12 15 12 15 22"/>
 </svg>
 </div>
 `,
 iconSize: [24, 24],
 iconAnchor: [12, 12],
 });
 }, []);

  // Create user location marker icon (pulsing blue dot)
 const createUserLocationIcon = useCallback(() => {
 return L.divIcon({
 className: 'user-location-icon',
 html: `
 <div style="position: relative;">
 <div style="
 width: 16px;
 height: 16px;
 background: #3b82f6;
 border-radius: 50%;
 border: 3px solid white;
 box-shadow: 0 2px 6px rgba(59, 130, 246, 0.5);
 animation: userLocationPulse 2s ease-in-out infinite;
 "></div>
 <div style="
 position: absolute;
 top: 50%;
 left: 50%;
 transform: translate(-50%, -50%);
 width: 40px;
 height: 40px;
 background: rgba(59, 130, 246, 0.2);
 border-radius: 50%;
 animation: userLocationRipple 2s ease-out infinite;
 "></div>
 </div>
 `,
 iconSize: [16, 16],
 iconAnchor: [8, 8],
 });
 }, []);

  // Get user's current location
 useEffect(() => {
 if (!navigator.geolocation) return;

 const watchId = navigator.geolocation.watchPosition(
 (position) => {
 setUserLocation({
 lat: position.coords.latitude,
 lng: position.coords.longitude,
 accuracy: position.coords.accuracy,
 });
 },
 (error) => {
 console.log('Geolocation error:', error.message);
 },
 {
 enableHighAccuracy: true,
 timeout: 10000,
 maximumAge: 30000,
 }
 );

 return () => navigator.geolocation.clearWatch(watchId);
 }, []);

  // Update user location marker
 useEffect(() => {
 if (!mapRef.current || !userLocation) return;

    // Remove existing markers
 if (userLocationMarkerRef.current) {
 mapRef.current.removeLayer(userLocationMarkerRef.current);
 }
 if (userLocationCircleRef.current) {
 mapRef.current.removeLayer(userLocationCircleRef.current);
 }

    // Add accuracy circle
 const accuracyCircle = L.circle([userLocation.lat, userLocation.lng], {
 radius: Math.min(userLocation.accuracy, 500), // Cap at 500m
 color: '#3b82f6',
 fillColor: '#3b82f6',
 fillOpacity: 0.1,
 weight: 1,
 opacity: 0.3,
 });
 accuracyCircle.addTo(mapRef.current);
 userLocationCircleRef.current = accuracyCircle;

    // Add marker
 const marker = L.marker([userLocation.lat, userLocation.lng], {
 icon: createUserLocationIcon(),
 zIndexOffset: 3000, // Above home marker
 });

 marker.bindPopup(`
 <div style="text-align: center; padding: 8px;">
 <div style="font-weight: 600; font-size: 14px; margin-bottom: 4px; color: #3b82f6;">
 Tu ubicación
 </div>
 <div style="font-size: 11px; color: #6b7280;">
 ${userLocation.lat.toFixed(6)}, ${userLocation.lng.toFixed(6)}
 </div>
 <div style="font-size: 10px; color: #9ca3af; margin-top: 4px;">
 Precisión: ±${Math.round(userLocation.accuracy)}m
 </div>
 </div>
 `);

 marker.addTo(mapRef.current);
 userLocationMarkerRef.current = marker;
 }, [userLocation, createUserLocationIcon]);

  // Update home marker when config changes
 useEffect(() => {
 if (!mapRef.current) return;

    // Remove existing home marker
 if (homeMarkerRef.current) {
 mapRef.current.removeLayer(homeMarkerRef.current);
 homeMarkerRef.current = null;
 }

    // Add new home marker if home mode is set
 if (mapCenterConfig.mode === 'home' && mapCenterConfig.homeLocation) {
 const { lat, lng, name } = mapCenterConfig.homeLocation;
 const homeMarker = L.marker([lat, lng], {
 icon: createHomeMarkerIcon(),
 zIndexOffset: 2000, // Above other markers
 });

 homeMarker.bindPopup(`
 <div style="text-align: center; padding: 8px;">
 <div style="font-weight: 600; font-size: 14px; margin-bottom: 4px;">
 ${name || 'Mi casa'}
 </div>
 <div style="font-size: 12px; color: #6b7280;">
 ${lat.toFixed(6)}, ${lng.toFixed(6)}
 </div>
 </div>
 `);

 homeMarker.addTo(mapRef.current);
 homeMarkerRef.current = homeMarker;
 }
 }, [mapCenterConfig, createHomeMarkerIcon]);

  // Auto-zoom when filters change OR on initial load
  // Ref to track if initial zoom has happened
 const initialZoomDoneRef = useRef(false);
 
 useEffect(() => {
    // Wait for map center config to load before applying initial center
 if (!mapRef.current || locations.length === 0 || mapCenterLoading) return;
 
 const filterChanged = prevFilterKeyRef.current !== filterKey;
 const isInitialLoad = !initialZoomDoneRef.current;
 
    // Auto-zoom on initial load OR when filters change
 if (isInitialLoad) {
      // Initial load - apply map center configuration
 setTimeout(() => {
 applyMapCenter(true, mapCenterConfig);
 initialZoomDoneRef.current = true;
 }, 100);
 } else if (filterChanged) {
      // Filter change (including search) - animated transition to fit all filtered results
 setTimeout(() => {
 zoomToBounds(false, 0);
 }, 150);
 }
 
 prevFilterKeyRef.current = filterKey;
 prevLocationsCountRef.current = locations.length;
 }, [filterKey, locations.length, zoomToBounds, applyMapCenter, mapCenterLoading, mapCenterConfig]);
 
  // Re-apply center when config changes (user saved new settings)
 useEffect(() => {
 if (centerConfigVersion > 0 && mapRef.current && !mapCenterLoading) {
      // Reload config and apply
 applyMapCenter(false);
 }
 }, [centerConfigVersion, applyMapCenter, mapCenterLoading]);

  // Show zoom button when user pans away
 useEffect(() => {
 if (!mapRef.current) return;
 
 const checkBounds = () => {
 if (!mapRef.current || locations.length === 0) return;
 
 const mapBounds = mapRef.current.getBounds();
 const locationsInView = locations.filter(loc => 
 mapBounds.contains([loc.coordinates.lat, loc.coordinates.lng])
 );
 
      // Show button if less than 50% of locations are in view
 setShowZoomButton(locationsInView.length < locations.length * 0.5);
 };
 
 mapRef.current.on('moveend', checkBounds);
 
 return () => {
 mapRef.current?.off('moveend', checkBounds);
 };
 }, [locations]);

  // Handle filter link clicks from popups
 useEffect(() => {
 const handleFilterClick = (e: MouseEvent) => {
 const target = e.target as HTMLElement;
 if (target.classList.contains('filter-link')) {
 e.preventDefault();
 e.stopPropagation();
 
 const filterType = target.dataset.filterType as 'zone' | 'region' | 'country' | 'continent' | 'searchTerm' | 'tag';
 const filterValue = target.dataset.filterValue;
 
 if (filterType && filterValue) {
 if (filterType === 'searchTerm') {
            // When clicking on a hashtag/classification, clear ALL other filters to prevent zero results
 setFilters({ 
 searchTerm: filterValue,
              // Clear all other filters
 continent: undefined,
 country: undefined,
 region: undefined,
 zone: undefined,
 tag: undefined,
 classificationCode: undefined,
 placeType: undefined,
 });
 } else if (filterType === 'tag') {
            // Clear all geography and other filters when filtering by tag (inverse filter)
 setFilters({ 
 tag: filterValue,
 continent: undefined,
 country: undefined,
 region: undefined,
 zone: undefined,
 searchTerm: undefined,
 classificationCode: undefined,
 });
 } else if (filterType === 'continent') {
            // Clear children when setting continent
 setFilters({ ...filters, continent: filterValue, country: undefined, region: undefined, zone: undefined });
 } else if (filterType === 'country') {
            // Clear children when setting country
 setFilters({ ...filters, country: filterValue, region: undefined, zone: undefined });
 } else if (filterType === 'region') {
            // Clear children when setting region
 setFilters({ ...filters, region: filterValue, zone: undefined });
 } else {
 setFilters({ ...filters, [filterType]: filterValue });
 }
 }
 }
 };

 document.addEventListener('click', handleFilterClick);
 return () => document.removeEventListener('click', handleFilterClick);
 }, [setFilters, filters]);

  // Handle popup action button clicks
 useEffect(() => {
 const handleActionClick = (e: MouseEvent) => {
 const target = e.target as HTMLElement;
 const button = target.closest('.popup-action-btn') as HTMLElement | null;
 
 if (button) {
 e.preventDefault();
 e.stopPropagation();
 
 const action = button.dataset.action;
 const locationId = button.dataset.locationId;
 const rating = button.dataset.rating;
 const locationName = button.dataset.locationName;
 
 if (action && locationId) {
          // Dispatch custom event that will be handled by the app
 window.dispatchEvent(new CustomEvent('popup-action', {
 detail: { action, locationId, rating, locationName }
 }));
 }
 }
 
      // Handle tech toggle button
 const toggleBtn = target.closest('.popup-toggle-tech') as HTMLElement | null;
 if (toggleBtn) {
 e.preventDefault();
 e.stopPropagation();
 
 const popupId = toggleBtn.dataset.popupId;
 if (popupId) {
 const content = document.querySelector(`.tech-content[data-popup-id="${popupId}"]`) as HTMLElement;
 const arrow = toggleBtn.querySelector('.toggle-arrow') as HTMLElement;
 
 if (content) {
 const isHidden = content.style.display === 'none';
 content.style.display = isHidden ? 'block' : 'none';
 if (arrow) {
 arrow.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
 }
 }
 }
 }
 
      // Handle original description toggle button
 const toggleOriginalBtn = target.closest('.popup-toggle-original') as HTMLElement | null;
 if (toggleOriginalBtn) {
 e.preventDefault();
 e.stopPropagation();
 
 const popupId = toggleOriginalBtn.dataset.popupId;
 if (popupId) {
 const content = document.querySelector(`.original-content[data-popup-id="${popupId}"]`) as HTMLElement;
 const arrow = toggleOriginalBtn.querySelector('.toggle-arrow-original') as HTMLElement;
 
 if (content) {
 const isHidden = content.style.display === 'none';
 content.style.display = isHidden ? 'block' : 'none';
 if (arrow) {
 arrow.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
 }
 }
 }
 }
 
      // Handle community validation toggle button
 const toggleCommunityBtn = target.closest('.popup-toggle-community') as HTMLElement | null;
 if (toggleCommunityBtn) {
 e.preventDefault();
 e.stopPropagation();
 
 const popupId = toggleCommunityBtn.dataset.popupId;
 if (popupId) {
 const content = document.querySelector(`.community-content[data-popup-id="${popupId}"]`) as HTMLElement;
 const arrow = toggleCommunityBtn.querySelector('.toggle-arrow-community') as HTMLElement;
 
 if (content) {
 const isHidden = content.style.display === 'none';
 content.style.display = isHidden ? 'block' : 'none';
 if (arrow) {
 arrow.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
 }
 
            // When opening, load reviews and check distance
 if (isHidden) {
 const locationId = content.dataset.locationId;
 const curatorId = content.dataset.curatorId;
 if (locationId) {
 loadCommunityReviews(locationId, curatorId || '');
 }
 }
 }
 }
 }
 
      // Handle community rating star clicks
 const ratingStar = target.closest('.community-rating-star') as HTMLElement | null;
 if (ratingStar) {
 e.preventDefault();
 e.stopPropagation();
 
 const rating = parseInt(ratingStar.dataset.rating || '0');
 const container = ratingStar.closest('.community-rating-input') as HTMLElement;
 if (container) {
 container.dataset.selectedRating = String(rating);
 const stars = container.querySelectorAll('.community-rating-star');
 stars.forEach((star, idx) => {
 (star as HTMLElement).textContent = idx < rating ? '' : '';
 (star as HTMLElement).style.color = idx < rating ? '#f59e0b' : '#d1d5db';
 });
 }
 }
 
      // Handle community review submit
 const submitBtn = target.closest('[data-action="submit-community-review"]') as HTMLElement | null;
 if (submitBtn) {
 e.preventDefault();
 e.stopPropagation();
 
 const locationId = submitBtn.dataset.locationId;
 if (locationId) {
 submitCommunityReview(locationId);
 }
 }
 };

 document.addEventListener('click', handleActionClick);
 return () => document.removeEventListener('click', handleActionClick);
 }, []);

  // Handle notes-updated event to refresh popup
 useEffect(() => {
 const handleNotesUpdated = (e: Event) => {
 const customEvent = e as CustomEvent<{ locationId: string; notes: string; visibility: string }>;
 const { locationId } = customEvent.detail;
 
      // Find the marker and refresh its popup
 const marker = markersRef.current.get(locationId);
 const location = locationsRef.current.get(locationId);
 
 if (marker && location) {
        // Update the location's customData locally for immediate UI feedback
 const updatedLocation = {
 ...location,
 customData: {
 ...location.customData,
 has_notes: 'true',
 }
 };
 locationsRef.current.set(locationId, updatedLocation);
 
        // Regenerate popup content with ownership info
 const ownership = getLocationOwnership(locationId, currentUserId);
 marker.setPopupContent(createPopupContent(updatedLocation, criteriaTimestamp, ownership, canEnrichLocations));
 
        // Reopen popup if it was open
 if (marker.isPopupOpen()) {
 marker.openPopup();
 }
 }
 };

 window.addEventListener('notes-updated', handleNotesUpdated);
 return () => window.removeEventListener('notes-updated', handleNotesUpdated);
 }, [criteriaTimestamp, getLocationOwnership, currentUserId, canEnrichLocations]);

  // Handle photo-updated event to refresh popup after photo upload/delete
 useEffect(() => {
 const handlePhotoUpdated = (e: Event) => {
 const customEvent = e as CustomEvent<{ locationId: string; imageUrl: string | null; visibility?: string | null; isDefaultImage?: boolean }>;
 const { locationId, imageUrl, visibility, isDefaultImage } = customEvent.detail;
 
      // Find the marker and refresh its popup
 const marker = markersRef.current.get(locationId);
 const location = locationsRef.current.get(locationId);
 
 if (marker && location) {
 let updatedLocation = { ...location };
 
 if (isDefaultImage && imageUrl) {
          // Admin set official image - update enrichedData
 const currentEnriched = location.enrichedData || {} as any;
 updatedLocation = {
 ...location,
 enrichedData: {
 ...currentEnriched,
 imagen: imageUrl,
 } as any,
 };
 } else {
          // User's personal image - update customData
 const updatedCustomData = { ...location.customData };
 if (imageUrl) {
 updatedCustomData.user_image_url = imageUrl;
 updatedCustomData.user_image_visibility = visibility || 'private';
 } else {
 delete updatedCustomData.user_image_url;
 delete updatedCustomData.user_image_visibility;
 }
 
 updatedLocation = {
 ...location,
 customData: Object.keys(updatedCustomData).length ? updatedCustomData : undefined,
 };
 }
 
 locationsRef.current.set(locationId, updatedLocation);
 
        // Regenerate popup content with ownership info
 const ownership = getLocationOwnership(locationId, currentUserId);
 marker.setPopupContent(createPopupContent(updatedLocation, criteriaTimestamp, ownership, canEnrichLocations));
 
        // Reopen popup if it was open
 if (marker.isPopupOpen()) {
 marker.openPopup();
 }
 }
 };

 window.addEventListener('photo-updated', handlePhotoUpdated);
 return () => window.removeEventListener('photo-updated', handlePhotoUpdated);
 }, [criteriaTimestamp, getLocationOwnership, currentUserId, canEnrichLocations]);

  // Handle visited-updated event to update popup elements in-place (without full regeneration)
 useEffect(() => {
 const upsertRatingUi = (parent: HTMLElement, locationId: string, ratingValue: number, allowRating: boolean) => {
 const starButtons = Array.from(
 parent.querySelectorAll(`button[data-action="set-rating"][data-location-id="${locationId}"]`)
 ) as HTMLButtonElement[];

 const hasStars = starButtons.length > 0;
 const currentRating = Number.isFinite(ratingValue) ? ratingValue : 0;

 if (!allowRating && hasStars) {
 const container = starButtons[0]?.parentElement as HTMLElement | null;
 if (container) container.remove();
 return;
 }

 if (allowRating && !hasStars) {
 const starsHtml = `
 <div style="display: inline-flex; align-items: center; gap: 2px;" title="Tu valoración personal">
 ${[1, 2, 3, 4, 5]
 .map(
 (star) => `
 <button 
 class="popup-action-btn" 
 data-action="set-rating" 
 data-location-id="${locationId}"
 data-rating="${star}"
 style="background: none; border: none; padding: 0; cursor: pointer; font-size: 14px; transition: transform 0.1s; color: ${currentRating >= star ? '#f59e0b' : '#d1d5db'};"
 title="Valorar ${star} estrella${star > 1 ? 's' : ''}"
 >${currentRating >= star ? '' : ''}</button>
 `
 )
 .join('')}
 ${currentRating > 0 ? `
 <button 
 class="popup-action-btn" 
 data-action="clear-rating" 
 data-location-id="${locationId}"
 style="background: none; border: none; padding: 0 0 0 3px; cursor: pointer; font-size: 10px; color: #9ca3af;"
 title="Quitar valoración"
 ></button>
 ` : ''}
 </div>
 `;

 const visitedBtn = parent.querySelector(
 `[data-action="toggle-visited"][data-location-id="${locationId}"]`
 ) as HTMLElement | null;
 visitedBtn?.insertAdjacentHTML('afterend', starsHtml);
 return;
 }

 if (hasStars) {
        // Update star fill
 starButtons.forEach((btn) => {
 const star = Number(btn.getAttribute('data-rating') || '0');
 const filled = currentRating >= star;
 btn.textContent = filled ? '' : '';
 btn.style.color = filled ? '#f59e0b' : '#d1d5db';
 });

        // Update clear button
 const clearBtn = parent.querySelector(
 `button[data-action="clear-rating"][data-location-id="${locationId}"]`
 ) as HTMLButtonElement | null;

 if (currentRating > 0 && !clearBtn) {
 starButtons[starButtons.length - 1]?.insertAdjacentHTML(
 'afterend',
 `
 <button 
 class="popup-action-btn" 
 data-action="clear-rating" 
 data-location-id="${locationId}"
 style="background: none; border: none; padding: 0 0 0 3px; cursor: pointer; font-size: 10px; color: #9ca3af;"
 title="Quitar valoración"
 ></button>
 `
 );
 }

 if (currentRating === 0 && clearBtn) {
 clearBtn.remove();
 }
 }
 };

 const handleVisitedUpdated = (e: Event) => {
 const customEvent = e as CustomEvent<{
 locationId: string;
 visited: boolean;
 distance?: number;
 customData?: Record<string, unknown>;
 }>;
 const { locationId, visited, customData } = customEvent.detail;

 const visitedBtn = document.querySelector(
 `[data-action="toggle-visited"][data-location-id="${locationId}"]`
 ) as HTMLElement | null;

      // Update the location ref for future popup regenerations
 const location = locationsRef.current.get(locationId);
 const newCustomData: Record<string, string> = customData
 ? Object.fromEntries(Object.entries(customData).map(([k, v]) => [k, String(v)]))
 : {
 ...(location?.customData || {}),
 visited: visited ? 'true' : 'false',
 };

 if (location) {
 locationsRef.current.set(locationId, {
 ...location,
 customData: newCustomData,
 updatedAt: new Date(),
 });
 }

 if (!visitedBtn) return;

      // Update visited button styles
 visitedBtn.style.background = visited ? '#dcfce7' : '#fff';
 visitedBtn.style.color = visited ? '#166534' : '#6b7280';
 visitedBtn.style.borderColor = visited ? '#86efac' : '#e5e7eb';
 visitedBtn.title = visited ? 'Click para desmarcar' : 'Marcar como visitado';

 const svg = visitedBtn.querySelector('svg');
 if (svg) svg.setAttribute('fill', visited ? 'currentColor' : 'none');

      // Update rating UI (show/hide + fill) without regenerating popup
 const parent = visitedBtn.parentElement as HTMLElement | null;
 if (parent) {
 const ratingValue = parseInt(newCustomData.user_rating || '0') || 0;
 const allowRating =
 canEnrichLocations ||
 !!newCustomData.visited_verified_at ||
 !!newCustomData.oldest_geotagged_photo_date;

 upsertRatingUi(parent, locationId, ratingValue, allowRating);
 }
 };

 window.addEventListener('visited-updated', handleVisitedUpdated);
 return () => window.removeEventListener('visited-updated', handleVisitedUpdated);
 }, [canEnrichLocations]);

  // Handle rating-updated event to update stars in-place (without full regeneration)
 useEffect(() => {
 const handleRatingUpdated = (e: Event) => {
 const customEvent = e as CustomEvent<{
 locationId: string;
 rating: string;
 customData?: Record<string, unknown>;
 }>;
 const { locationId, rating, customData } = customEvent.detail;

 const ratingValue = parseInt(rating || '0') || 0;

      // Update stars (if visible)
 const starButtons = Array.from(
 document.querySelectorAll(`button[data-action="set-rating"][data-location-id="${locationId}"]`)
 ) as HTMLButtonElement[];

 starButtons.forEach((btn) => {
 const star = Number(btn.getAttribute('data-rating') || '0');
 const filled = ratingValue >= star;
 btn.textContent = filled ? '' : '';
 btn.style.color = filled ? '#f59e0b' : '#d1d5db';
 });

      // Toggle clear button
 const parent = starButtons[0]?.parentElement as HTMLElement | undefined;
 if (parent) {
 const clearBtn = parent.querySelector(
 `button[data-action="clear-rating"][data-location-id="${locationId}"]`
 ) as HTMLButtonElement | null;

 if (ratingValue > 0 && !clearBtn) {
 starButtons[starButtons.length - 1]?.insertAdjacentHTML(
 'afterend',
 `
 <button 
 class="popup-action-btn" 
 data-action="clear-rating" 
 data-location-id="${locationId}"
 style="background: none; border: none; padding: 0 0 0 3px; cursor: pointer; font-size: 10px; color: #9ca3af;"
 title="Quitar valoración"
 ></button>
 `
 );
 }

 if (ratingValue === 0 && clearBtn) {
 clearBtn.remove();
 }
 }

      // Update location ref
 const location = locationsRef.current.get(locationId);
 if (location) {
 const cd = customData
 ? Object.fromEntries(Object.entries(customData).map(([k, v]) => [k, String(v)]))
 : { ...(location.customData || {}), user_rating: rating || '' };

 locationsRef.current.set(locationId, {
 ...location,
 customData: cd,
 updatedAt: new Date(),
 });
 }
 };

 window.addEventListener('rating-updated', handleRatingUpdated);
 return () => window.removeEventListener('rating-updated', handleRatingUpdated);
 }, []);

 useEffect(() => {
 if (!mapContainerRef.current || mapRef.current) return;

    // Define world bounds to prevent map from repeating
 const worldBounds = L.latLngBounds(
 L.latLng(-85, -180), // Southwest corner
 L.latLng(85, 180) // Northeast corner
 );

 mapRef.current = L.map(mapContainerRef.current, {
 center: [20, 0],
 zoom: 2,
 minZoom: 2, // Prevent zooming out too far
 maxBounds: worldBounds,
 maxBoundsViscosity: 1.0, // Completely restrict panning outside bounds
 scrollWheelZoom: true,
 worldCopyJump: false, // Prevent world from wrapping
 });

    // Add tile layer
 const tileConfig = MAP_TILE_LAYERS[mapTheme];
 tileLayerRef.current = L.tileLayer(tileConfig.url, {
 attribution: tileConfig.attribution,
 maxZoom: 19,
 noWrap: true, // Prevent tiles from repeating
 }).addTo(mapRef.current);

    // Scale control removed - using custom MapScaleBar component instead

    // Initialize marker cluster group
 markerClusterRef.current = L.markerClusterGroup({
 maxClusterRadius: 50,
 spiderfyOnMaxZoom: true,
 showCoverageOnHover: false,
 zoomToBoundsOnClick: true,
 disableClusteringAtZoom: 16,
 chunkedLoading: true,
 iconCreateFunction: (cluster) => {
 const count = cluster.getChildCount();
 let size = 'small';
 if (count > 50) size = 'large';
 else if (count > 10) size = 'medium';
 
 return L.divIcon({
 html: `<div><span>${count}</span></div>`,
 className: `marker-cluster marker-cluster-${size}`,
 iconSize: L.point(40, 40),
 });
 },
 });

    // Cluster layer not added by default anymore

 return () => {
 if (mapRef.current) {
 mapRef.current.remove();
 mapRef.current = null;
 }
 };
 }, []);

  // Update tile layer when theme changes
 useEffect(() => {
 if (!mapRef.current || !tileLayerRef.current) return;
 
 const tileConfig = MAP_TILE_LAYERS[mapTheme];
 tileLayerRef.current.setUrl(tileConfig.url);
 }, [mapTheme]);

  // Track pending popup to open after marker updates
 const pendingPopupRef = useRef<string | null>(null);

  // Only recreate markers when location list changes (add/remove), not on enrichment updates
 const locationIds = React.useMemo(() => locations.map(l => l.id).sort().join(','), [locations]);
 
 useEffect(() => {
 if (!mapRef.current || !markerClusterRef.current) return;

    // Clear existing markers from map
 markersRef.current.forEach(marker => marker.remove());
 markersRef.current.clear();
 locationsRef.current.clear();

 if (locations.length === 0) return;

 const markersToAdd: L.Marker[] = [];

    // Add new markers
 locations.forEach((location) => {
 const isSelected = selectedLocations.has(location.id);
 const isFocused = focusedLocationId === location.id;
 const isEnriched = !!location.enrichedData;
 const ownership = getLocationOwnership(location.id, currentUserId);

 const marker = L.marker([location.coordinates.lat, location.coordinates.lng], {
 icon: createCustomIcon(isSelected, isFocused, isEnriched, location, criteriaTimestamp, false, ownership.isOwn, { ownerName: ownership.ownerName, ownerId: ownership.ownerId, curatorId: ownership.curatorId, curatorIcon: ownership.curatorIcon, curatorColor: ownership.curatorColor }),
 });

      // Create popup with content including ownership info
 const popupContent = createPopupContent(location, criteriaTimestamp, ownership, canEnrichLocations);
 marker.bindPopup(popupContent, {
 maxWidth: 380,
 minWidth: 280,
 className: 'custom-popup',
 closeButton: true,
 autoPan: true,
 autoPanPadding: L.point(50, 50),
 });

 marker.on('click', function (this: L.Marker) {
 this.openPopup();
 
        // Wait for popup to render, then pan to center it vertically
 setTimeout(() => {
 const map = mapRef.current;
 if (!map) return;
 
 const popup = this.getPopup();
 if (!popup || !popup.isOpen()) return;
 
          // Get popup element and its actual height
 const popupElement = popup.getElement();
 if (!popupElement) return;
 
 const popupRect = popupElement.getBoundingClientRect();
 const popupHeight = popupRect.height;
 
          // Get map container dimensions
 const container = map.getContainer();
 const containerRect = container.getBoundingClientRect();
 const viewportHeight = containerRect.height;
 
          // Get marker position in container coordinates
 const markerLatLng = this.getLatLng();
 const markerPoint = map.latLngToContainerPoint(markerLatLng);
 
          // The popup appears ABOVE the marker
          // We want the popup to be vertically centered in the viewport
          // So the marker should be positioned at: viewportCenter + popupHeight/2
 const idealMarkerY = (viewportHeight / 2) + (popupHeight / 2);
 
          // Calculate how much to pan
 const offsetY = markerPoint.y - idealMarkerY;
 
          // Only pan if the offset is significant
 if (Math.abs(offsetY) > 30) {
 map.panBy([0, offsetY], { animate: true, duration: 0.35 });
 }
 }, 100);
 });

 marker.on('dblclick', () => {
 toggleLocationSelection(location.id);
 });

 marker.on('popupclose', () => {
 if (focusedLocationId === location.id) {
 setFocusedLocation(null);
 }
 });

 markersRef.current.set(location.id, marker);
 locationsRef.current.set(location.id, location);
 
      // Add marker to map (will be hidden in heatmap mode)
 marker.addTo(mapRef.current!);
 });

    // Fit bounds only on initial load
 if (locations.length > 0 && prevLocationsCountRef.current === 0) {
 const bounds = L.latLngBounds(
 locations.map(loc => [loc.coordinates.lat, loc.coordinates.lng] as [number, number])
 );
 mapRef.current.fitBounds(bounds, { 
 padding: [50, 50], 
 maxZoom: 12 
 });
 }
 }, [locationIds, toggleLocationSelection, setFocusedLocation, viewMode]);

  // Handle view mode changes (heatmap/markers)
 useEffect(() => {
 if (!mapRef.current) return;
 
    // Handle heatmap layer
 if (viewMode === 'heatmap') {
      // Remove old heat layer if exists
 if (heatLayerRef.current && mapRef.current.hasLayer(heatLayerRef.current)) {
 mapRef.current.removeLayer(heatLayerRef.current);
 }
 
      // Calculate dynamic intensity based on point density
 const pointCount = locations.length;
 
      // For few points, use higher individual intensity
      // For many points, let clustering create natural hotspots
 const baseIntensity = pointCount <= 1 ? 1.0 : 
 pointCount <= 10 ? 0.8 : 
 pointCount <= 50 ? 0.6 : 
 pointCount <= 200 ? 0.4 : 0.3;
 
      // Dynamic radius: larger for fewer points, smaller for many
 const dynamicRadius = pointCount <= 1 ? 50 : 
 pointCount <= 10 ? 40 : 
 pointCount <= 50 ? 30 : 
 pointCount <= 200 ? 25 : 20;
 
      // Dynamic blur: more blur for fewer points for smoother appearance
 const dynamicBlur = pointCount <= 1 ? 30 : 
 pointCount <= 10 ? 25 : 
 pointCount <= 50 ? 20 : 15;
 
      // Create heat data from locations with dynamic intensity
 const heatData: [number, number, number][] = locations.map(loc => [
 loc.coordinates.lat,
 loc.coordinates.lng,
 baseIntensity
 ]);
 
      // Normalize max based on expected clustering
 const dynamicMax = pointCount <= 1 ? 0.5 : 
 pointCount <= 10 ? 0.6 : 
 pointCount <= 50 ? 0.8 : 1.0;
 
      // Create new heat layer with optimized settings
 heatLayerRef.current = L.heatLayer(heatData, {
 radius: dynamicRadius,
 blur: dynamicBlur,
 maxZoom: 18,
 max: dynamicMax,
 minOpacity: 0.4, // Ensure minimum visibility
 gradient: {
 0.0: '#60a5fa', // Lighter blue for better visibility
 0.2: '#22c55e', 
 0.4: '#84cc16',
 0.6: '#eab308',
 0.8: '#f97316',
 1.0: '#dc2626'
 }
 });
 
 heatLayerRef.current.addTo(mapRef.current);
 
      // Hide markers in heatmap mode but keep them for popup interactions
 markersRef.current.forEach(marker => {
 const icon = marker.getIcon() as L.DivIcon;
 if (icon.options.className) {
 marker.setOpacity(0);
 }
 });
 } else {
      // Remove heat layer
 if (heatLayerRef.current && mapRef.current.hasLayer(heatLayerRef.current)) {
 mapRef.current.removeLayer(heatLayerRef.current);
 heatLayerRef.current = null;
 }
 
      // Show markers again
 markersRef.current.forEach(marker => {
 marker.setOpacity(1);
 });
 }
 }, [viewMode, locations]);

  // Update popup content and icons when enrichment data changes (without recreating markers)
 useEffect(() => {
 if (!mapRef.current) return;
 
 locations.forEach(location => {
 const marker = markersRef.current.get(location.id);
 if (!marker) return;
 
      // Verify location has valid data before updating popup
 if (!location || !location.id) return;
 
      // Update the stored location reference
 locationsRef.current.set(location.id, location);
 
      // Update popup content - with safety check and ownership info
 try {
 const ownership = getLocationOwnership(location.id, currentUserId);
 const popupContent = createPopupContent(location, criteriaTimestamp, ownership, canEnrichLocations);
 marker.setPopupContent(popupContent);
 } catch (e) {
 console.warn('Error updating popup content for location:', location.id, e);
 }
 
      // Update icon
 const isSelected = selectedLocations.has(location.id);
 const isFocused = focusedLocationId === location.id;
 const isEnriched = !!location.enrichedData;
 const isRecentlyEnriched = recentlyEnrichedIds.has(location.id);
 const ownership = getLocationOwnership(location.id, currentUserId);
 marker.setIcon(createCustomIcon(isSelected, isFocused, isEnriched, location, criteriaTimestamp, isRecentlyEnriched, ownership.isOwn, { ownerName: ownership.ownerName, ownerId: ownership.ownerId, curatorId: ownership.curatorId, curatorIcon: ownership.curatorIcon, curatorColor: ownership.curatorColor }));
 });
 
    // Open pending popup if any
 if (pendingPopupRef.current) {
 const marker = markersRef.current.get(pendingPopupRef.current);
 if (marker) {
 marker.openPopup();
 }
 pendingPopupRef.current = null;
 }
 }, [enrichmentKey, selectedLocations, focusedLocationId, criteriaTimestamp, recentlyEnrichedIds, getLocationOwnership, currentUserId, canEnrichLocations]);

  // Initialize the previous enrichment state on first load (to avoid false positives)
 const isInitializedRef = useRef(false);
 
 useEffect(() => {
    // On first render, populate the ref with current enrichment states without triggering animations
 if (!isInitializedRef.current && allLocations.length > 0) {
 allLocations.forEach(loc => {
        // Store description length: 0 = not enriched, >0 = enriched
 previousEnrichmentStateRef.current.set(loc.id, loc.enrichedData?.descripcion?.length || 0);
 });
 isInitializedRef.current = true;
 console.log('Initialized enrichment state tracking for', allLocations.length, 'locations');
 }
 }, [allLocations]); // Use allLocations instead of just length to detect reference changes

  // Detect newly enriched locations and trigger animation + open popup
 useEffect(() => {
    // Skip if not initialized yet
 if (!isInitializedRef.current) return;
 
 console.log('Checking for enrichment changes, allLocations count:', allLocations.length);
 
 const newlyEnriched: string[] = [];
 
    // Use allLocations (not filtered) to detect any enrichment changes
 allLocations.forEach(loc => {
 const prevDescLength = previousEnrichmentStateRef.current.get(loc.id) ?? -1;
 const currentDescLength = loc.enrichedData?.descripcion?.length || 0;
 
      // If this location wasn't tracked before (-1), add it now
 if (prevDescLength === -1) {
 previousEnrichmentStateRef.current.set(loc.id, currentDescLength);
 console.log('New location tracked:', loc.name, 'desc length:', currentDescLength);
 return; // Don't trigger animation for newly tracked locations
 }
 
      // Detect NEW enrichment (from 0 to >0) OR significant content update
 const wasNotEnriched = prevDescLength === 0;
 const isNowEnriched = currentDescLength > 0;
 const hasSignificantChange = currentDescLength > prevDescLength + 50; // More than 50 chars added
 
 if ((wasNotEnriched && isNowEnriched) || hasSignificantChange) {
 newlyEnriched.push(loc.id);
 console.log('Newly enriched location detected:', loc.name, loc.id, 
 'prev:', prevDescLength, 'current:', currentDescLength);
 }
 
      // Update previous state
 previousEnrichmentStateRef.current.set(loc.id, currentDescLength);
 });
 
 if (newlyEnriched.length > 0) {
 console.log(' Triggering celebration for:', newlyEnriched.length, 'locations');
 
      // Play celebration sound
 playEnrichmentComplete();
 
      // Show toast for each enriched location
 newlyEnriched.forEach(id => {
 const loc = allLocations.find(l => l.id === id);
 if (loc) {
 toast.success(`${loc.name}`, {
 description: 'Enriquecimiento completado',
 duration: 3000,
 });
 }
 });
 
 setRecentlyEnrichedIds(prev => {
 const next = new Set(prev);
 newlyEnriched.forEach(id => next.add(id));
 return next;
 });
 
      // Open popup for the most recently enriched location and pan to it
 const lastEnrichedId = newlyEnriched[newlyEnriched.length - 1];
 const location = allLocations.find(l => l.id === lastEnrichedId);
 
 if (location && mapRef.current) {
        // Pan to the location
 mapRef.current.setView(
 [location.coordinates.lat, location.coordinates.lng],
 Math.max(mapRef.current.getZoom(), 10),
 { animate: true, duration: 0.5 }
 );
 
        // Open popup directly after a short delay to allow marker icon update
 setTimeout(() => {
 const marker = markersRef.current.get(lastEnrichedId);
 if (marker) {
 marker.openPopup();
 console.log('Opened popup for enriched location:', location.name);
 }
 }, 600); // Wait for pan animation + marker update
 }
 
      // Clear the animation after 4 seconds (matching longer animation)
 setTimeout(() => {
 setRecentlyEnrichedIds(prev => {
 const next = new Set(prev);
 newlyEnriched.forEach(id => next.delete(id));
 return next;
 });
 }, 4000);
 }
 }, [allLocations, enrichmentKey]);

  // Update marker icons when selection or focus changes
 useEffect(() => {
 markersRef.current.forEach((marker, locationId) => {
 const location = locationsRef.current.get(locationId);
 const isSelected = selectedLocations.has(locationId);
 const isFocused = focusedLocationId === locationId;
 const isEnriched = !!location?.enrichedData;
 const isRecentlyEnriched = recentlyEnrichedIds.has(locationId);
 const ownership = getLocationOwnership(locationId, currentUserId);
 marker.setIcon(createCustomIcon(isSelected, isFocused, isEnriched, location, criteriaTimestamp, isRecentlyEnriched, ownership.isOwn, { ownerName: ownership.ownerName, ownerId: ownership.ownerId, curatorId: ownership.curatorId, curatorIcon: ownership.curatorIcon, curatorColor: ownership.curatorColor }));
 });
 }, [selectedLocations, focusedLocationId, criteriaTimestamp, recentlyEnrichedIds, getLocationOwnership, currentUserId]);

  // Curator visibility based on zoom level
 useEffect(() => {
 if (!mapRef.current || curatorVisibilityZooms.size === 0) return;
 
 const updateCuratorVisibility = () => {
 const map = mapRef.current;
 if (!map) return;
 
 try {
 const currentZoom = map.getZoom();
 
 markersRef.current.forEach((marker, locationId) => {
 const location = locationsRef.current.get(locationId);
 if (!location) return;
 
 const ownership = getLocationOwnership(locationId, currentUserId);
 
          // Only apply visibility zoom to curator points
 if (ownership.curatorId) {
 const minZoom = curatorVisibilityZooms.get(ownership.curatorId);
            // Access Leaflet marker's icon element
 const markerElement = (marker as any)._icon as HTMLElement | undefined;
 
            // If null (no limit), always show
 if (minZoom === null || minZoom === undefined) {
 marker.setOpacity(1);
 if (markerElement) markerElement.style.pointerEvents = '';
 return;
 }
 
            // Show if current zoom is >= minZoom, hide otherwise
 if (currentZoom >= minZoom) {
 marker.setOpacity(1);
 if (markerElement) markerElement.style.pointerEvents = '';
 } else {
 marker.setOpacity(0);
 if (markerElement) markerElement.style.pointerEvents = 'none';
 }
 }
 });
 } catch (e) {
        // Map not ready, ignore
 }
 };
 
    // Initial update
 updateCuratorVisibility();
 
    // Update on zoom change
 mapRef.current.on('zoomend', updateCuratorVisibility);
 
 return () => {
 if (mapRef.current) {
 mapRef.current.off('zoomend', updateCuratorVisibility);
 }
 };
 }, [curatorVisibilityZooms, getLocationOwnership, currentUserId]);

  // Handle focused location - pan and open popup
 useEffect(() => {
 if (!focusedLocationId || !mapRef.current) return;

 const marker = markersRef.current.get(focusedLocationId);
 const location = locationsRef.current.get(focusedLocationId);
 
 if (marker && location) {
      // Pan to the location
 mapRef.current.setView(
 [location.coordinates.lat, location.coordinates.lng],
 Math.max(mapRef.current.getZoom(), 10),
 { animate: true, duration: 0.5 }
 );
 
      // Open the popup after a short delay to allow panning
 setTimeout(() => {
 marker.openPopup();
 }, 300);
 }
 }, [focusedLocationId]);

  // Show empty state message overlaying the map, not replacing it
 const showEmptyState = locations.length === 0;

 return (
 <motion.div
 initial={{ opacity: 0 }}
 animate={{ opacity: 1 }}
 className="h-full w-full overflow-hidden relative"
 >
 <div ref={mapContainerRef} className="h-full w-full" />
 
 {/* Custom scale bar */}
 <MapScaleBar map={mapRef.current} units={measurementUnits} />
 
 {/* Floating zoom button */}
 <motion.div
 initial={{ opacity: 0, scale: 0.8 }}
 animate={{ 
 opacity: showZoomButton ? 1 : 0, 
 scale: showZoomButton ? 1 : 0.8,
 pointerEvents: showZoomButton ? 'auto' : 'none'
 }}
 className="absolute bottom-20 left-1/2 -translate-x-1/2 z-[999]"
 >
 <Button
 onClick={() => zoomToBounds(false)}
 className="bg-white hover:bg-gray-50 text-gray-700 shadow-lg border gap-2"
 size="sm"
 >
 <Maximize2 className="w-4 h-4" />
 Ver {locations.length} ubicaciones
 </Button>
 </motion.div>

 {/* Map theme toggle - minimal, top right */}
 <div className="absolute top-4 right-4 z-[999]">
 <MapThemeToggle 
 theme={mapTheme} 
 onThemeChange={setMapTheme} 
 />
 </div>
 
 {/* Map Center Settings - now in UserProfileEditor */}

 {/* Legend and stats - single line bottom right */}
 <div className="absolute bottom-4 right-4 z-[999]">
 <div className={cn(
 "backdrop-blur-sm rounded-full px-4 py-2 shadow-md text-xs flex items-center gap-4",
 mapTheme === 'dark' ? 'bg-gray-900/95' : 'bg-white/95'
 )}>
 {/* Location count */}
 <div className="flex items-center gap-1.5 pr-3 border-r border-border/50">
 <MapPin className="w-3.5 h-3.5 text-primary" />
 <span className="font-semibold">{locations.length}</span>
 {locations.length !== totalLocations && (
 <span className={mapTheme === 'dark' ? 'text-gray-400' : 'text-muted-foreground'}>/ {totalLocations}</span>
 )}
 </div>
 
 {/* Legend items */}
 <div className="flex items-center gap-1.5">
 <svg width="10" height="14" viewBox="0 0 24 36" className="drop-shadow-sm">
 <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 24 12 24s12-15 12-24c0-6.627-5.373-12-12-12z" fill="#22c55e" stroke="white" strokeWidth="2"/>
 <circle cx="12" cy="12" r="4" fill="white" fillOpacity="0.9"/>
 </svg>
 <span className={mapTheme === 'dark' ? 'text-gray-300' : 'text-gray-600'}>Final</span>
 </div>
 <div className="flex items-center gap-1.5">
 <svg width="10" height="14" viewBox="0 0 24 36" className="drop-shadow-sm">
 <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 24 12 24s12-15 12-24c0-6.627-5.373-12-12-12z" fill="#3b82f6" stroke="white" strokeWidth="2"/>
 <circle cx="12" cy="12" r="4" fill="white" fillOpacity="0.9"/>
 </svg>
 <span className={mapTheme === 'dark' ? 'text-gray-300' : 'text-gray-600'}>Pendiente</span>
 </div>
 <div className="flex items-center gap-1.5">
 <svg width="10" height="14" viewBox="0 0 24 36" className="drop-shadow-sm">
 <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 24 12 24s12-15 12-24c0-6.627-5.373-12-12-12z" fill="#9ca3af" stroke="white" strokeWidth="2"/>
 <circle cx="12" cy="12" r="4" fill="white" fillOpacity="0.9"/>
 </svg>
 <span className={mapTheme === 'dark' ? 'text-gray-300' : 'text-gray-600'}>Importado</span>
 </div>
 <div className="flex items-center gap-1.5">
 <svg width="10" height="14" viewBox="0 0 24 36" className="drop-shadow-sm">
 <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 24 12 24s12-15 12-24c0-6.627-5.373-12-12-12z" fill="#f97316" stroke="white" strokeWidth="2"/>
 <circle cx="12" cy="12" r="4" fill="white" fillOpacity="0.9"/>
 </svg>
 <span className={mapTheme === 'dark' ? 'text-gray-300' : 'text-gray-600'}>Vacío</span>
 </div>
 </div>
 </div>

 {/* Empty state overlay */}
 {showEmptyState && (
 <div className="absolute inset-0 flex items-center justify-center bg-muted/30 z-[500]">
 <p className="text-muted-foreground bg-background/80 backdrop-blur-sm px-4 py-2 rounded-lg shadow">
 No hay ubicaciones para mostrar
 </p>
 </div>
 )}

 <style>{`
 .custom-popup .leaflet-popup-content-wrapper {
 border-radius: 12px;
 box-shadow: 0 10px 40px rgba(0,0,0,0.15);
 padding: 0;
 overflow: hidden;
 }
 .custom-popup .leaflet-popup-content {
 margin: 0;
 }
 .custom-popup .leaflet-popup-close-button {
 top: 8px;
 right: 8px;
 width: 24px;
 height: 24px;
 font-size: 18px;
 color: #6b7280;
 background: white;
 border-radius: 50%;
 display: flex;
 align-items: center;
 justify-content: center;
 box-shadow: 0 2px 4px rgba(0,0,0,0.1);
 }
 .custom-popup .leaflet-popup-close-button:hover {
 color: #1a1a1a;
 background: #f3f4f6;
 }
 .custom-popup .leaflet-popup-tip {
 box-shadow: 0 3px 10px rgba(0,0,0,0.1);
 }
 @keyframes pulse {
 0%, 100% { transform: scale(1); }
 50% { transform: scale(1.15); }
 }
 @keyframes enriched-celebrate {
 0% { 
 transform: scale(1);
 filter: drop-shadow(0 0 0 rgba(34, 197, 94, 0));
 }
 5% { 
 transform: scale(2.2);
 filter: drop-shadow(0 0 20px rgba(34, 197, 94, 0.9));
 }
 15% { 
 transform: scale(1.6);
 filter: drop-shadow(0 0 30px rgba(34, 197, 94, 0.7));
 }
 25% { 
 transform: scale(1.9);
 filter: drop-shadow(0 0 25px rgba(34, 197, 94, 0.6));
 }
 40% { 
 transform: scale(1.5);
 filter: drop-shadow(0 0 20px rgba(34, 197, 94, 0.5));
 }
 55% { 
 transform: scale(1.7);
 filter: drop-shadow(0 0 15px rgba(34, 197, 94, 0.4));
 }
 70% { 
 transform: scale(1.3);
 filter: drop-shadow(0 0 10px rgba(34, 197, 94, 0.3));
 }
 85% { 
 transform: scale(1.15);
 filter: drop-shadow(0 0 5px rgba(34, 197, 94, 0.15));
 }
 100% { 
 transform: scale(1);
 filter: drop-shadow(0 0 0 rgba(34, 197, 94, 0));
 }
 }
 .recently-enriched {
 z-index: 9999 !important;
 }
 `}</style>
 </motion.div>
 );
}
