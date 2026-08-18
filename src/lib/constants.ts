/**
 * RED TONNES — audited default constants.
 *
 * Every number here is either cited to a source or explicitly labeled
 * `ASSUMED:` with the reasoning. Anything labeled ASSUMED that materially
 * drives outcomes is also exposed as a slider in the UI.
 *
 * Sources referenced below:
 *  [1] Jakosky, B. M. & Edwards, C. S. (2018), 'Inventory of CO2 available
 *      for terraforming Mars', Nature Astronomy 2, 634-639. (Also NASA
 *      summary: 'Mars Terraforming Not Possible Using Present-Day Technology'.)
 *  [2] NASA Mars fact sheet (NSSDC): surface pressure ~6.36 mbar mean,
 *      sol = 24.6597 h, solar constant at Mars ~586-590 W/m2 mean.
 *  [3] Sabatier reaction stoichiometry: CO2 + 4 H2 -> CH4 + 2 H2O
 *      (standard chemistry; used on ISS ECLSS).
 *  [4] Water electrolysis: 2 H2O -> 2 H2 + O2. Practical PEM systems run
 *      ~50-55 kWh per kg H2 (theoretical 39.4 kWh/kg HHV).
 *  [5] Synodic period Earth-Mars ~779.9 days ~= 25.6 months.
 *  [6] BVAD / NASA Baseline Values and Assumptions Document: crew metabolic
 *      loads (O2 ~0.84 kg/CD, CO2 ~1.0 kg/CD, potable water, kcal).
 *  [7] Wheeler, R. (2017), 'Agriculture for Space: People and Places Paving
 *      the Way', Open Agriculture — controlled-environment crop yields.
 *  [8] US EPA / on-farm composting handbooks: thermophilic compost 55 C
 *      for >=3 days for pathogen kill; 60-120 day maturation typical.
 *  [9] Hecht et al. (2009), Science: ~0.4-0.6 wt% perchlorate in Phoenix
 *      lander soils.
 */

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

/** Hours in one Martian sol. Source [2]. */
export const HOURS_PER_SOL = 24.6597;

/** Earth-Mars synodic period expressed in sols (~779.9 Earth days / 1.0275 day-per-sol). Source [5]. */
export const SOLS_PER_SYNODIC_WINDOW = 759;

/** Sols a cargo/crew ship spends in transit (~6 months typical Hohmann-ish). ASSUMED: mid-range of 180-270 day transfers. */
export const TRANSIT_SOLS = 175;

/** Sols after each window arrival when return ships must burn for Earth. ASSUMED: ~600 sols in, before the next arrival closes the geometry. */
export const DEPARTURE_OFFSET_SOLS = 600;

// ---------------------------------------------------------------------------
// Starship as currency
// ---------------------------------------------------------------------------

/** Default landed payload per cargo Starship, tonnes. ASSUMED: '100 t class' per SpaceX public statements; user-adjustable slider 50-200 t. */
export const DEFAULT_STARSHIP_PAYLOAD_T = 100;

/** Methalox needed to fully fuel one returning Starship, tonnes. ASSUMED: ~1,000 t propellant class (SpaceX figures range 1,000-1,200 t); slider. */
export const DEFAULT_METHALOX_PER_SHIP_T = 1000;

/** Oxidizer-to-fuel mass ratio for Raptor methalox. ASSUMED: ~3.6:1 O2:CH4 (public Raptor figures 3.5-3.8). */
export const LOX_TO_CH4_RATIO = 3.6;

// ---------------------------------------------------------------------------
// Mars environment
// ---------------------------------------------------------------------------

/** Mean surface pressure, mbar. Source [2]. */
export const MARS_SURFACE_PRESSURE_MBAR = 6.36;

/** Atmospheric CO2 fraction by mass. Source [2] (~95% by volume, ~96% by mass). */
export const ATMOSPHERE_CO2_MASS_FRACTION = 0.96;

/** Mean solar irradiance at Mars top-of-atmosphere, W/m2. Source [2]. */
export const MARS_SOLAR_CONSTANT_W_M2 = 586;

/** Clear-sky background optical depth (dust always present). ASSUMED: tau ~0.3-0.5 typical quiet season; we use 0.4. */
export const TAU_QUIET = 0.4;

/** Global dust storm peak optical depth. ASSUMED: tau ~4-6 observed in 2018 storm (Opportunity site reported ~10.8 peak); we use 5 as a punishing default. */
export const TAU_GLOBAL_STORM_PEAK = 5.0;

/** Sunlight fraction reaching surface vs tau: exp(-tau / cos(z)); we fold zenith geometry into an effective divisor. ASSUMED: effective airmass factor 2 for a daily average. */
export const TAU_EFFECTIVE_AIRMASS = 2.0;

