// Section 02: global macro pulse, cards, and score history (filled client-side).
export default function MacroSection() {
  return (
    <>
      <div className="deck-divider"><span></span><svg><use href="#i-layers" /></svg><span></span></div>
      <section className="deck-section investing-section" aria-label="Global Macro">
        <div className="deck-heading">
          <div><div className="eyebrow pink-eyebrow"><i />02 / THE BIGGER PICTURE</div></div>
          <span className="scope-label"><svg aria-hidden="true"><use href="#i-globe" /></svg>GLOBAL MACRO</span>
        </div>
        <section className="pulse-card" aria-labelledby="pulse-title">
          <div className="card-heading"><h2 id="pulse-title"><svg aria-hidden="true"><use href="#i-globe" /></svg>Pulse makro</h2><span className="macro-scale-label">0–100</span></div>
          <div className="pulse-grid" id="pulse-grid" />
        </section>
        <div className="macro-grid" id="macro-grid"><p className="macro-availability" role="status">Memuat skor makro…</p></div>
        <div className="macro-history" id="macro-score-history">
          <section className="m2-plot-panel">
            <header><h3>Riwayat skor Global Macro <small>0–100</small></h3></header>
            <p className="btc-empty" role="status">Memuat riwayat skor…</p>
          </section>
        </div>
      </section>
    </>
  );
}
