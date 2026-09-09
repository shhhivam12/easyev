/**
 * EasyEV Contextual Insurance Intelligence & EV Protection Gap Engine
 * India EVs: Cars, Two-Wheelers and Three-Wheelers
 *
 * v2.0 — production-oriented replacement module
 *
 * IMPORTANT:
 * - Statutory tariff data, insurer features and pricing inputs must be periodically
 *   reviewed against current IRDAI notifications and insurer policy wordings.
 * - All non-regulatory OD/add-on prices below are EasyEV estimates, not insurer quotes.
 * - Final premium, IDV, eligibility, exclusions and underwriting are determined by
 *   the issuing insurer and policy wording.
 */

/* ============================================================================
 * UTILITIES
 * ========================================================================== */

const INR = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0
});

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const toNumber = (value, fallback = null) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const formatInr = (value) => INR.format(Math.round(value || 0));

const normalizeText = (value = '') =>
  String(value)
    .toLowerCase()
    .trim()
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ');

const unique = (items) => [...new Set(items.filter(Boolean))];

const isEnabled = (value) => value === true;

/* ============================================================================
 * LAYER 1 — REGULATORY / STATUTORY METADATA
 * ========================================================================== */

export const REGULATORY_METADATA = Object.freeze({
  regulatoryAuthority:
    'IRDAI (Insurance Regulatory and Development Authority of India)',

  statutoryGSTRate: 0.18,

  policyStructures: Object.freeze({
    privateElectricCar:
      'New private car package structure may include long-term third-party cover with own-damage cover as applicable under prevailing regulations.',

    electricTwoWheeler:
      'New electric two-wheeler package structure may include long-term third-party cover with own-damage cover as applicable under prevailing regulations.',

    commercialThreeWheeler:
      'Commercial three-wheeler cover is subject to applicable motor insurance and regulatory requirements.'
  }),

  sourceNotice:
    'Third-party tariff treatment must be maintained from current IRDAI/insurer-approved schedules. EasyEV should refresh these values when regulations change.',

  disclaimer:
    'This module provides contextual analysis and estimated pricing bands. It is not an insurance quote, policy document, underwriting decision, or legal advice.'
});

/**
 * NOTE:
 * Values are retained as configurable reference inputs rather than presented by
 * the engine as permanently valid "official" rates. Replace/refresh from the
 * current applicable tariff schedule when deploying commercially.
 */

export const IRDAI_EV_TP_SLABS = Object.freeze({
  ELECTRIC_PRIVATE_CARS_3_YEAR: Object.freeze([
    Object.freeze({
      slabId: 'car_sub_30kw',
      minExclusiveKw: null,
      maxKw: 30,
      label: 'Motor Power ≤ 30 kW',
      indicativeBundleInr: 5104
    }),

    Object.freeze({
      slabId: 'car_30_to_65kw',
      minExclusiveKw: 30,
      maxKw: 65,
      label: 'Motor Power > 30 kW to ≤ 65 kW',
      indicativeBundleInr: 8324
    }),

    Object.freeze({
      slabId: 'car_above_65kw',
      minExclusiveKw: 65,
      maxKw: null,
      label: 'Motor Power > 65 kW',
      indicativeBundleInr: 19216
    })
  ]),

  ELECTRIC_TWO_WHEELERS_5_YEAR: Object.freeze([
    Object.freeze({
      slabId: '2w_sub_3kw',
      minExclusiveKw: null,
      maxKw: 3,
      label: 'Motor Power ≤ 3 kW',
      indicativeBundleInr: 2901
    }),

    Object.freeze({
      slabId: '2w_3_to_7kw',
      minExclusiveKw: 3,
      maxKw: 7,
      label: 'Motor Power > 3 kW to ≤ 7 kW',
      indicativeBundleInr: 3851
    }),

    Object.freeze({
      slabId: '2w_7_to_16kw',
      minExclusiveKw: 7,
      maxKw: 16,
      label: 'Motor Power > 7 kW to ≤ 16 kW',
      indicativeBundleInr: 4914
    }),

    Object.freeze({
      slabId: '2w_above_16kw',
      minExclusiveKw: 16,
      maxKw: null,
      label: 'Motor Power > 16 kW',
      indicativeBundleInr: 7240
    })
  ]),

  ELECTRIC_THREE_WHEELERS_1_YEAR: Object.freeze([
    Object.freeze({
      slabId: '3w_e_rickshaw',
      category: 'E-Rickshaw / E-Cart',
      indicativeRateInr: 3385
    }),

    Object.freeze({
      slabId: '3w_passenger_auto',
      category: 'Electric Passenger 3-Wheeler',
      indicativeRateInr: 4210
    }),

    Object.freeze({
      slabId: '3w_cargo_goods',
      category: 'Electric Cargo Goods Carrier',
      indicativeRateInr: 4680
    })
  ])
});

/* ============================================================================
 * LAYER 2 — INSURER PROFILE MODEL
 *
 * Capability flags are intentionally separated from "verified" language.
 * Production deployments should maintain a dated source URL/policy-wording
 * reference for every capability.
 * ========================================================================== */

