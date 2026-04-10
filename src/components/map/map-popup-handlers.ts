/**
 * map-popup-handlers.ts
 * DOM event delegation for popup interactions: filter links, action buttons,
 * toggle sections, community reviews, visited/rating in-place updates.
 */
import { loadCommunityReviews, submitCommunityReview } from './map-community-reviews';

// ─── Filter link clicks ───────────────────────────────────────────

export interface FilterState {
  continent?: string;
  country?: string;
  region?: string;
  zone?: string;
  tag?: string;
  searchTerm?: string;
  classificationCode?: string;
  placeType?: string;
  onlyEnriched?: boolean;
}

export function setupFilterLinkHandler(
  setFilters: (f: FilterState) => void,
  getFilters: () => FilterState,
): () => void {
  const handler = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (!target.classList.contains('filter-link')) return;

    e.preventDefault();
    e.stopPropagation();

    const filterType = target.dataset.filterType as
      | 'zone'
      | 'region'
      | 'country'
      | 'continent'
      | 'searchTerm'
      | 'tag';
    const filterValue = target.dataset.filterValue;
    if (!filterType || !filterValue) return;

    const filters = getFilters();

    if (filterType === 'searchTerm') {
      setFilters({
        searchTerm: filterValue,
        continent: undefined,
        country: undefined,
        region: undefined,
        zone: undefined,
        tag: undefined,
        classificationCode: undefined,
        placeType: undefined,
      });
    } else if (filterType === 'tag') {
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
      setFilters({ ...filters, continent: filterValue, country: undefined, region: undefined, zone: undefined });
    } else if (filterType === 'country') {
      setFilters({ ...filters, country: filterValue, region: undefined, zone: undefined });
    } else if (filterType === 'region') {
      setFilters({ ...filters, region: filterValue, zone: undefined });
    } else {
      setFilters({ ...filters, [filterType]: filterValue });
    }
  };

  document.addEventListener('click', handler);
  return () => document.removeEventListener('click', handler);
}

// ─── Action button clicks (popup actions, tech toggle, community reviews) ──

export function setupActionClickHandler(): () => void {
  const handler = (e: MouseEvent) => {
    const target = e.target as HTMLElement;

    // ── Popup action buttons ──
    const button = target.closest('.popup-action-btn') as HTMLElement | null;
    if (button) {
      e.preventDefault();
      e.stopPropagation();
      const action = button.dataset.action;
      const locationId = button.dataset.locationId;
      const rating = button.dataset.rating;
      const locationName = button.dataset.locationName;
      if (action && locationId) {
        window.dispatchEvent(
          new CustomEvent('popup-action', {
            detail: { action, locationId, rating, locationName },
          }),
        );
      }
    }

    // ── Tech toggle ──
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
          if (arrow) arrow.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
        }
      }
    }

    // ── Original description toggle ──
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
          if (arrow) arrow.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
        }
      }
    }

    // ── Community validation toggle ──
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
          if (arrow) arrow.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
          if (isHidden) {
            const locationId = content.dataset.locationId;
            const curatorId = content.dataset.curatorId;
            if (locationId) loadCommunityReviews(locationId, curatorId || '');
          }
        }
      }
    }

    // ── Community rating stars ──
    const ratingStar = target.closest('.community-rating-star') as HTMLElement | null;
    if (ratingStar) {
      e.preventDefault();
      e.stopPropagation();
      const ratingVal = parseInt(ratingStar.dataset.rating || '0');
      const container = ratingStar.closest('.community-rating-input') as HTMLElement;
      if (container) {
        container.dataset.selectedRating = String(ratingVal);
        const stars = container.querySelectorAll('.community-rating-star');
        stars.forEach((star, idx) => {
          (star as HTMLElement).textContent = idx < ratingVal ? '★' : '☆';
          (star as HTMLElement).style.color = idx < ratingVal ? '#f59e0b' : '#d1d5db';
        });
      }
    }

    // ── Community review submit ──
    const submitBtn = target.closest('[data-action="submit-community-review"]') as HTMLElement | null;
    if (submitBtn) {
      e.preventDefault();
      e.stopPropagation();
      const locationId = submitBtn.dataset.locationId;
      if (locationId) submitCommunityReview(locationId);
    }
  };

  document.addEventListener('click', handler);
  return () => document.removeEventListener('click', handler);
}

