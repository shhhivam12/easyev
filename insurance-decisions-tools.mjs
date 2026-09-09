/**
 * EasyEV Dedicated Insurance Decision Tool
 * =========================================
 *
 * Production-grade contextual AI tool layer for EV insurance intelligence.
 *
 * Responsibilities:
 * 1. Resolve the buyer's EV safely.
 * 2. Resolve city context without hidden location assumptions.
 * 3. Read relevant Buyer Decision Passport signals.
 * 4. Build base / recommended / custom rider configurations.
 * 5. Generate an indicative insurance dossier via the deterministic
 *    EasyEV insurance intelligence engine.
 * 6. Compare/rank insurer profiles when multiple plans are available.
 * 7. Detect contextual protection gaps and critical EV risks.
 * 8. Produce auditable confidence and calculation-quality metadata.
 * 9. Update the Buyer Decision Passport and contextual next actions.
 * 10. Return a Smart Stage-ready payload for the EasyEV frontend.
 *
 * IMPORTANT:
 * - This is NOT a live insurer quote engine.
 * - Indicative OD/add-on values come from the EasyEV insurance engine.
 * - Final premium, IDV, eligibility, deductibles, exclusions and coverage
 *   are determined by the issuing insurer and applicable policy wording.
 * - Regulatory inputs in easyev-insurance-catalog.mjs must be refreshed
 *   against current IRDAI material before commercial deployment.
 */

/* ============================================================================
 * IMPORTS
 * ========================================================================== */

import * as z from 'zod/v4';

import {
  calculateContextualEVInsurance,
  getTailoredInsuranceCatalog,
  getCityRisk,
  assessBatteryValueRisk
} from './easyev-insurance-catalog.mjs';

/* ============================================================================
 * CONSTANTS
 * ========================================================================== */

export const INSURANCE_PLAN_TIERS = Object.freeze([
  'digital_value',
  'balanced_recommended',
  'platinum_rti',
  'all'
]);

export const INSURANCE_COVERAGE_MODES = Object.freeze([
  'base',
  'recommended',
  'custom'
]);

export const MATCH_TYPES = Object.freeze([
  'EXACT_MATCH',
  'ALIAS_MATCH',
  'FUZZY_MATCH',
  'SHORTLIST_CONTEXT',
  'UNKNOWN'
]);

export const DEFAULT_PLAN_ID_BY_TIER = Object.freeze({
  digital_value: 'digit-ev-shield',
  balanced_recommended: 'hdfc-ergo-ev-comprehensive',
  platinum_rti: 'icici-lombard-ev-total-protect'
});

export const BATTERY_CRITICAL_GAP_TYPES = Object.freeze([
  'BATTERY_WATER_INGRESS_EXCLUDED',
  'TRACTION_BATTERY_EXCLUDED',
  'HIGH_VOLTAGE_BATTERY_EXCLUDED',
  'BATTERY_WATER_DAMAGE_EXCLUDED'
]);

/* ============================================================================
 * GENERIC HELPERS
 * ========================================================================== */

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeToken(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function asFiniteNumber(value, fallback = null) {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

function isFiniteNumber(value) {
  if (value === null || value === undefined || value === '') {
    return false;
  }

  return Number.isFinite(Number(value));
}

function dedupeStrings(values) {
  return [...new Set(
    safeArray(values).filter(
      (value) =>
        typeof value === 'string' &&
        value.trim().length > 0
    )
  )];
}

function parseBoolean(value) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (
    value === 'true' ||
    value === '1' ||
    value === 1
  ) {
    return true;
  }

  if (
    value === 'false' ||
    value === '0' ||
    value === 0
  ) {
    return false;
  }

  return undefined;
}

function firstPresentBoolean(...values) {
  for (const value of values) {
    const parsed = parseBoolean(value);

    if (parsed !== undefined) {
      return parsed;
    }
  }

  return undefined;
}

function formatInr(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return 'N/A';
  }

  return `₹${Math.round(number).toLocaleString('en-IN')}`;
}

function scoreFromPlan(plan) {
  const candidates = [
    plan?.suitabilityAnalysis?.protectionMatchScore,
    plan?.suitabilityAnalysis?.finalSuitabilityScore,
    plan?.contextScore,
    plan?.protectionMatchScore,
    plan?.matchScore,
    plan?.score
  ];

  for (const candidate of candidates) {
    const score = Number(candidate);

    if (Number.isFinite(score)) {
      return score;
    }
  }

  return 0;
}

function extractPlanId(plan) {
  return (
    plan?.planId ??
    plan?.selectedPlan?.id ??
    plan?.id ??
    plan?.insurer?.id ??
    null
  );
}

function extractPlanName(plan) {
  return (
    plan?.selectedPlan?.displayName ??
    plan?.displayName ??
    plan?.planName ??
    plan?.name ??
    'Insurance Plan'
  );
}

/* ============================================================================
 * ZOD TOOL CONTRACT
 * ========================================================================== */

export const insuranceToolDefinition = Object.freeze({
  name: 'explore_ev_insurance',

  description:
    'Contextual EV insurance intelligence for a vehicle the buyer is considering. ' +
    'Use for insurance cost questions, battery/electrical protection, zero depreciation, ' +
    'charger protection, Return-to-Invoice, roadside assistance, protection gaps and ' +
    'on-road EV purchase decisions. Produces an indicative estimate and an explainable ' +
    'protection recommendation; it is not a binding insurer quote.',

  inputSchema: {
    vehicle: z
      .string()
      .optional()
      .describe(
        'EV model or variant name, e.g. Nexon.ev, Punch.ev, BE 6'
      ),

    vehicleName: z.string().optional(),
    model: z.string().optional(),
    name: z.string().optional(),

    city: z
      .string()
      .optional()
      .describe(
        'Registration city, e.g. Pune, Mumbai, Delhi, Gurgaon'
      ),

    location: z.string().optional(),
    rtoCity: z.string().optional(),

    planTier: z
      .enum(INSURANCE_PLAN_TIERS)
      .optional()
      .describe(
        'Preferred plan tier. Use all for multi-plan comparison.'
      ),

    coverageMode: z
      .enum(INSURANCE_COVERAGE_MODES)
      .optional()
      .describe(
        'base = minimal reference, recommended = EasyEV contextual recommendation, custom = explicit rider overrides'
      ),

    planId: z.string().optional(),
    plan: z.string().optional(),

    zeroDepreciation: z.boolean().optional(),

    batteryCover: z.boolean().optional(),
    highVoltageBatteryCover: z.boolean().optional(),

    chargerCover: z.boolean().optional(),
    wallboxAndCableProtection: z.boolean().optional(),

    returnToInvoice: z.boolean().optional(),
    rti: z.boolean().optional(),

    evRoadsideAssistance: z.boolean().optional(),
    rsa: z.boolean().optional(),

    tyreAndRimCover: z.boolean().optional(),
    tyreCover: z.boolean().optional()
  }
});

