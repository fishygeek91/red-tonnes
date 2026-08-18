'use client';

/**
 * Sources & assumptions drawer. Numerically conservative and cited beats
 * pretty and wrong; this is the receipts page.
 */

import { useSimStore } from '../store/useSimStore';

/** One cited row. */
function Row(props: { term: string; value: string; source: string }): React.ReactElement {
  return (
    <div className="py-1.5 border-b border-[var(--line)] text-[11px]">
      <div className="flex justify-between gap-3">
        <span className="text-[var(--text)]">{props.term}</span>
        <span className="num text-[var(--ice)] text-right shrink-0">{props.value}</span>
      </div>
      <div className="text-[var(--dim)] text-[10px] mt-0.5">{props.source}</div>
    </div>
  );
}

/** The drawer. */
export function SourcesDrawer(): React.ReactElement | null {
  const show = useSimStore((s) => s.showSources);
  const setShow = useSimStore((s) => s.setShowSources);
  if (!show) {
    return null;
  }
  return (
    <div className="absolute inset-0 z-40 flex" onClick={() => setShow(false)}>
      <div className="flex-1 bg-black/60" />
      <div
        className="w-[440px] h-full panel border-l border-[var(--rust)] overflow-y-auto p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-sm tracking-[0.25em] text-[var(--rust-hot)]">SOURCES & ASSUMPTIONS</h2>
          <button onClick={() => setShow(false)} className="text-[var(--dim)] hover:text-[var(--text)] text-lg leading-none">×</button>
        </div>
        <p className="text-[10px] text-[var(--dim)] mb-3">
          Anything labeled ASSUMED is a modeling choice, not a measurement — and the load-bearing ones are sliders.
          Full audit trail lives in <span className="num">src/lib/constants.ts</span>.
        </p>
        <Row term="Starship landed payload" value="100 t class (slider 50–200)" source="ASSUMED — SpaceX public statements; no Mars landing demonstrated. This is why it is user-adjustable." />
        <Row term="Methalox per return ship" value="1,000 t (slider 600–1,500)" source="ASSUMED — SpaceX figures for full propellant load, 1,000–1,200 t." />
        <Row term="Sabatier stoichiometry" value="CO2 + 4 H2 → CH4 + 2 H2O" source="Standard chemistry; flown on ISS ECLSS. Mass ratios exact from molar masses." />
        <Row term="Electrolysis energy" value="52.5 kWh / kg H2" source="Practical PEM systems (50–55); theoretical HHV floor is 39.4." />
        <Row term="CO2 intake at 6 mbar" value="0.9 kWh / kg CO2" source="ASSUMED — isothermal ideal from 600 Pa→100 kPa is ~0.29; real cryo/mechanical intake runs ~0.7–1.0. Earth-normal compression figures are wrong here on purpose." />
        <Row term="Mars surface pressure" value="6.36 mbar mean" source="NASA NSSDC Mars fact sheet." />
        <Row term="Synodic period" value="~779.9 days ≈ 759 sols" source="Orbital mechanics; the 26-month cargo cadence." />
        <Row term="Crew metabolism" value="0.84 kg O2 · 1.04 kg CO2 · 3,000 kcal /p/sol" source="NASA BVAD (Baseline Values and Assumptions Document) class values." />
        <Row term="Crop productivity" value="e.g. potato ~37, wheat ~20 g/m²/sol" source="Wheeler 2017, Open Agriculture (controlled-environment ranges); mid-range chosen, not best-case." />
        <Row term="Compost cycle" value="55 °C+, 70 sols to maturity" source="US EPA / on-farm composting handbooks: ≥3 days thermophilic for pathogen kill, 60–120 days maturation." />
        <Row term="Regolith perchlorate" value="~0.5 wt%, wash 3 L/kg" source="Hecht et al. 2009 (Phoenix); wash ratio ASSUMED." />
        <Row term="CO2 inventory / terraforming" value="≤ ~20 mbar accessible" source="Jakosky & Edwards 2018, Nature Astronomy; NASA summary: not possible with present-day technology. The overlay exists to show this, not to beat it." />
        <Row term="Dust storm optical depth" value="quiet τ≈0.4 · global storm τ≈5" source="ASSUMED from observed ranges (2018 storm exceeded τ 10 at Opportunity). Storm years ~1 in 3, seeded deterministically." />
        <Row term="Weibull failures" value="~1 / 500 unit-sols, 40 kg/repair" source="ASSUMED — no Mars MTBF data exists; shape 2 wear-out fleet average." />
      </div>
    </div>
  );
}
