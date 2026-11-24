export default function TradingHeader() {
  return (
    <>
      <header className="workspace-header">
      <div className="identity"><img src="/assets/deck-mark.svg" className="deck-logo" width="34" height="34" alt="Logo Deck" /><div className="wordmark">TRADING<span>DECK</span><small>YOUR TACTICAL WORKSPACE</small></div></div>
      <nav className="deck-navigation" aria-label="Pilih halaman"><a href="/"><svg aria-hidden="true"><use href="#t-market" /></svg>Market Deck</a><a href="/trading" aria-current="page"><svg aria-hidden="true"><use href="#t-grid" /></svg>Trading Deck</a></nav>
      <div className="workspace-meta"><i className="status-dot"></i><span>JAKARTA <b id="trading-time">—</b></span></div>
      </header>
    </>
  );
}