/* ============================================================================
 * VEHICLE RESOLUTION
 * ========================================================================== */

function resolveVehicleRequest(input, firstDefined) {
  if (typeof firstDefined === 'function') {
    return (
      firstDefined(
        input,
        ['vehicle', 'vehicleName', 'model', 'name']
      ) ?? null
    );
  }

  return (
    input?.vehicle ??
    input?.vehicleName ??
    input?.model ??
    input?.name ??
    null
  );
}

function normalizeResolutionResult(result) {
  if (!result) {
    return {
      resolved: [],
      confidence: null,
      matchType: null
    };
  }

  if (Array.isArray(result)) {
    return {
      resolved: result,
      confidence: null,
      matchType: null
    };
  }

  return {
    resolved: safeArray(result.resolved),
    confidence: asFiniteNumber(
      result.confidence,
      null
    ),
    matchType:
      result.matchType ??
      result.type ??
      null
  };
}

function determineVehicleMatch({
  requested,
  vehicle,
  resolverConfidence,
  resolverMatchType
}) {
  if (!vehicle) {
    return {
      matchType: 'UNKNOWN',
      confidence: 0
    };
  }

  const requestedToken =
    normalizeToken(requested);

  const resolvedToken =
    normalizeToken(
      vehicle.name ??
      vehicle.model ??
      vehicle.displayName
    );

  /*
   * Exact normalized name match is deterministic.
   */
  if (
    requested &&
    requestedToken &&
    resolvedToken &&
    requestedToken === resolvedToken
  ) {
    return {
      matchType: 'EXACT_MATCH',
      confidence: 1
    };
  }

  const numericResolverConfidence =
    asFiniteNumber(
      resolverConfidence,
      null
    );

  if (
    resolverMatchType === 'exact' ||
    resolverMatchType === 'EXACT_MATCH'
  ) {
    return {
      matchType: 'EXACT_MATCH',
      confidence:
        numericResolverConfidence ?? 1
    };
  }

  if (
    resolverMatchType === 'alias' ||
    resolverMatchType === 'ALIAS_MATCH'
  ) {
    return {
      matchType: 'ALIAS_MATCH',
      confidence:
        numericResolverConfidence ?? 0.92
    };
  }

  if (
    resolverMatchType === 'fuzzy' ||
    resolverMatchType === 'FUZZY_MATCH'
  ) {
    return {
      matchType: 'FUZZY_MATCH',
      confidence:
        numericResolverConfidence ?? 0.70
    };
  }

  if (requested && resolvedToken) {
    return {
      matchType: 'FUZZY_MATCH',
      confidence:
        numericResolverConfidence ?? 0.70
    };
  }

  return {
    matchType: 'UNKNOWN',
    confidence:
      numericResolverConfidence ?? 0
  };
}

/* ============================================================================
 * CITY RESOLUTION
 * ========================================================================== */

function resolveCityRequest(
  input,
  record,
  firstDefined
) {
  let city = null;

  if (typeof firstDefined === 'function') {
    city =
      firstDefined(
        input,
        ['city', 'location', 'rtoCity']
      ) ?? null;

    if (city) {
      return {
        city: String(city).trim(),
        source: 'EXPLICIT_INPUT'
      };
    }
  } else {
    city =
      input?.city ??
      input?.location ??
      input?.rtoCity ??
      null;

    if (city) {
      return {
        city: String(city).trim(),
        source: 'EXPLICIT_INPUT'
      };
    }
  }

  const profileCity =
    record?.passport?.profile?.city;

  if (profileCity) {
    return {
      city:
        String(profileCity).trim(),
      source:
        'PASSPORT_PROFILE'
    };
  }

  const locationLabel =
    record?.passport?.location?.label;

  if (locationLabel) {
    return {
      city:
        String(locationLabel).trim(),
      source:
        'PASSPORT_LOCATION'
    };
  }

  return {
    city: null,
    source: 'NATIONAL_BASELINE'
  };
}

/* ============================================================================
 * BUYER PROFILE / USAGE CONTEXT
 * ========================================================================== */

function buildChargingContext(profile) {
  const chargingValue =
    String(
      profile?.charging ?? ''
    )
      .trim()
      .toLowerCase();

  const explicitHomeCharging =
    parseBoolean(
      profile?.homeCharging
    );

  const homeCharging =
    explicitHomeCharging !== undefined
      ? explicitHomeCharging
      : chargingValue === 'home';

  const dailyKm =
    isFiniteNumber(profile?.dailyKm)
      ? Number(profile.dailyKm)
      : null;

  return {
    homeCharging,

    chargingSetupKnown:
      explicitHomeCharging !== undefined ||
      hasOwn(profile, 'charging'),

    portableCharger:
      parseBoolean(
        profile?.portableCharger
      ),

    dailyKm,

    dailyKmKnown:
      dailyKm !== null,

    outdoorParking:
      parseBoolean(
        profile?.outdoorParking
      ) ?? false,

    basementParking:
      parseBoolean(
        profile?.basementParking
      ) ?? false,

    roughRoadUsage:
      parseBoolean(
        profile?.roughRoadUsage
      ) ?? false,

    highwayUsage:
      parseBoolean(
        profile?.highwayUsage
      ) ?? false,

    publicChargingFrequency:
      profile?.publicChargingFrequency ??
      null
  };
}

/* ============================================================================
 * RECOMMENDED RIDER ENGINE
 * ========================================================================== */

