// Screener, personal setups and watchlist (filled client-side).
export default function TradingMain() {
  return (
    <>
      <main className="trading-main">
      <div className="trading-page-heading"><div><div className="eyebrow"><i></i>TACTICAL WORKSPACE</div><h1>Trading Deck</h1></div><div className="trading-section-links"><a href="#screener-title">Screener</a><span>/</span><a href="#setups-title">Setup</a></div></div>
      <div className="trading-layout">
      <section className="trading-panel screener-panel" aria-labelledby="screener-title">
      <header className="trading-panel-header"><h2 id="screener-title"><svg aria-hidden="true"><use href="#t-filter" /></svg>Screener</h2><div className="trading-market-switch" role="group" aria-label="Pasar screener"><button type="button" data-screener-market="stocks" aria-pressed="true">Saham IDX</button><button type="button" data-screener-market="crypto" aria-pressed="false">Kripto</button></div></header>
      <div className="screener-frame" id="trading-screener" aria-label="Screener saham Indonesia"><div className="screener-message" id="screener-message" role="status"><span className="loading-mark"></span><span>Memuat screener…</span></div><div id="screener-embed"></div></div>
      <footer className="trading-source"><span>TradingView · Data dapat tertunda</span><a id="screener-source" href="https://www.tradingview.com/screener/" target="_blank" rel="noopener noreferrer">Buka screener<svg aria-hidden="true"><use href="#t-arrow" /></svg></a></footer>
      </section>
      <aside className="trading-sidebar" aria-label="Ruang kerja pribadi">
      <section className="trading-panel setups-panel" aria-labelledby="setups-title">
      <header className="trading-panel-header"><h2 id="setups-title"><svg aria-hidden="true"><use href="#t-note" /></svg>Setup <span className="setup-count" id="setup-count">0</span></h2><button type="button" className="trading-icon-button" id="add-setup" aria-label="Tambah setup" title="Tambah setup" aria-haspopup="dialog" aria-controls="setup-dialog"><svg aria-hidden="true"><use href="#t-plus" /></svg></button></header>
      <div className="setup-filters" role="group" aria-label="Filter status setup"><button type="button" data-setup-filter="all" aria-pressed="true">Semua</button><button type="button" data-setup-filter="watch" aria-pressed="false">Pantau</button><button type="button" data-setup-filter="ready" aria-pressed="false">Siap</button><button type="button" data-setup-filter="archive" aria-pressed="false">Arsip</button></div>
      <div className="setup-list" id="setup-list"></div>
      <div className="trading-local-note">Catatan pribadi · tersimpan di browser ini</div>
      </section>
      <details className="trading-panel trading-watchlist" open><summary>Watchlist saham <svg aria-hidden="true"><use href="#t-chevron" /></svg></summary><div id="trading-watchlist"></div><a className="watchlist-edit-link" href="/#market-agenda">Atur di Market Deck<svg aria-hidden="true"><use href="#t-arrow" /></svg></a></details>
      </aside>
      </div>
      <p id="trading-feedback" className="trading-feedback" role="status"></p>
      <footer className="trading-footer"><span>MARKET DECK <i>/</i> TRADING WORKSPACE</span><a href="/">Kembali ke Market Deck<svg aria-hidden="true"><use href="#t-arrow" /></svg></a></footer>
      </main>
    </>
  );
}
