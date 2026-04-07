import L from 'leaflet';
import { GeoLocation } from '@/types/location';
import { CriteriaStatus, CURATOR_ICON_PATHS } from './map-constants';
import { getCriteriaColor, getUserHue, getOwnerInitials, adjustHslLightness } from './map-utils';
import { getMarkerSizeConfig, getBaseSize, getHoverSize } from './useMarkerSizeConfig';

export const createCustomIcon = (
  isSelected: boolean,
  isFocused: boolean,
  isEnriched: boolean = false,
  location?: GeoLocation,
  criteriaTimestamp: number = 0,
  isRecentlyEnriched: boolean = false,
  isOwn: boolean = true,
  ownerInfo?: { ownerName?: string; ownerId?: string; curatorId?: string; curatorIcon?: string; curatorColor?: string }
) => {
  const sizeConfig = getMarkerSizeConfig();
  
  // Determine which config entry to use based on context (will be refined per section)
  const ownEnrichedSizes = sizeConfig.own_enriched;
  const pinHeight = getBaseSize(ownEnrichedSizes, isRecentlyEnriched, isFocused, isSelected);
  const hoverPinHeight = getHoverSize(ownEnrichedSizes, isRecentlyEnriched, isFocused, isSelected) || pinHeight * 2;
  const pinWidth = pinHeight * 0.7;
  const dotSize = pinHeight * 0.25;

  const criteriaStatus = location
    ? getCriteriaColor(location, criteriaTimestamp)
    : {
      color: 'hsl(0, 72%, 51%)',
      gradient: 'linear-gradient(135deg, hsl(0, 72%, 56%), hsl(0, 84%, 45%))',
      status: 'new' as CriteriaStatus,
    };

  let gradient = criteriaStatus.gradient;
  if (isFocused) {
    gradient = criteriaStatus.gradient.replace('42%', '52%').replace('36%', '46%').replace('56%', '66%').replace('65%', '75%');
  } else if (isSelected) {
    gradient = criteriaStatus.gradient.replace('42%', '48%').replace('36%', '40%').replace('56%', '62%').replace('65%', '70%');
  }
  
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
  
  const shadow = isFocused || isSelected || isRecentlyEnriched
    ? `drop-shadow(0 3px 6px rgba(0,0,0,0.4)) drop-shadow(0 0 ${isRecentlyEnriched ? '10px' : '6px'} ${glowColor})`
    : 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))';

  // For curator locations
  if (ownerInfo?.curatorId) {
    const locationIsEnriched = isEnriched || location?.enrichedData?.descripcion;
    
    if (!locationIsEnriched) {
      const grayColor = '#94a3b8';
      const iconPath = CURATOR_ICON_PATHS['map-pin'];
      const curatorDefSizes = sizeConfig.curator_default;
      const simplePinSize = getBaseSize(curatorDefSizes, isRecentlyEnriched, isFocused, isSelected);
      
      return L.divIcon({
        className: `custom-marker-curator-default${isRecentlyEnriched ? ' recently-enriched' : ''}`,
        html: `
        <div style="width: ${simplePinSize}px; height: ${simplePinSize}px; position: relative; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.25)); ${animationStyle}">
        <svg width="${simplePinSize}" height="${simplePinSize}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="${iconPath}" fill="none" stroke="${grayColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        </div>
        `,
        iconSize: [simplePinSize, simplePinSize],
        iconAnchor: [simplePinSize / 2, simplePinSize],
        popupAnchor: [0, -simplePinSize + 4],
      });
    }
    
    const isValidLucideIcon = ownerInfo.curatorIcon &&
      ownerInfo.curatorIcon !== 'map-pin' &&
      CURATOR_ICON_PATHS[ownerInfo.curatorIcon];
    
    const curatorEnrSizes = sizeConfig.curator_enriched;
    const curPinHeight = getBaseSize(curatorEnrSizes, isRecentlyEnriched, isFocused, isSelected);
    const curPinWidth = curPinHeight * 0.7;
    const curDotSize = curPinHeight * 0.25;
    const curatorColor = ownerInfo.curatorColor || '#14b8a6';
    const curatorColorLight = adjustHslLightness(curatorColor, 15);
    const iconName = isValidLucideIcon ? ownerInfo.curatorIcon! : 'map-pin';
    const iconPath = CURATOR_ICON_PATHS[iconName] || CURATOR_ICON_PATHS['map-pin'];
    const iconSize = curPinHeight * 0.35;
    return L.divIcon({
      className: `custom-marker-curator${isRecentlyEnriched ? ' recently-enriched' : ''}`,
      html: `
      <div style="width: ${curPinWidth}px; height: ${curPinHeight}px; position: relative; filter: ${shadow}; ${animationStyle}">
      <svg width="${curPinWidth}" height="${curPinHeight}" viewBox="0 0 24 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
      <linearGradient id="curatorPinGrad-${location?.id || 'default'}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${curatorColorLight}" />
      <stop offset="100%" style="stop-color:${curatorColor}" />
      </linearGradient>
      </defs>
      <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 24 12 24s12-15 12-24c0-6.627-5.373-12-12-12z" fill="url(#curatorPinGrad-${location?.id || 'default'})" stroke="white" stroke-width="1.5"/>
      <circle cx="12" cy="12" r="${curDotSize + 2}" fill="white" fill-opacity="0.95"/>
      <g transform="translate(${12 - iconSize/2}, ${12 - iconSize/2}) scale(${iconSize/24})">
      <path d="${iconPath}" fill="none" stroke="${curatorColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
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
    const followedSizes = sizeConfig.followed;
    const circleSize = getBaseSize(followedSizes, isRecentlyEnriched, isFocused, isSelected);
    const userHue = getUserHue(ownerInfo?.ownerId);
    const initials = getOwnerInitials(ownerInfo?.ownerName);
    const hoverSize = getHoverSize(followedSizes, isRecentlyEnriched, isFocused, isSelected) || circleSize * 2;
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
      <circle cx="12" cy="12" r="11" fill="url(#circleGrad-${location?.id || 'default'})" stroke="white" stroke-width="1.5"/>
      <text x="12" y="12" text-anchor="middle" dominant-baseline="central" fill="white" font-size="${fontSize}" font-weight="600" font-family="system-ui, sans-serif" style="letter-spacing: -0.5px;">${initials}</text>
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
    const ownNewSizes = sizeConfig.own_new;
    const circleSize = getBaseSize(ownNewSizes, isRecentlyEnriched, isFocused, isSelected);
    const statusColor = criteriaStatus.color;
    const statusColorLight = adjustHslLightness(statusColor, 15);
    
    return L.divIcon({
      className: `custom-marker-dot${isRecentlyEnriched ? ' recently-enriched' : ''}`,
      html: `
      <div style="width: ${circleSize}px; height: ${circleSize}px; position: relative; filter: drop-shadow(0 1px 3px rgba(0,0,0,0.3)); ${animationStyle}">
      <svg width="${circleSize}" height="${circleSize}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
      <linearGradient id="dotGrad-${location?.id || 'default'}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${statusColorLight}" />
      <stop offset="100%" style="stop-color:${statusColor}" />
      </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="11" fill="url(#dotGrad-${location?.id || 'default'})" stroke="white" stroke-width="2"/>
      </svg>
      </div>
      `,
      iconSize: [circleSize, circleSize],
      iconAnchor: [circleSize / 2, circleSize / 2],
      popupAnchor: [0, -circleSize / 2],
    });
  }

  // Classic pin/teardrop shape (for own enriched locations)
  const scaleRatioPin = hoverPinHeight / pinHeight;
  
  return L.divIcon({
    className: `custom-marker${isRecentlyEnriched ? ' recently-enriched' : ''}`,
    html: `
    <div style="width: ${pinWidth}px; height: ${pinHeight}px; position: relative; filter: ${shadow}; ${animationStyle} transition: transform 0.15s ease-out; transform-origin: center bottom;" onmouseenter="this.style.transform='scale(${scaleRatioPin.toFixed(2)})'" onmouseleave="this.style.transform='scale(1)'">
    <svg width="${pinWidth}" height="${pinHeight}" viewBox="0 0 24 36" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
    <linearGradient id="pinGrad-${location?.id || 'default'}" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" style="stop-color:${criteriaStatus.color.replace('36%', '50%').replace('51%', '60%').replace('53%', '62%').replace('60%', '70%')}" />
    <stop offset="100%" style="stop-color:${criteriaStatus.color}" />
    </linearGradient>
    </defs>
    <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 24 12 24s12-15 12-24c0-6.627-5.373-12-12-12z" fill="url(#pinGrad-${location?.id || 'default'})" stroke="white" stroke-width="1.5"/>
    <circle cx="12" cy="12" r="${dotSize}" fill="white" fill-opacity="0.95"/>
    </svg>
    </div>
    `,
    iconSize: [pinWidth, pinHeight],
    iconAnchor: [pinWidth / 2, pinHeight],
    popupAnchor: [0, -pinHeight + 4],
  });
};