function calculateRecommendedRiders({
  vehicle,
  cityRisk,
  chargingContext,
  priceLakh
}) {
  const batteryRisk =
    assessBatteryValueRisk(
      vehicle,
      priceLakh
    ) ?? {
      category: 'UNKNOWN'
    };

  const highValue =
    Number.isFinite(priceLakh) &&
    priceLakh >= 18;

  const batteryRiskHigh =
    ['HIGH', 'CRITICAL'].includes(
      batteryRisk.category
    );

  const elevatedFloodRisk =
    cityRisk?.risk === 'HIGH' ||
    cityRisk?.risk === 'MEDIUM';

  return {
    /*
     * Zero-depreciation is useful in a new-vehicle purchase journey,
     * but remains a recommendation rather than a guarantee of eligibility.
     */
    zeroDepreciation: true,

    highVoltageBatteryCover:
      batteryRiskHigh ||
      elevatedFloodRisk,

    wallboxAndCableProtection:
      chargingContext.chargingSetupKnown &&
      chargingContext.homeCharging,

    returnToInvoice:
      highValue,

    evRoadsideAssistance:
      (
        chargingContext.dailyKm !== null &&
        chargingContext.dailyKm >= 30
      ) ||
      chargingContext.highwayUsage,

    tyreAndRimCover:
      chargingContext.roughRoadUsage
  };
}

function hasExplicitCoverageOverride(input) {
  const keys = [
    'zeroDepreciation',
    'batteryCover',
    'highVoltageBatteryCover',
    'chargerCover',
    'wallboxAndCableProtection',
    'returnToInvoice',
    'rti',
    'evRoadsideAssistance',
    'rsa',
    'tyreAndRimCover',
    'tyreCover'
  ];

  return keys.some(
    (key) =>
      input?.[key] !== undefined
  );
}

function buildSelectedRiders({
  input,
  coverageMode,
  recommendedRiders
}) {
  const baseRiders = {
    zeroDepreciation: false,
    highVoltageBatteryCover: false,
    wallboxAndCableProtection: false,
    returnToInvoice: false,
    evRoadsideAssistance: false,
    tyreAndRimCover: false
  };

  if (
    coverageMode === 'base'
  ) {
    return {
      ...baseRiders
    };
  }

  if (
    coverageMode === 'recommended'
  ) {
    return {
      ...recommendedRiders
    };
  }

  /*
   * Custom mode:
   * inherit contextual recommendation and override ONLY explicitly
   * specified values.
   */

  const selected = {
    ...recommendedRiders
  };

  const zeroDep =
    firstPresentBoolean(
      input?.zeroDepreciation
    );

  if (
    zeroDep !== undefined
  ) {
    selected.zeroDepreciation =
      zeroDep;
  }

  const battery =
    firstPresentBoolean(
      input?.batteryCover,
      input?.highVoltageBatteryCover
    );

  if (
    battery !== undefined
  ) {
    selected.highVoltageBatteryCover =
      battery;
  }

  const charger =
    firstPresentBoolean(
      input?.chargerCover,
      input?.wallboxAndCableProtection
    );

  if (
    charger !== undefined
  ) {
    selected.wallboxAndCableProtection =
      charger;
  }

  const returnToInvoice =
    firstPresentBoolean(
      input?.returnToInvoice,
      input?.rti
    );

  if (
    returnToInvoice !== undefined
  ) {
    selected.returnToInvoice =
      returnToInvoice;
  }

  const rsa =
    firstPresentBoolean(
      input?.evRoadsideAssistance,
      input?.rsa
    );

  if (
    rsa !== undefined
  ) {
    selected.evRoadsideAssistance =
      rsa;
  }

  const tyre =
    firstPresentBoolean(
      input?.tyreAndRimCover,
      input?.tyreCover
    );

  if (
    tyre !== undefined
  ) {
    selected.tyreAndRimCover =
      tyre;
  }

  return selected;
}

/* ============================================================================
 * CATALOG NORMALIZATION + RANKING
 * ========================================================================== */

function normalizeCatalog(rawCatalog) {
  const plans =
    Array.isArray(rawCatalog)
      ? rawCatalog
      : safeArray(
          rawCatalog?.plans ??
          rawCatalog?.results ??
          rawCatalog?.items
        );

  return plans
    .map((plan, index) => ({
      ...plan,
      _catalogIndex: index,
      _planId:
        extractPlanId(plan),
      _score:
        scoreFromPlan(plan),
      _displayName:
        extractPlanName(plan)
    }))
    .filter(Boolean);
}

function rankCatalogPlans(plans) {
  return [...plans].sort(
    (a, b) => {
      const scoreDifference =
        Number(
          b?._score ?? 0
        ) -
        Number(
          a?._score ?? 0
        );

      if (
        scoreDifference !== 0
      ) {
        return scoreDifference;
      }

      /*
       * If contextual scores tie, prefer lower estimated starting cost.
       */
      const aCost =
        Number(
          a?.pricingEstimate
            ?.totalMinInr ??
          a?.estimatedRangeInr
            ?.min ??
          Infinity
        );

      const bCost =
        Number(
          b?.pricingEstimate
            ?.totalMinInr ??
          b?.estimatedRangeInr
            ?.min ??
          Infinity
        );

      return aCost - bCost;
    }
  );
}

/* ============================================================================
 * DOSSIER VALIDATION
 * ========================================================================== */

function validateDossier(dossier) {
  if (
    !dossier ||
    typeof dossier !== 'object'
  ) {
    return {
      valid: false,
      reason:
        'EMPTY_ENGINE_RESPONSE'
    };
  }

  const requiredSections = [
    'vehicleSummary',
    'regulatoryTpDetails',
    'selectedPlan',
    'pricingEstimate',
    'suitabilityAnalysis'
  ];

  const missing =
    requiredSections.filter(
      (key) =>
        !dossier[key]
    );

  if (
    missing.length > 0
  ) {
    return {
      valid: false,
      reason:
        'MISSING_ENGINE_SECTIONS',
      missing
    };
  }

  return {
    valid: true,
    reason: null
  };
}

/* ============================================================================
 * BATTERY / PROTECTION GAP LOGIC
 * ========================================================================== */

function textIndicatesBatteryGap(gap) {
  const type =
    String(
      gap?.type ?? ''
    ).toUpperCase();

  if (
    BATTERY_CRITICAL_GAP_TYPES.includes(
      type
    )
  ) {
    return true;
  }

  const text = [
    gap?.title,
    gap?.type,
    gap?.description
  ]
    .filter(Boolean)
    .join(' ');

  const patterns = [
    /water\s+ingress/i,
    /flood.{0,40}battery/i,
    /battery.{0,40}flood/i,
    /water.{0,40}traction\s+battery/i,
    /traction\s+battery.{0,40}water/i,
    /high[-\s]?voltage\s+battery.{0,40}(excluded|not covered)/i,
    /traction\s+battery.{0,40}(excluded|not covered)/i,
    /battery.{0,40}(damage|replacement).{0,40}(not covered|excluded)/i
  ];

  return patterns.some(
    (pattern) =>
      pattern.test(text)
  );
}

