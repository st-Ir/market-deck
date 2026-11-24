export default function MarketHeader() {
  return (
    <>
      <header className="workspace-header"><div className="identity"><img src="/assets/deck-mark.svg" className="deck-logo" width="34" height="34" alt="Logo Market Deck, dua bidang geometris bertumpuk" /><div className="wordmark">MARKET<span>DECK</span><small>A CLEARER PERSPECTIVE</small></div></div><nav className="deck-navigation" aria-label="Pilih halaman"><a href="/" aria-current="page"><svg aria-hidden="true"><use href="#i-market" /></svg>Market Deck</a><a href="/trading"><svg aria-hidden="true"><use href="#i-layers" /></svg>Trading Deck</a></nav><div className="workspace-meta"><i className="status-dot"></i><span>PERSONAL WORKSPACE</span><i className="header-divider"></i><span>JAKARTA <b id="local-time">—</b></span></div></header>
    </>
  );
}
