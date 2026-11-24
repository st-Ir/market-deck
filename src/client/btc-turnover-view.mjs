import {
  DAY, SPIKE, cash, day, timestamp, decimal, percent, ratio, tone, whole,
  volumeChart, rvolChart, priceChart, etfVolumeChart,
} from './btc-turnover-charts.mjs';

const HISTORY_DAYS = 180;
const MARKET_CHARTS = { volume: volumeChart, rvol: rvolChart, price: priceChart };
const SOURCE_LINKS = [
  ['Binance Spot', 'https://developers.binance.com/en/docs/catalog/core-trading-spot-trading/api/rest-api/market'],
  ['Binance USDⓈ-M', 'https://developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-usd-s-m-futures/api/rest-api/market-data'],
  ['Gate Futures', 'https://www.gate.com/docs/developers/apiv4/en/futures/'],
  ['SoSoValue ETF', 'https://sosovalue.com/assets/etf/us-btc-spot'],
];

const signedCash = (value) => (value > 0 ? '+' : '') + cash(value);
const amount = (value, unit = 'USDT') => Number.isFinite(value) ? cash(value) + ' ' + unit : '—';
const changeLabel = (change) => Number.isFinite(change)
  ? percent(change) + ' vs hari sebelumnya' : '';
const text = (value) => String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');

function tile(label, value, detail = '', cls = '') {
  return `<div><span>${label}</span><strong class="${cls}">${value}</strong>${detail ? `<small>${detail}</small>` : ''}</div>`;
}

const tiles = (markup, columns = 3, extra = '') =>
  `<div class="metric-detail-summary turnover-tiles turnover-tiles-${columns} ${extra}">${markup}</div>`;

function marketLabel(model, market) {
  if (market === 'spot') return model?.spotVenue ? 'Spot ' + model.spotVenue : 'Spot BTC';
  return model?.perpetualVenue ? 'Perpetual ' + model.perpetualVenue : 'Perpetual BTC';
}

function visibleRows(rows) {
  if (!rows?.length) return [];
  const cutoff = Date.parse(rows.at(-1).date) - (HISTORY_DAYS - 1) * DAY;
  return rows.filter((row) => Date.parse(row.date) >= cutoff);
}

function historyCoverage(rows) {
  return rows.length ? `${rows.length} hari UTC · ${day(rows[0].date, true)} – ${day(rows.at(-1).date, true)}` : '';
}