export function getDecisionVerdict({
  protectionScore,
  criticalGaps = [],
  hasCriticalBatteryGap = false
} = {}) {
  const numericScore = asFiniteNumber(protectionScore, null);

  if (numericScore === null) {
    return 'INSUFFICIENT_ANALYSIS';
  }

  /*
   * Battery / water critical exposure gets highest priority.
   */
  if (hasCriticalBatteryGap) {
    return 'ACTION_REQUIRED';
  }

  const gapList = safeArray(criticalGaps);

  if (gapList.length >= 2) {
    return 'PROTECTION_GAPS_PRESENT';
  }

  if (numericScore >= 90) {
    return 'STRONGLY_RECOMMENDED';
  }

  if (numericScore >= 80) {
    return 'RECOMMENDED';
  }

  if (numericScore >= 65) {
    return 'PARTIAL_PROTECTION';
  }

  return 'PROTECTION_GAPS_PRESENT';
}

/* ============================================================================
 * RISK FLAGS
 * ========================================================================== */

function buildRiskFlags({
  cityRisk,
  batteryRisk,
  chargingContext,
  selectedRiders
}) {
  const riskFlags = [];

  if (
    cityRisk?.risk === 'HIGH'
  ) {
    riskFlags.push({
      type:
        'HIGH_FLOOD_EXPOSURE',

      severity:
        'HIGH',

      label:
        'Elevated local waterlogging/flood exposure; review applicable EV electrical and battery-related exclusions.'
    });
  }

  if (
    batteryRisk?.category === 'HIGH' ||
    batteryRisk?.category === 'CRITICAL'
  ) {
    riskFlags.push({
      type:
        'HIGH_BATTERY_CAPITAL_EXPOSURE',

      severity:
        'HIGH',

      label:
        'High capital exposure in traction-battery and high-voltage EV components.'
    });
  }

  if (
    chargingContext?.chargingSetupKnown &&
    chargingContext?.homeCharging &&
    !selectedRiders.wallboxAndCableProtection
  ) {
    riskFlags.push({
      type:
        'HOME_CHARGER_PROTECTION_GAP',

      severity:
        'MEDIUM',

      label:
        'Home charging equipment protection should be checked for applicable policy limits, exclusions and eligibility.'
    });
  }

  if (
    !selectedRiders.zeroDepreciation
  ) {
    riskFlags.push({
      type:
        'DEPRECIATION_EXPOSURE',

      severity:
        'HIGH',

      label:
        'Applicable depreciation deductions may increase out-of-pocket repair costs.'
    });
  }

  return riskFlags;
}

/* ============================================================================
 * CONFIDENCE ENGINE
 * ========================================================================== */

function buildAnalysisConfidence({
  matchType,
  matchConfidence,
  citySource,
  priceVerified,
  chargingSetupKnown,
  dailyKmKnown,
  catalogPlans
}) {
  let level = 'HIGH';

  const reasons = [];

  /*
   * Vehicle confidence.
   */
  if (
    matchType === 'EXACT_MATCH'
  ) {
    reasons.push(
      'Vehicle resolved through exact normalized match.'
    );
  } else if (
    matchType === 'ALIAS_MATCH'
  ) {
    level = 'MEDIUM';

    reasons.push(
      'Vehicle resolved through a recognised alias.'
    );
  } else if (
    matchType === 'FUZZY_MATCH' &&
    matchConfidence >= 0.85
  ) {
    level = 'MEDIUM';

    reasons.push(
      'Vehicle resolved through high-confidence fuzzy matching.'
    );
  } else {
    level = 'LOW';

    reasons.push(
      'Vehicle resolution is not exact.'
    );
  }

  /*
   * Location confidence.
   */
  if (
    citySource === 'NATIONAL_BASELINE'
  ) {
    if (
      level === 'HIGH'
    ) {
      level = 'MEDIUM';
    }

    reasons.push(
      'Registration city was not explicitly available; city-specific risk analysis is unavailable.'
    );
  } else {
    reasons.push(
      'Registration-city context is available.'
    );
  }

  /*
   * Price confidence.
   */
  if (!priceVerified) {
    level = 'LOW';

    reasons.push(
      'Exact vehicle price is unavailable; model-level fallback is being used only for indicative calculations.'
    );
  } else {
    reasons.push(
      'Vehicle price is available from the catalog.'
    );
  }

  /*
   * Charging context.
   */
  if (!chargingSetupKnown) {
    if (
      level === 'HIGH'
    ) {
      level = 'MEDIUM';
    }

    reasons.push(
      'Charging setup is not explicitly confirmed.'
    );
  }

  /*
   * Daily usage context.
   */
  if (!dailyKmKnown) {
    reasons.push(
      'Daily driving distance is not explicitly confirmed.'
    );
  }

  /*
   * Multi-plan context.
   */
  if (
    catalogPlans.length === 0
  ) {
    if (
      level === 'HIGH'
    ) {
      level = 'MEDIUM';
    }

    reasons.push(
      'No multi-plan catalog was available for cross-plan comparison.'
    );
  }

  return {
    level,
    matchConfidence,
    reasons
  };
}

/* ============================================================================
 * MAIN TOOL HANDLER
 * ========================================================================== */

