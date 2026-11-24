export default function SetupDialog() {
  return (
    <>
      <dialog className="setup-dialog" id="setup-dialog" aria-labelledby="setup-dialog-title">
      <header><div><span className="setup-dialog-eyebrow">PERSONAL SETUP</span><h2 id="setup-dialog-title">Tambah setup</h2></div><button type="button" className="trading-icon-button" id="close-setup" aria-label="Tutup setup"><svg aria-hidden="true"><use href="#t-close" /></svg></button></header>
      <form id="setup-form"><div className="setup-form-row"><label>Pasar<select id="setup-market"><option value="stocks">Saham IDX</option><option value="crypto">Kripto</option></select></label><label>Simbol<input id="setup-symbol" name="symbol" placeholder="BBCA" required maxLength="20" autoComplete="off" autoCapitalize="characters" spellCheck="false" /></label></div><label>Status<select id="setup-state"><option value="watch">Pantau</option><option value="ready">Siap</option><option value="archive">Arsip</option></select></label><label>Rencana<textarea id="setup-note" rows="5" maxLength="1500" placeholder="Trigger, invalidasi, dan hal yang ditunggu…"></textarea></label><p className="setup-error" id="setup-error" role="alert"></p><footer><button type="button" className="setup-delete" id="archive-setup" hidden>Arsipkan</button><button type="button" className="trading-button" id="cancel-setup">Batal</button><button type="submit" className="trading-button trading-primary">Simpan</button></footer></form>
      </dialog>
    </>
  );
}