// ---------------------------------------------------------------------------
// Honest planet overlay (Jakosky & Edwards constraint)
// ---------------------------------------------------------------------------

/** Present atmospheric pressure, mbar. Source [1][2]. */
export const OVERLAY_PRESENT_MBAR = 6.36;

/** Pressure if the entire south polar CO2 cap were released, mbar. Source [1]: caps hold <= ~15 mbar equivalent; total accessible CO2 <= ~20 mbar. */
export const OVERLAY_POLAR_CAP_RELEASE_MBAR = 15;

/** All accessible CO2 (caps + regolith within reach), mbar. Source [1]. */
export const OVERLAY_ALL_ACCESSIBLE_MBAR = 20;

/** Pressure needed for unprotected human survival (Armstrong limit ~62 mbar; livable warm CO2 greenhouse needs ~1000+ mbar). Source [1] discussion. */
export const OVERLAY_EARTHLIKE_MBAR = 1013;

/** Solar-wind stripping leak rate, mbar per millennium. ASSUMED: order-of-magnitude from MAVEN loss rates (~1-2 kg/s today); negligible on game timescales, shown to teach the asymmetry. */
export const OVERLAY_STRIP_MBAR_PER_1000Y = 0.8;

// ---------------------------------------------------------------------------
// ISRU chemistry & energy
// ---------------------------------------------------------------------------

/** Electrolysis electric energy per kg H2 produced, kWh. Source [4] (practical PEM ~52.5). */
export const ELECTROLYSIS_KWH_PER_KG_H2 = 52.5;

/** Mass ratios from 2 H2O -> 2 H2 + O2: per kg H2O split -> 0.1119 kg H2 + 0.8881 kg O2 (exact from molar masses). Source [4]. */
export const H2_PER_KG_H2O = 2.016 / 18.015;
/** O2 produced per kg H2O electrolyzed. Source [4]. */
export const O2_PER_KG_H2O = 15.999 / 18.015;

/** Sabatier CO2 + 4 H2 -> CH4 + 2 H2O mass ratios per kg CH4. Source [3]. */
export const SABATIER_CO2_PER_KG_CH4 = 44.009 / 16.043;
/** H2 consumed per kg CH4. Source [3]. */
export const SABATIER_H2_PER_KG_CH4 = (4 * 2.016) / 16.043;
/** Water recycled out of the Sabatier reactor per kg CH4. Source [3]. */
export const SABATIER_H2O_PER_KG_CH4 = (2 * 18.015) / 16.043;

/** Sabatier reactor auxiliary electric power, kWh per kg CH4 (pumps, thermal management; reaction itself is exothermic). ASSUMED: 0.8 kWh/kg. */
export const SABATIER_AUX_KWH_PER_KG_CH4 = 0.8;

/**
 * CO2 acquisition energy at ~6 mbar intake, kWh per kg CO2.
 * Isothermal compression from 600 Pa to 100 kPa is ~0.29 kWh/kg ideal;
 * real cryo-freezing or multi-stage mechanical intake lands ~0.7-1.0.
 * ASSUMED: 0.9 kWh/kg (deliberately NOT Earth-normal compression energy).
 */
export const CO2_INTAKE_KWH_PER_KG = 0.9;

/** Ice mining + melt energy, kWh per kg water: excavation, haul, and 0.093 kWh/kg latent+sensible heat, with overburden overhead. ASSUMED: 0.35 kWh/kg at a shallow Arcadia-class deposit. */
export const ICE_MINE_KWH_PER_KG_H2O_BASE = 0.35;

/** Liquefaction energy for CH4 and O2 storage, kWh per kg. ASSUMED: 0.3 (O2) / 0.45 (CH4) typical cryocooler figures. */
export const LIQUEFACTION_KWH_PER_KG_O2 = 0.3;
export const LIQUEFACTION_KWH_PER_KG_CH4 = 0.45;

/** Cryogenic tank boil-off per sol as a fraction of stored mass. ASSUMED: 0.05%/sol with active recondensation shortfall. */
export const TANK_BOILOFF_PER_SOL = 0.0005;

/** H2 gas leak rate per sol (tiny molecule, real plumbing). ASSUMED: 0.2%/sol of gaseous H2 buffer. */
export const H2_LEAK_PER_SOL = 0.002;

// ---------------------------------------------------------------------------
// Power
// ---------------------------------------------------------------------------

/** Solar panel efficiency x packing x degradation, applied to surface flux. ASSUMED: 0.20 net. */
export const SOLAR_NET_EFFICIENCY = 0.2;