export async function handleExploreEvInsurance(
  record,
  args,
  signal,
  helpers = {}
) {
  try {
    const safeRecord =
      record &&
      typeof record === 'object'
        ? record
        : {};

    const {
      resolveVehicles,
      unpackArgs,
      firstDefined,
      unique
    } = helpers;

    let rawInput =
      typeof unpackArgs === 'function'
        ? unpackArgs(args)
        : (args ?? {});

    if (
      !rawInput ||
      typeof rawInput !== 'object'
    ) {
      rawInput = {};
    }

    /*
     * Validate only when the host exposes a compatible Zod safeParse path.
     * Otherwise preserve the host input rather than breaking execution.
     */
    let input = rawInput;

    try {
      if (
        insuranceToolDefinition
          .inputSchema &&
        typeof insuranceToolDefinition
          .inputSchema.safeParse ===
          'function'
      ) {
        const parsed =
          insuranceToolDefinition
            .inputSchema
            .safeParse(rawInput);

        if (
          parsed.success
        ) {
          input = parsed.data;
        }
      }
    } catch {
      input = rawInput;
    }

    if (
      signal?.throwIfAborted
    ) {
      signal.throwIfAborted();
    }

    /* ------------------------------------------------------------------------
     * 1. VEHICLE RESOLUTION
     * ---------------------------------------------------------------------- */

    const requested =
      resolveVehicleRequest(
        input,
        firstDefined
      );

    const shortlist =
      safeArray(
        safeRecord.passport
          ?.shortlist
      );

    let vehicleItem = null;
    let matchType = 'UNKNOWN';
    let matchConfidence = 0;

    if (
      requested &&
      typeof resolveVehicles ===
        'function'
    ) {
      const resolverResult =
        normalizeResolutionResult(
          resolveVehicles(
            [requested],
            safeRecord.category
          )
        );

      if (
        resolverResult.resolved.length > 0
      ) {
        vehicleItem =
          resolverResult.resolved[0];

        const match =
          determineVehicleMatch({
            requested,
            vehicle:
              vehicleItem,
            resolverConfidence:
              resolverResult.confidence,
            resolverMatchType:
              resolverResult.matchType
          });

        matchType =
          match.matchType;

        matchConfidence =
          match.confidence;
      }
    }

    /*
     * If the user supplied no vehicle and exactly one shortlist item exists,
     * it is safe to use that contextual vehicle.
     */
    if (
      !vehicleItem &&
      !requested &&
      shortlist.length === 1
    ) {
      vehicleItem =
        shortlist[0];

      matchType =
        'SHORTLIST_CONTEXT';

      matchConfidence =
        0.85;
    }

    /*
     * Multiple shortlisted EVs require explicit selection.
     */
    if (
      !vehicleItem &&
      !requested &&
      shortlist.length > 1
    ) {
      return {
        stage:
          'insurance-needs-vehicle-selection',

        payload: {
          status:
            'VEHICLE_SELECTION_REQUIRED',

          availableShortlist:
            shortlist.map(
              (vehicle) => ({
                id:
                  vehicle?.id ??
                  null,

                name:
                  vehicle?.name ??
                  vehicle?.model ??
                  'EV',

                category:
                  vehicle?.category ??
                  'Electric Vehicle'
              })
            ),

          reason:
            'Multiple EVs are present in the Buyer Decision Passport.'
        },

        spoken:
          'Aapki shortlist mein multiple EVs hain. Accurate insurance analysis ke liye kaunsi EV ka estimate dekhna hai?'
      };
    }

    /*
     * Never silently accept a weak fuzzy match.
     */
    if (
      vehicleItem &&
      matchType === 'FUZZY_MATCH' &&
      matchConfidence < 0.85
    ) {
      return {
        stage:
          'insurance-needs-vehicle-confirmation',

        payload: {
          status:
            'VEHICLE_CONFIRMATION_NEEDED',

          requestedVehicle:
            requested ??
            null,

          resolvedVehicle:
            vehicleItem?.name ??
            vehicleItem?.model ??
            'Selected EV',

          matchType,
          confidence:
            matchConfidence,

          message:
            `Please confirm whether you meant ${
              vehicleItem?.name ??
              vehicleItem?.model ??
              'this EV'
            } before generating the insurance analysis.`
        },

        spoken:
          `Aapne ${
            requested || 'EV'
          } bola. Kya aap ${
            vehicleItem?.name ??
            vehicleItem?.model ??
            'is EV'
          } ka insurance estimate dekhna chahte hain?`
      };
    }

    /*
     * No invented default vehicle.
     */
    if (!vehicleItem) {
      return {
        stage:
          'insurance-needs-vehicle',

        payload: {
          status:
            'VEHICLE_REQUIRED',

          requestedVehicle:
            requested ??
            null,

          availableShortlist:
            shortlist.map(
              (vehicle) =>
                vehicle?.name ??
                vehicle?.model ??
                'EV'
            ),

          message:
            'Please confirm the electric vehicle model before generating a contextual insurance analysis.'
        },

        spoken:
          'Accurate EV insurance estimate nikaalne ke liye mujhe vehicle model confirm karna hoga. Aap kaunsi EV explore kar rahe hain?'
      };
    }

    if (
      signal?.throwIfAborted
    ) {
      signal.throwIfAborted();
    }

    /* ------------------------------------------------------------------------
     * 2. CITY CONTEXT
     * ---------------------------------------------------------------------- */

    const cityResolution =
      resolveCityRequest(
        input,
        safeRecord,
        firstDefined
      );

    const resolvedCity =
      cityResolution.city;

    const cityDisplay =
      resolvedCity ??
      'National Baseline';

    /*
     * IMPORTANT:
     * `calculationCity` deliberately remains null when city isn't known.
     * The underlying catalog must support NATIONAL_BASELINE/null safely.
     */
    const calculationCity =
      resolvedCity;

    const pricingContext = {
      mode:
        resolvedCity
          ? 'CITY_SPECIFIC'
          : 'NATIONAL_BASELINE',

      city:
        resolvedCity ??
        null
    };

    const cityRisk =
      resolvedCity
        ? (
            getCityRisk(
              resolvedCity
            ) || {
              risk:
                'UNKNOWN',

              label:
                'City flood risk unavailable'
            }
          )
        : {
            risk:
              'UNKNOWN',

            label:
              'National baseline — city-specific flood exposure unavailable'
          };

    /* ------------------------------------------------------------------------
     * 3. BUYER PASSPORT CONTEXT
     * ---------------------------------------------------------------------- */

    const profile =
      safeRecord.passport
        ?.profile ??
      {};

    const chargingContext =
      buildChargingContext(
        profile
      );

    /* ------------------------------------------------------------------------
     * 4. PRICE CONTEXT
     * ---------------------------------------------------------------------- */

    const rawPrice =
      vehicleItem?.priceMinLakh ??
      vehicleItem?.priceMaxLakh ??
      null;

    const exactPrice =
      isFiniteNumber(rawPrice)
        ? Number(rawPrice)
        : null;

    const priceVerified =
      exactPrice !== null;

    /*
     * The existing deterministic engine expects a numeric price.
     * If its input contract is later changed to accept null, remove this
     * fallback and let the engine return "insufficient pricing data".
     *
     * For the current engine, the fallback is explicitly marked as a
     * MODEL_LEVEL_FALLBACK in analysis metadata.
     */
    const enginePrice =
      exactPrice ??
      14.5;

    /* ------------------------------------------------------------------------
     * 5. BATTERY / CAPITAL RISK
     * ---------------------------------------------------------------------- */

    const batteryRisk =
      assessBatteryValueRisk(
        vehicleItem,
        enginePrice
      ) ?? {
        category:
          'UNKNOWN',

        label:
          'Battery exposure could not be determined.'
      };

    /* ------------------------------------------------------------------------
     * 6. COVERAGE MODE + RIDERS
     * ---------------------------------------------------------------------- */

    const hasOverrides =
      hasExplicitCoverageOverride(
        input
      );

    const coverageMode =
      INSURANCE_COVERAGE_MODES.includes(
        input.coverageMode
      )
        ? input.coverageMode
        : (
            hasOverrides
              ? 'custom'
              : 'recommended'
          );

    const recommendedRiders =
      calculateRecommendedRiders({
        vehicle:
          vehicleItem,

        cityRisk,

        chargingContext,

        priceLakh:
          enginePrice
      });

    const selectedRiders =
      buildSelectedRiders({
        input,
        coverageMode,
        recommendedRiders
      });

    /* ------------------------------------------------------------------------
     * 7. PLAN TIER
     * ---------------------------------------------------------------------- */

    const requestedPlanTier =
      input.planTier ??
      'balanced_recommended';

    const planTier =
      INSURANCE_PLAN_TIERS.includes(
        requestedPlanTier
      )
        ? requestedPlanTier
        : 'balanced_recommended';

    const planMode =
      planTier === 'all'
        ? 'CATALOG_COMPARISON'
        : 'SINGLE_PLAN_ANALYSIS';

    /* ------------------------------------------------------------------------
     * 8. GENERATE CATALOG
     * ---------------------------------------------------------------------- */

    const rawCatalog =
      getTailoredInsuranceCatalog({
        vehicle:
          vehicleItem,

        city:
          calculationCity,

        pricingContext,

        exShowroomPriceLakh:
          enginePrice,

        chargingContext,

        selectedRiders,

        planTier
      });

    const catalogPlans =
      rankCatalogPlans(
        normalizeCatalog(
          rawCatalog
        )
      );

    /* ------------------------------------------------------------------------
     * 9. SELECT WINNING / TARGET PLAN
     * ---------------------------------------------------------------------- */

    let targetPlanId =
      input.planId ??
      input.plan ??
      null;

    if (!targetPlanId) {
      if (
        planTier === 'all' &&
        catalogPlans.length > 0
      ) {
        targetPlanId =
          catalogPlans[0]?._planId ??
          DEFAULT_PLAN_ID_BY_TIER
            .balanced_recommended;
      } else {
        targetPlanId =
          DEFAULT_PLAN_ID_BY_TIER[
            planTier
          ] ??
          DEFAULT_PLAN_ID_BY_TIER
            .balanced_recommended;
      }
    }

    /* ------------------------------------------------------------------------
     * 10. MAIN DOSSIER
     * ---------------------------------------------------------------------- */

    const dossier =
      calculateContextualEVInsurance({
        vehicle:
          vehicleItem,

        exShowroomPriceLakh:
          enginePrice,

        city:
          calculationCity,

        pricingContext,

        planId:
          targetPlanId,

        chargingContext,

        selectedRiders
      });

    const dossierValidation =
      validateDossier(
        dossier
      );

    if (
      !dossierValidation.valid
    ) {
      throw new Error(
        `Insurance engine returned an invalid dossier: ${
          dossierValidation.reason
        }${
          dossierValidation.missing
            ? ` (${dossierValidation.missing.join(', ')})`
            : ''
        }`
      );
    }

    if (
      signal?.throwIfAborted
    ) {
      signal.throwIfAborted();
    }

    /* ------------------------------------------------------------------------
     * 11. PROTECTION GAPS + HARD BLOCKERS
     * ---------------------------------------------------------------------- */

    const gaps =
      safeArray(
        dossier
          ?.suitabilityAnalysis
          ?.coverageGapsIdentified
      );

    const criticalGaps =
      gaps.filter(
        (gap) =>
          gap?.severity ===
          'CRITICAL'
      );

    const rawProtectionScore =
      dossier
        ?.suitabilityAnalysis
        ?.protectionMatchScore;

    const protectionScore =
      Number.isFinite(
        Number(rawProtectionScore)
      )
        ? Number(rawProtectionScore)
        : null;

    const hasCriticalBatteryGap =
      criticalGaps.some(
        (gap) =>
          textIndicatesBatteryGap(
            gap
          )
      );

    const decisionVerdict =
      getDecisionVerdict({
        protectionScore,
        criticalGaps,
        hasCriticalBatteryGap
      });

    /* ------------------------------------------------------------------------
     * 12. RISK FLAGS
     * ---------------------------------------------------------------------- */

    const riskFlags =
      buildRiskFlags({
        cityRisk,
        batteryRisk,
        chargingContext,
        selectedRiders
      });

    /* ------------------------------------------------------------------------
     * 13. CALCULATION CONFIDENCE
     * ---------------------------------------------------------------------- */

    const calculationConfidence =
      buildAnalysisConfidence({
        matchType,
        matchConfidence,

        citySource:
          cityResolution.source,

        priceVerified,

        chargingSetupKnown:
          chargingContext
            .chargingSetupKnown,

        dailyKmKnown:
          chargingContext
            .dailyKmKnown,

        catalogPlans
      });

    /* ------------------------------------------------------------------------
     * 14. CONTEXTUAL PLAN EXPLANATION
     * ---------------------------------------------------------------------- */

    const whyThisPlan = [
      cityRisk?.risk === 'HIGH'
        ? `High local waterlogging exposure in ${cityDisplay} makes EV electrical and battery-related exclusions particularly important to review.`
        : null,

      chargingContext.chargingSetupKnown &&
      chargingContext.homeCharging
        ? 'Home charging makes eligible charger/cable and electrical-equipment protection relevant.'
        : null,

      batteryRisk?.category === 'HIGH' ||
      batteryRisk?.category === 'CRITICAL'
        ? 'The selected EV has relatively high capital exposure in traction-battery and high-voltage components.'
        : null,

      selectedRiders.zeroDepreciation
        ? 'Zero depreciation is prioritised for this new-EV purchase journey.'
        : null,

      selectedRiders.returnToInvoice
        ? 'Return-to-Invoice is included because higher vehicle value makes total-loss capital protection more relevant.'
        : null,

      selectedRiders.evRoadsideAssistance
        ? 'Roadside assistance is prioritised based on the buyer usage context.'
        : null
    ].filter(Boolean);

    /* ------------------------------------------------------------------------
     * 15. CONTEXTUAL DECISION SUMMARY
     * ---------------------------------------------------------------------- */

    const decisionSummary = {
      planMode,

      planTier,

      coverageMode,

      verdict:
        decisionVerdict,

      protectionScore:
        protectionScore ??
        'N/A',

      criticalGapCount:
        criticalGaps.length,

      riskFlags,

      primaryRisk:
        batteryRisk?.category ??
        'UNKNOWN',

      floodRisk:
        cityRisk?.risk ??
        'UNKNOWN',

      estimatedProtectionCost:
        dossier
          ?.pricingEstimate
          ?.formattedBand ??
        'Estimate unavailable',

      recommendedPlan:
        dossier
          ?.selectedPlan
          ?.displayName ??
        'Recommended EV Protection Profile',

      whyThisPlan,

      actionRequired:
        protectionScore === null
          ? 'Protection analysis could not be fully verified. Review coverage details before purchase.'
          : criticalGaps.length > 0
            ? 'Review critical EV protection gaps before purchase.'
            : 'Protection configuration is aligned with the current EV usage context.'
    };

    /* ------------------------------------------------------------------------
     * 16. MISSING CONTEXT
     * ---------------------------------------------------------------------- */

    const missingContext = [];

    if (
      matchType !== 'EXACT_MATCH' &&
      matchType !== 'ALIAS_MATCH'
    ) {
      missingContext.push(
        'vehicle_exact_match'
      );
    }

    if (!resolvedCity) {
      missingContext.push(
        'registration_city'
      );
    }

    if (
      !chargingContext
        .chargingSetupKnown
    ) {
      missingContext.push(
        'charging_setup'
      );
    }

    if (
      !chargingContext
        .dailyKmKnown
    ) {
      missingContext.push(
        'daily_km'
      );
    }

    if (!priceVerified) {
      missingContext.push(
        'vehicle_price'
      );
    }

    /* ------------------------------------------------------------------------
     * 17. ANALYSIS METADATA
     * ---------------------------------------------------------------------- */

    const analysisMetadata = {
      tool:
        'explore_ev_insurance',

      version:
        '4.0.0',

      generatedAt:
        new Date().toISOString(),

      matchType,

      matchConfidence,

      citySource:
        cityResolution.source,

      cityDisplay,

      planMode,

      planTier,

      coverageMode,

      vehicleContext: {
        source:
          [
            'EXACT_MATCH',
            'ALIAS_MATCH',
            'FUZZY_MATCH'
          ].includes(matchType)
            ? 'USER_REQUEST'
            : 'BUYER_SHORTLIST',

        explicitConfirmation:
          matchType === 'EXACT_MATCH' ||
          matchType === 'ALIAS_MATCH',

        requestedVehicle:
          requested ??
          null,

        resolvedVehicle:
          vehicleItem?.name ??
          vehicleItem?.model ??
          null
      },

      calculationBasis: {
        city: {
          mode:
            pricingContext.mode,

          value:
            pricingContext.city
        },

        vehicle: {
          matchType,

          confidence:
            matchConfidence
        },

        price: {
          verified:
            priceVerified,

          basis:
            priceVerified
              ? 'EXACT_CATALOG_PRICE'
              : 'MODEL_LEVEL_FALLBACK',

          valueLakh:
            enginePrice
        },

        profile: {
          chargingSetupProvided:
            chargingContext
              .chargingSetupKnown,

          dailyKmProvided:
            chargingContext
              .dailyKmKnown
        }
      },

      missingContext,

      contextualCompleteness:
        missingContext.length === 0
          ? 'COMPLETE'
          : 'PARTIAL',

      calculationConfidence,

      recommendationConfidence: {
        level:
          calculationConfidence.level,

        reasons:
          calculationConfidence.reasons
      },

      dataFreshness: {
        regulatoryData:
          'VERIFY_CURRENT_IRDAI_SOURCE_BEFORE_COMMERCIAL_USE',

        insurerCapabilities:
          'VERIFY_CURRENT_POLICY_WORDING_BEFORE_PURCHASE',

        premiumPricing:
          'INDICATIVE_EASYEV_ESTIMATE_UNLESS_LIVE_QUOTE_INTEGRATION_EXISTS'
      }
    };

    /* ------------------------------------------------------------------------
     * 18. CONTEXTUAL NEXT ACTIONS
     * ---------------------------------------------------------------------- */

    const existingActions =
      safeArray(
        safeRecord.passport
          ?.nextActions
      );

    const contextualActions = [
      ...existingActions
    ];

    if (
      criticalGaps.length > 0
    ) {
      contextualActions.push(
        'Resolve critical EV insurance protection gaps before finalizing the policy.'
      );
    }

    if (
      cityRisk?.risk === 'HIGH'
    ) {
      contextualActions.push(
        `Verify battery/electrical water-ingress exclusions for ${cityDisplay}.`
      );
    }

    if (
      chargingContext.homeCharging &&
      chargingContext.chargingSetupKnown
    ) {
      contextualActions.push(
        'Verify whether the chosen policy explicitly covers eligible home wallbox, cable and surge-related risks.'
      );
    }

    if (!priceVerified) {
      contextualActions.push(
        'Confirm the exact vehicle variant and ex-showroom price before relying on the premium estimate.'
      );
    }

    contextualActions.push(
      'Compare insurer policy wording, IDV, deductibles, exclusions and add-on limits before purchase.'
    );

    const actionDeduper =
      typeof unique === 'function'
        ? unique
        : dedupeStrings;

    const nextActions =
      actionDeduper(
        contextualActions
      );

    /* ------------------------------------------------------------------------
     * 19. UPDATE BUYER DECISION PASSPORT
     * ---------------------------------------------------------------------- */

    if (
      safeRecord.passport
    ) {
      safeRecord.passport.insurance = {
        vehicleName:
          vehicleItem?.name ??
          vehicleItem?.model ??
          'Selected EV',

        matchType,

        matchConfidence,

        citySource:
          cityResolution.source,

        cityDisplay,

        planMode,

        planTier,

        coverageMode,

        planDisplayName:
          dossier
            ?.selectedPlan
            ?.displayName,

        insurerName:
          dossier
            ?.selectedPlan
            ?.insurerName,

        estimatedBand:
          dossier
            ?.pricingEstimate
            ?.formattedBand,

        protectionMatchScore:
          protectionScore,

        decisionVerdict,

        statutoryTp:
          dossier
            ?.regulatoryTpDetails
            ?.statutoryRateInr,

        tpSlab:
          dossier
            ?.regulatoryTpDetails
            ?.slabMatched,

        batteryRisk:
          batteryRisk?.category ??
          'UNKNOWN',

        floodRisk:
          cityRisk?.risk ??
          'UNKNOWN',

        riskFlags,

        recommendedPriorities:
          safeArray(
            dossier
              ?.suitabilityAnalysis
              ?.recommendedProtectionPriorities
          ),

        whyThisEstimate:
          safeArray(
            dossier
              ?.suitabilityAnalysis
              ?.whyThisEstimate
          ),

        calculationConfidence,

        regulatoryDisclaimer: {
          isEstimated:
            true,

          requiresCurrentRateVerification:
            true
        }
      };

      safeRecord.passport.nextActions =
        nextActions;
    }

    /* ------------------------------------------------------------------------
     * 20. REGULATORY / ESTIMATE DISCLAIMER
     * ---------------------------------------------------------------------- */

    const regulatoryDisclaimer = {
      isEstimated:
        true,

      requiresCurrentRateVerification:
        true,

      notice:
        'Indicative estimate only. Final premium, IDV, statutory TP/OD structure, coverage, deductibles, exclusions and eligibility are determined by the issuing insurer and applicable current policy/regulatory requirements.'
    };

    /* ------------------------------------------------------------------------
     * 21. SPOKEN RESPONSE
     * ---------------------------------------------------------------------- */

    const vehicleName =
      vehicleItem?.name ??
      vehicleItem?.model ??
      'Selected EV';

    const parsedPower =
      dossier
        ?.vehicleSummary
        ?.parsedMotorKw;

    const powerLabel =
      Number.isFinite(
        Number(parsedPower)
      )
        ? `${parsedPower} kW`
        : 'electric motor';

    const tpTenure =
      dossier
        ?.regulatoryTpDetails
        ?.tenureRule ??
      'applicable statutory TP';

    const spokenCity =
      resolvedCity
        ? cityDisplay
        : 'national baseline';

    const estimatedBand =
      dossier
        ?.pricingEstimate
        ?.formattedBand ??
      'an indicative range';

    const scoreSpoken =
      protectionScore === null
        ? 'protection analysis is incomplete'
        : `protection score ${protectionScore}/100`;

    const priceQualifier =
      priceVerified
        ? ''
        : ' using a model-level fallback price estimate';

    const spoken =
      `${vehicleName} ke ${powerLabel} motor aur ${spokenCity} ke context ke hisaab se, ${tpTenure} aur ${coverageMode === 'base' ? 'base protection' : 'EV protection'} ka estimated cost ${estimatedBand}${priceQualifier} hai. Screen par ${scoreSpoken} aur contextual Decision Summary open kar di hai.`;

    /* ------------------------------------------------------------------------
     * 22. FINAL TOOL RESPONSE
     * ---------------------------------------------------------------------- */

    return {
      stage:
        'insurance-plans',

      payload: {
        analysisMetadata,

        decisionSummary,

        dossier,

        catalog:
          catalogPlans,

        city:
          cityDisplay,

        citySource:
          cityResolution.source,

        pricingContext,

        chargingContext,

        batteryRisk,

        riskFlags,

        regulatoryDisclaimer,

        vehicleResolution: {
          matchType,

          confidence:
            matchConfidence,

          requestedVehicle:
            requested ??
            null,

          resolvedVehicle:
            vehicleName
        },

        vehicle: {
          id:
            vehicleItem?.id ??
            null,

          name:
            vehicleName,

          category:
            vehicleItem?.category ??
            'Electric Vehicle',

          priceMinLakh:
            vehicleItem?.priceMinLakh ??
            null,

          priceMaxLakh:
            vehicleItem?.priceMaxLakh ??
            null,

          priceVerified,

          battery:
            vehicleItem?.battery ??
            vehicleItem?.batteryCapacity ??
            null,

          power:
            vehicleItem?.power ??
            null
        },

        selectedRiders,

        nextActions
      },

      spoken
    };
  } catch (error) {
    console.error(
      'Failed to execute explore_ev_insurance:',
      error
    );

    return {
      stage:
        'insurance-error',

      payload: {
        status:
          'CALCULATION_FAILED',

        error:
          error?.message ??
          'Unknown calculation error',

        message:
          'EasyEV could not safely complete the contextual insurance analysis. No potentially misleading estimate was presented.'
      },

      spoken:
        'Insurance analysis safely complete nahi ho paayi, isliye main inaccurate estimate show nahi kar raha. Vehicle aur insurance details verify karke dobara try karein.'
    };
  }
}

