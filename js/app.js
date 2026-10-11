// Shared checklist + budget engine.
// Data model M = { budget, cats: [{ id, emoji, name, tip }], items: [{ id, cat, name, kind, harga, pax, perHead,
// depo, depoDate, dueDate, done, note, ref }] } where kind is 'biasa' | 'pax' (food, priced per pax) | 'task'.
// M is cached in this browser and, when D.sheetUrl is set, loaded from / saved to a Google Sheet
// through the Apps Script in apps-script/Code.gs (saving needs the passcode).
// Layout: sidebar (couple, budget, overview) | moving KPI strip over a detail table for the selected category.
(function () {
  const D = window.CHECKLIST;
  const KEY = 'checklist:' + D.id + ':v2', OLD_KEY = 'checklist:' + D.id + ':v1', UI_KEY = 'checklist:' + D.id + ':ui';
  const SHEET = (D.sheetUrl || '').trim();
  const app = document.getElementById('app');

  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } }
  };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = v => { const n = parseFloat(v); return isFinite(n) && n >= 0 ? n : 0; };
  const rm = n => 'RM' + n.toLocaleString('en-MY', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
  const newId = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

  // ---------- model ----------

  // Starting data from data/<id>.js, with any edits saved by the older (v1) version of this page folded in
  function seed(old) {
    const S = Object.assign({ checked: {}, amt: {}, custom: {}, hidden: {}, pay: {}, cats: [], hiddenCats: {}, catEdits: {}, pax: {} }, old || {});
    const P0 = D.pax || {};
    const sharedPax = { guests: S.guests ?? P0.guests ?? '', perHead: S.perHead ?? P0.perHead ?? '' };
    const cats = D.categories.filter(c => !S.hiddenCats[c.id]).map(c => ({ ...c, ...S.catEdits[c.id] })).concat(S.cats);
    const items = [];
    cats.forEach(c => (c.items || []).filter(i => !S.hidden[i.id]).concat(S.custom[c.id] || []).forEach(i => {
      const P = S.pay[i.id] || {}, X = S.pax[i.id] || sharedPax;
      const kind = i.pax ? 'pax' : (i.ref !== undefined || i.custom) ? 'biasa' : 'task';
      items.push({
        id: i.id, cat: c.id, name: i.name, kind,
        harga: kind === 'biasa' ? (S.amt[i.id] !== undefined ? S.amt[i.id] : (i.ref ?? '')) : '',
        pax: kind === 'pax' ? X.guests : '', perHead: kind === 'pax' ? X.perHead : '',
        depo: P.depo || '', depoDate: P.depoDate || '', dueDate: P.dueDate || '',
        done: !!S.checked[i.id], note: i.note || '',
        ref: i.pax && !i.custom ? `${P0.guests} pax × RM${P0.perHead}` : i.ref > 0 ? rm(i.ref) : ''
      });
    }));
    return { budget: S.budget ?? D.budget, couple: '', date: '', theme: '', cats: cats.map(c => ({ id: c.id, emoji: c.emoji, name: c.name, tip: c.tip || '' })), items };
  }
  const isModel = x => x && Array.isArray(x.cats) && Array.isArray(x.items);

  let M = store.get(KEY);
  if (!isModel(M)) M = seed(store.get(OLD_KEY));
  const ui = Object.assign({ sel: null, pass: '' }, store.get(UI_KEY));
  if (!ui.sel && store.get(OLD_KEY)) ui.sel = store.get(OLD_KEY).sel || null;

  const canEdit = () => !SHEET || !!ui.pass;
  const locked = () => !!SHEET && !ui.pass;      // private: nothing is shown until the passcode is entered
  function save() {             // every edit: cache locally, then (debounced) push to the Sheet
    store.set(KEY, M);
    sync.queue();
  }
  const saveUi = () => store.set(UI_KEY, ui);

  const groups = () => M.cats.map(c => ({ ...c, list: M.items.filter(i => i.cat === c.id) }));
  const selected = () => { const G = groups(); return G.find(g => g.id === ui.sel) || G[0] || { id: '', emoji: '', name: '', list: [] }; };
  const itemById = id => M.items.find(i => i.id === id);
  const hasCost = i => i.kind !== 'task';
  const cost = i => i.kind === 'pax' ? num(i.pax) * num(i.perHead) : num(i.harga);

  // ---------- dates & payment status ----------

  const BULAN = ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ogo', 'Sep', 'Okt', 'Nov', 'Dis'];
  const HARI = ['Ahad', 'Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat', 'Sabtu'];
  const BULAN_PENUH = ['Januari', 'Februari', 'Mac', 'April', 'Mei', 'Jun', 'Julai', 'Ogos', 'September', 'Oktober', 'November', 'Disember'];
  const fmtD = d => { const [y, m, dd] = d.split('-').map(Number); return `${dd} ${BULAN[m - 1]}${y !== new Date().getFullYear() ? ' ' + y : ''}`; };
  const longDate = d => { const [y, m, dd] = d.split('-').map(Number); return `${HARI[new Date(y, m - 1, dd).getDay()]} · ${dd} ${BULAN_PENUH[m - 1]} ${y}`; };
  const today = () => { const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), t.getDate()); };
  const daysTo = d => { const [y, m, dd] = d.split('-').map(Number); return Math.round((new Date(y, m - 1, dd) - today()) / 864e5); };
  const countdown = d => { const n = daysTo(d); return n > 1 ? `${n} hari lagi` : n === 1 ? 'Esok! 💕' : n === 0 ? 'Hari ni! 💍' : 'Alhamdulillah, dah selamat 💕'; };
  const whenText = n => n < 0 ? `Lewat ${-n} hari` : n === 0 ? 'Hari ni' : n === 1 ? 'Esok' : `${n} hari lagi`;

  const depoPaid = i => num(i.depo) > 0 && i.depoDate && daysTo(i.depoDate) <= 0 ? num(i.depo) : 0;
  // '' | 'soon' (≤7 days) | 'overdue'; only for items not yet ticked
  const dueStatus = i => {
    if (i.done || !i.dueDate) return '';
    const n = daysTo(i.dueDate);
    return n < 0 ? 'overdue' : n <= 7 ? 'soon' : '';
  };
  const worst = list => { const st = list.filter(hasCost).map(dueStatus); return st.includes('overdue') ? 'overdue' : st.includes('soon') ? 'soon' : ''; };
  function statusOf(i) {        // status cell: chip + what's still owed
    const c = cost(i), dp = depoPaid(i);
    if (i.done) return { cls: 'paid', text: '✓ Paid', note: '' };
    const note = dp ? `baki ${rm(Math.max(c - dp, 0))}` : '';
    if (i.dueDate) {
      const st = dueStatus(i);
      return { cls: st || 'plan', text: st ? whenText(daysTo(i.dueDate)) : `Full ${fmtD(i.dueDate)}`, note };
    }
    if (dp) return { cls: 'plan', text: 'Depo paid', note };
    return { cls: 'none', text: '—', note: '' };
  }

  const heart = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 8 3.4 4.5 6.9 4.5c2.1 0 3.6 1.2 5.1 3 1.5-1.8 3-3 5.1-3 3.5 0 5.5 3.5 4.2 6.8-1.8 4.6-9.3 9.2-9.3 9.2z"/></svg>';
  const val = v => v === undefined || v === null ? '' : esc(v);
  const money = v => v === '' || v === undefined || v === null ? '' : num(v) % 1 ? num(v).toFixed(2) : String(v);

  // ---------- markup ----------

  function kpiHTML(g, dup) {
    return `<button class="kpi" data-sel="${esc(g.id)}"${dup ? ' tabindex="-1" aria-hidden="true"' : ''}>
        <span class="kpi-top"><span class="emoji">${esc(g.emoji)}</span><span class="kpi-name">${esc(g.name)}</span><i class="due-dot" data-k-due="${esc(g.id)}"></i></span>
        <span class="kpi-rm" data-k-rm="${esc(g.id)}"></span>
        <span class="kpi-bar"><i data-k-bar="${esc(g.id)}"></i></span>
        <span class="kpi-foot"><span data-k-count="${esc(g.id)}"></span><span data-k-note="${esc(g.id)}"></span></span>
      </button>`;
  }

  function rowHTML(i) {
    const id = esc(i.id), sub = [];
    if (i.ref) sub.push('🧵 ' + esc(i.ref));
    else if (i.kind === 'pax') sub.push('🍛 per pax');
    if (i.note) sub.push(esc(i.note));
    const pax = i.kind === 'pax' ? `<div class="pax">
        <label><input type="number" inputmode="numeric" min="0" data-f="pax" data-id="${id}" value="${val(i.pax)}"> pax</label>
        <span>×</span>
        <label>RM<input type="number" inputmode="decimal" min="0" step="0.5" data-f="perHead" data-id="${id}" value="${val(i.perHead)}"></label>
      </div>` : '';
    const cells = hasCost(i) ? `
        <td data-label="Harga">${i.kind === 'pax'
          ? `<b class="pax-total" data-pax-total="${id}"></b>`
          : `<label class="amt">RM<input type="number" inputmode="decimal" min="0" step="0.01" data-f="harga" data-id="${id}" value="${val(money(i.harga))}" placeholder="0"></label>`}</td>
        <td data-label="Depo"><label class="amt">RM<input type="number" inputmode="decimal" min="0" step="0.01" data-f="depo" data-id="${id}" value="${val(i.depo)}" placeholder="0"></label></td>
        <td data-label="Tarikh depo"><input class="date" type="date" data-f="depoDate" data-id="${id}" value="${val(i.depoDate)}" aria-label="Tarikh depo ${esc(i.name)}"></td>
        <td data-label="Full payment by"><input class="date" type="date" data-f="dueDate" data-id="${id}" value="${val(i.dueDate)}" aria-label="Full payment ${esc(i.name)}"></td>
        <td data-label="Status" class="st-cell"><span class="chip" data-status="${id}"></span><small data-status-note="${id}"></small></td>`
      : `<td class="na" colspan="5"><span>task</span></td>`;
    return `<tr class="item${i.done ? ' done' : ''}${hasCost(i) ? '' : ' task'}" data-id="${id}">
        <td class="ck"><button class="check" data-check="${id}" aria-pressed="${!!i.done}" aria-label="Tick ${esc(i.name)}">${heart}</button></td>
        <td class="d-name"><span class="name">${esc(i.name)}</span>${sub.length ? `<span class="sub">${sub.join(' · ')}</span>` : ''}${pax}</td>
        ${cells}
        <td class="del-cell"><button class="del" data-del="${id}" aria-label="Buang ${esc(i.name)}">×</button></td>
      </tr>`;
  }

  function detailHTML(g) {
    if (!g.id) return `<p class="empty">Belum ada kategori. Tekan <b>+</b> dekat Overview untuk mula.</p>`;
    return `
      <header class="d-head">
        <div>
          <h2><span class="emoji">${esc(g.emoji)}</span>${esc(g.name)}</h2>
          ${g.tip ? `<p class="tip">${esc(g.tip)}</p>` : ''}
        </div>
        <div class="d-stats">
          <span><small>Done</small><b data-d-count></b></span>
          <span><small>Total</small><b data-d-total></b></span>
          <span><small>Dah bayar</small><b data-d-paid></b></span>
          <span><small>Belum bayar</small><b data-d-owe></b></span>
        </div>
      </header>
      <div class="d-wrap">
        <table class="d-table">
          <thead><tr><th></th><th>Item</th><th>Harga</th><th>Depo</th><th>Tarikh depo</th><th>Full payment by</th><th>Status</th><th></th></tr></thead>
          <tbody>${g.list.map(rowHTML).join('')}</tbody>
        </table>
      </div>
      <button class="add-item" data-additem="${esc(g.id)}">+ Tambah item dalam ${esc(g.name)}</button>`;
  }

  // Header. Names, date & theme are private (they come from the Sheet): the locked view shows none of them.
  const coupleHTML = c => esc(c).replace(/\s*&amp;\s*/, ' <span>&amp;</span> ');
  const heroHTML = () => {
    const couple = !locked() && M.couple, date = !locked() && M.date, theme = !locked() && M.theme;
    return `
        <header class="hero">
          <p class="kicker">${locked() ? '♡ Private' : esc(D.title)}</p>
          <h1 class="couple">${couple ? coupleHTML(couple) : esc(D.title)}</h1>
          ${locked() ? `<p class="when secret">🔒 Butiran majlis dirahsiakan ♡</p>`
            : date ? `<p class="when">${longDate(date)} <button class="edit-event" data-act="editevent" title="Tukar nama / tarikh / tema" aria-label="Tukar nama, tarikh atau tema">✎</button></p>`
            : `<p class="when"><button class="set-date" data-act="editevent">✎ Set nama &amp; tarikh majlis</button></p>`}
          ${date || theme ? `<p class="hero-pills">
            ${theme ? `<span class="pill-theme"><i></i>Tema ${esc(theme)}</span>` : ''}
            ${date ? `<span class="pill-count">⏳ ${countdown(date)}</span>` : ''}
          </p>` : ''}
          ${locked() ? '' : `<form class="event-form" data-eventform hidden>
            <label>Nama<input name="couple" value="${val(M.couple)}" placeholder="cth. Ali &amp; Siti"></label>
            <label>Tarikh majlis<input type="date" name="date" value="${val(M.date)}"></label>
            <label>Tema<input name="theme" value="${val(M.theme)}" placeholder="cth. Pink"></label>
            <button type="submit">Simpan</button>
          </form>`}
          <p class="tagline" title="${esc(D.source || '')}">${esc(D.tagline || '')}</p>
        </header>`;
  };

  // Locked: only the invitation-style header plus blurred placeholder shapes; no real data is in the page
  function renderLocked(msg) {
    const bars = n => Array.from({ length: n }, (_, k) => `<i style="width:${[78, 55, 66, 40, 70, 48][k % 6]}%"></i>`).join('');
    const kpi = `<div class="skel-kpi">${bars(3)}</div>`;
    app.innerHTML = `
      <aside class="side">
        <a class="back" href="index.html">← Semua checklist</a>
        ${heroHTML()}
        <div class="card skel" aria-hidden="true"><b></b>${bars(3)}</div>
        <div class="card skel" aria-hidden="true">${bars(6)}</div>
      </aside>
      <div class="main locked-main">
        <div class="skel-board" aria-hidden="true">
          <div class="skel-kpis">${kpi.repeat(4)}</div>
          <div class="card skel skel-table"><b></b>${bars(12)}</div>
        </div>
        <form class="card lock-card" data-unlock>
          <div class="lock-ico" aria-hidden="true">🔒</div>
          <h2>Private ♡</h2>
          <p>Checklist &amp; bajet ni private. Masukkan passcode untuk tengok.</p>
          <div class="lock-row">
            <input name="pass" type="password" placeholder="Passcode" autocomplete="current-password" aria-label="Passcode" autofocus>
            <button type="submit">Unlock</button>
          </div>
          <small class="lock-msg" data-lock-msg>${esc(msg || '')}</small>
        </form>
      </div>`;
    document.body.classList.remove('readonly');
  }

  function render() {
    document.title = `${D.title}${!locked() && M.couple ? ' · ' + M.couple : ''} ♡`;
    if (locked()) { renderLocked(); return; }
    const G = groups(), sel = selected();
    const rows = G.map(g => `
      <tr data-sel="${esc(g.id)}" tabindex="0">
        <td class="ov-name"><span class="emoji">${esc(g.emoji)}</span>${esc(g.name)}<i class="due-dot" data-row-due="${esc(g.id)}"></i></td>
        <td class="ov-bar">
          <span><i data-row-bar="${esc(g.id)}"></i></span>
          <span class="ov-act">
            <button class="edit-cat" data-editcat="${esc(g.id)}" aria-label="Edit kategori ${esc(g.name)}" title="Edit kategori">✎</button>
            <button class="del-cat" data-delcat="${esc(g.id)}" aria-label="Buang kategori ${esc(g.name)}" title="Buang kategori">×</button>
          </span>
        </td>
        <td class="ov-count" data-row-count="${esc(g.id)}"></td>
        <td class="ov-rm" data-row-total="${esc(g.id)}"></td>
      </tr>`).join('');

    app.innerHTML = `
      <aside class="side">
        <a class="back" href="index.html">← Semua checklist</a>
        ${heroHTML()}

        <section class="card budget">
          <div class="budget-top">
            <div>
              <p class="label">Planned <button class="help-btn" data-act="help" aria-label="Apa maksud nombor ni?" aria-expanded="false">?</button></p>
              <p class="big" data-planned></p>
              <label class="cap" title="Tekan untuk tukar bajet">Bajet <span>RM</span><input type="number" inputmode="numeric" min="0" step="50" data-budget value="${val(M.budget)}" aria-label="Bajet (RM)"><i aria-hidden="true">✎</i></label>
            </div>
            <div class="ring" data-ring><span data-pct></span></div>
          </div>
          <div class="bar"><i data-bar-paid></i><i data-bar-planned></i></div>
          <div class="legend">
            <span><i class="dot paid"></i>Dah bayar <b data-paid></b></span>
            <span><i class="dot planned"></i>Belum bayar <b data-owe></b></span>
            <span><i class="dot free"></i><em data-left-label>Baki bajet</em> <b data-left></b></span>
          </div>
          <dl class="help" data-help hidden>
            <dt>Planned</dt><dd>Jumlah harga semua item. Auto: tukar harga dalam table kategori.</dd>
            <dt>Bajet</dt><dd>Had bajet kau. Tekan nombor tu &amp; taip bajet baru.</dd>
            <dt>Dah bayar</dt><dd>Item yang dah tick ♡ + depo yang tarikh bayarnya dah sampai.</dd>
            <dt>Belum bayar</dt><dd>Planned − dah bayar.</dd>
            <dt>Baki bajet</dt><dd>Bajet − planned. Merah kalau dah lebih bajet.</dd>
            <dt>%</dt><dd>Berapa item yang dah tick.</dd>
          </dl>
          <button class="next-due" data-next hidden></button>
        </section>

        <section class="card overview">
          <div class="ov-head">
            <p class="label">Overview</p>
            <button class="add-cat" data-act="addcat" aria-label="Tambah kategori" title="Tambah kategori">+</button>
          </div>
          <div class="ov-scroll">
            <table>
              <tbody>${rows}</tbody>
              <tfoot><tr>
                <td class="ov-name">Semua</td>
                <td class="ov-bar"><span><i data-row-bar="all"></i></span></td>
                <td class="ov-count" data-row-count="all"></td>
                <td class="ov-rm" data-row-total="all"></td>
              </tr></tfoot>
            </table>
          </div>
          <form class="cat-form" data-catform hidden>
            <input name="emoji" value="✨" maxlength="4" aria-label="Emoji kategori">
            <input name="name" placeholder="Nama kategori baru…" aria-label="Nama kategori" autocomplete="off">
            <button type="submit">Add</button>
          </form>
        </section>

        <footer class="foot">
          <div class="sync" data-sync></div>
          <form class="unlock" data-unlock hidden>
            <input name="pass" type="password" placeholder="Passcode untuk edit" autocomplete="current-password" aria-label="Passcode">
            <button type="submit">Unlock</button>
          </form>
          <p class="tools">
            <button data-act="export">Backup</button>
            <button data-act="import">Restore</button>
            <button data-act="reset">Reset</button>
            ${SHEET ? `<button data-act="lock" data-lockbtn>Lock</button>` : ''}
          </p>
          <p class="fine">${esc(D.source || '')}</p>
        </footer>
      </aside>

      <div class="main">
        <div class="kpis" aria-label="Categories">
          <div class="kpi-track">${G.map(g => kpiHTML(g)).join('')}${G.map(g => kpiHTML(g, true)).join('')}</div>
        </div>
        <section class="card detail" aria-live="polite">${detailHTML(sel)}</section>
      </div>`;
    document.body.classList.toggle('readonly', !canEdit());
    markSelected();
    totals();
    sync.paint();
    marquee();
  }

  function renderDetail() {
    if (locked()) return;
    app.querySelector('.detail').innerHTML = detailHTML(selected());
    markSelected();
    totals();
  }

  function markSelected() {
    const id = selected().id;
    app.querySelectorAll('[data-sel]').forEach(el => {
      const on = el.dataset.sel === id;
      el.classList.toggle('on', on);
      if (el.classList.contains('kpi') && !el.hasAttribute('aria-hidden')) el.setAttribute('aria-pressed', on);
    });
  }

  function select(id, flashItem) {
    ui.sel = id; saveUi();
    renderDetail();
    const d = app.querySelector('.detail');
    d.classList.remove('flash'); void d.offsetWidth; d.classList.add('flash');
    if (!wide()) d.scrollIntoView({ block: 'start', behavior: 'smooth' });
    if (flashItem) {
      const tr = app.querySelector(`.d-table tr[data-id="${flashItem}"]`);
      if (tr) { tr.scrollIntoView({ block: 'nearest' }); tr.classList.add('flash'); }
    }
  }

  // The KPI strip glides sideways only when the cards don't all fit; the track holds two copies
  // so the loop is seamless. Hover/focus pauses it; reduced-motion users get a plain scroll row.
  const wide = () => matchMedia('(min-width: 960px) and (min-height: 600px)').matches;
  function marquee() {
    const box = app.querySelector('.kpis'), track = app.querySelector('.kpi-track');
    if (!box) return;
    box.classList.remove('moving');                 // loop copy hidden, so this measures one set
    const oneSet = track.scrollWidth;
    const move = wide() && oneSet > box.clientWidth + 4 && !matchMedia('(prefers-reduced-motion: reduce)').matches;
    box.classList.toggle('moving', move);
    track.style.setProperty('--dur', Math.round(oneSet / 35) + 's');   // ~35px per second
  }

  // ---------- numbers ----------

  function totals() {
    let planned = 0, paid = 0, done = 0, count = 0, next = null;
    const all = (sel, fn) => app.querySelectorAll(sel).forEach(fn);
    const setAll = (sel, txt) => all(sel, el => { el.textContent = txt; });
    const sel = selected();

    groups().forEach(g => {
      let ct = 0, cd = 0, cp = 0;
      g.list.forEach(i => {
        if (i.done) cd++;
        if (!hasCost(i)) return;
        const v = cost(i);
        ct += v; cp += i.done ? v : Math.min(depoPaid(i), v);
        if (i.dueDate && !i.done && (!next || i.dueDate < next.i.dueDate)) next = { i, g };
      });
      const n = g.list.length, pct = n ? cd / n * 100 : 0, st = worst(g.list);
      setAll(`[data-row-count="${g.id}"]`, `${cd}/${n}`);
      setAll(`[data-row-total="${g.id}"]`, rm(ct));
      all(`[data-row-bar="${g.id}"]`, el => { el.style.width = pct + '%'; el.closest('tr').classList.toggle('complete', n > 0 && cd === n); });
      all(`[data-row-due="${g.id}"]`, el => { el.className = 'due-dot ' + st; });
      setAll(`[data-k-rm="${g.id}"]`, rm(ct));
      setAll(`[data-k-count="${g.id}"]`, `${cd}/${n} done`);
      setAll(`[data-k-note="${g.id}"]`, cp ? `paid ${rm(cp)}` : '');
      all(`[data-k-bar="${g.id}"]`, el => { el.style.width = pct + '%'; });
      all(`[data-k-due="${g.id}"]`, el => { el.className = 'due-dot ' + st; });
      all(`.kpi[data-sel="${g.id}"]`, el => el.classList.toggle('complete', n > 0 && cd === n));
      if (g.id === sel.id) {
        setAll('[data-d-count]', `${cd}/${n}`);
        setAll('[data-d-total]', rm(ct));
        setAll('[data-d-paid]', rm(cp));
        setAll('[data-d-owe]', rm(Math.max(ct - cp, 0)));
      }
      planned += ct; paid += cp; done += cd; count += n;
    });

    sel.list.forEach(i => {
      const el = app.querySelector(`[data-status="${i.id}"]`);
      if (el) {
        const s = statusOf(i);
        el.textContent = s.text; el.className = 'chip ' + s.cls;
        app.querySelector(`[data-status-note="${i.id}"]`).textContent = s.note;
      }
      if (i.kind === 'pax') setAll(`[data-pax-total="${i.id}"]`, rm(cost(i)));
    });

    setAll('[data-row-count="all"]', `${done}/${count}`);
    setAll('[data-row-total="all"]', rm(planned));
    all('[data-row-bar="all"]', el => { el.style.width = (count ? done / count * 100 : 0) + '%'; });

    const cap = num(M.budget), over = cap && planned > cap;
    setAll('[data-planned]', rm(planned));
    setAll('[data-paid]', rm(paid));
    setAll('[data-left]', over ? rm(planned - cap) : rm(Math.max(cap - planned, 0)));
    setAll('[data-left-label]', over ? 'Lebih bajet' : 'Baki bajet');
    setAll('[data-owe]', rm(Math.max(planned - paid, 0)));
    const pct = count ? Math.round(done / count * 100) : 0;
    setAll('[data-pct]', pct + '%');
    const ring = app.querySelector('[data-ring]');
    ring.style.setProperty('--p', pct); ring.title = `${done} / ${count} done`;
    const w = v => cap ? Math.min(v / cap * 100, 100) + '%' : '0%';
    app.querySelector('[data-bar-paid]').style.width = w(paid);
    app.querySelector('[data-bar-planned]').style.width = w(Math.max(planned - paid, 0));
    app.querySelector('.budget').classList.toggle('over', !!over);

    const nd = app.querySelector('[data-next]');
    nd.hidden = !next;
    if (next) {
      const baki = Math.max(cost(next.i) - depoPaid(next.i), 0);
      nd.innerHTML = `<span>⏰ Next bayar · ${fmtD(next.i.dueDate)} (${whenText(daysTo(next.i.dueDate)).toLowerCase()})</span><b>${esc(next.i.name)} · ${rm(baki)}</b>`;
      nd.dataset.nextCat = next.g.id; nd.dataset.nextItem = next.i.id;
      nd.className = 'next-due ' + dueStatus(next.i);
    }
  }

  // ---------- Google Sheet sync ----------
  // Load on open (and when the tab comes back into view); every edit is pushed ~0.7s later as the whole
  // model (it's small). One request at a time; if editing continues, the newest state goes next.
  const sync = {
    state: SHEET ? 'loading' : 'local', msg: '', at: null, timer: null, busy: false, dirty: false,

    async call(payload) {      // always POST with the passcode; text/plain body means no CORS preflight
      const res = await fetch(SHEET, { method: 'POST', body: JSON.stringify(payload) });
      const out = await res.json();
      if (!out.ok) throw new Error(out.error || 'Google Sheet error');
      return out;
    },

    queue() {
      if (!SHEET || !ui.pass) return;
      this.dirty = true; this.set('saving');
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.push(), 700);
    },

    async push() {
      if (this.busy) return;                       // the running push re-checks `dirty` when it ends
      this.busy = true; this.dirty = false;
      try {
        await this.call({ action: 'save', pass: ui.pass, data: M });
        this.at = new Date();
        this.set(this.dirty ? 'saving' : 'saved');
      } catch (e) {
        this.dirty = true;
        if (/passcode/i.test(e.message)) { lockOut(false, 'Passcode dah bertukar. Masukkan yang baru.'); return; }
        else { this.set('error', e.message); clearTimeout(this.timer); this.timer = setTimeout(() => this.push(), 15000); }
      }
      this.busy = false;
      if (this.dirty && this.state === 'saving') { clearTimeout(this.timer); this.timer = setTimeout(() => this.push(), 300); }
    },

    async pull(first) {
      if (locked() || this.busy || this.dirty) return;
      const editing = document.activeElement && document.activeElement.matches('input') || document.querySelector('dialog[open]');
      if (!first && editing) return;              // don't yank inputs out from under someone typing
      try {
        if (first) this.set('loading');
        const { data } = await this.call({ action: 'load', pass: ui.pass });
        if (isModel(data) && (data.cats.length || data.items.length)) {
          const changed = JSON.stringify(data) !== JSON.stringify(M);
          M = data; store.set(KEY, M);
          if (changed || first) render();
          this.at = new Date(); this.set('saved');
        } else {                                     // empty Sheet: fill it with what this browser has
          this.queue();
        }
      } catch (e) {
        if (/passcode/i.test(e.message)) return lockOut(false, 'Passcode dah bertukar. Masukkan yang baru.');
        this.set('error', /unknown action/i.test(e.message)
          ? 'Script Google belum dikemas kini (Deploy > Manage deployments > New version).'
          : 'Tak dapat buka Google Sheet. Tunjuk data terakhir dalam browser ni.');
      }
    },

    set(state, msg) { this.state = state; this.msg = msg || ''; this.paint(); },

    paint() {
      const el = app.querySelector('[data-sync]');
      if (!el) return;
      const t = this.at ? this.at.toLocaleTimeString('en-MY', { hour: 'numeric', minute: '2-digit' }) : '';
      const text = {
        local: '💾 Disimpan dalam browser ni',
        loading: '☁️ Loading dari Google Sheet…',
        saving: '☁️ Menyimpan ke Google Sheet…',
        saved: `☁️ Saved ke Google Sheet${t ? ' · ' + t : ''}`,
        view: '👀 Mode lihat. Unlock untuk edit.',
        error: '⚠️ Tak dapat sambung ke Google Sheet'
      }[this.state];
      el.className = 'sync ' + this.state;
      el.innerHTML = `<span>${text}</span>${this.msg ? `<small>${esc(this.msg)}</small>` : ''}`;
      const f = app.querySelector('[data-unlock]');
      if (f) f.hidden = !(SHEET && !ui.pass);
      const lb = app.querySelector('[data-lockbtn]');
      if (lb) lb.hidden = !ui.pass;
    }
  };

  // ---------- events ----------

  function guard() {            // view-only visitors can look but not change anything
    if (canEdit()) return true;
    const f = app.querySelector('[data-unlock]');
    if (f) { f.hidden = false; f.pass.focus(); f.classList.remove('nudge'); void f.offsetWidth; f.classList.add('nudge'); }
    return false;
  }

  app.addEventListener('click', e => {
    const chk = e.target.closest('[data-check]');
    if (chk) {
      if (!guard()) return;
      const i = itemById(chk.dataset.check);
      i.done = !i.done;
      chk.closest('.item').classList.toggle('done', i.done);
      chk.setAttribute('aria-pressed', i.done);
      if (i.done) { chk.classList.remove('pop'); void chk.offsetWidth; chk.classList.add('pop'); }
      save(); totals(); return;
    }
    const del = e.target.closest('[data-del]');
    if (del) {
      if (!guard()) return;
      M.items = M.items.filter(i => i.id !== del.dataset.del);
      save(); renderDetail(); return;
    }
    const ec = e.target.closest('[data-editcat]');
    if (ec) { if (guard()) openCatForm(ec.dataset.editcat); return; }
    const dc = e.target.closest('[data-delcat]');
    if (dc) {
      if (!guard()) return;
      const id = dc.dataset.delcat, c = M.cats.find(x => x.id === id);
      if (!confirm(`Buang kategori "${c.name}" dan semua item dalamnya?`)) return;
      M.cats = M.cats.filter(x => x.id !== id);
      M.items = M.items.filter(i => i.cat !== id);
      if (ui.sel === id) { ui.sel = null; saveUi(); }
      save(); render(); return;
    }
    const ai = e.target.closest('[data-additem]');
    if (ai) { if (guard()) openAddItem(ai.dataset.additem); return; }
    const nd = e.target.closest('[data-next]');
    if (nd) { select(nd.dataset.nextCat, nd.dataset.nextItem); return; }
    const sel = e.target.closest('[data-sel]');
    if (sel) { select(sel.dataset.sel); return; }
    const act = e.target.closest('[data-act]');
    if (act) actions[act.dataset.act]();
  });

  // One small form for both "+ new category" and "✎ edit category"
  function openCatForm(id) {
    const f = app.querySelector('[data-catform]'), c = id && M.cats.find(x => x.id === id);
    if (c) { f.dataset.edit = id; f.emoji.value = c.emoji; f.name.value = c.name; }
    else { delete f.dataset.edit; f.emoji.value = '✨'; f.name.value = ''; }
    f.querySelector('button').textContent = c ? 'Simpan' : 'Add';
    f.name.placeholder = c ? 'Nama kategori' : 'Nama kategori baru…';
    app.querySelectorAll('.overview tr.editing').forEach(r => r.classList.remove('editing'));
    if (c) app.querySelector(`.overview tr[data-sel="${id}"]`).classList.add('editing');
    f.hidden = false;
    f.name.focus(); f.name.select();
  }

  app.addEventListener('keydown', e => {
    if (e.key === 'Escape' && e.target.closest('[data-catform]')) {
      e.target.closest('[data-catform]').hidden = true;
      app.querySelectorAll('.overview tr.editing').forEach(r => r.classList.remove('editing'));
      return;
    }
    const r = !e.target.closest('button') && e.target.closest('tr[data-sel]');
    if (r && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); select(r.dataset.sel); }
  });

  app.addEventListener('input', e => {
    const t = e.target;
    if (!t.dataset.f && !('budget' in t.dataset)) return;
    if (!canEdit()) { t.value = t.defaultValue; guard(); return; }
    if ('budget' in t.dataset) M.budget = t.value;
    else { const i = itemById(t.dataset.id); if (i) i[t.dataset.f] = t.value; }
    save(); totals();
  });

  app.addEventListener('submit', e => {
    const uf = e.target.closest('[data-unlock]');
    if (uf) { e.preventDefault(); unlock(uf); return; }
    const ef = e.target.closest('[data-eventform]');
    if (ef) {
      e.preventDefault();
      M.couple = ef.couple.value.trim(); M.date = ef.date.value; M.theme = ef.theme.value.trim();
      save(); render(); return;
    }
    const cf = e.target.closest('[data-catform]');
    if (!cf) return;
    e.preventDefault();
    const name = cf.name.value.trim();
    if (!name) { cf.name.focus(); return; }
    const emoji = cf.emoji.value.trim() || '✨';
    if (cf.dataset.edit) {                             // editing an existing category
      Object.assign(M.cats.find(c => c.id === cf.dataset.edit), { emoji, name });
      save(); render(); return;
    }
    const id = newId('k');
    M.cats.push({ id, emoji, name, tip: '' });
    ui.sel = id; saveUi(); save(); render();
    openAddItem(id);                                   // straight into adding items
  });

  async function unlock(f) {
    const pass = f.pass.value.trim();
    if (!pass) { f.pass.focus(); return; }
    const btn = f.querySelector('button');
    btn.disabled = true; btn.textContent = '…';
    try {
      await sync.call({ action: 'check', pass });
      ui.pass = pass; saveUi();
      sync.set('loading');
      render();
      sync.pull(true);                               // load the Sheet; an empty Sheet is filled with this browser's data
      return;
    } catch (err) {
      f.pass.value = '';
      const m = f.querySelector('[data-lock-msg]');
      if (m) m.textContent = /passcode/i.test(err.message) ? 'Passcode salah, cuba lagi.' : 'Tak dapat sambung. Cuba lagi sekejap.';
      f.classList.remove('nudge'); void f.offsetWidth; f.classList.add('nudge');
      f.pass.focus();
    }
    btn.disabled = false; btn.textContent = 'Unlock';
  }

  // wipe = also forget this browser's copy of the data (the "Lock" button), so nothing stays on a shared device
  function lockOut(wipe, msg) {
    clearTimeout(sync.timer);
    ui.pass = ''; saveUi();
    if (wipe) { try { localStorage.removeItem(KEY); localStorage.removeItem(OLD_KEY); } catch (e) {} M = seed(null); }
    if (dlg.open) dlg.close();
    document.title = `${D.title} ♡`;
    renderLocked(msg);
  }

  let rt;
  addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(marquee, 150); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sync.pull(); });
  setInterval(() => { if (document.visibilityState === 'visible') sync.pull(); }, 60000);

  const actions = {
    export() {
      const blob = new Blob([JSON.stringify(M, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${D.id}-checklist-backup.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    },
    import() {
      if (!guard()) return;
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'application/json';
      inp.onchange = () => {
        const file = inp.files[0];
        if (!file) return;
        file.text().then(txt => {
          try {
            const x = JSON.parse(txt);
            M = isModel(x) ? x : seed(x);              // older backups are converted
            save(); render();
          } catch (err) { alert('File tu tak boleh baca. Pastikan ia backup dari checklist ni.'); }
        });
      };
      inp.click();
    },
    help() {
      const h = app.querySelector('[data-help]'), b = app.querySelector('.help-btn');
      h.hidden = !h.hidden; b.setAttribute('aria-expanded', !h.hidden);
    },
    addcat() {
      if (!guard()) return;
      const f = app.querySelector('[data-catform]');
      if (!f.hidden && !f.dataset.edit) { f.hidden = true; return; }   // + again closes it
      openCatForm(null);
    },
    reset() {
      if (!guard()) return;
      if (!confirm(SHEET ? 'Reset semua data ke senarai asal? Google Sheet pun akan di-overwrite.' : 'Reset semua tick, harga, tarikh & item tambahan?')) return;
      M = seed(null); ui.sel = null; saveUi(); save(); render();
    },
    lock() { lockOut(true); },
    editevent() {
      const f = app.querySelector('[data-eventform]');
      f.hidden = !f.hidden;
      if (!f.hidden) f.date.focus();
    }
  };

  // ---------- "Tambah item" popup: 1 item (biasa / makanan per pax), 2 depo, 3 last date ----------
  const dlg = document.createElement('dialog');
  dlg.className = 'item-dlg';
  dlg.innerHTML = `
    <form novalidate>
      <header>
        <p class="label">Tambah item</p>
        <h3 data-dlg-cat></h3>
      </header>

      <section>
        <p class="step"><span>1</span>Item</p>
        <div class="seg" data-seg="type">
          <button type="button" data-v="no" class="on">🎁 Biasa</button>
          <button type="button" data-v="yes">🍛 Makanan (per pax)</button>
        </div>
        <div class="row2">
          <label>Nama item<input name="name" placeholder="cth. Photographer, Kek, Khemah…" autocomplete="off"></label>
          <label data-plain>Harga (RM)<input name="price" type="number" inputmode="decimal" min="0" step="0.01" placeholder="0"></label>
        </div>
        <div class="seg-fields pax3" data-fields="type" hidden>
          <label>Pax<input name="guests" type="number" inputmode="numeric" min="0" placeholder="30"></label>
          <label>RM / pax<input name="perHead" type="number" inputmode="decimal" min="0" step="0.5" placeholder="9"></label>
          <p class="pax-calc"><small>Total</small><b data-dlg-paxtotal>RM0</b></p>
        </div>
      </section>

      <section>
        <p class="step"><span>2</span>Perlu bayar depo?</p>
        <div class="seg" data-seg="depo">
          <button type="button" data-v="no" class="on">Tak perlu</button>
          <button type="button" data-v="yes">Ya, ada depo</button>
        </div>
        <div class="seg-fields" data-fields="depo" hidden>
          <label>Depo (RM)<input name="depo" type="number" inputmode="decimal" min="0" step="0.01" placeholder="0"></label>
          <label>Tarikh bayar depo<input name="depoDate" type="date"></label>
        </div>
      </section>

      <section>
        <p class="step"><span>3</span>Ada last date full payment?</p>
        <div class="seg" data-seg="due">
          <button type="button" data-v="no" class="on">Takde</button>
          <button type="button" data-v="yes">Ya, ada</button>
        </div>
        <div class="seg-fields" data-fields="due" hidden>
          <label>Last date full payment<input name="dueDate" type="date"></label>
        </div>
      </section>

      <p class="dlg-baki" data-dlg-baki></p>
      <div class="dlg-actions">
        <button type="button" class="ghost" data-dlg-cancel>Cancel</button>
        <button type="submit" class="primary">Tambah item</button>
      </div>
    </form>`;
  document.body.appendChild(dlg);
  const F = dlg.querySelector('form');
  let dlgCat = null;

  const segOn = name => dlg.querySelector(`[data-seg="${name}"] .on`).dataset.v === 'yes';
  function setSeg(name, yes) {
    dlg.querySelectorAll(`[data-seg="${name}"] button`).forEach(b => b.classList.toggle('on', (b.dataset.v === 'yes') === yes));
    dlg.querySelector(`[data-fields="${name}"]`).hidden = !yes;
    if (name === 'type') {                                    // food: pax × RM/pax replaces the plain price
      dlg.querySelector('[data-plain]').hidden = yes;
      F.name.placeholder = yes ? 'cth. Tempah katering, Kuih, Air…' : 'cth. Photographer, Kek, Khemah…';
    }
  }
  const dlgPrice = () => segOn('type') ? num(F.guests.value) * num(F.perHead.value) : num(F.price.value);
  function dlgBaki() {
    dlg.querySelector('[data-dlg-paxtotal]').textContent = rm(num(F.guests.value) * num(F.perHead.value));
    const p = dlgPrice(), d = segOn('depo') ? num(F.depo.value) : 0;
    dlg.querySelector('[data-dlg-baki]').textContent = p && d ? `Baki lepas depo: ${rm(Math.max(p - d, 0))}` : '';
  }
  function openAddItem(catId) {
    dlgCat = catId;
    const c = M.cats.find(x => x.id === catId);
    dlg.querySelector('[data-dlg-cat]').innerHTML = `<span class="emoji">${esc(c.emoji)}</span>${esc(c.name)}`;
    F.reset(); setSeg('type', /makan|food|katering/i.test(catId + c.name)); setSeg('depo', false); setSeg('due', false); dlgBaki();
    F.name.classList.remove('bad');
    dlg.showModal();
    F.name.focus();
  }

  dlg.addEventListener('click', e => {
    const b = e.target.closest('.seg button');
    if (b) {
      const name = b.closest('[data-seg]').dataset.seg, yes = b.dataset.v === 'yes';
      setSeg(name, yes); dlgBaki();
      if (yes && name !== 'type') dlg.querySelector(`[data-fields="${name}"] input`).focus();
      else if (name === 'type') F.name.focus();
      return;
    }
    if (e.target.closest('[data-dlg-cancel]') || e.target === dlg) dlg.close();   // Cancel, or click outside
  });
  F.addEventListener('input', () => { dlgBaki(); F.name.classList.remove('bad'); });
  F.addEventListener('submit', e => {
    e.preventDefault();
    const name = F.name.value.trim();
    if (!name) { F.name.classList.add('bad'); F.name.focus(); return; }
    const food = segOn('type'), id = newId('c');
    M.items.push({
      id, cat: dlgCat, name, kind: food ? 'pax' : 'biasa',
      harga: food ? '' : F.price.value, pax: food ? F.guests.value : '', perHead: food ? F.perHead.value : '',
      depo: segOn('depo') ? F.depo.value : '', depoDate: segOn('depo') ? F.depoDate.value : '',
      dueDate: segOn('due') ? F.dueDate.value : '', done: false, note: '', ref: ''
    });
    save(); dlg.close();
    if (selected().id !== dlgCat) { ui.sel = dlgCat; saveUi(); }
    renderDetail();
    const tr = app.querySelector(`.d-table tr[data-id="${id}"]`);
    if (tr) { tr.scrollIntoView({ block: 'nearest' }); tr.classList.add('flash'); }
  });

  if (!locked()) store.set(KEY, M);                  // keep the converted model even before the first edit
  render();
  if (document.fonts) document.fonts.ready.then(marquee);   // re-measure once real fonts load
  sync.pull(true);
})();
