import L from 'leaflet';
import { GeoLocation } from '@/types/location';
import { CriteriaStatus, CURATOR_ICON_PATHS } from './map-constants';
import { getCriteriaColor, getUserHue, getOwnerInitials, adjustHslLightness } from './map-utils';
import { getMarkerSizeConfig, getBaseSize, getHoverSize } from './useMarkerSizeConfig';
import { getMarkerStateRules, getStateColor, getStateShadow, getStateBorderWidth } from './useMarkerStateRules';

export const createCustomIcon = (
  isSelected: boolean,
  isFocused: boolean,
  isEnriched: boolean = false,
  location?: GeoLocation,
  criteriaTimestamp: number = 0,
  isRecentlyEnriched: boolean = false,
  isOwn: boolean = true,
  ownerInfo?: { ownerName?: string; ownerId?: string; curatorId?: string; curatorIcon?: string; curatorColor?: string; druidId?: string; druidIcon?: string; druidColor?: string },
  isCatalog: boolean = false,
) => {
  const sizeConfig = getMarkerSizeConfig();
  
  // Determine which config entry to use based on context
  const enrichedKey = isCatalog ? 'catalog_enriched' : 'own_enriched';
  const ownEnrichedSizes = sizeConfig[enrichedKey] || sizeConfig.own_enriched;
  const pinHeight = getBaseSize(ownEnrichedSizes, isRecentlyEnriched, isFocused, isSelected);
  const hoverPinHeight = getHoverSize(ownEnrichedSizes) || pinHeight * 2;
  const pinWidth = pinHeight * 0.7;
  const dotSize = pinHeight * 0.25;

  const criteriaStatus = location
    ? getCriteriaColor(location, criteriaTimestamp)
    : {
      color: 'hsl(0, 72%, 51%)',
      gradient: 'linear-gradient(135deg, hsl(0, 72%, 56%), hsl(0, 84%, 45%))',
      status: 'new' as CriteriaStatus,
    };

  
  const glowColors: Record<CriteriaStatus, string> = {
    current: 'rgba(34, 197, 94, 0.5)',
    previous: 'rgba(59, 130, 246, 0.5)',
    unknown: 'rgba(107, 114, 128, 0.4)',
    new: 'rgba(239, 68, 68, 0.4)',
  };
  const glowColor = glowColors[criteriaStatus.status];
  
  const animationStyle = isRecentlyEnriched
    ? 'animation: enriched-celebrate 3.5s ease-out;'
    : isFocused
    ? 'animation: pulse 1s ease-in-out infinite;'
    : '';
  
  const stateRules = getMarkerStateRules();
  const currentState = isRecentlyEnriched ? 'recent' : isFocused ? 'focused' : isSelected ? 'selected' : 'normal';
  const shadow = currentState !== 'normal'
    ? getStateShadow(currentState, '#000000', stateRules)
    : 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))';
  const borderWidth = getStateBorderWidth(currentState, stateRules);

  /** Apply state-based color mixing to a hex color */
  const applyStateColor = (hex: string): string => {
    if (currentState === 'normal') return hex;
    return getStateColor(hex, currentState, stateRules);
  };

  // For druid locations
  if (ownerInfo?.druidId) {
    const locationIsEnriched = isEnriched || location?.enrichedData?.descripcion;
    const druidColor = ownerInfo.druidColor || sizeConfig.druid_new?.fill_color || '#a855f7';
    const druidColorLight = ownerInfo.druidColor ? adjustHslLightness(druidColor, 15) : (sizeConfig.druid_new?.fill_color_light || adjustHslLightness(druidColor, 15));
    
    if (!locationIsEnriched) {
      const druidDefSizes = sizeConfig.druid_new;
      const circleSize = getBaseSize(druidDefSizes, isRecentlyEnriched, isFocused, isSelected);
      const hoverCircleSize = getHoverSize(druidDefSizes);
      const defScaleRatio = hoverCircleSize ? (hoverCircleSize / circleSize) : 1;
      const defHoverAttr = defScaleRatio > 1 ? `onmouseenter="this.style.transform='scale(${defScaleRatio.toFixed(2)})'" onmouseleave="this.style.transform='scale(1)'"` : '';
      
      return L.divIcon({
        className: `custom-marker-druid-default${isRecentlyEnriched ? ' recently-enriched' : ''}`,
        html: `
        <div style="width: ${circleSize}px; height: ${circleSize}px; position: relative; filter: ${shadow}; ${animationStyle} transition: transform 0.15s ease-out; transform-origin: center center;" ${defHoverAttr}>
        <svg width="${circleSize}" height="${circleSize}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
        <linearGradient id="druidDefGrad-${location?.id || 'default'}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:${applyStateColor(druidColorLight)}" />
        <stop offset="100%" style="stop-color:${applyStateColor(druidColor)}" />
        </linearGradient>
        </defs>
        <circle cx="12" cy="12" r="11" fill="url(#druidDefGrad-${location?.id || 'default'})" stroke="white" stroke-width="${borderWidth}"/>
        </svg>
        </div>
        `,
        iconSize: [circleSize, circleSize],
        iconAnchor: [circleSize / 2, circleSize / 2],
        popupAnchor: [0, -circleSize / 2],
      });
    }
    
    const druidEnrSizes = sizeConfig.druid_enriched;
    const drPinHeight = getBaseSize(druidEnrSizes, isRecentlyEnriched, isFocused, isSelected);
    const drPinWidth = drPinHeight * 0.7;
    const drDotSize = drPinHeight * 0.25;
    const drHoverPinHeight = getHoverSize(druidEnrSizes);
    const drScaleRatio = drHoverPinHeight ? (drHoverPinHeight / drPinHeight) : 1;
    const drHoverAttr = drScaleRatio > 1 ? `onmouseenter="this.style.transform='scale(${drScaleRatio.toFixed(2)})'" onmouseleave="this.style.transform='scale(1)'"` : '';
    const iconPath = CURATOR_ICON_PATHS['map-pin'];
    const drIconSize = drPinHeight * 0.35;
    
    return L.divIcon({
      className: `custom-marker-druid${isRecentlyEnriched ? ' recently-enriched' : ''}`,
      html: `
      <div style="width: ${drPinWidth}px; height: ${drPinHeight}px; position: relative; filter: ${shadow}; ${animationStyle} transition: transform 0.15s ease-out; transform-origin: center bottom;" ${drHoverAttr}>
      <svg width="${drPinWidth}" height="${drPinHeight}" viewBox="0 0 24 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
      <linearGradient id="druidPinGrad-${location?.id || 'default'}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${applyStateColor(druidColorLight)}" />
      <stop offset="100%" style="stop-color:${applyStateColor(druidColor)}" />
      </linearGradient>
      </defs>
      <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 24 12 24s12-15 12-24c0-6.627-5.373-12-12-12z" fill="url(#druidPinGrad-${location?.id || 'default'})" stroke="white" stroke-width="${borderWidth}"/>
      <circle cx="12" cy="12" r="${drDotSize + 2}" fill="white" fill-opacity="0.95"/>
      <g transform="translate(${12 - drIconSize/2}, ${12 - drIconSize/2}) scale(${drIconSize/24})">
      <path d="${iconPath}" fill="none" stroke="${applyStateColor(druidColor)}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </g>
      </svg>
      </div>
      `,
      iconSize: [drPinWidth, drPinHeight],
      iconAnchor: [drPinWidth / 2, drPinHeight],
      popupAnchor: [0, -drPinHeight + 4],
    });
  }

  // For curator locations
  if (ownerInfo?.curatorId) {
    const locationIsEnriched = isEnriched || location?.enrichedData?.descripcion;
    
    if (!locationIsEnriched) {
      const curatorColor = ownerInfo.curatorColor || sizeConfig.curator_default?.fill_color || '#94a3b8';
      const curatorColorLight = ownerInfo.curatorColor ? adjustHslLightness(curatorColor, 15) : (sizeConfig.curator_default?.fill_color_light || adjustHslLightness(curatorColor, 15));
      const curatorDefSizes = sizeConfig.curator_default;
      const circleSize = getBaseSize(curatorDefSizes, isRecentlyEnriched, isFocused, isSelected);
      const hoverCircleSize = getHoverSize(curatorDefSizes);
      const defScaleRatio = hoverCircleSize ? (hoverCircleSize / circleSize) : 1;
      const defHoverAttr = defScaleRatio > 1 ? `onmouseenter="this.style.transform='scale(${defScaleRatio.toFixed(2)})'" onmouseleave="this.style.transform='scale(1)'"` : '';
      
      return L.divIcon({
        className: `custom-marker-curator-default${isRecentlyEnriched ? ' recently-enriched' : ''}`,
        html: `
        <div style="width: ${circleSize}px; height: ${circleSize}px; position: relative; filter: ${shadow}; ${animationStyle} transition: transform 0.15s ease-out; transform-origin: center center;" ${defHoverAttr}>
        <svg width="${circleSize}" height="${circleSize}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
        <linearGradient id="curDefGrad-${location?.id || 'default'}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:${applyStateColor(curatorColorLight)}" />
        <stop offset="100%" style="stop-color:${applyStateColor(curatorColor)}" />
        </linearGradient>
        </defs>
        <circle cx="12" cy="12" r="11" fill="url(#curDefGrad-${location?.id || 'default'})" stroke="white" stroke-width="${borderWidth}"/>
        </svg>
        </div>
        `,
        iconSize: [circleSize, circleSize],
        iconAnchor: [circleSize / 2, circleSize / 2],
        popupAnchor: [0, -circleSize / 2],
      });
    }
    
    const isValidLucideIcon = ownerInfo.curatorIcon &&
      ownerInfo.curatorIcon !== 'map-pin' &&
      CURATOR_ICON_PATHS[ownerInfo.curatorIcon];
    
    const curatorEnrSizes = sizeConfig.curator_enriched;
    const curPinHeight = getBaseSize(curatorEnrSizes, isRecentlyEnriched, isFocused, isSelected);
    const curPinWidth = curPinHeight * 0.7;
    const curDotSize = curPinHeight * 0.25;
    const curatorColor = ownerInfo.curatorColor || sizeConfig.curator_enriched?.fill_color || '#14b8a6';
    const curatorColorLight = ownerInfo.curatorColor ? adjustHslLightness(curatorColor, 15) : (sizeConfig.curator_enriched?.fill_color_light || adjustHslLightness(curatorColor, 15));
    const iconName = isValidLucideIcon ? ownerInfo.curatorIcon! : 'map-pin';
    const iconPath = CURATOR_ICON_PATHS[iconName] || CURATOR_ICON_PATHS['map-pin'];
    const iconSize = curPinHeight * 0.35;
    const curHoverPinHeight = getHoverSize(curatorEnrSizes);
    const curScaleRatio = curHoverPinHeight ? (curHoverPinHeight / curPinHeight) : 1;
    const curHoverAttr = curScaleRatio > 1 ? `onmouseenter="this.style.transform='scale(${curScaleRatio.toFixed(2)})'" onmouseleave="this.style.transform='scale(1)'"` : '';
    return L.divIcon({
      className: `custom-marker-curator${isRecentlyEnriched ? ' recently-enriched' : ''}`,
      html: `
      <div style="width: ${curPinWidth}px; height: ${curPinHeight}px; position: relative; filter: ${shadow}; ${animationStyle} transition: transform 0.15s ease-out; transform-origin: center bottom;" ${curHoverAttr}>
      <svg width="${curPinWidth}" height="${curPinHeight}" viewBox="0 0 24 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
      <linearGradient id="curatorPinGrad-${location?.id || 'default'}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${applyStateColor(curatorColorLight)}" />
      <stop offset="100%" style="stop-color:${applyStateColor(curatorColor)}" />
      </linearGradient>
      </defs>
      <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 24 12 24s12-15 12-24c0-6.627-5.373-12-12-12z" fill="url(#curatorPinGrad-${location?.id || 'default'})" stroke="white" stroke-width="${borderWidth}"/>
      <circle cx="12" cy="12" r="${curDotSize + 2}" fill="white" fill-opacity="0.95"/>
      <g transform="translate(${12 - iconSize/2}, ${12 - iconSize/2}) scale(${iconSize/24})">
      <path d="${iconPath}" fill="none" stroke="${applyStateColor(curatorColor)}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </g>
      </svg>
      </div>
      `,
      iconSize: [curPinWidth, curPinHeight],
      iconAnchor: [curPinWidth / 2, curPinHeight],
      popupAnchor: [0, -curPinHeight + 4],
    });
  }

  // For followed users' locations
  if (!isOwn) {
    const isFollowedEnriched = isEnriched || location?.enrichedData?.descripcion;
    const followedSizesKey = isFollowedEnriched ? 'followed_enriched' : 'followed_new';
    const followedSizes = sizeConfig[followedSizesKey] || sizeConfig.followed_enriched;
    const circleSize = getBaseSize(followedSizes, isRecentlyEnriched, isFocused, isSelected);
    const userHue = getUserHue(ownerInfo?.ownerId);
    const initials = getOwnerInitials(ownerInfo?.ownerName);
    const hoverSize = getHoverSize(followedSizes) || circleSize * 2;
    const fontSize = hoverSize * 0.38;
    
    const userColor = `hsl(${userHue}, 65%, 45%)`;
    const userColorLight = `hsl(${userHue}, 65%, 55%)`;
    
    const scaleRatio = hoverSize / circleSize;
    
    return L.divIcon({
      className: 'custom-marker-circle',
      html: `
      <div style="width: ${circleSize}px; height: ${circleSize}px; position: relative; filter: ${shadow}; ${animationStyle} transition: transform 0.15s ease-out; transform-origin: center center;" onmouseenter="this.style.transform='scale(${scaleRatio.toFixed(2)})'" onmouseleave="this.style.transform='scale(1)'">
      <svg width="${circleSize}" height="${circleSize}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
      <linearGradient id="circleGrad-${location?.id || 'default'}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${userColorLight}" />
      <stop offset="100%" style="stop-color:${userColor}" />
      </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="11" fill="url(#circleGrad-${location?.id || 'default'})" stroke="white" stroke-width="${borderWidth}"/>
      <text x="12" y="12" text-anchor="middle" dominant-baseline="central" fill="white" font-size="${fontSize}" font-weight="600" font-family="system-ui, sans-serif" style="letter-spacing: -0.5px;">${initials}</text>
      </svg>
      </div>
      `,
      iconSize: [circleSize, circleSize],
      iconAnchor: [circleSize / 2, circleSize / 2],
      popupAnchor: [0, -circleSize / 2],
    });
  }

  // Non-enriched own locations: small simple circle (separate config for empty vs imported)
  if (criteriaStatus.status === 'unknown' || criteriaStatus.status === 'new') {
    const sizeKey = isCatalog
      ? (criteriaStatus.status === 'new' ? 'catalog_empty' : 'catalog_new')
      : (criteriaStatus.status === 'new' ? 'own_empty' : 'own_new');
    const ownNewSizes = sizeConfig[sizeKey] || sizeConfig.own_new;
    const circleSize = getBaseSize(ownNewSizes, isRecentlyEnriched, isFocused, isSelected);
    const statusColor = ownNewSizes.fill_color || criteriaStatus.color;
    const statusColorLight = ownNewSizes.fill_color_light || adjustHslLightness(statusColor, 15);
    const ownNewHover = getHoverSize(ownNewSizes);
    const ownNewScaleRatio = ownNewHover ? (ownNewHover / circleSize) : 1;
    const ownNewHoverAttr = ownNewScaleRatio > 1 ? `onmouseenter="this.style.transform='scale(${ownNewScaleRatio.toFixed(2)})'" onmouseleave="this.style.transform='scale(1)'"` : '';
    
    return L.divIcon({
      className: `custom-marker-dot${isRecentlyEnriched ? ' recently-enriched' : ''}`,
      html: `
      <div style="width: ${circleSize}px; height: ${circleSize}px; position: relative; filter: ${shadow}; ${animationStyle} transition: transform 0.15s ease-out; transform-origin: center center;" ${ownNewHoverAttr}>
      <svg width="${circleSize}" height="${circleSize}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
      <linearGradient id="dotGrad-${location?.id || 'default'}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${applyStateColor(statusColorLight)}" />
      <stop offset="100%" style="stop-color:${applyStateColor(statusColor)}" />
      </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="11" fill="url(#dotGrad-${location?.id || 'default'})" stroke="white" stroke-width="${borderWidth}"/>
      </svg>
      </div>
      `,
      iconSize: [circleSize, circleSize],
      iconAnchor: [circleSize / 2, circleSize / 2],
      popupAnchor: [0, -circleSize / 2],
    });
  }

  // Classic pin/teardrop shape (for own enriched locations)
  const ownEnrColor = ownEnrichedSizes.fill_color || criteriaStatus.color;
  const ownEnrColorLight = ownEnrichedSizes.fill_color_light || adjustHslLightness(ownEnrColor, 15);
  const scaleRatioPin = hoverPinHeight / pinHeight;
  
  return L.divIcon({
    className: `custom-marker${isRecentlyEnriched ? ' recently-enriched' : ''}`,
    html: `
    <div style="width: ${pinWidth}px; height: ${pinHeight}px; position: relative; filter: ${shadow}; ${animationStyle} transition: transform 0.15s ease-out; transform-origin: center bottom;" onmouseenter="this.style.transform='scale(${scaleRatioPin.toFixed(2)})'" onmouseleave="this.style.transform='scale(1)'">
    <svg width="${pinWidth}" height="${pinHeight}" viewBox="0 0 24 36" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
    <linearGradient id="pinGrad-${location?.id || 'default'}" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" style="stop-color:${applyStateColor(ownEnrColorLight)}" />
    <stop offset="100%" style="stop-color:${applyStateColor(ownEnrColor)}" />
    </linearGradient>
    </defs>
    <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 24 12 24s12-15 12-24c0-6.627-5.373-12-12-12z" fill="url(#pinGrad-${location?.id || 'default'})" stroke="white" stroke-width="${borderWidth}"/>
    <circle cx="12" cy="12" r="${dotSize}" fill="white" fill-opacity="0.95"/>
    </svg>
    </div>
    `,
    iconSize: [pinWidth, pinHeight],
    iconAnchor: [pinWidth / 2, pinHeight],
    popupAnchor: [0, -pinHeight + 4],
  });
};