/* ============================================================================
 * TESTABLE / REUSABLE HELPERS
 * ========================================================================== */

export {
  parseBoolean,
  normalizeToken,
  resolveVehicleRequest,
  resolveCityRequest,
  buildChargingContext,
  calculateRecommendedRiders,
  hasExplicitCoverageOverride,
  buildSelectedRiders,
  normalizeCatalog,
  rankCatalogPlans,
  validateDossier,
  buildRiskFlags,
  buildAnalysisConfidence,
  textIndicatesBatteryGap,
  scoreFromPlan,
  extractPlanId,
  extractPlanName
};

/* ============================================================================
 * DEFAULT EXPORT
 * ========================================================================== */

export default Object.freeze({
  insuranceToolDefinition,

  handleExploreEvInsurance,

  getDecisionVerdict,

  parseBoolean,
  normalizeToken,

  resolveVehicleRequest,
  resolveCityRequest,

  buildChargingContext,
  calculateRecommendedRiders,
  hasExplicitCoverageOverride,
  buildSelectedRiders,

  normalizeCatalog,
  rankCatalogPlans,

  validateDossier,

  buildRiskFlags,
  buildAnalysisConfidence,

  textIndicatesBatteryGap,

  scoreFromPlan,
  extractPlanId,
  extractPlanName
});