// ─── In-place rating UI helper ─────────────────────────────────────

export function upsertRatingUi(
  parent: HTMLElement,
  locationId: string,
  ratingValue: number,
  allowRating: boolean,
) {
  const starButtons = Array.from(
    parent.querySelectorAll(`button[data-action="set-rating"][data-location-id="${locationId}"]`),
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
          >${currentRating >= star ? '★' : '☆'}</button>
        `,
          )
          .join('')}
        ${
          currentRating > 0
            ? `
          <button 
            class="popup-action-btn" 
            data-action="clear-rating" 
            data-location-id="${locationId}"
            style="background: none; border: none; padding: 0 0 0 3px; cursor: pointer; font-size: 10px; color: #9ca3af;"
            title="Quitar valoración"
          >✕</button>
        `
            : ''
        }
      </div>
    `;
    const visitedBtn = parent.querySelector(
      `[data-action="toggle-visited"][data-location-id="${locationId}"]`,
    ) as HTMLElement | null;
    visitedBtn?.insertAdjacentHTML('afterend', starsHtml);
    return;
  }

  if (hasStars) {
    starButtons.forEach((btn) => {
      const star = Number(btn.getAttribute('data-rating') || '0');
      const filled = currentRating >= star;
      btn.textContent = filled ? '★' : '☆';
      btn.style.color = filled ? '#f59e0b' : '#d1d5db';
    });

    const clearBtn = parent.querySelector(
      `button[data-action="clear-rating"][data-location-id="${locationId}"]`,
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
        >✕</button>
      `,
      );
    }

    if (currentRating === 0 && clearBtn) {
      clearBtn.remove();
    }
  }
}

// ─── Visited-updated handler ────────────────────────────────────────

export function setupVisitedUpdatedHandler(
  locationsRef: React.MutableRefObject<Map<string, any>>,
  canEnrichLocations: boolean,
): () => void {
  const handler = (e: Event) => {
    const { locationId, visited, customData } = (e as CustomEvent).detail;

    const visitedBtn = document.querySelector(
      `[data-action="toggle-visited"][data-location-id="${locationId}"]`,
    ) as HTMLElement | null;

    const location = locationsRef.current.get(locationId);
    const newCustomData: Record<string, string> = customData
      ? Object.fromEntries(Object.entries(customData).map(([k, v]) => [k, String(v)]))
      : { ...(location?.customData || {}), visited: visited ? 'true' : 'false' };

    if (location) {
      locationsRef.current.set(locationId, {
        ...location,
        customData: newCustomData,
        updatedAt: new Date(),
      });
    }

    if (!visitedBtn) return;

    visitedBtn.style.background = visited ? '#dcfce7' : '#fff';
    visitedBtn.style.color = visited ? '#166534' : '#6b7280';
    visitedBtn.style.borderColor = visited ? '#86efac' : '#e5e7eb';
    visitedBtn.title = visited ? 'Click para desmarcar' : 'Marcar como visitado';

    const svg = visitedBtn.querySelector('svg');
    if (svg) svg.setAttribute('fill', visited ? 'currentColor' : 'none');

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

  window.addEventListener('visited-updated', handler);
  return () => window.removeEventListener('visited-updated', handler);
}

// ─── Rating-updated handler ────────────────────────────────────────

export function setupRatingUpdatedHandler(
  locationsRef: React.MutableRefObject<Map<string, any>>,
): () => void {
  const handler = (e: Event) => {
    const { locationId, rating, customData } = (e as CustomEvent).detail;
    const ratingValue = parseInt(rating || '0') || 0;

    const starButtons = Array.from(
      document.querySelectorAll(`button[data-action="set-rating"][data-location-id="${locationId}"]`),
    ) as HTMLButtonElement[];

    starButtons.forEach((btn) => {
      const star = Number(btn.getAttribute('data-rating') || '0');
      const filled = ratingValue >= star;
      btn.textContent = filled ? '★' : '☆';
      btn.style.color = filled ? '#f59e0b' : '#d1d5db';
    });

    const parent = starButtons[0]?.parentElement as HTMLElement | undefined;
    if (parent) {
      const clearBtn = parent.querySelector(
        `button[data-action="clear-rating"][data-location-id="${locationId}"]`,
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
          >✕</button>
        `,
        );
      }
      if (ratingValue === 0 && clearBtn) clearBtn.remove();
    }

    const location = locationsRef.current.get(locationId);
    if (location) {
      const cd = customData
        ? Object.fromEntries(Object.entries(customData).map(([k, v]) => [k, String(v)]))
        : { ...(location.customData || {}), user_rating: rating || '' };
      locationsRef.current.set(locationId, { ...location, customData: cd, updatedAt: new Date() });
    }
  };

  window.addEventListener('rating-updated', handler);
  return () => window.removeEventListener('rating-updated', handler);
}