export const INSURER_PROFILES = Object.freeze([
  Object.freeze({
    id: 'digit-ev-shield',

    displayName: 'Digit EV Protection Profile',

    insurer: Object.freeze({
      name: 'Go Digit General Insurance',
      brandRef: 'Digit EV / Motor Insurance',
      officialWebsite: 'https://www.godigit.com/'
    }),

    segmentTier: 'digital_value',

    positioning:
      'Digital-first EV protection profile emphasizing contextual battery and charging risk assessment.',

    capabilities: Object.freeze({
      zeroDepreciationAvailable: true,
      highVoltageBatteryProtection: true,
      homeWallboxAndPanelProtection: true,
      chargingCableProtection: true,
      consequentialEVComponentCover: true,
      roadsideAssistanceEV: true,
      returnToInvoiceAvailable: true,
      tyreAndRimCoverAvailable: false
    }),

    recommendedFor: Object.freeze([
      'Urban EV owners',
      'Home charging users',
      'Digital-first claims journeys'
    ]),

    agentNarrativeHindi:
      'EasyEV ke contextual analysis ke hisaab se yeh profile un EV buyers ke liye relevant hai jinko battery, charging setup aur zero-depreciation protection par focus chahiye.',

    agentNarrativeEnglish:
      'A contextual fit for EV buyers prioritising battery exposure, charging setup protection and digital-first servicing.'
  }),

  Object.freeze({
    id: 'hdfc-ergo-ev-comprehensive',

    displayName: 'HDFC ERGO EV Comprehensive Profile',

    insurer: Object.freeze({
      name: 'HDFC ERGO General Insurance',
      brandRef: 'HDFC ERGO Motor / EV Cover',
      officialWebsite: 'https://www.hdfcergo.com/'
    }),

    segmentTier: 'balanced_recommended',

    positioning:
      'Balanced contextual profile for battery, electric drivetrain, charging and roadside assistance priorities.',

    capabilities: Object.freeze({
      zeroDepreciationAvailable: true,
      highVoltageBatteryProtection: true,
      homeWallboxAndPanelProtection: true,
      chargingCableProtection: true,
      consequentialEVComponentCover: true,
      roadsideAssistanceEV: true,
      returnToInvoiceAvailable: true,
      tyreAndRimCoverAvailable: true
    }),

    recommendedFor: Object.freeze([
      'High-value EVs',
      'Mixed city and highway use',
      'Owners seeking broad contextual protection'
    ]),

    agentNarrativeHindi:
      'Yeh balanced profile hai jahan EasyEV battery risk, flood exposure, charger setup aur roadside assistance ko ek saath evaluate karta hai.',

    agentNarrativeEnglish:
      'A balanced profile where EasyEV evaluates battery risk, flood exposure, charging setup and roadside assistance together.'
  }),

  Object.freeze({
    id: 'tata-aig-ev-secure',

    displayName: 'Tata AIG EV Protection Profile',

    insurer: Object.freeze({
      name: 'Tata AIG General Insurance',
      brandRef: 'Tata AIG Motor Insurance / Add-ons',
      officialWebsite: 'https://www.tataaig.com/'
    }),

    segmentTier: 'balanced_recommended',

    positioning:
      'Contextual profile suited to owners who prioritise comprehensive damage, component and workshop protection.',

    capabilities: Object.freeze({
      zeroDepreciationAvailable: true,
      highVoltageBatteryProtection: true,
      homeWallboxAndPanelProtection: true,
      chargingCableProtection: true,
      consequentialEVComponentCover: true,
      roadsideAssistanceEV: true,
      returnToInvoiceAvailable: true,
      tyreAndRimCoverAvailable: true
    }),

    recommendedFor: Object.freeze([
      'Rough-road exposure',
      'High urban usage',
      'Premium EV component protection'
    ]),

    agentNarrativeHindi:
      'EasyEV is profile ko un users ke liye contextual fit maanta hai jinke daily routes me road impact aur expensive EV components ka exposure zyada hai.',

    agentNarrativeEnglish:
      'A contextual fit for users whose daily routes create higher road-impact exposure for expensive EV components.'
  }),

  Object.freeze({
    id: 'icici-lombard-ev-total-protect',

    displayName: 'ICICI Lombard EV Total Protection Profile',

    insurer: Object.freeze({
      name: 'ICICI Lombard General Insurance',
      brandRef: 'ICICI Lombard Motor Insurance / Add-ons',
      officialWebsite: 'https://www.icicilombard.com/'
    }),

    segmentTier: 'platinum_rti',

    positioning:
      'High-protection contextual profile for expensive EVs where theft and total-loss recovery are major concerns.',

    capabilities: Object.freeze({
      zeroDepreciationAvailable: true,
      highVoltageBatteryProtection: true,
      homeWallboxAndPanelProtection: true,
      chargingCableProtection: true,
      consequentialEVComponentCover: true,
      roadsideAssistanceEV: true,
      returnToInvoiceAvailable: true,
      tyreAndRimCoverAvailable: true
    }),

    recommendedFor: Object.freeze([
      'Premium EVs',
      'High capital exposure',
      'Theft / total-loss risk sensitivity'
    ]),

    agentNarrativeHindi:
      'High-value EV ke liye EasyEV capital protection, total-loss exposure aur RTI suitability ko extra weight deta hai.',

    agentNarrativeEnglish:
      'For high-value EVs, EasyEV gives additional weight to capital protection, total-loss exposure and RTI suitability.'
  })
]);

/* ============================================================================
 * LAYER 3 — EASYEV CONTEXTUAL RISK MODEL
 * ========================================================================== */

