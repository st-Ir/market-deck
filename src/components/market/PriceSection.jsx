// Section 01: IHSG/Bitcoin snapshot, chart, watchlist, sentiment and agenda panels.
export default function PriceSection() {
  return (
    <>
      <section className="deck-section trading-section" aria-label="Analisis pasar">
      <div className="deck-heading"><div><div className="eyebrow"><i></i>01 / PRICE & EXECUTION</div></div><span className="scope-label"><svg><use href="#i-market" /></svg>IHSG & BITCOIN</span></div>
      <section className="market-snapshot" id="market-snapshot" aria-label="Ringkasan IHSG">
      <article className="snapshot-stat metric-stat" data-metric="foreign-net"><div className="snapshot-label"><span>NET ASING</span><button className="metric-period" id="flow-period" type="button" aria-label="Ubah net asing ke mingguan">Harian ↔</button></div><div className="snapshot-main"><strong className="metric-value">—</strong><span className="snapshot-change metric-delta">— <small>Δ20H</small></span></div><p className="metric-date">Memuat data BEI…</p><svg className="snapshot-spark metric-spark" viewBox="0 0 130 30" role="img" aria-label="Riwayat belum dimuat"></svg></article>
      <article className="snapshot-stat metric-stat" data-metric="turnover"><div className="snapshot-label">NILAI TRANSAKSI<svg><use href="#i-market" /></svg></div><div className="snapshot-main"><strong className="metric-value">—</strong><span className="snapshot-change metric-delta">— <small>Δ20H</small></span></div><p className="metric-date">Memuat data BEI…</p><svg className="snapshot-spark metric-spark" viewBox="0 0 130 30" role="img" aria-label="Riwayat belum dimuat"></svg></article>
      <article className="snapshot-stat metric-stat" data-metric="eido"><button className="metric-open" type="button" data-eido-open aria-label="Buka ringkasan pergerakan EIDO" aria-haspopup="dialog" aria-controls="eido-dialog"></button><div className="snapshot-label">EIDO<svg><use href="#i-globe" /></svg></div><div className="snapshot-main"><strong className="metric-value">—</strong><span className="snapshot-change metric-delta">— <small>Δ1H</small></span></div><p className="metric-date">Memuat EIDO…</p><svg className="snapshot-spark metric-spark" viewBox="0 0 130 30" role="img" aria-label="Riwayat belum dimuat"></svg></article>
      <article className="snapshot-stat metric-stat fx-stat" data-metric="usd-idr"><div className="snapshot-label"><span>USD / IDR</span><svg aria-hidden="true"><use href="#i-switch" /></svg></div><div className="snapshot-main"><strong className="metric-value">—</strong><span className="snapshot-change metric-delta">— <small>Δ1H</small></span></div><p className="metric-date">Memuat kurs…</p><svg className="snapshot-spark metric-spark" viewBox="0 0 130 30" role="img" aria-label="Riwayat belum dimuat"></svg></article>
      </section>
      <div className="market-grid">
      <div className="market-charts">
      <section className="chart-card" id="chart-card" data-symbol="IDX:COMPOSITE" aria-label="Chart TradingView IHSG">
      <header className="chart-header compact-chart-header"><div className="market-switch" role="group" aria-label="Pilih pasar chart"><button type="button" data-market="ihsg" aria-pressed="true">IHSG</button><button type="button" data-market="bitcoin" aria-pressed="false">Bitcoin</button></div><span className="market-status" id="market-status" role="status"><i></i><span>—</span></span><div className="chart-controls"><button className="icon-button chart-tools-toggle" id="toggle-chart-tools" type="button" aria-label="Tampilkan alat chart" title="Tampilkan alat chart" aria-controls="tradingview-chart" aria-pressed="false"><svg><use href="#i-tools" /></svg></button><button className="icon-button" id="expand-chart" title="Perbesar chart" aria-label="Perbesar chart"><svg><use href="#i-expand" /></svg></button></div></header>
      <div id="tradingview-chart" className="tradingview-chart" aria-label="Grafik IHSG dari TradingView"><div className="chart-loading" id="chart-loading"><span className="loading-mark"></span><span>Memuat chart TradingView…</span></div></div>
      </section>
      </div>
      <aside className="market-context" aria-label="Konteks trading">
      <section className="watchlist-card" aria-labelledby="watchlist-title"><div className="card-heading"><h2 id="watchlist-title">Pantauan pasar</h2><span className="watchlist-market" id="watchlist-market">IHSG</span></div><p className="watchlist-intro sr-only" id="watchlist-intro">Komoditas ekspor, energi, dan kondisi dolar.</p><div className="cross-asset-list" id="cross-asset-list"></div><p className="sr-only" id="watchlist-announcement" role="status" aria-live="polite"></p></section>
      <div className="context-stack">
      <details className="sentiment-card" id="market-sentiment">
        <summary className="card-heading sentiment-summary">
          <h2 id="fear-greed-title">Fear &amp; Greed IHSG</h2>
          <span className="sentiment-compact" id="fear-greed-compact"><span className="sentiment-scope">—</span></span>
          <svg className="ui-icon sentiment-chevron" aria-hidden="true"><use href="#i-chevron" /></svg>
        </summary>
        <div className="sentiment-reading" id="fear-greed-reading" aria-live="polite">Memuat skor…</div>
        <div className="sentiment-meter" id="fear-greed-meter" role="img" aria-label="Sentimen IHSG sedang dimuat" hidden><i /></div>
        <div className="sentiment-scale" id="fear-greed-scale" hidden><span>FEAR</span><span>GREED</span></div>
        <div className="sentiment-parts" id="fear-greed-parts"></div>
        <div className="sentiment-source">
          <a id="fear-greed-source" target="_blank" rel="noopener noreferrer" hidden>
            <span>Dihitung · BEI</span> <svg className="ui-icon" aria-hidden="true"><use href="#i-external" /></svg>
          </a>
          <span id="fear-greed-date"></span>
        </div>
        <details className="sentiment-method" id="fear-greed-method" hidden><summary>Metode perhitungan</summary><p /></details>
      </details>
      <section className="sector-card" id="sector-card" aria-label="Pergerakan sektoral IDX-IC hari ini"><div className="sector-rows" id="sector-rows"><span className="sector-empty">Memuat indeks sektoral BEI…</span></div><span className="sector-note" id="sector-note"></span></section></div>
      </aside>
      </div>
      
      <div className="agenda-panels">
      <section className="agenda-panel news-panel" id="market-news" aria-labelledby="news-title"><div className="news-head"><h2 id="news-title"><svg><use href="#i-news" /></svg>Sentiment</h2><span className="news-head-end"><span className="news-updated" id="news-updated"></span><svg className="ui-icon news-chevron" aria-hidden="true"><use href="#i-chevron" /></svg></span></div><ul className="news-list" id="news-list"><li className="news-empty">Memuat headline…</li></ul><p className="news-source">Headline terpenting 24 jam terakhir · media arus utama terverifikasi · tanpa promosi atau clickbait</p></section>
      <details className="agenda-panel agenda-disclosure agenda-combined" id="market-agenda" aria-labelledby="agenda-title"><summary className="agenda-summary"><span className="agenda-summary-heading"><h2 id="agenda-title"><svg><use href="#i-calendar" /></svg>Agenda</h2><svg className="ui-icon agenda-chevron"><use href="#i-chevron" /></svg></span><span className="agenda-preview-row"><small>EKONOMI</small><span className="agenda-preview" id="economic-next">Memuat agenda terdekat…</span></span><span className="agenda-preview-row"><small>CORPORATE</small><span className="agenda-preview" id="corporate-next">Pilih saham portofolio atau watchlist</span></span><span className="agenda-foot">Buka untuk kalender ekonomi lengkap dan corporate action saham pilihanmu</span></summary><div className="agenda-expanded"><div className="agenda-tabs" role="tablist" aria-label="Isi agenda"><button type="button" role="tab" data-agenda-tab="economic" aria-selected="true">Kalender ekonomi</button><button type="button" role="tab" data-agenda-tab="corporate" aria-selected="false">Corporate action</button></div><div className="agenda-pane" data-agenda-pane="economic" role="tabpanel"><div className="calendar-toolbar"><div className="calendar-nav"><button type="button" id="calendar-prev" aria-label="Bulan sebelumnya"><svg className="ui-icon"><use href="#i-prev" /></svg></button><strong id="calendar-month" aria-live="polite">—</strong><button type="button" id="calendar-next" aria-label="Bulan berikutnya"><svg className="ui-icon"><use href="#i-next" /></svg></button></div><div className="calendar-actions"><button type="button" className="calendar-filter" id="calendar-filter" aria-label="Ganti cakupan negara">AS + ID</button><button type="button" className="agenda-button" id="reload-calendar" aria-label="Muat ulang kalender ekonomi" title="Muat ulang kalender"><svg className="ui-icon"><use href="#i-refresh" /></svg></button></div></div><div className="economic-events" id="economic-events" aria-live="polite"><p className="calendar-no-events">Memuat jadwal resmi…</p></div><div className="agenda-source calendar-source"><details><summary>WIB · Sumber <svg className="ui-icon"><use href="#i-chevron" /></svg></summary><p>CPI, PPI, payrolls, JOLTS, PCE, GDP, FOMC, dan BI-Rate. Jam AS dikonversi ke WIB sesuai daylight saving. Jadwal tanpa jam tetap memakai tanggal negara sumber. Jadwal dapat berubah.</p><ul id="calendar-source-list"></ul></details></div></div><div className="agenda-pane" data-agenda-pane="corporate" role="tabpanel" hidden><div className="personal-toolbar"><span className="agenda-eyebrow">PORTOFOLIO / WATCHLIST</span><button type="button" className="agenda-button" data-edit-symbols aria-haspopup="dialog" aria-controls="personal-symbols-dialog">Atur saham</button></div><div className="selected-symbols" id="personal-symbols"></div><div id="corporate-content"></div><div className="agenda-source" id="corporate-note">Hanya saham pilihanmu · Sumber IDX</div></div></div></details>
      </div>
      </section>
    </>
  );
}
