# Market Deck (Next.js)

Versi Next.js dari prototype Market Deck: halaman **Market Deck** (`/`) dan **Trading Deck** (`/trading`).

```bash
npm install
npm run dev      # http://localhost:3000
npm run build && npm start
```

## Struktur

| Lokasi | Isi |
| --- | --- |
| `src/app/(market)/` | Layout + halaman `/` (CSS Market Deck) |
| `src/app/(trading)/trading/` | Layout + halaman `/trading` (CSS Trading Deck) |
| `src/app/api/[endpoint]/route.js` | 14 endpoint `/api/*` yang dipakai widget |
| `src/lib/market-data.js` | Sumber data endpoint: snapshot + sumber live |
| `src/components/market`, `src/components/trading` | Markup halaman sebagai komponen React |
| `src/components/LegacyScripts.jsx` | Menjalankan modul interaktif di browser setelah hydration |
| `src/legacy/` | Logika interaktif (chart TradingView, kartu, dialog, kalender, setup) dari prototype |
| `src/styles/` | CSS asli prototype |
| `src/data/` | Snapshot JSON tiap endpoint |

Dua route group punya root layout sendiri, jadi pindah antara `/` dan `/trading` adalah navigasi halaman penuh — sama seperti prototype.

## Data

Endpoint **live** (cache server singkat; widget di halaman memuat ulang tiap 60 detik). Bila sumber gagal, endpoint jatuh kembali ke snapshot di `src/data/`:

| Endpoint | Sumber |
| --- | --- |
| `/api/usd-idr` | Riwayat kurs referensi ECB (via Frankfurter), IHSG Yahoo `^JKSE`, kuotasi intraday Yahoo `IDR=X` (hanya bila selisih < 1,5% dari ECB) |
| `/api/vix` | Cboe VIX CSV |
| `/api/us10y-quote` | Cboe TNX delayed |
| `/api/treasury-seed`, `/api/treasury-curve` | Yahoo `^TNX` intraday, U.S. Treasury CSV |
| `/api/context-prices` | TradingView (endpoint scanner publik, tidak resmi): ICE Newcastle coal, Bursa Malaysia FCPO, ICE Brent, LME nikel, TVC emas; penundaan bursa ditampilkan di tile. Cadangan: tabel intraday Trading Economics |
| `/api/macro-id` | TradingView: TVC:ID10Y (yield SBN 10Y, realtime), spread terhadap TVC:US10Y (realtime), AMEX:EIDO (tertunda 15 mnt). Cadangan EOD: Trading Economics + Yahoo. `releaseIndicator()` untuk rilis bulanan disimpan untuk Global Macro |
| `/api/macro-scores` | Skor 0–100 untuk likuiditas empat ekonomi dan cadangan Fed, growth dan inflasi AS, serta risk appetite pasar AS. Respons menyertakan nilai, periode, sumber, rumus, bobot, dan riwayat. Nowcast Growth dan Inflasi menyertakan tanggal pembaruan, input, serta kontribusi per indikator jika tersedia. |
| `/api/btc-m2` | FRED (AS), ECB (euro area), BOJ (Jepang), kurs ECB via Frankfurter; China: tabel bulanan terverifikasi (`src/data/m2-china-seed.json`) + Trading Economics untuk bulan terbaru |
| `/api/btc-spot`, `/api/eth-btc` | Binance spot |
| `/api/btc-perpetual` | Binance USDⓈ-M BTCUSDT, dengan ticker dan riwayat Gate BTC_USDT saat Binance tidak tersedia. Arsip harian Binance menjadi cadangan jika kedua ticker gagal. Kartu Nilai Transaksi BTC menjumlahkan nilai kuotasi USDT spot dan perpetual pada hari UTC yang sama atau pada jendela 24 jam yang selaras. |
| `/api/btc-perpetual-position` | Funding rate BTC perpetual, pembayaran funding 7 hari, serta perubahan dan riwayat open interest 24 jam dalam satuan BTC. Binance USDⓈ-M dengan cadangan Gate. Semua data memakai kontrak dari bursa yang sama. |
| `/api/btc-etf-turnover` | Nilai transaksi ETF spot Bitcoin AS dalam USD, arus bersih, aset bersih, dan riwayat per ETF dari data SoSoValue yang dipakai `/api/btc-etf`. Cadangan Yahoo Finance memakai estimasi harga penutupan × jumlah saham dan diberi label. |
| `/api/ihsg-fear-greed` | Skor IHSG dari momentum indeks, breadth, arus asing, dan volatilitas BEI. Estimasi intraday memakai komponen sesi yang tersedia. |
| `/api/btc-fear-greed` | Skor BTC dari momentum, volatilitas, volume berarah, dan taker buy/sell BTCUSDT Binance Spot pada hari UTC yang selesai. |
| `/api/fear-greed` | Indeks Alternative.me untuk konteks Risk appetite makro. |
| `/api/idx-summary`, `/api/idx-turnover` | Ringkasan saham harian BEI (lihat di bawah) |
| `/api/corporate-actions` | Kalender aksi korporasi BEI (`idx.id/primary/Home/GetCalendar`, bulan ini + bulan depan): dividen, HMETD, saham bonus, RUPS, public expose, laporan buyback; agenda obligasi/sukuk disaring. Ditambah UMA dan suspensi (100 pengumuman terakhir); status "sedang disuspensi" dibatalkan bila saham itu bertransaksi setelah tanggal suspensi |
| `/api/idx-turnover` (popup) | Per sesi: nilai reguler/negosiasi, frekuensi, breadth, beli/jual asing, IHSG, 5 saham penggerak. Popup menghitung RVOL & MA dari nilai reguler, persentil 60 sesi, hari akumulasi/distribusi, dan menandai blok nego (≥ 30%) |
| `/api/idx-summary` (popup) | Per sesi: beli/jual/net asing, nilai reguler, IHSG, 15 net beli & jual terbesar. Popup: kumulatif, MA5, jumlah 5/20 sesi, streak, partisipasi, z-score intensitas (|z| ≥ 2 = ekstrem), divergensi IHSG 5 sesi, saham pilihan asing 1/5/20 sesi, unduh CSV |
| `/api/idx-live` | Feed beranda BEI selama sesi (`home/GetIndexList`, `Home/GetTopValue`): level IHSG/LQ45/sektor, nilai transaksi reguler, frekuensi, breadth. Dipakai kartu NILAI TRANSAKSI (LIVE) dan strip sektoral sampai ringkasan EOD terbit. Net asing tidak tersedia intraday |
| `/api/commodity-stocks` | Emiten terkait tiap komoditas (`src/lib/commodity-stocks.js`): diuntungkan saat harga naik/turun, dengan harga, perubahan 1 hari dan 1 minggu (TradingView). Popup komoditas: angka live dari /api/context-prices (harga, 1 hari, 1 minggu, 1 bulan, high/low hari ini) dan tabel emiten. Daftar emiten adalah kurasi umum, bukan rekomendasi; ubah di `COMMODITY_STOCKS` |
| `/api/idx-sectors` | Ringkasan indeks BEI (`GetIndexSummary` per tanggal): 11 sektor IDX-IC, IHSG, LQ45, perubahan 1/5/20 sesi dan porsi nilai transaksi |