export const EASYEV_HEURISTIC_CONFIG = Object.freeze({
  modelName: 'EasyEV Contextual Insurance Intelligence v2.0',

  idvEstimationFactor: Object.freeze({
    min: 0.94,
    baseline: 0.95,
    max: 0.96
  }),

  cityRiskMultipliers: Object.freeze({
    metroZoneA: Object.freeze({
      multiplier: 1.0,
      label: 'Metro / higher exposure baseline'
    }),

    tier2ZoneB: Object.freeze({
      multiplier: 0.92,
      label: 'Tier-2/3 baseline'
    })
  }),

  floodRiskDatabase: Object.freeze({
    mumbai: Object.freeze({
      risk: 'HIGH',
      score: 100,
      label: 'High monsoon waterlogging / submersion exposure'
    }),

    chennai: Object.freeze({
      risk: 'HIGH',
      score: 95,
      label: 'Cyclone and low-lying ingress exposure'
    }),

    gurgaon: Object.freeze({
      risk: 'HIGH',
      score: 85,
      label: 'Monsoon flash-waterlogging exposure'
    }),

    gurugram: Object.freeze({
      risk: 'HIGH',
      score: 85,
      label: 'Monsoon flash-waterlogging exposure'
    }),

    delhi: Object.freeze({
      risk: 'MEDIUM',
      score: 60,
      label: 'Moderate urban waterlogging exposure'
    }),

    noida: Object.freeze({
      risk: 'MEDIUM',
      score: 60,
      label: 'Moderate urban waterlogging exposure'
    }),

    bengaluru: Object.freeze({
      risk: 'MEDIUM',
      score: 65,
      label: 'Urban flash-flood / drain ingress exposure'
    }),

    bangalore: Object.freeze({
      risk: 'MEDIUM',
      score: 65,
      label: 'Urban flash-flood / drain ingress exposure'
    }),

    pune: Object.freeze({
      risk: 'LOW',
      score: 30,
      label: 'Standard contextual urban exposure'
    }),

    hyderabad: Object.freeze({
      risk: 'LOW',
      score: 30,
      label: 'Standard contextual urban exposure'
    }),

    ahmedabad: Object.freeze({
      risk: 'LOW',
      score: 25,
      label: 'Standard contextual urban exposure'
    }),

    kolkata: Object.freeze({
      risk: 'MEDIUM',
      score: 70,
      label: 'Seasonal waterlogging exposure'
    })
  }),

  defaults: Object.freeze({
    city: 'Gurgaon',
    exShowroomPriceLakh: 15,
    unknownCarKw: 75,
    unknownTwoWheelerKw: 5,
    unknownThreeWheelerRateInr: 4210
  })
});

/* ============================================================================
 * VEHICLE CLASSIFICATION
 * ========================================================================== */

export function classifyVehicle(vehicle = {}) {
  const category = normalizeText(
    vehicle.category || vehicle.vehicleCategory || ''
  );

  const name = normalizeText(
    vehicle.name || vehicle.model || ''
  );

  const combined = `${category} ${name}`;

  if (
    /three wheeler|3 wheeler|3w\b|3-wheeler|e rickshaw|e cart|electric auto|cargo/.test(
      combined
    )
  ) {
    return 'three_wheeler';
  }

  if (
    /scooter|motorcycle|bike|two wheeler|2 wheeler|2w\b|2-wheeler/.test(
      combined
    )
  ) {
    return 'two_wheeler';
  }

  return 'private_car';
}

export function matchesKwSlab(kw, slab) {
  if (!Number.isFinite(kw) || kw <= 0) return false;

  const lowerOk =
    slab.minExclusiveKw === null ||
    slab.minExclusiveKw === undefined ||
    kw > slab.minExclusiveKw;

  const upperOk =
    slab.maxKw === null ||
    slab.maxKw === undefined ||
    kw <= slab.maxKw;

  return lowerOk && upperOk;
}

/* ============================================================================
 * POWER PARSING
 *
 * Handles:
 * 90 kW
 * 90.5kW
 * 122 PS
 * 100 bhp / hp
 * 120 Nm is intentionally NOT interpreted as power.
 * ========================================================================== */

export function parseMotorPowerKw(vehicle = {}) {
  const exactKw = toNumber(vehicle.motorKw, null);

  if (exactKw !== null && exactKw > 0) {
    return {
      kw: exactKw,
      confidence: 'high',
      source: 'catalog_exact_kw'
    };
  }

  const candidates = [
    vehicle.power,
    vehicle.motorPower,
    vehicle.motor_power,
    vehicle.peakPower,
    vehicle.peak_power
  ]
    .filter(Boolean)
    .map(String);

  const rawPower = candidates.join(' | ');

  if (!rawPower) {
    return {
      kw: null,
      confidence: 'missing',
      source: 'power_missing'
    };
  }

  const kwMatch = rawPower.match(
    /(\d+(?:\.\d+)?)\s*kW/i
  );

  if (kwMatch) {
    return {
      kw: Number.parseFloat(kwMatch[1]),
      confidence: 'high',
      source: 'parsed_kw'
    };
  }

  const psMatch = rawPower.match(
    /(\d+(?:\.\d+)?)\s*(PS|bhp|hp)\b/i
  );

  if (psMatch) {
    const powerValue = Number.parseFloat(psMatch[1]);
    const unit = psMatch[2].toLowerCase();

    const convertedKw =
      unit === 'ps'
        ? powerValue * 0.73549875
        : powerValue * 0.745699872;

    return {
      kw: Math.round(convertedKw * 10) / 10,
      confidence: 'medium',
      source: `converted_from_${unit}`
    };
  }

  return {
    kw: null,
    confidence: 'low',
    source: 'unrecognized_power_format'
  };
}

/* ============================================================================
 * BATTERY / CAPITAL RISK
 * ========================================================================== */

export function assessBatteryValueRisk(
  vehicle = {},
  exShowroomLakh
) {
  const explicitBatteryKwh = toNumber(
    vehicle.batteryKwh ?? vehicle.batteryCapacityKwh,
    null
  );

  const priceLakh =
    toNumber(exShowroomLakh, null) ??
    toNumber(vehicle.priceMinLakh, null) ??
    EASYEV_HEURISTIC_CONFIG.defaults.exShowroomPriceLakh;

  let category;
  let score;
  let label;

  if (priceLakh >= 25) {
    category = 'CRITICAL';
    score = 100;

    label =
      'Very high capital exposure from traction-battery and high-voltage components';
  } else if (priceLakh >= 14) {
    category = 'HIGH';
    score = 75;

    label =
      'High battery and electric drivetrain capital exposure';
  } else if (priceLakh >= 6) {
    category = 'MEDIUM';
    score = 50;

    label =
      'Meaningful battery and high-voltage component exposure';
  } else {
    category = 'MODERATE';
    score = 30;

    label =
      'Moderate capital exposure typical of smaller EV battery systems';
  }

  if (
    explicitBatteryKwh !== null &&
    explicitBatteryKwh >= 70
  ) {
    score = clamp(score + 10, 0, 100);

    if (category !== 'CRITICAL') {
      category = 'HIGH';
    }
  }

  return {
    category,
    score,
    label,
    batteryKwh: explicitBatteryKwh
  };
}