/** Daylight fraction of a sol usable for solar (day/night + low sun). ASSUMED: 0.35 effective capacity factor multiplier. */
export const SOLAR_DAYLIGHT_FACTOR = 0.35;

/** Solar array specific mass, kg per kWe installed (thin-film blankets, landed). ASSUMED: 10 kg/kWe-peak. */
export const SOLAR_KG_PER_KWE = 10;

/** Fission surface power specific mass, kg per kWe (Kilopower-derived scaled). ASSUMED: 150 kg/kWe including shielding. */
export const NUCLEAR_KG_PER_KWE = 150;

/** Dust accumulation on panels per sol without cleaning, output fraction lost. ASSUMED: 0.2%/sol, recovered by crew cleaning labor. */
export const PANEL_DUST_LOSS_PER_SOL = 0.002;

// ---------------------------------------------------------------------------
// Humans (per crew-sol). Source [6] BVAD-class values.
// ---------------------------------------------------------------------------

/** Metabolic O2 consumed, kg per person-sol. Source [6]. */
export const HUMAN_O2_KG_PER_SOL = 0.84;
/** Metabolic CO2 exhaled, kg per person-sol. Source [6]. */
export const HUMAN_CO2_KG_PER_SOL = 1.04;
/** Potable water (drink + food prep + hygiene min), kg per person-sol. Source [6] (~3.9 potable; hygiene adds more; recycled). */
export const HUMAN_WATER_KG_PER_SOL = 8.0;
/** Diet energy, kcal per person-sol. Source [6] (~3,000 for active surface crew). */
export const HUMAN_KCAL_PER_SOL = 3000;
/** Protein requirement, g per person-sol. ASSUMED: 90 g for active crew. */
export const HUMAN_PROTEIN_G_PER_SOL = 90;
/** Solid waste (feces dry + wet), kg per person-sol. Source [6] ~0.12 dry / 0.25 wet. */
export const HUMAN_SOLID_WASTE_KG_PER_SOL = 0.25;
/** Urine, kg per person-sol. Source [6] ~1.6. */
export const HUMAN_URINE_KG_PER_SOL = 1.6;
/** Nitrogen content of urine, fraction by mass. ASSUMED: ~1% N (urea). */
export const URINE_N_FRACTION = 0.01;
/** N in solid waste, fraction of wet mass. ASSUMED: 1.5%. */
export const SOLID_WASTE_N_FRACTION = 0.015;
/** P in solid waste + urine combined, kg per person-sol. ASSUMED: 1.5 g/person-sol. */
export const HUMAN_P_KG_PER_SOL = 0.0015;
/** Water-recycler recovery fraction (urine + graywater + humidity). ASSUMED: 0.93 ISS-class. */
export const WATER_RECYCLE_FRACTION = 0.93;
/** Habitat pressurized volume per person, m3 (long-duration). ASSUMED: 60 m3/person BVAD habitable-volume class. */
export const HABITAT_M3_PER_PERSON = 60;
/** Life-support baseline power, kWe per person (ECLSS, thermal, lights, comms share). ASSUMED: 2.5 kWe/person. */
export const LIFE_SUPPORT_KWE_PER_PERSON = 2.5;
/** Crew work hours available per person per sol. ASSUMED: 6.5 productive hours. */
export const CREW_HOURS_PER_SOL = 6.5;

// ---------------------------------------------------------------------------
// Greenhouses & crops (aggregate figures; per-crop data in crops.ts)
// ---------------------------------------------------------------------------

/** LED lighting electric power per m2 of full-LED growing area, kWe. Source [7] discussion; ~250-400 W/m2 PAR-equivalent wall-plug. ASSUMED: 0.3 kWe/m2. */
export const LED_KWE_PER_M2 = 0.3;

/** Minimum photosynthetically useful surface flux fraction for solar greenhouses; below this, yield scales linearly down. ASSUMED. */
export const SOLAR_GREENHOUSE_LIGHT_FLOOR = 0.15;

/** CO2 a greenhouse draws per kg of dry biomass fixed (photosynthesis ~1.5 kg CO2 per kg dry biomass). Standard plant physiology. */
export const CO2_PER_KG_DRY_BIOMASS = 1.5;
/** O2 released per kg dry biomass fixed (~1.1 kg). Standard plant physiology. */
export const O2_PER_KG_DRY_BIOMASS = 1.1;

/** N demand per kg dry biomass, kg (typical 2-4% N in dry plant tissue). ASSUMED: 0.03. */
export const N_PER_KG_DRY_BIOMASS = 0.03;
/** P demand per kg dry biomass, kg. ASSUMED: 0.004. */
export const P_PER_KG_DRY_BIOMASS = 0.004;
/** K demand per kg dry biomass, kg. ASSUMED: 0.025. */
export const K_PER_KG_DRY_BIOMASS = 0.025;

