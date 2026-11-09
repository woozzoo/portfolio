/* 화면 코멘트 — tools/serve_review.py 로 띄웠을 때, 또는 공개본 주소에 ?review 를 붙여 열었을 때(손님 모드) 나타난다.
   손님 모드: 코멘트는 그 사람 브라우저(localStorage)에 저장되고, [보내기]로 복사·내려받아 전달한다.
   받은 파일은 tools/import_guest.py 로 feedback/comments.json 에 합친다.
   [코멘트 남기기]를 켜고 누르면 점 핀, 끌면 영역 코멘트. 저장은 feedback/comments.json.
   위치: x·w = 문서 폭 비율, y·h = 문서 맨 위에서 px. vw = 남길 때 창 폭. */
(function () {
  'use strict';
  const API = '/api/comments';
  const ST = { open: '열림', req: '수정 요청', done: '반영됨', hold: '보류' };
  const S = { items: [], mode: false, show: true, panel: false, hideDone: false, allPages: false, pop: null, drag: null };
  const LOCAL = /^(127\.0\.0\.1|localhost)$/.test(location.hostname);
  /* 손님 모드 표시는 그 탭에서만 유지한다(사례 페이지를 오갈 때). 탭을 닫고 일반 주소로 오면 나오지 않는다 */
  if (!LOCAL && /[?&]review\b/.test(location.search)) try { sessionStorage.setItem('rv-guest', '1'); } catch (x) {}
  /* 로컬에서는 주소에 ?review 가 있을 때만 손님 모드(시험용), 공개본에서는 한 번 들어오면 다른 페이지에서도 유지 */
  const GUEST = LOCAL ? /[?&]review\b/.test(location.search) : (() => { try { return sessionStorage.getItem('rv-guest') === '1'; } catch (x) { return false; } })();
  const KEY = 'rv-guest-items';
  /* 공개본은 /portfolio/ 아래에 있으므로 페이지 경로를 사이트 기준으로 맞춘다 */
  const root = (document.currentScript && document.currentScript.src || '').replace(/review\.js.*$/, '');
  const rootPath = root ? new URL(root).pathname : '/';
  const page = ('/' + location.pathname.slice(rootPath.length)).replace(/\/index\.html$/, '/');
  const pageUrl = pg => rootPath.replace(/\/$/, '') + pg;

  function el(tag, attrs, kids) {
    const n = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (v == null || v === false) return;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    });
    (kids || []).forEach(c => c != null && n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return n;
  }
  /* 손님 모드 저장소: 서버 API 와 같은 모양으로 답한다 */
  function gload() { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (x) { return []; } }
  function gsave(a) { localStorage.setItem(KEY, JSON.stringify(a)); }
  function guestCall(method, url, body) {
    const a = gload(), id = (url.match(/\/(g\d+)$/) || [])[1];
    if (method === 'GET') return a;
    if (method === 'POST') {
      const n = a.reduce((m, c) => Math.max(m, +c.id.slice(1) || 0), 0) + 1;
      const c = { ...body, id: 'g' + String(n).padStart(3, '0'), status: 'open', at: new Date().toISOString(), author: guestName() };
      a.push(c); gsave(a); return c;
    }
    const i = a.findIndex(c => c.id === id); if (i < 0) throw new Error('없음');
    if (method === 'PATCH') { if (body.text != null && !String(body.text).trim()) throw new Error('내용이 비었습니다'); Object.assign(a[i], body, { updated: new Date().toISOString() }); gsave(a); return a[i]; }
    if (method === 'DELETE') { a.splice(i, 1); gsave(a); return { ok: true }; }
  }
  function guestName() {
    let n = ''; try { n = localStorage.getItem('rv-guest-name') || ''; } catch (x) {}
    if (!n) { n = (prompt('코멘트에 남길 이름을 적어 주세요.') || '').trim() || '손님'; try { localStorage.setItem('rv-guest-name', n); } catch (x) {} }
    return n;
  }
  async function call(method, url, body) {
    if (GUEST) return guestCall(method, url, body);
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    if (!r.ok) throw new Error(r.status);
    return r.json();
  }
  const docW = () => document.documentElement.clientWidth;
  const mine = () => S.items.filter(c => c.page === page && inView(c));
  /* 탭 패널 안에 남긴 코멘트는 그 탭이 열려 있을 때만 보인다 */
  function inView(c) { if (!c.view) return true; const v = document.getElementById(c.view); return !v || v.classList.contains('on'); }
  function viewAt(px, py) {
    const cover = document.getElementById('rv-cover'); if (cover) cover.style.display = 'none';
    const n = document.elementFromPoint(px - scrollX, py - scrollY);
    if (cover) cover.style.display = '';
    const v = n && n.closest('[role=tabpanel][id]'); return v ? v.id : undefined;
  }
  function viewName(c) { if (!c.view) return ''; const t = document.querySelector('[aria-controls="' + c.view + '"]'); return t ? ' · ' + t.innerText.split('\n')[0] + ' 탭' : ''; }
  function showView(c) { if (!c.view) return; const t = document.querySelector('[aria-controls="' + c.view + '"]'); if (t && t.getAttribute('aria-selected') !== 'true') t.click(); }
  const visible = c => !(S.hideDone && c.status === 'done');
  function fmt(iso) { const d = new Date(iso); return isNaN(d) ? '' : `${d.getMonth() + 1}.${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }

  /* ---------- 화면 뼈대 ---------- */
  const css = `
  #rv-bar{position:fixed;right:20px;bottom:20px;z-index:9990;display:flex;gap:6px;font:500 13px/1 "Pretendard Variable",-apple-system,sans-serif}
  #rv-bar button{all:unset;cursor:pointer;background:#141318;color:#fff;padding:11px 14px;border-radius:999px;box-shadow:0 6px 18px rgba(0,0,0,.18)}
  #rv-bar button.rv-mode[aria-pressed=true]{background:#F06B3B}
  #rv-bar button:focus-visible{outline:2px solid #3B7BF2;outline-offset:2px}
  #rv-layer{position:absolute;left:0;top:0;width:100%;z-index:9980;pointer-events:none}
  #rv-cover{position:fixed;inset:0;z-index:9985;cursor:crosshair;background:rgba(20,19,24,.04)}
  .rv-pin{position:absolute;pointer-events:auto;transform:translate(-50%,-100%);min-width:26px;height:26px;padding:0 6px;border-radius:13px 13px 13px 2px;background:#F06B3B;color:#fff;font:700 12px/26px ui-monospace,Menlo,monospace;text-align:center;border:2px solid #fff;box-shadow:0 3px 10px rgba(0,0,0,.25);cursor:pointer}
  .rv-pin.done{background:#9a9a9a}.rv-pin.hold{background:#5E5C67}.rv-pin.req{background:#8A5CF2}
  .rv-pin:focus-visible{outline:2px solid #3B7BF2}
  .rv-area{position:absolute;border:2px dashed #F06B3B;background:rgba(240,107,59,.08);display:none}
  .rv-area.on,.rv-drag{display:block}
  .rv-drag{position:absolute;border:2px dashed #F06B3B;background:rgba(240,107,59,.12)}
  .rv-pop{position:absolute;pointer-events:auto;width:300px;background:#fff;color:#141318;border-radius:10px;box-shadow:0 12px 40px rgba(0,0,0,.22);padding:14px;font:400 14px/1.55 "Pretendard Variable",-apple-system,sans-serif;z-index:2}
  .rv-pop textarea{width:100%;min-height:90px;border:1px solid #ddd;border-radius:6px;padding:8px;font:inherit;resize:vertical;box-sizing:border-box}
  .rv-pop .rv-row{display:flex;gap:6px;justify-content:flex-end;margin-top:10px;flex-wrap:wrap}
  .rv-pop button{all:unset;cursor:pointer;padding:6px 10px;border-radius:6px;background:#f1f0ee;font-size:13px}
  .rv-pop button.rv-pri{background:#141318;color:#fff}
  .rv-pop button:focus-visible{outline:2px solid #3B7BF2}
  .rv-pop .rv-meta{font:12px ui-monospace,Menlo,monospace;color:#8a8a8a;margin-bottom:6px}
  .rv-pop .rv-txt{white-space:pre-wrap;word-break:break-word}
  .rv-pop .rv-note{margin-top:8px;padding:8px;background:#f5f4f2;border-radius:6px;font-size:13px;white-space:pre-wrap}
  .rv-pop .rv-err{color:#c2381b;font-size:12px;margin-top:6px}
  #rv-panel{position:fixed;right:20px;bottom:70px;z-index:9991;width:340px;max-height:70vh;overflow:auto;background:#fff;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.22);padding:12px;font:400 13px/1.5 "Pretendard Variable",-apple-system,sans-serif;color:#141318}
  #rv-panel h4{font-size:13px;margin:4px 4px 8px;display:flex;justify-content:space-between;align-items:center}
  #rv-panel label{font-weight:400;font-size:12px;color:#5E5C67}
  #rv-panel .rv-opts{display:flex;gap:12px;margin:0 4px 8px}
  #rv-panel .rv-g{font:600 12px/1.4 inherit;margin:12px 4px 4px;color:#141318}
  #rv-panel a{display:block;padding:8px;border-radius:8px;color:inherit;text-decoration:none}
  #rv-panel a:hover,#rv-panel a:focus-visible{background:#f3f2ef;outline:none}
  #rv-panel .rv-p{font:11px ui-monospace,Menlo,monospace;color:#8a8a8a}
  #rv-panel .rv-t{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  `;
  let layer, bar, btnMode, btnList, btnShow;

  function mount() {
    document.head.appendChild(el('style', { text: css }));
    layer = el('div', { id: 'rv-layer', 'aria-label': '코멘트 핀' });
    document.body.appendChild(layer);
    btnMode = el('button', { type: 'button', class: 'rv-mode', 'aria-pressed': 'false', text: '코멘트 남기기 (C)', onclick: e => {
      if (e.detail === 0 && !S.mode) { /* 키보드: 지금 보이는 화면 위쪽에 점 코멘트 */
        const x = docW() / 2, y = scrollY + innerHeight / 3;
        draft({ page, view: viewAt(x, y), x: 0.5, y: Math.round(y), vw: innerWidth, hint: '키보드로 남김 · ' + hintAt(x, y) });
        return;
      }
      setMode(!S.mode);
    } });
    btnList = el('button', { type: 'button', 'aria-expanded': 'false', onclick: togglePanel });
    btnShow = el('button', { type: 'button', 'aria-pressed': 'true', onclick: () => { S.show = !S.show; btnShow.setAttribute('aria-pressed', S.show); btnShow.textContent = S.show ? '핀 숨기기' : '핀 보기'; render(); }, text: '핀 숨기기' });
    bar = el('div', { id: 'rv-bar' }, GUEST ? [btnShow, btnList, el('button', { type: 'button', text: '보내기', onclick: sendOut }), btnMode] : [btnShow, btnList, btnMode]);
    document.body.appendChild(bar);
    addEventListener('resize', render);
    addEventListener('keydown', e => {
      const typing = e.target.closest && e.target.closest('input,textarea,select,[contenteditable]');
      if ((e.key === 'c' || e.key === 'C' || e.key === 'ㅊ') && !typing && !e.metaKey && !e.ctrlKey && !e.altKey && !S.drag) {
        e.preventDefault(); if (S.pop && !S.pop.id) return; setMode(!S.mode); return;
      }
      if (e.key !== 'Escape') return;
      if (S.drag) { cancelDrag(); return; }
      if (S.pop) { closePop(); return; }
      if (S.mode) setMode(false);
    });
    new ResizeObserver(() => render()).observe(document.body);
    const mo = new MutationObserver(() => { if (S.pop && S.pop.id) { const c = S.items.find(x => x.id === S.pop.id); if (c && !inView(c)) closePop(); } render(); renderPanel(); });
    document.querySelectorAll('[role=tabpanel]').forEach(n => mo.observe(n, { attributes: true, attributeFilter: ['class'] }));
  }

  function setMode(on) {
    S.mode = on; btnMode.setAttribute('aria-pressed', on); btnMode.textContent = on ? '남기기 끄기 (C·Esc)' : '코멘트 남기기 (C)';
    const old = document.getElementById('rv-cover'); if (old) old.remove();
    if (on) {
      closePop();
      const cover = el('div', { id: 'rv-cover', 'aria-hidden': 'true' });
      cover.addEventListener('mousedown', startDrag);
      document.body.appendChild(cover);
    }
  }

  /* ---------- 찍기 ---------- */
  function startDrag(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    const x0 = e.pageX, y0 = e.pageY;
    const box = el('div', { class: 'rv-drag' }); layer.appendChild(box);
    S.drag = { x0, y0, box };
    const move = ev => {
      const x = Math.min(x0, ev.pageX), y = Math.min(y0, ev.pageY);
      Object.assign(box.style, { left: x + 'px', top: y + 'px', width: Math.abs(ev.pageX - x0) + 'px', height: Math.abs(ev.pageY - y0) + 'px' });
    };
    const up = ev => {
      removeEventListener('mousemove', move); removeEventListener('mouseup', up);
      if (!S.drag) return;
      box.remove(); S.drag = null;
      const dx = Math.abs(ev.pageX - x0), dy = Math.abs(ev.pageY - y0);
      const area = dx >= 8 && dy >= 8;
      const W = docW();
      const spot = area ? { x: Math.min(x0, ev.pageX), y: Math.min(y0, ev.pageY), w: dx, h: dy } : { x: x0, y: y0 };
      const cx = area ? spot.x + spot.w / 2 : x0, cy = area ? spot.y + spot.h / 2 : y0;
      const hint = hintAt(cx, cy), view = viewAt(cx, cy);
      setMode(false);
      draft({ page, view, x: spot.x / W, y: spot.y, w: area ? spot.w / W : undefined, h: area ? spot.h : undefined, vw: innerWidth, hint });
    };
    S.drag.cancel = () => { removeEventListener('mousemove', move); removeEventListener('mouseup', up); box.remove(); };
    addEventListener('mousemove', move); addEventListener('mouseup', up);
  }
  function cancelDrag() { if (S.drag) { S.drag.cancel(); S.drag = null; } }

  /* 찍은 자리의 요소를 짧게 적어 둔다(반영할 때 무엇을 가리켰는지 찾는 단서) */
  function hintAt(px, py) {
    const cover = document.getElementById('rv-cover');
    if (cover) cover.style.display = 'none';
    const n = document.elementFromPoint(px - scrollX, py - scrollY);
    if (cover) cover.style.display = '';
    if (!n || n.closest('#rv-layer,#rv-bar,#rv-panel')) return '';
    const img = n.closest('img') || (n.querySelector && n.querySelector('img'));
    const parts = [n.tagName.toLowerCase() + (n.className && typeof n.className === 'string' ? '.' + n.className.trim().split(/\s+/).join('.') : '')];
    const sec = n.closest('section[id],header,section.step,.panel');
    if (sec) parts.push('in ' + (sec.id ? '#' + sec.id : sec.className ? '.' + String(sec.className).split(' ')[0] : sec.tagName.toLowerCase()));
    if (img && img.getAttribute('src')) parts.push('img ' + img.getAttribute('src'));
    const t = (n.innerText || '').replace(/\s+/g, ' ').trim();
    if (t) parts.push('"' + t.slice(0, 80) + '"');
    return parts.join(' | ');
  }

  /* ---------- 핀 ---------- */
  function pos(c) { const W = docW(); return { x: c.x * W, y: c.y, w: c.w ? c.w * W : 0, h: c.h || 0 }; }
  function render() {
    if (!layer) return;
    layer.style.height = document.documentElement.scrollHeight + 'px';
    [...layer.querySelectorAll('.rv-pin,.rv-area')].forEach(n => n.remove());
    btnList.textContent = '목록 ' + S.items.filter(c => c.page === page && c.status !== 'done').length;
    if (!S.show) return;
    mine().filter(visible).forEach(c => {
      const p = pos(c);
      let area = null;
      if (p.w) {
        area = el('div', { class: 'rv-area' });
        Object.assign(area.style, { left: p.x + 'px', top: p.y + 'px', width: p.w + 'px', height: p.h + 'px' });
        layer.appendChild(area);
      }
      const pin = el('button', { type: 'button', class: 'rv-pin ' + c.status, 'data-id': c.id, 'aria-label': `코멘트 ${c.id} ${ST[c.status]}`, text: c.id.replace(/^[cg]0*/, '') });
      Object.assign(pin.style, { left: (p.w ? p.x + p.w : p.x) + 'px', top: p.y + 'px' });
      if (area) {
        pin.addEventListener('mouseenter', () => area.classList.add('on'));
        pin.addEventListener('mouseleave', () => { if (!(S.pop && S.pop.id === c.id)) area.classList.remove('on'); });
        pin.addEventListener('focus', () => area.classList.add('on'));
        pin.addEventListener('blur', () => { if (!(S.pop && S.pop.id === c.id)) area.classList.remove('on'); });
        if (S.pop && S.pop.id === c.id) area.classList.add('on');
      }
      pin.addEventListener('click', () => open(c.id));
      layer.appendChild(pin);
    });
    if (S.pop) placePop();
  }

  /* ---------- 팝오버 ---------- */
  function closePop() {
    if (!S.pop) return;
    const back = S.pop.opener; S.pop.node.remove(); S.pop = null; render();
    if (back && back.isConnected) back.focus();
    else if (back && back.dataset && back.dataset.id) { const n = layer.querySelector('.rv-pin[data-id="' + back.dataset.id + '"]'); (n || btnMode).focus(); }
    else if (btnMode) btnMode.focus();
  }
  function placePop() {
    const { node, at } = S.pop;
    const W = docW(), left = Math.max(12, Math.min(at.x + 12, W - 312));
    Object.assign(node.style, { left: left + 'px', top: (at.y + 8) + 'px' });
    if (!node.isConnected) layer.appendChild(node);
  }
  function draft(c) {
    closePop();
    const ta = el('textarea', { 'aria-label': '코멘트 내용', placeholder: '고칠 내용을 적어 주세요' });
    const err = el('div', { class: 'rv-err', role: 'alert' });
    const save = el('button', { type: 'button', class: 'rv-pri', text: '저장', onclick: async () => {
      if (!ta.value.trim()) { err.textContent = '내용을 적어 주세요.'; return; }
      save.disabled = true;
      try { const r = await call('POST', API, { ...c, text: ta.value }); S.items.push(r); closePop(); renderPanel(); }
      catch (x) { err.textContent = '저장하지 못했습니다(' + x.message + '). 서버가 켜져 있는지 확인해 주세요.'; save.disabled = false; }
    } });
    ta.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save.click(); });
    const node = el('div', { class: 'rv-pop', role: 'dialog', 'aria-label': '새 코멘트' }, [
      el('div', { class: 'rv-meta', text: (c.w ? '영역' : '점') + ' 코멘트 · ⌘Enter 저장' }), ta, err,
      el('div', { class: 'rv-row' }, [el('button', { type: 'button', text: '취소', onclick: closePop }), save])]);
    const p = pos(c);
    S.pop = { id: null, node, opener: btnMode, at: { x: p.w ? p.x + p.w : p.x, y: p.y + (p.h || 0) } };
    placePop(); ta.focus();
  }
  function open(id) {
    const c = S.items.find(x => x.id === id); if (!c) return;
    closePop();
    const err = el('div', { class: 'rv-err', role: 'alert' });
    const txt = el('div', { class: 'rv-txt', text: c.text });
    const kids = [el('div', { class: 'rv-meta', text: `${c.id} · ${ST[c.status]}${viewName(c)} · ${fmt(c.at)}${c.vw ? ' · 창 ' + c.vw + 'px' : ''}` }), txt];
    if (c.note) kids.push(el('div', { class: 'rv-note', text: '반영: ' + c.note }));
    kids.push(err);
    const act = async (fn) => { try { await fn(); } catch (x) { err.textContent = '처리하지 못했습니다(' + x.message + ').'; } };
    const row = el('div', { class: 'rv-row' });
    row.appendChild(el('button', { type: 'button', text: '고치기', onclick: () => {
      const ta = el('textarea', { 'aria-label': '코멘트 고치기' }); ta.value = c.text; txt.replaceWith(ta); ta.focus();
      row.replaceChildren(el('button', { type: 'button', text: '취소', onclick: () => open(id) }),
        el('button', { type: 'button', class: 'rv-pri', text: '저장', onclick: () => act(async () => { Object.assign(c, await call('PATCH', API + '/' + id, { text: ta.value })); open(id); renderPanel(); }) }));
    } }));
    if (c.status === 'done' || c.status === 'hold') row.appendChild(el('button', { type: 'button', text: '다시 열기', onclick: () => act(async () => { Object.assign(c, await call('PATCH', API + '/' + id, { status: 'open' })); open(id); renderPanel(); }) }));
    row.appendChild(el('button', { type: 'button', text: '삭제', onclick: () => {
      row.replaceChildren(el('span', { text: '지울까요?' }), el('button', { type: 'button', text: '아니요', onclick: () => open(id) }),
        el('button', { type: 'button', class: 'rv-pri', text: '지우기', onclick: () => act(async () => { await call('DELETE', API + '/' + id); S.items = S.items.filter(x => x.id !== id); closePop(); renderPanel(); }) }));
    } }));
    row.appendChild(el('button', { type: 'button', class: 'rv-pri', text: '닫기', onclick: closePop }));
    kids.push(row);
    const node = el('div', { class: 'rv-pop', role: 'dialog', 'aria-label': '코멘트 ' + c.id }, kids);
    const p = pos(c);
    const opener = document.activeElement && document.activeElement.closest && document.activeElement.closest('.rv-pin,#rv-panel a') || null;
    S.pop = { id, node, opener: opener && opener.classList.contains('rv-pin') ? { dataset: { id } } : opener, at: { x: p.w ? p.x + p.w : p.x, y: p.y } };
    render();
    node.querySelector('button').focus();
  }

  /* ---------- 손님 모드: 보내기 ---------- */
  function sendOut() {
    if (S.mode) setMode(false);
    const items = gload();
    const out = JSON.stringify({ from: (localStorage.getItem('rv-guest-name') || '손님'), site: location.origin + rootPath, at: new Date().toISOString(), items }, null, 1);
    closePop();
    const msg = el('div', { class: 'rv-txt', text: items.length ? `코멘트 ${items.length}건을 보냅니다. [복사]한 뒤 카카오톡 등에 붙여 넣거나, [파일 받기]로 내려받은 파일을 보내 주세요.` : '아직 남긴 코멘트가 없습니다.' });
    const err = el('div', { class: 'rv-err', role: 'status' });
    const row = el('div', { class: 'rv-row' }, [
      el('button', { type: 'button', text: '닫기', onclick: closePop }),
      el('button', { type: 'button', text: '파일 받기', onclick: () => {
        const a = el('a', { href: URL.createObjectURL(new Blob([out], { type: 'application/json' })), download: '포트폴리오_코멘트.json' });
        document.body.appendChild(a); a.click(); a.remove(); err.textContent = '내려받았습니다.';
      } }),
      el('button', { type: 'button', class: 'rv-pri', text: '복사', onclick: async () => {
        try { await navigator.clipboard.writeText(out); err.textContent = '복사했습니다. 붙여 넣어 보내 주세요.'; }
        catch (x) { err.textContent = '복사하지 못했습니다. [파일 받기]를 써 주세요.'; }
      } })]);
    const node = el('div', { class: 'rv-pop', role: 'dialog', 'aria-label': '코멘트 보내기' }, [el('div', { class: 'rv-meta', text: '보내기' }), msg, err, row]);
    S.pop = { id: null, node, opener: null, at: { x: docW() - 330, y: scrollY + innerHeight - 260 } };
    placePop(); node.querySelector('.rv-pri').focus();
  }

  /* ---------- 목록 ---------- */
  function togglePanel() { S.panel = !S.panel; btnList.setAttribute('aria-expanded', S.panel); renderPanel(); }
  const pageName = pg => pg === '/' ? '메인' : pg.replace(/^\/cases\//, '사례 · ').replace(/\.html$/, '');
  function renderPanel() {
    let p = document.getElementById('rv-panel');
    if (!S.panel) { if (p) p.remove(); return; }
    if (!p) { p = el('div', { id: 'rv-panel', role: 'region', 'aria-label': '코멘트 목록' }); document.body.appendChild(p); }
    const chk = el('input', { type: 'checkbox', onchange: e => { S.hideDone = e.target.checked; render(); renderPanel(); } }); chk.checked = S.hideDone;
    const all = el('input', { type: 'checkbox', onchange: e => { S.allPages = e.target.checked; renderPanel(); } }); all.checked = S.allPages;
    const here = S.items.filter(c => c.page === page).length;
    p.replaceChildren(el('h4', {}, ['이 페이지 ' + here + ' · 전체 ' + S.items.length]),
      el('div', { class: 'rv-opts' }, [el('label', {}, [all, ' 모든 페이지']), el('label', {}, [chk, ' 반영됨 숨기기'])]));
    const list = S.items.filter(visible).filter(c => S.allPages || c.page === page);
    if (!list.length) p.appendChild(el('div', { class: 'rv-p', text: S.allPages ? '아직 코멘트가 없습니다.' : '이 페이지에는 코멘트가 없습니다.' }));
    const pages = [...new Set(list.map(c => c.page))].sort((a, b) => (b === page) - (a === page));
    pages.forEach(pg => {
      if (S.allPages) p.appendChild(el('div', { class: 'rv-g', text: pageName(pg) + (pg === page ? ' (지금)' : '') }));
      list.filter(c => c.page === pg).forEach(c => p.appendChild(el('a', { href: pageUrl(c.page) + '#rv=' + c.id, onclick: e => { if (c.page === page) { e.preventDefault(); jump(c.id); } } }, [
        el('div', { class: 'rv-p', text: `${c.id} · ${ST[c.status]}${viewName(c)}` }), el('div', { class: 'rv-t', text: c.text })])));
    });
  }
  function jump(id) {
    const c = S.items.find(x => x.id === id); if (!c) return;
    showView(c);
    if (!S.show) { S.show = true; btnShow.setAttribute('aria-pressed', 'true'); btnShow.textContent = '핀 숨기기'; }
    scrollTo({ top: Math.max(0, c.y - innerHeight / 3), behavior: 'smooth' });
    open(id);
  }

  /* ---------- 시작: 서버가 있을 때만 ---------- */
  if (!LOCAL && !GUEST) return; /* 배포본에서는 ?review 로 연 손님만 쓴다(서버 요청 없음) */
  (GUEST ? Promise.resolve(gload()) : fetch(API, { cache: 'no-store' }).then(r => r.ok ? r.json() : Promise.reject())).then(items => {
    if (!Array.isArray(items)) return;
    S.items = items; mount(); render();
    if (GUEST && !localStorage.getItem('rv-guest-seen')) { /* 손님 첫 방문: 쓰는 법 한 번 보여 준다 */
      localStorage.setItem('rv-guest-seen', '1');
      const node = el('div', { class: 'rv-pop', role: 'dialog', 'aria-label': '코멘트 남기는 법' }, [
        el('div', { class: 'rv-meta', text: '코멘트 남기는 법' }),
        el('div', { class: 'rv-txt', text: '1. 오른쪽 아래 [코멘트 남기기](또는 C키)를 켭니다.\n2. 고칠 곳을 누르면 점, 끌면 영역 코멘트가 됩니다.\n3. 핀을 누르면 고치기·삭제할 수 있습니다. 사례 페이지를 오가며 남겨도 됩니다.\n4. 다 남기면 [보내기]에서 복사하거나 파일로 받아 전해 주세요.\n코멘트는 이 브라우저에만 저장됩니다.' }),
        el('div', { class: 'rv-row' }, [el('button', { type: 'button', class: 'rv-pri', text: '알겠어요', onclick: closePop })])]);
      S.pop = { id: null, node, opener: null, at: { x: docW() - 330, y: scrollY + innerHeight - 330 } };
      placePop(); node.querySelector('button').focus();
    }
    const m = location.hash.match(/rv=([cg]\d+)/);
    if (m) setTimeout(() => jump(m[1]), 400); /* 이미지가 자리 잡은 뒤 */
  }).catch(() => { /* 정적 배포본: 코멘트 없음 */ });
})();