/* ============================================================================
 * CITY / USAGE CONTEXT
 * ========================================================================== */

export function getCityRisk(city) {
  const cleanCity = normalizeText(city);

  const matchedKey = Object.keys(
    EASYEV_HEURISTIC_CONFIG.floodRiskDatabase
  ).find((key) => cleanCity.includes(key));

  return (
    EASYEV_HEURISTIC_CONFIG.floodRiskDatabase[
      matchedKey
    ] ||
    Object.freeze({
      risk: 'LOW',
      score: 25,
      label:
        'No specific EasyEV flood-risk profile available; standard urban baseline applied'
    })
  );
}

export function getUsageContext(
  chargingContext = {},
  vehicle = {}
) {
  const dailyKm = clamp(
    toNumber(chargingContext.dailyKm, 30) ?? 30,
    0,
    500
  );

  return {
    homeCharging:
      chargingContext.homeCharging !== false,

    portableCharger:
      chargingContext.portableCharger !== false,

    publicChargingFrequency:
      chargingContext.publicChargingFrequency ||
      'occasional',

    outdoorParking:
      isEnabled(chargingContext.outdoorParking),

    basementParking:
      isEnabled(chargingContext.basementParking),

    dailyKm,

    roughRoadUsage:
      isEnabled(chargingContext.roughRoadUsage),

    highwayUsage:
      isEnabled(chargingContext.highwayUsage),

    vehicleClass:
      classifyVehicle(vehicle)
  };
}

/* ============================================================================
 * PROTECTION GAP ANALYSIS
 * ========================================================================== */

export function evaluateProtectionGaps({
  vehicle = {},
  city,
  chargingContext = {},
  selectedRiders = {}
} = {}) {
  const vehicleClass = classifyVehicle(vehicle);
  const cityRisk = getCityRisk(city);
  const usage = getUsageContext(
    chargingContext,
    vehicle
  );

  const gaps = [];

  const addGap = (
    severity,
    title,
    description,
    recommendedRider,
    riskScore
  ) => {
    gaps.push({
      severity,
      title,
      description,
      recommendedRider,
      riskScore
    });
  };

  if (
    !isEnabled(
      selectedRiders.highVoltageBatteryCover
    ) &&
    ['HIGH', 'MEDIUM'].includes(cityRisk.risk)
  ) {
    addGap(
      'CRITICAL',
      'High-Voltage Water Ingress Exposure',
      `The selected location has ${cityRisk.label.toLowerCase()}. Battery and high-voltage component protection should be checked specifically against the applicable policy wording.`,
      'highVoltageBatteryCover',
      95
    );
  }

  if (
    !isEnabled(
      selectedRiders.highVoltageBatteryCover
    ) &&
    (
      usage.basementParking ||
      usage.outdoorParking
    )
  ) {
    addGap(
      'IMPORTANT',
      'Parking-Environment Battery Exposure',
      'Your parking environment increases the importance of checking water-ingress and high-voltage component exclusions.',
      'highVoltageBatteryCover',
      75
    );
  }

  if (
    !isEnabled(
      selectedRiders.wallboxAndCableProtection
    ) &&
    (
      usage.homeCharging ||
      usage.portableCharger
    )
  ) {
    addGap(
      'IMPORTANT',
      'Home Charging Equipment Exposure',
      'Your charging setup may include a wallbox, portable EVSE, cable or electrical accessories that require separate coverage verification.',
      'wallboxAndCableProtection',
      65
    );
  }

  if (
    !isEnabled(
      selectedRiders.zeroDepreciation
    )
  ) {
    addGap(
      'CRITICAL',
      'Depreciation Exposure on Repairable Components',
      'Without zero-depreciation coverage, applicable depreciation and policy deductions can increase out-of-pocket repair costs.',
      'zeroDepreciation',
      90
    );
  }

  if (
    !isEnabled(
      selectedRiders.evRoadsideAssistance
    ) &&
    (
      usage.dailyKm >= 50 ||
      usage.highwayUsage
    )
  ) {
    addGap(
      'IMPORTANT',
      'EV Recovery and Towing Exposure',
      'Higher-distance or highway usage increases the value of checking EV-compatible towing and roadside assistance.',
      'evRoadsideAssistance',
      60
    );
  }

  if (
    !isEnabled(
      selectedRiders.returnToInvoice
    ) &&
    toNumber(vehicle.priceMinLakh, 0) >= 14
  ) {
    addGap(
      'MODERATE',
      'High Capital Loss Exposure',
      'For higher-value EVs, theft or total-loss scenarios may justify evaluating Return-to-Invoice eligibility.',
      'returnToInvoice',
      45
    );
  }

  if (
    !isEnabled(
      selectedRiders.tyreAndRimCover
    ) &&
    usage.roughRoadUsage
  ) {
    addGap(
      'MODERATE',
      'Tyre and Rim Road-Impact Exposure',
      'Frequent rough-road use increases the value of evaluating tyre and rim protection where available.',
      'tyreAndRimCover',
      40
    );
  }

  return {
    cityRisk,
    usage,

    gaps: gaps.sort(
      (a, b) => b.riskScore - a.riskScore
    ),

    totalRiskPoints:
      gaps.reduce(
        (sum, gap) =>
          sum + gap.riskScore,
        0
      )
  };
}