// ---------------------------------------------------------------------------
// Compost & digesters. Source [8] plus ASSUMED Mars adaptations.
// ---------------------------------------------------------------------------

/** Sols an aerobic compost batch takes to reach usable maturity. Source [8]: 60-120 Earth days; we use 70 sols. */
export const COMPOST_MATURITY_SOLS = 70;
/** O2 the compost pile consumes per kg of feedstock over its cycle, kg. ASSUMED: 0.35 kg O2/kg feedstock aerobic demand. */
export const COMPOST_O2_PER_KG_FEED = 0.35;
/** CO2 released per kg feedstock over the cycle, kg. ASSUMED: 0.45. */
export const COMPOST_CO2_PER_KG_FEED = 0.45;
/** Mass retained as finished compost per kg feedstock. ASSUMED: 0.5 (rest is CO2 + water vapor). */
export const COMPOST_YIELD_FRACTION = 0.5;
/** Fraction of feedstock N retained in finished compost (rest lost as NH3 unless scrubbed). ASSUMED: 0.7. */
export const COMPOST_N_RETENTION = 0.7;
/** Anaerobic digester biogas CH4 yield per kg volatile feedstock, kg. ASSUMED: 0.12 kg CH4/kg. */
export const DIGESTER_CH4_PER_KG_FEED = 0.12;
/** Digester CO2 released per kg feedstock, kg. ASSUMED: 0.18. */
export const DIGESTER_CO2_PER_KG_FEED = 0.18;
/** Digestate (wet fertilizer) per kg feedstock, kg. ASSUMED: 0.6. */
export const DIGESTER_DIGESTATE_FRACTION = 0.6;
/** Digester N retention (digestate keeps most N). ASSUMED: 0.9. */
export const DIGESTER_N_RETENTION = 0.9;
/** Digester cycle length, sols. ASSUMED: 25 (mesophilic ~20-30 days). */
export const DIGESTER_CYCLE_SOLS = 25;

// ---------------------------------------------------------------------------
// Soil factory & perchlorates. Source [9].
// ---------------------------------------------------------------------------

/** Perchlorate mass fraction in raw regolith. Source [9]: 0.4-0.6 wt%; we use 0.5%. */
export const REGOLITH_PERCHLORATE_FRACTION = 0.005;
/** Water needed to wash 1 kg regolith to crop-safe perchlorate level, kg (recycled at WATER_RECYCLE_FRACTION). ASSUMED: 3 L/kg wash ratio. */
export const PERCHLORATE_WASH_WATER_PER_KG = 3;
/** Energy to wash + dry 1 kg regolith, kWh. ASSUMED: 0.05. */
export const PERCHLORATE_WASH_KWH_PER_KG = 0.05;
/** Compost fraction by mass for manufactured soil to reach quality 1.0. ASSUMED: 15% organics. */
export const SOIL_COMPOST_FRACTION = 0.15;
/** Yield multiplier on unwashed-regolith beds (perchlorate stress). ASSUMED: 0.35. */
export const DIRTY_SOIL_YIELD_MULTIPLIER = 0.35;

// ---------------------------------------------------------------------------
// Reliability / spares
// ---------------------------------------------------------------------------

/** Weibull-ish characteristic life of mechanical systems, sols. ASSUMED: 500 sols characteristic, shape ~2. */
export const SPARES_CHARACTERISTIC_LIFE_SOLS = 500;
/** Weibull shape parameter (wear-out dominated). ASSUMED. */
export const SPARES_WEIBULL_SHAPE = 2.0;
/** Spare-parts mass to fix one failure event, kg. ASSUMED: 40 kg average LRU. */
export const SPARES_KG_PER_REPAIR = 40;
/** Efficiency penalty per outstanding unrepaired failure. ASSUMED: 4% each. */
export const UNREPAIRED_FAILURE_PENALTY = 0.04;

// ---------------------------------------------------------------------------
// Diet composition
// ---------------------------------------------------------------------------

/** Earth packaged food: kcal per kg. ASSUMED: 4,000 kcal/kg dehydrated-class rations. */
export const EARTH_FOOD_KCAL_PER_KG = 4000;
/** Earth packaged food protein, g per kg. ASSUMED: 120 g/kg. */
export const EARTH_FOOD_PROTEIN_G_PER_KG = 120;
/** Variety threshold: minimum distinct crops harvested in last 60 sols to avoid deficiency ('scurvy-class') penalty when Earth-food fraction < 25%. ASSUMED. */
export const VARIETY_MIN_CROPS = 3;
