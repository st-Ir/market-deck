// Sprite of SVG symbols referenced via <use href="#i-…">.
export default function IconLibrary() {
  return (
    <>
      <svg className="icon-library" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <symbol id="i-external" viewBox="0 0 24 24"><path d="M14 4h6v6m0-6L10 14M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5" /></symbol>
      <symbol id="i-download" viewBox="0 0 24 24"><path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4" /></symbol>
      <symbol id="i-chevron" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6" /></symbol>
      <symbol id="i-prev" viewBox="0 0 24 24"><path d="m14 6-6 6 6 6" /></symbol>
      <symbol id="i-next" viewBox="0 0 24 24"><path d="m10 6 6 6-6 6" /></symbol>
      <symbol id="i-refresh" viewBox="0 0 24 24"><path d="M20 7v5h-5M4 17v-5h5M5 8a8 8 0 0 1 13-3l2 2M4 17l2 2a8 8 0 0 0 13-3" /></symbol>
      <symbol id="i-switch" viewBox="0 0 24 24"><path d="M4 8h15m-4-4 4 4-4 4M20 16H5m4-4-4 4 4 4" /></symbol>
      <symbol id="i-info" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7v1" /></symbol>
      <symbol id="i-expand" viewBox="0 0 24 24"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" /></symbol>
      <symbol id="i-tools" viewBox="0 0 24 24"><path d="M4 7h7m4 0h5M4 17h3m4 0h9" /><circle cx="13" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></symbol>
      <symbol id="i-close" viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18" /></symbol>
      <symbol id="i-market" viewBox="0 0 24 24"><path d="M3 17l5-6 4 3 8-10M16 4h4v4M3 21h18" /></symbol>
      <symbol id="i-globe" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18z" /></symbol>
      <symbol id="i-calendar" viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="16" rx="3" /><path d="M8 3v4m8-4v4M4 11h16m-12 4h2m4 0h2" /></symbol>
      <symbol id="i-layers" viewBox="0 0 24 24"><path d="m12 3 10 5-10 5L2 8zm-9 10 9 5 9-5m-18 5 9 5 9-5" /></symbol>
      <symbol id="i-news" viewBox="0 0 24 24"><path d="M5 4h12v15a1 1 0 0 0 1 1H6a2 2 0 0 1-2-2V5a1 1 0 0 1 1-1zm12 5h3v9a2 2 0 0 1-2 2M8 8h5M8 12h5M8 16h3" /></symbol>
      {/* Market status symbols (client/market-status.mjs). */}
      <symbol id="i-st-break" viewBox="0 0 24 24"><path d="M9 6v12M15 6v12" /></symbol>
      <symbol id="i-st-closed" viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></symbol>
      <symbol id="i-st-pre" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></symbol>
      <symbol id="i-st-holiday" viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4m8-4v4M4 10h16m-10 3 4 4m0-4-4 4" /></symbol>
      {/* IDX-IC sector icons (client/sectors.mjs). */}
      <symbol id="i-sec-IDXENERGY" viewBox="0 0 24 24"><path d="M13 2 5 14h6l-1 8 8-12h-6z" /></symbol>
      <symbol id="i-sec-IDXBASIC" viewBox="0 0 24 24"><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9" /></symbol>
      <symbol id="i-sec-IDXINDUST" viewBox="0 0 24 24"><path d="M3 21V10l6 4v-4l6 4V4h4v17zM3 21h18" /></symbol>
      <symbol id="i-sec-IDXNONCYC" viewBox="0 0 24 24"><path d="M3 4h2l2.5 11h11L21 7H6.2M9 20h.01M18 20h.01" /></symbol>
      <symbol id="i-sec-IDXCYCLIC" viewBox="0 0 24 24"><path d="M5 8h14l-1 13H6zM9 8V6a3 3 0 0 1 6 0v2" /></symbol>
      <symbol id="i-sec-IDXHEALTH" viewBox="0 0 24 24"><path d="M12 20s-8-4.6-8-10.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 2.5C20 15.4 12 20 12 20zM8 12h2l1-2 2 4 1-2h2" /></symbol>
      <symbol id="i-sec-IDXFINANCE" viewBox="0 0 24 24"><path d="M3 9 12 4l9 5M5 9v9m4.7-9v9m4.6-9v9M19 9v9M3 21h18" /></symbol>
      <symbol id="i-sec-IDXPROPERT" viewBox="0 0 24 24"><path d="M4 21V5l8-2v18m0-12 8 2v8M4 21h17M8 8h.01M8 12h.01M8 16h.01M16 13h.01M16 17h.01" /></symbol>
      <symbol id="i-sec-IDXTECHNO" viewBox="0 0 24 24"><rect x="7" y="7" width="10" height="10" rx="1" /><path d="M10 3v4m4-4v4m-4 10v4m4-4v4M3 10h4m-4 4h4m10-4h4m-4 4h4" /></symbol>
      <symbol id="i-sec-IDXINFRA" viewBox="0 0 24 24"><path d="M12 10v11M8 21l4-11 4 11M9.5 16h5M8.5 6.5a5 5 0 0 1 7 0M6 4a8.5 8.5 0 0 1 12 0M12 9h.01" /></symbol>
      <symbol id="i-sec-IDXTRANS" viewBox="0 0 24 24"><path d="M3 6h11v10H3zM14 10h4l3 3v3h-7M7 19a2 2 0 1 0 0-.01M17 19a2 2 0 1 0 0-.01" /></symbol>
      </svg>
    </>
  );
}