/* ============================================================================
 * STATUTORY / TP SLAB RESOLUTION
 * ========================================================================== */

function resolveThreeWheelerSlab(
  vehicle = {}
) {
  const text = normalizeText(
    `${vehicle.category || ''} ${
      vehicle.name || ''
    } ${vehicle.bodyType || ''}`
  );

  if (
    /rickshaw|e cart|cart/.test(text)
  ) {
    return IRDAI_EV_TP_SLABS
      .ELECTRIC_THREE_WHEELERS_1_YEAR[0];
  }

  if (
    /cargo|goods|kargo|zor/.test(text)
  ) {
    return IRDAI_EV_TP_SLABS
      .ELECTRIC_THREE_WHEELERS_1_YEAR[2];
  }

  return IRDAI_EV_TP_SLABS
    .ELECTRIC_THREE_WHEELERS_1_YEAR[1];
}

export function resolveStatutoryTp({
  vehicle = {},
  powerParse = null
} = {}) {
  const vehicleClass =
    classifyVehicle(vehicle);

  const parsed =
    powerParse ||
    parseMotorPowerKw(vehicle);

  if (
    vehicleClass === 'two_wheeler'
  ) {
    const effectiveKw =
      parsed.kw ??
      EASYEV_HEURISTIC_CONFIG.defaults
        .unknownTwoWheelerKw;

    const slab =
      IRDAI_EV_TP_SLABS
        .ELECTRIC_TWO_WHEELERS_5_YEAR
        .find((item) =>
          matchesKwSlab(
            effectiveKw,
            item
          )
        ) ||
      IRDAI_EV_TP_SLABS
        .ELECTRIC_TWO_WHEELERS_5_YEAR[1];

    return {
      vehicleClass,
      effectiveKw,
      slab,

      statutoryTpInr:
        slab.indicativeBundleInr,

      tenureRule:
        'Indicative long-term TP reference for electric two-wheelers'
    };
  }

  if (
    vehicleClass === 'three_wheeler'
  ) {
    const slab =
      resolveThreeWheelerSlab(vehicle);

    return {
      vehicleClass,
      effectiveKw:
        parsed.kw,

      slab,

      statutoryTpInr:
        slab.indicativeRateInr,

      tenureRule:
        'Indicative annual TP reference for electric three-wheelers'
    };
  }

  const effectiveKw =
    parsed.kw ??
    EASYEV_HEURISTIC_CONFIG.defaults
      .unknownCarKw;

  const slab =
    IRDAI_EV_TP_SLABS
      .ELECTRIC_PRIVATE_CARS_3_YEAR
      .find((item) =>
        matchesKwSlab(
          effectiveKw,
          item
        )
      ) ||
    IRDAI_EV_TP_SLABS
      .ELECTRIC_PRIVATE_CARS_3_YEAR[2];

  return {
    vehicleClass,
    effectiveKw,
    slab,

    statutoryTpInr:
      slab.indicativeBundleInr,

    tenureRule:
      'Indicative long-term TP reference for electric private cars'
  };
}

/* ============================================================================
 * PLAN CAPABILITY MATCH
 * ========================================================================== */

export function getInsurerProfile(
  planId
) {
  return (
    INSURER_PROFILES.find(
      (profile) =>
        profile.id === planId
    ) ||
    INSURER_PROFILES.find(
      (profile) =>
        profile.id ===
        'hdfc-ergo-ev-comprehensive'
    ) ||
    INSURER_PROFILES[0]
  );
}

export function calculatePlanCapabilityScore(
  plan,
  context
) {
  let score = 60;

  const reasons = [];

  const cityRisk =
    context.cityRisk;

  const usage =
    context.usage;

  const priceLakh =
    context.priceLakh;

  if (
    plan.capabilities
      .zeroDepreciationAvailable
  ) {
    score += 8;

    reasons.push(
      'Zero-depreciation capability'
    );
  }

  if (
    plan.capabilities
      .highVoltageBatteryProtection &&
    ['HIGH', 'MEDIUM'].includes(
      cityRisk.risk
    )
  ) {
    score += 10;

    reasons.push(
      'High-voltage protection aligned with water-ingress context'
    );
  }

  if (
    plan.capabilities
      .homeWallboxAndPanelProtection &&
    usage.homeCharging
  ) {
    score += 6;

    reasons.push(
      'Home charging equipment alignment'
    );
  }

  if (
    plan.capabilities
      .roadsideAssistanceEV &&
    (
      usage.dailyKm >= 50 ||
      usage.highwayUsage
    )
  ) {
    score += 5;

    reasons.push(
      'Higher-distance EV assistance alignment'
    );
  }

  if (
    plan.capabilities
      .returnToInvoiceAvailable &&
    priceLakh >= 14
  ) {
    score += 6;

    reasons.push(
      'Higher capital-loss recovery suitability'
    );
  }

  if (
    plan.capabilities
      .tyreAndRimCoverAvailable &&
    usage.roughRoadUsage
  ) {
    score += 3;

    reasons.push(
      'Rough-road tyre/rim exposure alignment'
    );
  }

  return {
    score: clamp(
      score,
      0,
      100
    ),

    reasons
  };
}

/* ============================================================================
 * ADD-ON ESTIMATION
 * ========================================================================== */

