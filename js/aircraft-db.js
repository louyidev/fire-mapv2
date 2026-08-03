/**
 * Dictionnaire de référence ADS-B pour la classification des aéronefs
 */
export const AIRCRAFT_DB = {
  // Types d'avions et hélicoptères de lutte contre les incendies et secours
  FIRE_RESCUE_TYPES: new Set([
    'CL21', 'CL41', 'CL2T', 'CL4T', // Canadair CL-215 / CL-415
    'Q400', 'DH8D',                  // Dash 8-Q400MR (Sécurité Civile)
    'S2T',                           // Tracker S2T
    'BE20', 'BE30', 'BE9L',          // Beechcraft King Air (Reconnaissance)
    'EC45', 'H145', 'EC35', 'H135',  // Hélicoptères Sécurité Civile (Dragon) & SAMU
    'AS32', 'AS35', 'AS50', 'H125',  // Écureuil / Super Puma bombardiers d'eau
    'SA33', 'R66',  'PZL',           // PZL Dromader
    'AT8T', 'AT80',                  // Air Tractor AT-802 / Fire Boss
    'C130', 'C30J',                  // C-130 Hercules (Bombardier d'eau MAFFS)
  ]),

  // Préfixes d'indicatifs radio (Callsigns)
  CALLSIGNS: {
    FIRE_RESCUE: [
      'FDF',    // Sécurité Civile France (FDF31, FDF41...)
      'DRAGON', // Hélicoptères Sécurité Civile (DRAGON33...)
      'ECU',    // Gendarmerie / Secours Montagne
      'SAMU',   // Hélicoptères Hospitaliers
      'BEECH',  // Beechcraft Secours
      'FIRE',   // Lutte contre les incendies
      'BOMB',   // Bombardier d'eau
      'TKR',    // Tracker
      'PELICAN' // Pelican (Canadair / Dash)
    ],
    MILITARY: [
      'CTM',    // Cotam (Armée de l'Air et de l'Espace)
      'FAF',    // French Air Force
      'FNY',    // French Navy (Marine Nationale)
      'FGY',    // French Gendarmerie
      'FMY',    // ALAT (Aviation Légère de l'Armée de Terre)
      'AME',    // Spanish Air Force
      'GAF',    // German Air Force
      'BAF',    // Belgian Air Force
      'RRR',    // Royal Air Force
      'IAM',    // Italian Air Force
    ]
  },

  // Expressions régulières sur l'immatriculation (Tail Number)
  REGISTRATION_PATTERNS: [
    /^F-Z/i,   // Flotte d'État Française (Secours Civile, Douanes, Gendarmerie)
    /^F-MJ/i,  // Gendarmerie Nationale
  ]
};

/**
 * Classifie un aéronef à partir des données transmises en ADS-B
 * @param {Object} aircraft - Données ADS-B (hex, flight, t, r...)
 * @returns {Object} { category, label, iconClass, color }
 */
export function classifyAircraft(aircraft) {
  const hex = (aircraft.hex || '').toUpperCase();
  const callsign = (aircraft.flight || '').trim().toUpperCase();
  const typeCode = (aircraft.t || '').toUpperCase();
  const reg = (aircraft.r || '').toUpperCase();

  // A. Vérification de la plage HEX ICAO Militaire / État Français (380000 à 3DFFFF)
  const hexNum = parseInt(hex, 16);
  const isFrenchMilitaryHex = !isNaN(hexNum) && (hexNum >= 0x380000 && hexNum <= 0x3DFFFF);

  // B. Test Incendie / Secours
  const isFireType = AIRCRAFT_DB.FIRE_RESCUE_TYPES.has(typeCode);
  const isFireCallsign = AIRCRAFT_DB.CALLSIGNS.FIRE_RESCUE.some(prefix => callsign.startsWith(prefix));
  const isStateReg = AIRCRAFT_DB.REGISTRATION_PATTERNS.some(pattern => pattern.test(reg));

  if (isFireType || isFireCallsign || (isStateReg && isFireCallsign)) {
    return {
      category: 'FIRE_RESCUE',
      label: 'Secours / Lutte Incendie',
      iconClass: 'aircraft-icon-fire',
      color: '#ff3333'
    };
  }

  // C. Test Armée / Défense
  const isMilitaryCallsign = AIRCRAFT_DB.CALLSIGNS.MILITARY.some(prefix => callsign.startsWith(prefix));

  if (isMilitaryCallsign || isFrenchMilitaryHex) {
    return {
      category: 'MILITARY',
      label: 'Armée / Forces d\'État',
      iconClass: 'aircraft-icon-military',
      color: '#ff9900'
    };
  }

  // D. Aviation Civile / Commerciale par défaut
  return {
    category: 'COMMERCIAL',
    label: 'Aviation Commerciale / Civile',
    iconClass: 'aircraft-icon-commercial',
    color: '#0099ff'
  };
}