// ─── Notes-updated handler ──────────────────────────────────────────

export function setupNotesUpdatedHandler(
  markersRef: React.MutableRefObject<Map<string, L.Marker>>,
  locationsRef: React.MutableRefObject<Map<string, any>>,
  getLocationOwnership: (id: string, userId: string | null) => any,
  currentUserId: string | null,
  criteriaTimestamp: number,
  canEnrichLocations: boolean,
  createPopupContentFn: (loc: any, ts: number, ownership: any, canEnrich: boolean) => string,
): () => void {
  const handler = (e: Event) => {
    const { locationId } = (e as CustomEvent).detail;
    const marker = markersRef.current.get(locationId);
    const location = locationsRef.current.get(locationId);

    if (marker && location) {
      const updatedLocation = {
        ...location,
        customData: { ...location.customData, has_notes: 'true' },
      };
      locationsRef.current.set(locationId, updatedLocation);
      const ownership = getLocationOwnership(locationId, currentUserId);
      marker.setPopupContent(createPopupContentFn(updatedLocation, criteriaTimestamp, ownership, canEnrichLocations));
      if (marker.isPopupOpen()) marker.openPopup();
    }
  };

  window.addEventListener('notes-updated', handler);
  return () => window.removeEventListener('notes-updated', handler);
}

// ─── Photo-updated handler ──────────────────────────────────────────

export function setupPhotoUpdatedHandler(
  markersRef: React.MutableRefObject<Map<string, L.Marker>>,
  locationsRef: React.MutableRefObject<Map<string, any>>,
  getLocationOwnership: (id: string, userId: string | null) => any,
  currentUserId: string | null,
  criteriaTimestamp: number,
  canEnrichLocations: boolean,
  createPopupContentFn: (loc: any, ts: number, ownership: any, canEnrich: boolean) => string,
): () => void {
  const handler = (e: Event) => {
    const { locationId, imageUrl, visibility, isDefaultImage } = (e as CustomEvent).detail;
    const marker = markersRef.current.get(locationId);
    const location = locationsRef.current.get(locationId);

    if (marker && location) {
      let updatedLocation = { ...location };

      if (isDefaultImage && imageUrl) {
        const currentEnriched = location.enrichedData || {};
        updatedLocation = {
          ...location,
          enrichedData: { ...currentEnriched, imagen: imageUrl } as any,
        };
      } else {
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

      // Try to update the image in-place without regenerating the popup (preserves scroll)
      if (marker.isPopupOpen()) {
        const popupEl = marker.getPopup()?.getElement();
        const imgEl = popupEl?.querySelector('img[alt]') as HTMLImageElement | null;
        if (imgEl && imageUrl) {
          imgEl.src = imageUrl;
          return;
        }
        if (imgEl && !imageUrl) {
          // Photo removed — need full regeneration
        } else if (!imgEl && imageUrl) {
          // No image element yet — need full regeneration
        } else {
          return; // No change needed
        }
      }

      // Fallback: full popup regeneration (popup not open or structural change needed)
      const ownership = getLocationOwnership(locationId, currentUserId);
      marker.setPopupContent(createPopupContentFn(updatedLocation, criteriaTimestamp, ownership, canEnrichLocations));
      if (marker.isPopupOpen()) marker.openPopup();
    }
  };

  window.addEventListener('photo-updated', handler);
  return () => window.removeEventListener('photo-updated', handler);
}