function estimateAddOns({
  estimatedIdvMin,
  estimatedIdvMax,
  exShowroomInr,
  selectedRiders,
  vehicleClass
}) {
  let min = 0;
  let max = 0;

  const breakdown = [];

  const add = (
    rider,
    costMin,
    costMax,
    impact
  ) => {
    min += costMin;
    max += costMax;

    breakdown.push({
      rider,
      minInr: costMin,
      maxInr: costMax,

      range:
        `${formatInr(costMin)} – ${formatInr(costMax)}`,

      impact
    });
  };

  if (
    isEnabled(
      selectedRiders.zeroDepreciation
    )
  ) {
    add(
      'Zero Depreciation',

      Math.round(
        estimatedIdvMin * 0.0045
      ),

      Math.round(
        estimatedIdvMax * 0.0055
      ),

      'Reduces applicable depreciation-related out-of-pocket exposure'
    );
  }

  if (
    isEnabled(
      selectedRiders.highVoltageBatteryCover
    )
  ) {
    const multiplier =
      vehicleClass === 'two_wheeler'
        ? 0.0008
        : vehicleClass === 'three_wheeler'
          ? 0.001
          : 0.0012;

    add(
      'High-Voltage Battery / EV Component Protection',

      Math.round(
        Math.max(
          1200,
          exShowroomInr *
            multiplier
        )
      ),

      Math.round(
        Math.max(
          2000,
          exShowroomInr *
            (
              multiplier +
              0.0004
            )
        )
      ),

      'Contextual protection for expensive EV component exposure'
    );
  }

  if (
    isEnabled(
      selectedRiders.wallboxAndCableProtection
    )
  ) {
    add(
      'Home Wallbox and Charging Cable Protection',
      950,
      1400,
      'Addresses contextual charging-equipment exposure'
    );
  }

  if (
    isEnabled(
      selectedRiders.returnToInvoice
    )
  ) {
    add(
      'Return To Invoice',

      Math.round(
        estimatedIdvMin *
          0.0035
      ),

      Math.round(
        estimatedIdvMax *
          0.0045
      ),

      'Higher capital recovery protection in eligible total-loss scenarios'
    );
  }

  if (
    isEnabled(
      selectedRiders.evRoadsideAssistance
    )
  ) {
    add(
      'EV Roadside Assistance',
      650,
      900,
      'Supports contextual towing and roadside recovery needs'
    );
  }

  if (
    isEnabled(
      selectedRiders.tyreAndRimCover
    )
  ) {
    add(
      'Tyre and Rim Protection',
      900,
      1600,
      'Useful for high road-impact or rough-road exposure'
    );
  }

  return {
    min,
    max,
    breakdown
  };
}

/* ============================================================================
 * CONFIDENCE SCORING
 * ========================================================================== */

export function calculateConfidence({
  powerParse,
  vehicle,
  city
}) {
  let score = 65;

  const factors = [];

  if (
    powerParse.confidence ===
    'high'
  ) {
    score += 25;

    factors.push(
      'Exact or directly parsed motor power'
    );
  } else if (
    powerParse.confidence ===
    'medium'
  ) {
    score += 15;

    factors.push(
      'Motor power converted from PS/bhp/hp'
    );
  } else {
    factors.push(
      'Motor power fallback used'
    );
  }

  if (
    vehicle?.name
  ) {
    score += 5;

    factors.push(
      'Vehicle identity supplied'
    );
  }

  if (
    vehicle?.category
  ) {
    score += 3;

    factors.push(
      'Vehicle category supplied'
    );
  }

  if (
    getCityRisk(city).label
  ) {
    score += 2;

    factors.push(
      'Location context supplied'
    );
  }

  score = clamp(
    score,
    0,
    100
  );

  return {
    score,

    label:
      score >= 90
        ? 'High Confidence'
        : score >= 75
          ? 'Good Confidence'
          : 'Estimated Confidence',

    factors
  };
}

/* ============================================================================
 * MAIN ENGINE
 * ========================================================================== */

