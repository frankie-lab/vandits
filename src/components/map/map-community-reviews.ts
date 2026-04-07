import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { calculateDistance } from './map-utils';
import { CURATOR_ICON_PATHS } from './map-constants';

// Load community reviews for a curator location
export async function loadCommunityReviews(locationId: string, curatorId: string) {
  const container = document.querySelector(`.community-reviews-container[data-location-id="${locationId}"]`) as HTMLElement;
  const formContainer = document.querySelector(`.community-form-container[data-location-id="${locationId}"]`) as HTMLElement;
  const warningContainer = document.querySelector(`.community-distance-warning[data-location-id="${locationId}"]`) as HTMLElement;
  
  if (!container) return;
  
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    let validationRadius = 500;
    if (curatorId) {
      const { data: curator } = await supabase
        .from('curators')
        .select('validation_radius_meters')
        .eq('id', curatorId)
        .single();
      if (curator?.validation_radius_meters) validationRadius = curator.validation_radius_meters;
    }
    
    const { data: location } = await supabase
      .from('locations')
      .select('latitude, longitude')
      .eq('id', locationId)
      .single();
    
    const { data: reviews, error } = await supabase
      .from('curator_location_reviews')
      .select('*')
      .eq('location_id', locationId)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    const userIds = [...new Set((reviews || []).map(r => r.user_id))];
    const { data: profiles } = userIds.length > 0
      ? await supabase.from('profiles').select('id, display_name, avatar_url').in('id', userIds)
      : { data: [] };
    
    const profilesMap = new Map((profiles || []).map(p => [p.id, p]));
    
    const ratings = (reviews || []).filter(r => r.rating).map(r => r.rating as number);
    const avgRating = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;
    
    let reviewsHtml = '';
    
    if (ratings.length > 0) {
      reviewsHtml += `
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px; padding: 8px; background: #fffbeb; border-radius: 8px;">
      <div style="display: flex; align-items: center; gap: 2px;">
      ${[1,2,3,4,5].map(star => `<span style="font-size: 14px; color: ${star <= Math.round(avgRating) ? '#f59e0b' : '#d1d5db'};">${star <= Math.round(avgRating) ? '★' : '☆'}</span>`).join('')}
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
        ${review.rating ? `<span style="margin-left: auto; color: #f59e0b;">${'★'.repeat(review.rating)}${'☆'.repeat(5-review.rating)}</span>` : ''}
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
      
      let weightedRating: number;
      let breakdownText: string;
      
      if (ratings.length > 0) {
        weightedRating = (aiRating * 0.5) + (communityRating * 0.5);
        breakdownText = `(IA: ${aiRating.toFixed(1)} | Com: ${communityRating.toFixed(1)})`;
      } else {
        weightedRating = aiRating;
        breakdownText = `(Solo IA: ${aiRating.toFixed(1)})`;
      }
      
      const starsContainer = weightedContainer.querySelector('.weighted-rating-stars');
      if (starsContainer) {
        starsContainer.innerHTML = [1,2,3,4,5].map(star =>
          `<span style="font-size: 14px; line-height: 1; color: ${star <= Math.round(weightedRating) ? '#16a34a' : '#d1d5db'};">${star <= Math.round(weightedRating) ? '★' : '☆'}</span>`
        ).join('');
      }
      
      const valueEl = weightedContainer.querySelector('.weighted-rating-value') as HTMLElement;
      if (valueEl) valueEl.textContent = weightedRating > 0 ? weightedRating.toFixed(1) : '-';
      
      const breakdownEl = weightedContainer.querySelector('.weighted-rating-breakdown') as HTMLElement;
      if (breakdownEl) { breakdownEl.textContent = breakdownText; breakdownEl.style.display = 'inline'; }
      
      weightedContainer.title = `Rating ponderado: ${weightedRating.toFixed(1)} ${breakdownText}`;
    }
    
    // Check if user can leave a review
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
    
    const existingReview = reviews?.find(r => r.user_id === user.id);
    if (existingReview) {
      if (warningContainer) {
        warningContainer.innerHTML = `
        <div style="background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 10px; font-size: 10px; color: #166534; text-align: center;">
        <p style="margin: 0;">✅ Ya has validado este lugar</p>
        </div>
        `;
        warningContainer.style.display = 'block';
      }
      return;
    }
    
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
            if (formContainer) formContainer.style.display = 'block';
            if (warningContainer) warningContainer.style.display = 'none';
          } else {
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
export async function submitCommunityReview(locationId: string) {
  const ratingContainer = document.querySelector(`.community-rating-input[data-location-id="${locationId}"]`) as HTMLElement;
  const commentInput = document.querySelector(`.community-comment-input[data-location-id="${locationId}"]`) as HTMLTextAreaElement;
  const submitBtn = document.querySelector(`[data-action="submit-community-review"][data-location-id="${locationId}"]`) as HTMLButtonElement;
  
  const rating = parseInt(ratingContainer?.dataset.selectedRating || '0');
  const comment = commentInput?.value?.trim() || '';
  
  if (rating === 0) { toast.error('Selecciona una valoración'); return; }
  
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error('Debes iniciar sesión'); return; }
    
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
    
    const curatorId = document.querySelector(`.community-content[data-location-id="${locationId}"]`)?.getAttribute('data-curator-id') || '';
    await loadCommunityReviews(locationId, curatorId);
    
  } catch (err) {
    console.error('Error submitting review:', err);
    toast.error('Error al enviar valoración');
    
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
