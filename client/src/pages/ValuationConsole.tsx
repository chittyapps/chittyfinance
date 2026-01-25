import { useEffect, useMemo, useState } from "react";

type Quarter = "Q1" | "Q2" | "Q3" | "Q4";

const fmtMoney = (n: number) =>
  isFinite(n) ? "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 }) : "—";

export default function ValuationConsole() {
  // Valuation snapshot
  const [value, setValue] = useState(290000);
  const [low, setLow] = useState(285000);
  const [high, setHigh] = useState(295000);

  // Rent & Yield
  const [rent, setRent] = useState(1950);
  const [hoa, setHoa] = useState(450);
  const [tax, setTax] = useState(4300);
  const [vacancyPct, setVacancyPct] = useState(10);

  // Sensitivity
  const [rateShock, setRateShock] = useState(0); // -1..1 (%), 1 = 100bps
  const [inventory, setInventory] = useState(0); // -20..20 (%)
  const [quarter, setQuarter] = useState<Quarter>("Q4");

  // Comps: simple editable rows
  type Comp = { address: string; price: number; beds: number; baths: number; sqft: number; notes: string };
  const [comps, setComps] = useState<Comp[]>([
    { address: "550 W Surf #311", price: 300000, beds: 1, baths: 1, sqft: 750, notes: "Similar vintage/finishes" },
    { address: "550 W Surf #214", price: 287000, beds: 1, baths: 1, sqft: 700, notes: "Smaller, lower floor" },
    { address: "2940 N Pine Grove #3C", price: 295000, beds: 1, baths: 1, sqft: 740, notes: "Higher assessments" },
  ]);

  // Derived: NOI and Cap
  const noi = useMemo(() => {
    const gross = rent * 12;
    const eff = gross * (1 - vacancyPct / 100);
    return eff - hoa * 12 - tax;
  }, [rent, hoa, tax, vacancyPct]);

  const cap = useMemo(() => (value > 0 ? (noi / value) * 100 : 0), [noi, value]);

  // Derived: Scenario
  const scenario = useMemo(() => {
    const rateImpactPct = -3.6 * rateShock; // +0.5% => -1.8%
    const invImpactPct = -0.23 * inventory; // -10% => +2.3%
    const seasImpactPct = quarter === "Q4" ? -0.9 : 0;
    const totalPct = rateImpactPct + invImpactPct + seasImpactPct;
    const scenVal = value * (1 + totalPct / 100);
    return { scenVal, totalPct, rateImpactPct, invImpactPct };
  }, [value, rateShock, inventory, quarter]);

  // Derived: average comp price (positive prices only)
  const avgComp = useMemo(() => {
    const vals = comps.map((c) => c.price).filter((p) => p > 0);
    if (!vals.length) return 0;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }, [comps]);

  // Persist small state locally for convenience
  useEffect(() => {
    const saved = localStorage.getItem("valuation-console:v1");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === "object") {
          setValue(parsed.value ?? value);
          setLow(parsed.low ?? low);
          setHigh(parsed.high ?? high);
          setRent(parsed.rent ?? rent);
          setHoa(parsed.hoa ?? hoa);
          setTax(parsed.tax ?? tax);
          setVacancyPct(parsed.vacancyPct ?? vacancyPct);
          setRateShock(parsed.rateShock ?? rateShock);
          setInventory(parsed.inventory ?? inventory);
          setQuarter(parsed.quarter ?? quarter);
          setComps(parsed.comps ?? comps);
        }
      } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const payload = {
      value,
      low,
      high,
      rent,
      hoa,
      tax,
      vacancyPct,
      rateShock,
      inventory,
      quarter,
      comps,
    };
    localStorage.setItem("valuation-console:v1", JSON.stringify(payload));
  }, [value, low, high, rent, hoa, tax, vacancyPct, rateShock, inventory, quarter, comps]);

  return (
    <div>
      <header style={{ padding: "1.5rem 2rem", background: "#111827", color: "#f9fafb" }}>
        <h1 style={{ margin: 0, marginBottom: "0.25rem", fontSize: "1.5rem" }}>
          550 W Surf St #504 – Valuation Console
        </h1>
        <p style={{ margin: 0, fontSize: ".9rem", opacity: 0.9 }}>
          Interactive valuation, rental yield, comps, and sensitivity dashboard.
        </p>
      </header>
      <main style={{ padding: "1.5rem", maxWidth: 1100, margin: "0 auto" }}>
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))",
            gap: "1rem",
          }}
        >
          <article className="card" style={cardStyle}>
            <div className="label" style={labelStyle}>Valuation snapshot</div>
            <div className="stat-main" style={statMainStyle}>{fmtMoney(value)}</div>
            <div className="stat-sub" style={statSubStyle}>
              Range: {fmtMoney(low)} – {fmtMoney(high)}
            </div>

            <Field label="Target value ($)">
              <input type="number" value={value} step={1000} onChange={(e) => setValue(Number(e.target.value) || 0)} />
            </Field>
            <Field label="Low bound ($)">
              <input type="number" value={low} step={1000} onChange={(e) => setLow(Number(e.target.value) || 0)} />
            </Field>
            <Field label="High bound ($)">
              <input type="number" value={high} step={1000} onChange={(e) => setHigh(Number(e.target.value) || 0)} />
            </Field>

            <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", marginTop: ".35rem" }}>
              <span style={pillStyle}>1 BR · Historic courtyard</span>
              <span style={pillStyle}>Lincoln Park</span>
              <span style={pillStyle}>Owner-occupant / Investor</span>
            </div>
          </article>

          <article className="card" style={cardStyle}>
            <h2 style={{ margin: 0, marginBottom: ".6rem", fontSize: "1rem" }}>Rental & Yield</h2>
            <Field label="Market rent (per month, $)">
              <input type="number" value={rent} step={25} onChange={(e) => setRent(Number(e.target.value) || 0)} />
            </Field>
            <Field label="HOA dues (per month, $)">
              <input type="number" value={hoa} step={10} onChange={(e) => setHoa(Number(e.target.value) || 0)} />
            </Field>
            <Field label="Property tax (annual, $)">
              <input type="number" value={tax} step={50} onChange={(e) => setTax(Number(e.target.value) || 0)} />
            </Field>
            <Field label="Vacancy + repairs (% of rent)">
              <input type="number" value={vacancyPct} step={1} onChange={(e) => setVacancyPct(Number(e.target.value) || 0)} />
            </Field>

            <div className="label" style={{ ...labelStyle, marginTop: ".5rem" }}>Modeled results</div>
            <div className="stat-main" style={statMainStyle}>{(cap || 0).toFixed(1)}% cap</div>
            <div className="stat-sub" style={statSubStyle}>NOI: {fmtMoney(Math.round(noi))} / year</div>
            <p style={mutedStyle}>NOI = (Rent × 12 × (1 − vacancy)) − HOA × 12 − taxes.</p>
          </article>

          <article className="card" style={cardStyle}>
            <h2 style={{ margin: 0, marginBottom: ".6rem", fontSize: "1rem" }}>Sensitivity</h2>

            <div style={sliderRowStyle}>
              <span style={{ width: "5.5rem", fontSize: ".78rem" }}>Rate shock</span>
              <input type="range" min={-1} max={1} step={0.1} value={rateShock} onChange={(e) => setRateShock(Number(e.target.value) || 0)} style={{ flex: 1 }} />
              <span style={{ width: "4.5rem", fontSize: ".78rem", textAlign: "right" }}>
                {(rateShock * 100 >= 0 ? "+" : "") + (rateShock * 100).toFixed(0)} bps
              </span>
            </div>
            <div style={mutedStyle}>+50 bps ≈ −1.8% value (linear)</div>

            <div style={sliderRowStyle}>
              <span style={{ width: "5.5rem", fontSize: ".78rem" }}>Inventory</span>
              <input type="range" min={-20} max={20} step={1} value={inventory} onChange={(e) => setInventory(Number(e.target.value) || 0)} style={{ flex: 1 }} />
              <span style={{ width: "4.5rem", fontSize: ".78rem", textAlign: "right" }}>
                {(inventory > 0 ? "+" : "") + inventory.toFixed(0)}%
              </span>
            </div>
            <div style={mutedStyle}>−10% inventory ≈ +2.3% value.</div>

            <Field label="Seasonality">
              <select value={quarter} onChange={(e) => setQuarter(e.target.value as Quarter)}>
                <option value="Q1">Q1 (Jan–Mar)</option>
                <option value="Q2">Q2 (Apr–Jun)</option>
                <option value="Q3">Q3 (Jul–Sep)</option>
                <option value="Q4">Q4 (Oct–Dec)</option>
              </select>
            </Field>

            <div className="label" style={{ ...labelStyle, marginTop: ".5rem" }}>Scenario value</div>
            <div className="stat-main" style={statMainStyle}>{fmtMoney(Math.round(scenario.scenVal))}</div>
            <div className="stat-sub" style={statSubStyle}>
              Δ vs. base: {(scenario.totalPct >= 0 ? "+" : "") + scenario.totalPct.toFixed(1)}%
            </div>
            <p style={mutedStyle}>Combines rate, inventory, and seasonal adjustments into a single scenario price.</p>
          </article>
        </section>

        <section className="card" style={{ ...cardStyle, marginTop: "1rem" }}>
          <h2 style={{ margin: 0, marginBottom: ".6rem", fontSize: "1rem" }}>Comparable Sales (editable)</h2>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".82rem", marginTop: ".4rem" }}>
            <thead>
              <tr>
                <th style={thStyle}>Address</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Price ($)</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Beds</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Baths</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Sq Ft</th>
                <th style={thStyle}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {comps.map((c, i) => (
                <tr key={i}>
                  <td>
                    <input value={c.address} onChange={(e) => updateComp(i, { address: e.target.value })} />
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <input
                      type="number"
                      value={c.price}
                      onChange={(e) => updateComp(i, { price: Number(e.target.value) || 0 })}
                      style={{ textAlign: "right" }}
                    />
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <input
                      type="number"
                      value={c.beds}
                      onChange={(e) => updateComp(i, { beds: Number(e.target.value) || 0 })}
                      style={{ textAlign: "right" }}
                    />
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <input
                      type="number"
                      value={c.baths}
                      onChange={(e) => updateComp(i, { baths: Number(e.target.value) || 0 })}
                      style={{ textAlign: "right" }}
                    />
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <input
                      type="number"
                      value={c.sqft}
                      onChange={(e) => updateComp(i, { sqft: Number(e.target.value) || 0 })}
                      style={{ textAlign: "right" }}
                    />
                  </td>
                  <td>
                    <input value={c.notes} onChange={(e) => updateComp(i, { notes: e.target.value })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={mutedStyle}>
            Edit cells directly. Average comp price (1 BR) will be used as a reference anchor: <span style={{ fontWeight: 600 }}>{fmtMoney(Math.round(avgComp))}</span>.
          </p>
        </section>
      </main>
      <style>{globalCss}</style>
    </div>
  );

  function updateComp(index: number, patch: Partial<Comp>) {
    setComps((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ margin: ".35rem 0", fontSize: ".9rem" }}>
      <label style={{ display: "block", marginBottom: ".1rem", fontSize: ".8rem", color: "#4b5563" }}>{label}</label>
      <div>
        {children}
      </div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: ".6rem",
  padding: "1rem 1.25rem",
  boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
};

const labelStyle: React.CSSProperties = {
  fontSize: ".78rem",
  textTransform: "uppercase",
  letterSpacing: ".06em",
  color: "#6b7280",
  marginBottom: ".25rem",
};

const statMainStyle: React.CSSProperties = { fontSize: "1.4rem", fontWeight: 600 };
const statSubStyle: React.CSSProperties = { fontSize: ".8rem", color: "#6b7280", marginTop: ".1rem" };
const sliderRowStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: ".5rem", margin: ".3rem 0" };
const mutedStyle: React.CSSProperties = { fontSize: ".78rem", color: "#6b7280", marginTop: ".25rem" };
const pillStyle: React.CSSProperties = { padding: ".18rem .55rem", borderRadius: 999, fontSize: ".72rem", background: "#eef2ff", color: "#4338ca" };

const thStyle: React.CSSProperties = {
  fontWeight: 500,
  color: "#4b5563",
  background: "#f9fafb",
  position: "sticky" as const,
  top: 0,
  padding: ".35rem .4rem",
  borderBottom: "1px solid #e5e7eb",
  textAlign: "left",
};

const globalCss = `
  body { background:#f4f5f7; }
  input, select { width: 100%; padding: .35rem .45rem; border-radius: .35rem; border: 1px solid #d1d5db; font-size: .9rem; box-sizing: border-box; }
  td, th { padding: .35rem .4rem; border-bottom: 1px solid #e5e7eb; }
  tr:last-child td { border-bottom: none; }
`;