export function calculateContextualEVInsurance({
  vehicle = {},

  exShowroomPriceLakh,

  city =
    EASYEV_HEURISTIC_CONFIG.defaults
      .city,

  planId =
    'hdfc-ergo-ev-comprehensive',

  chargingContext = {
    homeCharging: true,
    portableCharger: true
  },

  selectedRiders = {
    zeroDepreciation: true,
    highVoltageBatteryCover: true,
    wallboxAndCableProtection: true,
    returnToInvoice: false,
    evRoadsideAssistance: true,
    tyreAndRimCover: false
  }
} = {}) {
  const plan =
    getInsurerProfile(planId);

  const priceLakh =
    toNumber(
      exShowroomPriceLakh,
      null
    ) ??
    toNumber(
      vehicle?.priceMinLakh,
      null
    ) ??
    EASYEV_HEURISTIC_CONFIG.defaults
      .exShowroomPriceLakh;

  const exShowroomInr =
    Math.round(
      priceLakh *
      100000
    );

  /* 1. IDV */

  const estimatedIdvMin =
    Math.round(
      exShowroomInr *
      EASYEV_HEURISTIC_CONFIG
        .idvEstimationFactor.min
    );

  const estimatedIdvMax =
    Math.round(
      exShowroomInr *
      EASYEV_HEURISTIC_CONFIG
        .idvEstimationFactor.max
    );

  const idvBaseline =
    Math.round(
      exShowroomInr *
      EASYEV_HEURISTIC_CONFIG
        .idvEstimationFactor.baseline
    );

  /* 2. Motor power + TP slab */

  const powerParse =
    parseMotorPowerKw(vehicle);

  const tpResolution =
    resolveStatutoryTp({
      vehicle,
      powerParse
    });

  /* 3. City context */

  const cityRisk =
    getCityRisk(city);

  const metroCities = [
    'delhi',
    'gurgaon',
    'gurugram',
    'noida',
    'mumbai',
    'bengaluru',
    'bangalore',
    'pune',
    'hyderabad',
    'chennai',
    'kolkata',
    'ahmedabad'
  ];

  const cleanCity =
    normalizeText(city);

  const isMetro =
    metroCities.some(
      (metro) =>
        cleanCity.includes(
          metro
        )
    );

  const cityMultiplier =
    isMetro
      ? EASYEV_HEURISTIC_CONFIG
          .cityRiskMultipliers
          .metroZoneA
          .multiplier
      : EASYEV_HEURISTIC_CONFIG
          .cityRiskMultipliers
          .tier2ZoneB
          .multiplier;

  /* 4. Base OD estimate */

  const baseOdMin =
    Math.round(
      estimatedIdvMin *
      0.0145 *
      cityMultiplier
    );

  const baseOdMax =
    Math.round(
      estimatedIdvMax *
      0.017 *
      cityMultiplier
    );

  /* 5. Add-ons */

  const addOns =
    estimateAddOns({
      estimatedIdvMin,
      estimatedIdvMax,
      exShowroomInr,
      selectedRiders,

      vehicleClass:
        tpResolution
          .vehicleClass
    });

  /* 6. GST */

  const netMin =
    tpResolution.statutoryTpInr +
    baseOdMin +
    addOns.min;

  const netMax =
    tpResolution.statutoryTpInr +
    baseOdMax +
    addOns.max;

  const gstMin =
    Math.round(
      netMin *
      REGULATORY_METADATA
        .statutoryGSTRate
    );

  const gstMax =
    Math.round(
      netMax *
      REGULATORY_METADATA
        .statutoryGSTRate
    );

  const totalMinInr =
    netMin +
    gstMin;

  const totalMaxInr =
    netMax +
    gstMax;

  /* 7. Protection analysis */

  const batteryRisk =
    assessBatteryValueRisk(
      vehicle,
      priceLakh
    );

  const gapEvaluation =
    evaluateProtectionGaps({
      vehicle,
      city,
      chargingContext,
      selectedRiders
    });

  /* 8. Suitability */

  let matchScore = 65;

  if (
    isEnabled(
      selectedRiders.zeroDepreciation
    )
  ) {
    matchScore += 10;
  }

  if (
    isEnabled(
      selectedRiders.highVoltageBatteryCover
    )
  ) {
    matchScore += 12;
  }

  if (
    isEnabled(
      selectedRiders
        .wallboxAndCableProtection
    ) &&
    gapEvaluation
      .usage
      .homeCharging
  ) {
    matchScore += 5;
  }

  if (
    isEnabled(
      selectedRiders
        .evRoadsideAssistance
    )
  ) {
    matchScore += 3;
  }

  if (
    isEnabled(
      selectedRiders
        .returnToInvoice
    ) &&
    priceLakh >= 14
  ) {
    matchScore += 4;
  }

  if (
    isEnabled(
      selectedRiders
        .tyreAndRimCover
    ) &&
    gapEvaluation
      .usage
      .roughRoadUsage
  ) {
    matchScore += 2;
  }

  const unresolvedPenalty =
    gapEvaluation.gaps.reduce(
      (sum, gap) =>
        sum +
        (
          gap.severity ===
          'CRITICAL'
            ? 8
            : gap.severity ===
              'IMPORTANT'
                ? 4
                : 2
        ),
      0
    );

  matchScore =
    clamp(
      matchScore -
        unresolvedPenalty,
      0,
      98
    );

  const planCapability =
    calculatePlanCapabilityScore(
      plan,
      {
        cityRisk,

        usage:
          gapEvaluation
            .usage,

        priceLakh
      }
    );

  const finalSuitabilityScore =
    Math.round(
      clamp(
        matchScore *
          0.7 +
          planCapability.score *
            0.3,
        0,
        98
      )
    );

  const confidence =
    calculateConfidence({
      powerParse,
      vehicle,
      city
    });

  const protectionPriorities =
    unique(
      gapEvaluation.gaps
        .slice(0, 3)
        .map(
          (gap) =>
            gap.recommendedRider
        )
        .concat(
          selectedRiders
            .highVoltageBatteryCover
            ? []
            : [
                'highVoltageBatteryCover'
              ]
        )
    );

  return {
    engineMetadata: {
      model:
        EASYEV_HEURISTIC_CONFIG
          .modelName,

      generatedAt:
        new Date()
          .toISOString(),

      confidence,

      disclaimer:
        'EasyEV provides contextual insurance intelligence and estimated protection bands. Regulatory tariffs, insurer features and policy wordings must be refreshed and verified before commercial quoting.'
    },

    vehicleSummary: {
      name:
        vehicle?.name ||
        vehicle?.model ||
        'Selected EV',

      category:
        vehicle?.category ||
        (
          tpResolution.vehicleClass ===
          'private_car'
            ? 'Electric Car'
            : tpResolution.vehicleClass ===
              'two_wheeler'
                ? 'Electric Two-Wheeler'
                : 'Electric Three-Wheeler'
        ),

      vehicleClass:
        tpResolution.vehicleClass,

      exShowroomInr,

      exShowroomPriceLakh:
        priceLakh,

      estimatedIdvRange: {
        min:
          estimatedIdvMin,

        baseline:
          idvBaseline,

        max:
          estimatedIdvMax
      },

      parsedMotorKw:
        tpResolution
          .effectiveKw,

      powerParseConfidence:
        powerParse
          .confidence,

      powerSource:
        powerParse
          .source,

      batteryValueRisk:
        batteryRisk
    },

    regulatoryTpDetails: {
      slabMatched:
        tpResolution.slab.label ||
        tpResolution.slab.category ||
        'Applicable reference slab',

      statutoryRateInr:
        tpResolution
          .statutoryTpInr,

      tenureRule:
        tpResolution
          .tenureRule,

      authority:
        REGULATORY_METADATA
          .regulatoryAuthority,

      note:
        'Reference values should be validated against the currently applicable tariff schedule before production use.'
    },

    selectedPlan: {
      id:
        plan.id,

      displayName:
        plan.displayName,

      insurerName:
        plan.insurer.name,

      brandRef:
        plan.insurer.brandRef,

      officialWebsite:
        plan.insurer
          .officialWebsite,

      segmentTier:
        plan.segmentTier,

      positioning:
        plan.positioning,

      capabilities:
        plan.capabilities,

      recommendedFor:
        plan.recommendedFor,

      agentPitchHindi:
        plan.agentNarrativeHindi,

      agentPitchEnglish:
        plan.agentNarrativeEnglish,

      capabilityMatchScore:
        planCapability
          .score,

      capabilityReasons:
        planCapability
          .reasons
    },

    pricingEstimate: {
      formattedBand:
        `${formatInr(
          totalMinInr
        )} – ${formatInr(
          totalMaxInr
        )}`,

      totalMinInr,
      totalMaxInr,

      pricingType:
        'EasyEV contextual estimate — not insurer quote',

      components: {
        statutoryTpInr:
          tpResolution
            .statutoryTpInr,

        baseOwnDamageRange: {
          min:
            baseOdMin,

          max:
            baseOdMax
        },

        addOnsRange: {
          min:
            addOns.min,

          max:
            addOns.max
        },

        gstRange: {
          min:
            gstMin,

          max:
            gstMax
        }
      },

      whatYouArePayingExtraFor:
        addOns.breakdown
    },

    suitabilityAnalysis: {
      protectionMatchScore:
        finalSuitabilityScore,

      rawCoverageScore:
        matchScore,

      planCapabilityScore:
        planCapability.score,

      cityFloodRiskContext:
        cityRisk,

      usageContext:
        gapEvaluation.usage,

      batteryRisk,

      coverageGapsIdentified:
        gapEvaluation.gaps,

      recommendedProtectionPriorities:
        protectionPriorities,

      whyThisEstimate: [
        `Motor power context: ${
          tpResolution.effectiveKw ??
          'estimated'
        } kW mapped to '${
          tpResolution.slab.label ||
          tpResolution.slab.category
        }'.`,

        `Estimated IDV baseline: ${formatInr(
          idvBaseline
        )} based on EasyEV's configurable new-EV estimation factor.`,

        `Location context: ${
          cityRisk.label
        }.`,

        `Battery exposure: ${
          batteryRisk.category
        } — ${
          batteryRisk.label
        }.`,

        `Regional pricing baseline: ${
          isMetro
            ? 'metro'
            : 'Tier-2/3'
        } multiplier applied.`,

        `Plan capability score: ${
          planCapability.score
        }/100 based on selected contextual priorities.`
      ]
    },

    explainability: {
      scoreFormula:
        'Final suitability = 70% selected protection fit + 30% plan capability alignment, with unresolved protection-gap penalties.',

      assumptions: [
        'Own-damage and add-on values are EasyEV heuristic estimates.',

        'TP reference values are configurable tariff inputs and must be refreshed against current regulations.',

        'Actual insurer quotes depend on IDV, location, vehicle variant, claims history, age, underwriting and policy terms.'
      ]
    }
  };
}