function historyRegion(key, label, columns, rows) {
  return `<div class="btc-table-wrap" data-btc-turnover-table="${key}" tabindex="0" role="region" aria-label="${label}">
    <table><thead><tr>${columns.map((column) => `<th scope="col">${column}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>
  </div>`;
}

function historyDisclosure(key, label, content, detail = '') {
  return `<details class="btc-history-disclosure" data-btc-turnover-disclosure="${key}">
    <summary>${label}${detail ? ` <small>${detail}</small>` : ''}</summary>${content}
  </details>`;
}

function marketHistory(rows, market, spikes = false) {
  const key = market + (spikes ? '-spikes' : '-daily');
  const label = spikes ? 'Lonjakan terbaru' : market === 'combined' ? 'Riwayat harian gabungan' : 'Riwayat harian';
  const detail = spikes ? 'RVOL ≥ 1,5×' : '';
  if (!rows.length) return historyDisclosure(key, label, '<p class="btc-empty">Belum ada lonjakan dalam riwayat ini.</p>', detail);
  const combined = market === 'combined';
  const trades = rows.some((row) => Number.isFinite(row.trades));
  const taker = !spikes && rows.some((row) => Number.isFinite(row.net));
  const regionLabel = spikes ? 'Lonjakan volume' : 'Riwayat transaksi ' + ({combined:'gabungan',spot:'spot',perpetual:'perpetual'}[market]);
  const columns = ['Tanggal UTC', 'Nilai (USDT)', ...(combined ? ['Spot', 'Perpetual', 'Porsi perp.'] : []),
    'RVOL', 'Perubahan BTC', ...(trades ? ['Transaksi'] : []), ...(taker ? ['Taker buy', 'Taker sell', 'Taker net'] : [])];
  const cells = rows.map((row) => {
    const share = row.volume > 0 ? decimal.format(row.perpetual / row.volume * 100) + '%' : '—';
    return `<tr><th scope="row">${day(row.date, true)}</th><td>${cash(row.volume)}</td>
      ${combined ? `<td>${cash(row.spot)}</td><td>${cash(row.perpetual)}</td><td>${share}</td>` : ''}
      <td>${ratio(row.rvol)}</td><td class="${tone(row.change)}">${percent(row.change)}</td>
      ${trades ? `<td>${whole(row.trades)}</td>` : ''}
      ${taker ? `<td>${cash(row.buy)}</td><td>${cash(row.sell)}</td><td class="${tone(row.net)}">${signedCash(row.net)}</td>` : ''}</tr>`;
  });
  return historyDisclosure(key, label, historyRegion(key, regionLabel, columns, cells), detail);
}

function tickerTile(label, rolling, detail = '') {
  if (!rolling) return tile(label, '—', 'Ticker belum tersedia');
  return tile(label, amount(rolling.volume), [detail, timestamp(rolling.to)].filter(Boolean).join(' · '), 'btc-positive');
}

function marketColumn(model, market, loading, renderChart) {
  const title = marketLabel(model, market);
  const start = `<section class="btc-flow-col"><h3 class="btc-col-title">${title}</h3>`;
  if (!model) return start + `<p class="btc-empty">${loading ? 'Memuat data pasar…' : 'Data pasar belum tersedia.'}</p></section>`;
  const { latest, month, rolling, archive } = model;
  const rows = visibleRows(model.rows);
  const coverage = ['BTCUSDT', historyCoverage(rows), archive && 'Arsip harian'].filter(Boolean).join(' · ');
  return start + `<p class="btc-coverage">${coverage}</p>` + tiles(
    tickerTile('24 jam berjalan', rolling, Number.isFinite(rolling?.trades) ? whole(rolling.trades) + ' transaksi' : '') +
    tile(latest ? 'Harian · ' + day(latest.date) : 'Harian', cash(latest?.volume), Number.isFinite(latest?.rvol) ? 'RVOL ' + ratio(latest.rvol) : '') +
    tile('Bulan ini', cash(month?.volume), month ? month.days + ' hari UTC' : '')
  ) + (rows.length ? renderChart(market + '-volume') + renderChart(market + '-rvol') + renderChart(market + '-price') +
    marketHistory(rows.slice().reverse(), market) : '') + '</section>';
}

function combinedSection(models, loading, renderChart) {
  const { combined, spot, perpetual } = models;
  const rows = visibleRows(combined?.rows);
  const { latest, month, rolling } = combined ?? {};
  const spotName = marketLabel(spot, 'spot');
  const perpName = marketLabel(perpetual, 'perpetual');
  const venues = [spotName, perpName].join(' + ');
  const tickerInfo = rolling ? [rolling.rvol!=null && 'RVOL ' + ratio(rolling.rvol),
    rolling.trades!=null && whole(rolling.trades) + ' transaksi'].filter(Boolean).join(' · ') : '';
  const head = `<section class="btc-flow-combined"><h3 class="btc-col-title">Gabungan Spot + Perpetual</h3>
    <p class="btc-coverage">${venues} · BTCUSDT${rows.length ? ' · ' + historyCoverage(rows) : ''}${combined?.archive ? ' · Perpetual dari arsip harian' : ''}</p>`;
  const totalTile = rolling ? tickerTile('Gabungan · Live 24 jam', rolling, tickerInfo)
    : tile('Gabungan · 24 jam', '—', loading ? 'Memuat ticker…' : 'Menunggu ticker yang waktunya selaras');
  const liveTiles = tiles(totalTile + tickerTile(spotName + ' · 24 jam', spot?.rolling) +
    tickerTile(perpName + ' · 24 jam', perpetual?.rolling), 3, 'turnover-live');
  if (!rows.length) return head + liveTiles + '</section>';

  const momentum = Number.isFinite(latest.ma5) && latest.ma20 > 0 ? (latest.ma5 / latest.ma20 - 1) * 100 : null;
  const stats = tiles(
    tile('Harian · ' + day(latest.date), cash(latest.volume), changeLabel(latest.volumeChange)) +
    tile('Bulan berjalan · UTC', cash(month?.volume), month ? 'Spot ' + cash(month.spot) + ' · perp ' + cash(month.perpetual) + ' · ' + month.days + ' hari' : '') +
    tile('RVOL harian', ratio(latest.rvol), 'Persentil 60 hari ' + whole(latest.percentile)) +
    tile('MA5 / MA20', percent(momentum), cash(latest.ma5) + ' / ' + cash(latest.ma20), tone(momentum)), 4
  );
  const metrics = `<p class="btc-coverage turnover-metrics">BTC ${percent(latest.change)} · Penutupan ${amount(latest.close)} · Naik/turun saat volume meningkat ${combined.rising}/${combined.falling} dalam 20 hari${rolling?.rvol!=null ? ' · RVOL 24 jam: ' + ratio(rolling.ratio7) + ' / 7H, ' + ratio(rolling.ratio30) + ' / 30H' : ''}</p>`;
  const hint = '<p class="btc-coverage turnover-chart-hint">Roda mouse: zoom · Seret: geser · Klik ganda: reset</p>';
  return head + liveTiles + stats + metrics + hint + renderChart('combined-volume') +
    combinedMomentum(rows, renderChart) + '</section>';
}

function combinedMomentum(rows, renderChart) {
  const spikes = rows.filter((row) => row.rvol >= SPIKE).slice(-10).reverse();
  return '<section class="turnover-analysis"><h3 class="btc-col-title">Momentum gabungan</h3><div class="btc-flow-split">' +
    renderChart('combined-rvol') + renderChart('combined-price') + '</div>' +
    marketHistory(spikes, 'combined', true) + marketHistory(rows.slice().reverse(), 'combined') + '</section>';
}

function etfSection(etf, loading, renderChart) {
  const head = '<section class="btc-flow-col turnover-etf"><h3 class="btc-col-title">ETF spot Bitcoin AS</h3>';
  if (!etf?.points?.length) return head + `<p class="btc-empty">${loading ? 'Memuat nilai transaksi ETF…' : 'Nilai transaksi ETF belum tersedia.'}</p></section>`;
  const rows = etf.points.slice(-HISTORY_DAYS);
  const latest = rows.at(-1);
  const current = etf.latestSession ?? latest;
  const showFunds = !!current.byFund && Object.values(current.byFund).some(Number.isFinite);
  const seriesLabel = etf.estimate ? 'Estimasi harga penutupan × jumlah saham' : 'Nilai transaksi yang dilaporkan';
  const coverage = typeof current.coverage === 'number' && etf.funds?.length ? ` · ${current.coverage}/${etf.funds.length} ETF` : '';
  const info = `<p class="btc-coverage">USD · ${text(etf.source)} · ${seriesLabel}${coverage}</p>`;
  const summary = tiles(tile('Nilai transaksi · ' + day(current.date), amount(current.volume, 'USD'),
    current.provisional ? 'Sementara · jumlah per ETF' : '') +
    tile('Arus bersih · ' + day(latest.date), Number.isFinite(latest.net) ? signedCash(latest.net) + ' USD' : '—', '', tone(latest.net)) +
    tile('Aset bersih · ' + day(latest.date), amount(latest.assets, 'USD')));
  const funds = showFunds ? `<h4 class="btc-subtitle">Nilai transaksi per ETF · ${day(current.date, true)}${current.provisional ? ' · sementara' : ''}</h4><div class="btc-fund-grid">${Object.entries(current.byFund).map(([fund, value]) => `<div><span>${text(fund)}</span><strong>${cash(value)}</strong></div>`).join('')}</div>` : '';
  const rawRows = rows.slice().reverse().map((row) => `<tr><th scope="row">${day(row.date, true)}</th><td>${cash(row.volume)}</td>
    <td class="${tone(row.net)}">${signedCash(row.net)}</td><td>${cash(row.assets)}</td></tr>`);
  const history = historyRegion('etf-daily', 'Riwayat ETF', ['Tanggal sesi AS', 'Nilai (USD)', 'Arus bersih', 'Aset bersih'], rawRows);
  return head + info + summary + renderChart('etf-volume') + funds +
    historyDisclosure('etf-daily', 'Riwayat ETF', history, 'USD') + '</section>';
}

function methodology() {
  const links = SOURCE_LINKS.map(([label, url]) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`).join(' · ');
  return `<details class="btc-method" data-btc-turnover-disclosure="method"><summary>Sumber &amp; metode</summary>
    <p>Gabungan menjumlahkan nilai transaksi BTCUSDT spot Binance dan perpetual Binance atau Gate dalam USDT. Total 24 jam diperbarui tiap menit selama ticker kedua pasar tersedia dengan selisih waktu maksimal dua menit. Riwayat gabungan memakai hari UTC yang selesai di kedua pasar.</p>
    <p>RVOL membandingkan nilai transaksi dengan rata-rata 20 hari UTC sebelumnya. MA5 dan MA20 mencakup hari yang ditampilkan. Persentil memakai 60 hari sebelumnya. Konfirmasi harga menandai pergerakan minimal 0,2% dengan aktivitas lebih tinggi dari hari sebelumnya.</p>
    <p>Taker net adalah taker buy dikurangi taker sell. Jumlah transaksi dan rincian taker tampil sesuai cakupan sumber. Nilai ETF dalam USD mengikuti sesi bursa AS dan ditampilkan terpisah dari total BTCUSDT. Arus bersih ETF mengukur creation dan redemption.</p><p>${links}</p></details>`;
}

export function renderBtcTurnoverChart({ models, etf, key, view }) {
  if (key === 'etf-volume') return etfVolumeChart(etf?.points?.slice(-HISTORY_DAYS) ?? [], view, etf?.estimate);
  const [market, kind] = key.split('-');
  const rows = visibleRows(models[market]?.rows);
  return MARKET_CHARTS[kind]?.(rows, market, view) ?? '';
}

export function renderBtcTurnover({ models, etf, loading, etfLoading, chartViews }) {
  const renderChart = (key) => renderBtcTurnoverChart({ models, etf, key, view: chartViews?.get(key) });
  return `<div class="btc-turnover">${combinedSection(models, loading, renderChart)}
    <div class="btc-flow-split">${marketColumn(models.spot, 'spot', loading, renderChart)}${marketColumn(models.perpetual, 'perpetual', loading, renderChart)}</div>
    ${etfSection(etf, etfLoading, renderChart)}${methodology()}</div>`;
}