Data harian Yahoo `IDR=X` tidak dipakai untuk riwayat karena memuat penutupan di luar rentang harian (lonjakan palsu ±3%).

### Net asing & nilai transaksi (BEI)

`/api/idx-summary` dan `/api/idx-turnover` membaca ringkasan saham harian BEI (`idx.id/primary/TradingSummary/GetStockSummary`, seluruh saham). Sesi disimpan di `.cache/idx-daily.json`; setelah 16.00 WIB sesi hari itu dicek ulang sampai terbit.

- **Nilai transaksi** = Σ (Value + NonRegularValue), definisi resmi BEI (30 Okt 2026: 11,64 T, sama dengan laporan BEI).
- **Net asing** diestimasi: BEI menerbitkan beli/jual asing sebagai volume, jadi tiap saham dinilai dengan VWAP pasar reguler. Uji 12 Nov 2026: +508,9 M vs +510,5 M yang dilaporkan untuk pasar reguler.

**ETF Bitcoin** (`/api/btc-etf`, `src/lib/btc-etf.js`): SoSoValue OpenAPI (perlu `SOSOVALUE_API_KEY` gratis; API hanya memberi 1 bulan terakhir, settle T+1) digabung di atas snapshot Farside `src/data/btc-etf.json`; riwayat gabungan disimpan di `.cache/btc-etf.json`. Cache 30 menit, 14 request per penyegaran.

**Masih snapshot**: `/api/economic-calendar` berisi jadwal resmi dan tetap snapshot bertanggal.

Data live di-cache di memori server: permintaan pertama menunggu sumber, berikutnya langsung dilayani dari cache dan diperbarui di latar belakang setelah kedaluwarsa.

**Chart:** IHSG dan Bitcoin digambar dengan Lightweight Charts (`src/client/market-chart.mjs`), tanpa desimal. IHSG: `/api/ihsg-ohlc[-5m]` (candle Yahoo ^JKSE, candle terakhir dari feed live BEI, tiap 15 detik). Bitcoin: `/api/btc-ohlc[-5m]` (Binance) lalu stream kline publik Binance per tick. Interval 1D/5m dan legenda OHLC muncul saat tombol pengaturan chart aktif. Status pasar di header chart memakai jadwal di `src/client/market-hours.mjs` (Sen–Kam 09:00–12:00 & 13:00–15:59, Jum 09:00–11:30 & 14:00–15:59).