/* ============================================================================
 * DECISION PASSPORT / SMART STAGE DOSSIER
 * ========================================================================== */

export function getTailoredInsuranceDossier(
  vehicle,

  city =
    EASYEV_HEURISTIC_CONFIG.defaults
      .city,

  exShowroomPriceLakh =
    EASYEV_HEURISTIC_CONFIG.defaults
      .exShowroomPriceLakh
) {
  return calculateContextualEVInsurance({
    vehicle,
    city,
    exShowroomPriceLakh,

    chargingContext: {
      homeCharging: true,
      portableCharger: true,

      publicChargingFrequency:
        'occasional',

      outdoorParking:
        false,

      basementParking:
        false,

      dailyKm:
        30,

      roughRoadUsage:
        false,

      highwayUsage:
        false
    },

    selectedRiders: {
      zeroDepreciation:
        true,

      highVoltageBatteryCover:
        true,

      wallboxAndCableProtection:
        true,

      returnToInvoice:
        false,

      evRoadsideAssistance:
        true,

      tyreAndRimCover:
        false
    }
  });
}


/**
 * Returns all evaluated insurer plans tailored for the vehicle and user context,
 * sorted by final suitability match score.
 */
export function getTailoredInsuranceCatalog({
  vehicle = {},
  city = EASYEV_HEURISTIC_CONFIG.defaults.city,
  exShowroomPriceLakh,
  chargingContext,
  selectedRiders
} = {}) {
  return INSURER_PROFILES.map((profile) =>
    calculateContextualEVInsurance({
      vehicle,
      city,
      exShowroomPriceLakh,
      planId: profile.id,
      chargingContext,
      selectedRiders
    })
  ).sort((a, b) => b.suitabilityAnalysis.protectionMatchScore - a.suitabilityAnalysis.protectionMatchScore);
}

/* ============================================================================
 * BACKWARD-FRIENDLY ALIASES & COMPATIBILITY LAYER
 * ========================================================================== */

export const EV_INSURANCE_PLANS = INSURER_PROFILES;
export const VERIFIED_INSURER_PROFILES = INSURER_PROFILES;
export const calculateEVInsuranceEstimate = calculateContextualEVInsurance;

export default Object.freeze({
  REGULATORY_METADATA,
  IRDAI_EV_TP_SLABS,
  INSURER_PROFILES,
  VERIFIED_INSURER_PROFILES,
  EV_INSURANCE_PLANS,
  EASYEV_HEURISTIC_CONFIG,
  matchesKwSlab,
  classifyVehicle,
  parseMotorPowerKw,
  assessBatteryValueRisk,
  getCityRisk,
  getUsageContext,
  evaluateProtectionGaps,
  resolveStatutoryTp,
  getInsurerProfile,
  calculatePlanCapabilityScore,
  calculateConfidence,
  calculateContextualEVInsurance,
  calculateEVInsuranceEstimate,
  getTailoredInsuranceDossier,
  getTailoredInsuranceCatalog
});
