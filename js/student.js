/* ═══ 1-1반 협동오목 — 학생 화면 ═══ */
const stage = $("#stage");
const S = {
  me: null, token: null, dev: "tablet", W: 1180, H: 820, k: 1, rot: false, tx: 0, ty: 0,
  screen: "login", G: null, gameId: null, view: null, qlog: new Map(), lastSeq: 0, feed: [],
  menu: null, overlay: null, pick: null, answered: false, winUntil: 0, endG: null,
  presence: {}, bubbles: {}, pos: null, chat: [], lastTick: 0, lastLobby: 0, fxq: [], fxBusy: false
};
const LS = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} }, del: k => { try { localStorage.removeItem(k); } catch (e) {} } };

/* ─── 화면 크기: 설계 크기(휴대폰 844×390, 태블릿 1180×820)로 그리고 통째로 확대·축소 ─── */
/* 세로로 들면 세로 화면(390 너비), 가로로 들면 가로 화면. 화면을 돌려서 보여주지 않음 */
function layout() {
  const vw = innerWidth, vh = innerHeight, long = Math.max(vw, vh), short = Math.min(vw, vh);
  const portrait = vh > vw;
  const phone = Math.min(screen.width, screen.height) < 600 || short < 520;
  let W, H;
  if (portrait) { W = 390; H = Math.round(Math.max(680, Math.min(900, 390 * vh / vw))); }
  else { H = phone ? 390 : 820; W = Math.round(Math.max(phone ? 720 : 1000, Math.min(phone ? 960 : 1400, H * long / short))); }
  const k = Math.min(vw / W, vh / H);
  S.vert = portrait; S.dev = portrait || phone ? "phone" : "tablet"; S.W = W; S.H = H; S.k = k; S.rot = 0;
  stage.style.width = W + "px"; stage.style.height = H + "px";
  S.tx = (vw - W * k) / 2; S.ty = (vh - H * k) / 2; stage.style.transform = `translate(${S.tx}px,${S.ty}px) scale(${k})`;
  stage.className = "app " + S.dev + (portrait ? " vert" : "");
}
/* 화면 좌표 → 무대 좌표 */
function toLocal(cx, cy) { return { x: (cx - S.tx) / S.k, y: (cy - S.ty) / S.k }; }
/* 입력 중(키보드가 떠서 화면 높이가 줄어듦)에는 화면을 다시 그리지 않음 — 다시 그리면 적던 글자가 지워짐 */
let pendingLayout = false;
const relayout = () => {
  if (editing) { pendingLayout = true; return; }
  const was = S.dev + S.W + S.vert; layout(); if (was !== S.dev + S.W + S.vert) render();
};
addEventListener("resize", relayout);
screen.orientation?.addEventListener?.("change", relayout);
addEventListener("orientationchange", () => setTimeout(relayout, 250));
/* 안드로이드: 화면을 처음 누를 때마다(전체 화면이 풀렸으면) 전체 화면 + 가로 고정 다시 요청 */
/* 폰에서 터치 시작(pointerdown)은 '사용자 동작'으로 인정되지 않아 두 번 눌러야 했음 → 손을 뗄 때 요청 */
["pointerup", "touchend", "click"].forEach(ev => addEventListener(ev, e => { if (!e.target.closest?.("input,select,textarea,#kbd")) goFull(); }, { capture: true }));

/* ─── 휴대폰·태블릿 글자 입력: 화면 위쪽에 따로 뜨는 입력칸 (키보드·화면 회전에 영향 안 받음) ─── */
const touchUI = matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
let editing = null;
stage.addEventListener("focusin", e => {
  const el = e.target;
  if (!touchUI || el.tagName !== "INPUT" || editing) return;
  el.blur(); openEditor(el);
});
function openEditor(el) {
  editing = el;
  const form = el.form, fields = form ? [...form.querySelectorAll("input")] : [el], idx = fields.indexOf(el), last = idx === fields.length - 1;
  const box = document.createElement("div"); box.id = "kbd";
  // 게임 화면과 같은 방향으로 돌아가도록 무대 안에 넣고, 키보드가 가리지 않는 쪽에 둠
  box.className = "side-c";
  box.innerHTML = `<form class="kbd-in" autocomplete="off"><div class="kbd-l">${esc(el.dataset.label || el.placeholder || "입력")}</div>
    <div class="kbd-row"><input><button class="btn ${last ? "green" : ""}">${last ? (form?.id === "loginForm" ? "입장!" : "보내기") : "다음 ▶"}</button></div>
    <button type="button" class="kbd-x" aria-label="닫기">✕</button></form>`;
  stage.appendChild(box);
  const inp = box.querySelector("input");
  inp.type = el.type === "password" ? "password" : "text";
  if (el.inputMode) inp.inputMode = el.inputMode;
  if (el.maxLength > 0) inp.maxLength = el.maxLength;
  inp.placeholder = el.placeholder; inp.value = el.value; inp.enterKeyHint = last ? "go" : "next";
  inp.focus(); try { inp.select(); } catch (e) {}
  const close = () => { box.remove(); editing = null; if (pendingLayout) { pendingLayout = false; setTimeout(relayout, 300); } };
  box.querySelector(".kbd-x").onclick = () => { el.value = inp.value; close(); };
  box.addEventListener("click", e => { if (e.target === box) { el.value = inp.value; close(); } });
  box.querySelector("form").onsubmit = ev => {
    ev.preventDefault();
    const cur = (el.id && document.getElementById(el.id)) || el; cur.value = inp.value; close();
    const f = cur.form;
    if (!last) openEditor((f && f.querySelectorAll("input")[idx + 1]) || fields[idx + 1]);
    else if (f) f.requestSubmit ? f.requestSubmit() : f.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
  };
}
/* 처음 들어오면 한 번 눌러 전체 화면으로 시작하는 안내 */
const standalone = () => matchMedia("(display-mode: fullscreen), (display-mode: standalone)").matches || navigator.standalone;
function startGate() {
  if (!touchUI || standalone() || document.fullscreenElement || !document.documentElement.requestFullscreen) return;
  const g = document.createElement("div"); g.id = "gate";
  g.innerHTML = `<div class="gate-in"><div class="outline" style="font:34px 'Black Han Sans'">1-1반 협동오목</div><div class="gate-btn">👆 화면을 눌러 시작</div><div class="gate-sub">전체 화면으로 바뀌어요</div></div>`;
  const go = () => { goFull(); g.remove(); };
  g.addEventListener("click", go); g.addEventListener("touchend", go);
  stage.appendChild(g);
}
document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement) goFull.locked = false; setTimeout(relayout, 200); });

/* ═══ 로그인 ═══ */
/* 첫 화면: 고해상도 그림(1125×2000) 위에 진짜 입력칸을 같은 자리에 얹음. 좌표는 그림 픽셀 기준 */
const LV = { W: 1125, H: 2000, clock: [994, 84, 136] };
const LV_FIELDS = [
  { id: "lid", x: 110, y: 934, w: 905, h: 100, label: "학번", ph: "학번 (예: 10106)", extra: 'inputmode="numeric" maxlength="10"' },
  { id: "lname", x: 103, y: 1158, w: 919, h: 105, label: "이름", ph: "이름", extra: 'maxlength="20"' },
  { id: "lbirth", x: 103, y: 1385, w: 919, h: 104, label: "생일 8자리 (예: 20090315)", ph: "생일 8자리 (예: 20090315)", extra: 'type="password" inputmode="numeric" maxlength="10"' }
];
const LV_GO = { x: 92, y: 1540, w: 938, h: 155 };
const fadeMask = (l, r, t, b) => {
  const g = [];
  if (l || r) g.push(`linear-gradient(to right,${l ? `transparent,#000 ${l}px` : "#000,#000 0"},${r ? `#000 calc(100% - ${r}px),transparent` : "#000,#000"})`);
  if (t || b) g.push(`linear-gradient(to bottom,${t ? `transparent,#000 ${t}px` : "#000,#000 0"},${b ? `#000 calc(100% - ${b}px),transparent` : "#000,#000"})`);
  return g.length ? `-webkit-mask-image:${g.join(",")};mask-image:${g.join(",")};-webkit-mask-composite:source-in;mask-composite:intersect;` : "";
};
function loginParts(ox, oy, s) {
  const last = esc(LS.get("omok_lastid") || "");
  const f = LV_FIELDS.map(q => `<input class="fld" id="${q.id}" data-label="${q.label}" ${q.extra} placeholder="${q.ph}" ${q.id === "lid" && last ? `value="${last}"` : ""} style="left:${(q.x - ox) * s}px;top:${(q.y - oy) * s}px;width:${q.w * s}px;height:${q.h * s}px;font-size:${Math.max(11, 44 * s)}px;border-radius:${36 * s}px;padding:0 ${40 * s}px">`).join("");
  const go = `<button class="go" type="submit" aria-label="우리반 입장" style="left:${(LV_GO.x - ox) * s}px;top:${(LV_GO.y - oy) * s}px;width:${LV_GO.w * s}px;height:${LV_GO.h * s}px"></button>`;
  const msg = `<div class="lmsg" id="lmsg" style="left:${(120 - ox) * s}px;top:${(748 - oy) * s}px;width:${885 * s}px;height:${74 * s}px;font-size:${Math.max(10, 36 * s)}px;line-height:${74 * s}px"></div>`;
  return f + go + msg;
}
function loginHTML() {
  const sideBtn = `<a class="tlink" href="teacher.html">교사</a>`;
  const landPhone = S.dev === "phone" && !S.vert;
  if (!landPhone) {
    // 세로 휴대폰·태블릿: 그림 전체를 가로폭(또는 높이)에 맞춰 가운데에
    const w = Math.min(S.W, S.H * LV.W / LV.H), h = w * LV.H / LV.W, s = w / LV.W;
    const left = (S.W - w) / 2, top = Math.max(0, S.H - h); // 그림을 화면 맨 아래에 붙임 (남는 위쪽은 흐린 배경)
    const fx = w < S.W - 1 ? 30 : 0, fy = h < S.H - 1 ? 36 : 0;
    const [cx, cy, cd] = LV.clock, d = cd * s;
    const clock = `<div class="wclock" style="left:${cx * s}px;top:${cy * s}px">${wallClock(d)}</div>`;
    return `<div class="lwrap"><div class="lbg"></div><form class="lg2 art-v" id="loginForm" autocomplete="off" style="left:${left}px;top:${top}px;width:${w}px;height:${h}px;${fadeMask(fx, fx, fy, 0)}">${clock}${loginParts(0, 0, s)}</form>${sideBtn}</div>`;
  }
  // 가로로 든 휴대폰: 같은 그림에서 로고와 로그인 창을 따로 잘라 나란히
  const P = { x0: 10, y0: 600, x1: 1115, y1: 1790 }, sp = S.H / (P.y1 - P.y0), pw = (P.x1 - P.x0) * sp, pl = S.W - pw - 10;
  const L = { x0: 20, y0: 154, x1: 1105, y1: 622 }, avail = pl - 16, sl = Math.min(avail / (L.x1 - L.x0), (S.H * .62) / (L.y1 - L.y0)), lw = (L.x1 - L.x0) * sl, lh = (L.y1 - L.y0) * sl;
  const bg = (r, s, w, h) => `width:${w}px;height:${h}px;background-image:url(assets/ui/login_v.webp);background-repeat:no-repeat;background-size:${LV.W * s}px ${LV.H * s}px;background-position:${-r.x0 * s}px ${-r.y0 * s}px;`;
  return `<div class="lwrap"><div class="lbg"></div>
    <div class="lg2-logo" style="left:${(pl - lw) / 2 - 2}px;top:${(S.H - lh) / 2 - 6}px;width:${lw}px;height:${lh}px;background-size:${LV.W * sl}px ${LV.H * sl}px,100% 100%;background-position:${-L.x0 * sl}px ${-L.y0 * sl}px,0 0"></div>
    <div class="wclock" style="left:7%;top:13%">${wallClock(36)}</div>
    <form class="lg2" id="loginForm" autocomplete="off" style="left:${pl}px;top:0;${bg(P, sp, pw, S.H)}${fadeMask(12, 12, 14, 0)}">${loginParts(P.x0, P.y0, sp)}</form>${sideBtn}</div>`;
}
async function doLogin(ev) {
  ev.preventDefault();
  const id = $("#lid").value.trim(), name = $("#lname").value.trim(), birth = $("#lbirth").value.trim();
  if (!id || !name || !birth) { $("#lmsg").textContent = "학번·이름·생일을 모두 적어주세요."; return; }
  goFull();
  $("#lmsg").textContent = "들어가는 중…";
  try {
    const r = await rpc("omok_login", { p_id: id, p_name: name, p_birth: birth });
    LS.set("omok_token", r.token); LS.set("omok_lastid", id);
    S.token = r.token; S.me = r; await startApp();
  } catch (e) { $("#lmsg").textContent = e.message; }
}
function goFull() {
  try {
    const d = document.documentElement;
    if (!touchUI) return;
    const lock = () => screen.orientation?.lock?.(innerHeight > innerWidth ? "portrait" : "landscape").catch(() => {});
    if (document.fullscreenElement) { if (!goFull.locked) { goFull.locked = true; lock(); } return; }
    if (d.requestFullscreen) d.requestFullscreen({ navigationUI: "hide" }).then(() => { goFull.locked = true; lock(); }).catch(() => {});
  } catch (e) {}
}

/* ═══ 시작 ═══ */
async function boot() {
  layout();
  setTimeout(startGate, 50);
  const tok = LS.get("omok_token");
  if (tok) {
    try { const me = await rpc("omok_me", { p_token: tok }); if (me && me.role === "student") { S.token = tok; S.me = me; await startApp(); return; } } catch (e) {}
    LS.del("omok_token");
  }
  S.screen = "login"; render();
}
async function startApp() {
  await Promise.all([syncTime(), loadRoster(), loadGroups(), loadSettings(), loadQueue(), loadMatches()]);
  const mine = stu(S.me.id); if (mine) S.me = { ...S.me, ...mine };
  S.pos = S.pos || { x: 20 + Math.random() * 60, y: 72 + Math.random() * 18 };
  subscribeDB(); joinPlaza();
  const gid = curGameId();
  if (gid) await enterGame(gid); else { S.screen = "plaza"; render(); }
  setInterval(loop, 250);
  setInterval(poll, 4000);
  setInterval(loadRoster, 30000);
  setInterval(syncTime, 60000);
}

/* ─── 실시간 구독 ─── */
function subscribeDB() {
  sb.channel("omok_db_s")
    .on("postgres_changes", { event: "*", schema: "public", table: "omok_settings" }, p => { if (p.new?.id) { DATA.settings[p.new.id] = p.new.value; onSettings(); } })
    .on("postgres_changes", { event: "*", schema: "public", table: "omok_queue" }, () => loadQueue().then(onQueue))
    .on("postgres_changes", { event: "*", schema: "public", table: "omok_matches" }, () => loadMatches().then(() => { if (S.overlay === "bracket") render(); }))
    .on("postgres_changes", { event: "*", schema: "public", table: "omok_groups" }, () => loadGroups())
    .on("postgres_changes", { event: "*", schema: "public", table: "omok_games" }, p => { if (p.new && p.new.id === S.gameId) onGame(p.new); })
    .on("postgres_changes", { event: "*", schema: "public", table: "omok_chat" }, p => onChat(p.new, p.eventType))
    .subscribe();
}
async function poll() {
  const before = curGameId();
  await loadSettings(); await loadQueue();
  if (curGameId() !== before) onSettings();
  if (S.gameId) {
    const { data } = await sb.from("omok_games").select("*").eq("id", S.gameId).maybeSingle();
    if (data && (data.seq !== S.G?.seq || data.status !== S.G?.status)) onGame(data);
  }
  onQueue();
}
function onSettings() {
  const gid = curGameId();
  if (gid && gid !== S.gameId) enterGame(gid);
  else if (S.screen === "plaza") renderPlazaHud();
}

/* ═══ 우리반 (광장) ═══ */
let plazaCh = null;
function joinPlaza() {
  plazaCh = sb.channel("omok_plaza", { config: { presence: { key: S.me.id } } });
  plazaCh.on("presence", { event: "sync" }, () => { S.presence = plazaCh.presenceState(); if (S.screen === "plaza") { updateWalkers(); renderPlazaHud(); } })
    .subscribe(async st => { if (st === "SUBSCRIBED") trackMe(); });
}
function trackMe() { plazaCh?.track({ id: S.me.id, name: S.me.name, x: S.pos.x, y: S.pos.y, t: Date.now() }).catch(() => {}); }
const online = () => { const o = {}; for (const [k, v] of Object.entries(S.presence)) { const m = v[v.length - 1]; if (m) o[k] = m; } return o; };

function plazaHTML() {
  const P = S.dev === "phone";
  return `<div class="room" id="room"><div class="roombg ${S.vert ? "vert" : ""}" id="roombg"></div><div class="warm"></div><div id="walkers"></div><div id="tapmark"></div>
    <div class="hud-top" id="hud"></div><div id="menuwrap"></div>
    <form class="chatbar" id="chatbar"><input id="chatin" maxlength="80" placeholder="${S.me.muted ? "선생님이 채팅을 막았어요" : "채팅하면 내 머리 위에 말풍선으로 떠요"}" ${S.me.muted ? "disabled" : ""}><button class="btn purple">${P ? "↵" : "보내기"}</button></form>
    <div id="dimwrap"></div></div>`;
}
function renderPlazaHud() {
  const hud = $("#hud"); if (!hud) return;
  const on = DATA.settings.game_enabled !== false && DATA.settings.game_enabled !== "false";
  const n = Object.keys(online()).filter(k => k !== "teacher").length;
  const hudHtml = `<span class="plate">🏫 우리반</span><span class="chip ${on ? "green" : "gray"}">${on ? "🎮 게임 가능" : "⛔ 게임 쉬는 중"}</span><span class="chip">👥 ${n}명</span>
    ${S.vert ? "" : `<span class="me-chip" id="mechip">${av(S.me.id, 24)}${esc(S.me.name)}</span>`}<button class="btn sm ${S.menu ? "gold" : "white"} menu-btn" id="menubtn" ${S.vert ? 'style="margin-left:auto"' : ""}>${S.menu ? "✕" : "☰"}${S.dev === "phone" ? "" : " 메뉴"}</button>`;
  if (hud._h !== hudHtml) { hud._h = hudHtml; hud.innerHTML = hudHtml; }
  renderMenu(); renderMatchWait();
}
function floorY(y) { return S.vert ? Math.max(58, Math.min(93, y)) : Math.max(64, Math.min(95, y)); }
function updateWalkers() {
  const box = $("#walkers"); if (!box) return;
  const on = online(), sz = S.vert ? 40 : S.dev === "phone" ? 32 : 54, seen = new Set();
  const qset = new Set(DATA.queue.map(q => q.sid));
  for (const [id, m] of Object.entries(on)) {
    seen.add(id);
    let el = box.querySelector(`[data-w="${CSS.escape(id)}"]`);
    const isT = id === "teacher", isMe = id === S.me.id;
    if (!el) {
      el = document.createElement("div"); el.dataset.w = id;
      el.className = "walker" + (isMe ? " me" : "") + (isT ? " is-t" : "");
      el.innerHTML = `<div class="xb"></div><div class="who">${isT ? avatar("T-0001", sz * 1.05, "#2b3366") : av(id, sz)}<span class="nametag">${isMe ? "⭐ " : isT ? "🧑‍🏫 " : ""}${esc(isT ? "선생님" : (m.name || nameOf(id)))}</span></div>`;
      el.style.left = (m.x ?? 50) + "%"; el.style.top = floorY(m.y ?? 80) + "%";
      box.appendChild(el);
    }
    const x = isMe ? S.pos.x : m.x, y = floorY(isMe ? S.pos.y : m.y);
    if (el.style.left !== x + "%" || el.style.top !== y + "%") {
      el.classList.add("moving"); clearTimeout(el._mv); el._mv = setTimeout(() => el.classList.remove("moving"), 1400);
      el.style.left = x + "%"; el.style.top = y + "%";
    }
    el.style.zIndex = 3 + Math.round(y);
    const b = S.bubbles[id], xb = el.querySelector(".xb");
    const html = b && b.until > Date.now() ? `<div class="bubble ${isT ? "t" : ""}">${esc(b.text)}</div>` : qset.has(id) ? `<div class="q-badge">🎲 매칭 대기</div>` : "";
    if (xb.innerHTML !== html) xb.innerHTML = html;
  }
  box.querySelectorAll("[data-w]").forEach(el => { if (!seen.has(el.dataset.w)) el.remove(); });
}
function onPlazaTap(e) {
  if (e.target.id !== "roombg") return;
  const p = toLocal(e.clientX, e.clientY);
  const x = Math.max(4, Math.min(96, p.x / S.W * 100)), y = floorY(p.y / S.H * 100);
  S.pos = { x, y }; trackMe(); updateWalkers();
  const tm = $("#tapmark"); tm.innerHTML = `<div class="tapmark" style="left:${x}%;top:${y}%"></div>`;
  setTimeout(() => { if (tm.innerHTML.includes(`left:${x}%`)) tm.innerHTML = ""; }, 1500);
}
/* 오른쪽 위 메뉴 */
function renderMenu() {
  const w = $("#menuwrap"); if (!w) return;
  if (!S.menu) { w._h = ""; w.innerHTML = ""; return; }
  const on = DATA.settings.game_enabled !== false && DATA.settings.game_enabled !== "false";
  const busy = !!curGameId(), dis = !on || busy ? "disabled" : "";
  const inQ = DATA.queue.find(q => q.sid === S.me.id);
  const ol = online(), nOn = DATA.roster.filter(s => ol[s.id]).length;
  const item = (k, ic, l, sub, body) => `<div class="dd-item ${S.menu === k ? "open" : ""}"><div class="dd-row" data-menu="${k}">${ic} ${l}<span class="dd-sub">${sub}</span><span class="dd-arrow">${S.menu === k ? "▾" : "▸"}</span></div>${S.menu === k ? body : ""}</div>`;
  const game = `<div class="dd-body">${!on ? `<div class="help" style="text-align:center">⛔ 지금은 선생님이 게임을 꺼두었어요</div>` : busy ? `<div class="help" style="text-align:center">🎮 다른 게임이 진행 중이에요</div>` : inQ ? `<div class="help" style="text-align:center">🎲 매칭 대기 중이에요</div>` : ""}
    <button class="btn sm" data-q="solo" ${dis}>⚔️ 1:1 빠른 매칭<small>2명</small></button>
    <button class="btn sm red" data-q="random" ${dis}>🎲 3:3 랜덤 매칭<small>6명</small></button>
    <button class="btn sm green" data-q="group" ${dis || (S.me.grp ? "" : "disabled")}>🛡️ 조별 연습<small>${S.me.grp ? esc(grpName(S.me.grp)) + " vs 다른 조" : "조 없음"}</small></button>
    <button class="btn sm gold" data-ov="bracket">🏆 토너먼트 대진표</button>
    <button class="btn sm white" data-ov="dex">🃏 카드 도감</button>
    <button class="btn xs gray" data-act="logout" style="align-self:flex-end">로그아웃</button></div>`;
  const people = `<div class="dd-body"><div class="ol-list">${DATA.roster.map(s => `<div class="ol ${ol[s.id] ? "" : "off"}"><span class="dot" style="${ol[s.id] ? "" : "background:#b9bfd6"}"></span>${av(s.id, 18)}${esc(s.name)}<span class="gn">${s.grp ? esc(grpName(s.grp)) : ""}</span></div>`).join("")}</div></div>`;
  const fresh = S.menuFresh; S.menuFresh = false;
  const html = `<div class="dd${fresh ? " fresh" : ""}">${item("game", "🎮", "게임하기", "연습 · 대진표", game)}${item("online", "👥", "접속인원", `${nOn} / ${DATA.roster.length}명`, people)}</div>`;
  // 몇 초마다 자동으로 다시 불려도(접속인원 변화 등) 내용이 같으면 그대로 두어 깜빡이지 않게
  const key = html.replace(' fresh', "");
  if (w._h === key && !fresh) return;
  const keepScroll = w.querySelector(".dd")?.scrollTop || 0;
  w._h = key; w.innerHTML = html;
  const dd = w.querySelector(".dd"); if (dd && keepScroll) dd.scrollTop = keepScroll;
}
/* 매칭 대기 창 */
function renderMatchWait() {
  const w = $("#dimwrap"); if (!w) return;
  const q = DATA.queue.find(x => x.sid === S.me.id);
  if (!q || curGameId()) { w._h = ""; w.innerHTML = ""; return; }
  const same = DATA.queue.filter(x => x.mode === q.mode);
  const need = q.mode === "solo" ? 2 : q.mode === "random" ? 6 : 0;
  let seats = "", line = "";
  if (q.mode === "group") {
    const byG = {}; same.forEach(x => (byG[x.grp] = byG[x.grp] || []).push(x.sid));
    const mineG = byG[q.grp] || [];
    const others = Object.entries(byG).filter(([g, a]) => +g !== q.grp && a.length >= 2);
    seats = mineG.map(id => `<div class="seat full">${av(id, 36)}<span>${esc(nameOf(id))}</span></div>`).join("");
    line = mineG.length < 2 ? `우리 조가 2명 이상 모여야 해요 (${mineG.length}명)` : others.length ? "상대 조를 찾았어요! 곧 시작해요" : "상대 조를 기다리는 중…";
  } else {
    seats = Array.from({ length: need }, (_, i) => same[i] ? `<div class="seat full">${av(same[i].sid, 36)}<span>${esc(nameOf(same[i].sid))}</span></div>` : `<div class="seat">?</div>`).join("");
    line = `${Math.min(same.length, need)} / ${need}명 대기 중…`;
  }
  const title = { solo: "⚔️ 1:1 빠른 매칭", random: "🎲 3:3 랜덤 매칭", group: "🛡️ 조별 연습" }[q.mode];
  const sub = { solo: "2명이 모이면 바로 시작해요", random: "6명이 모이면 팀을 무작위로 나눠요", group: "조원 2명 이상 + 상대 조가 모이면 시작해요" }[q.mode];
  const mhtml = `<div class="dim"><div class="match-card panel"><div style="font:26px Jua">${title}</div><div style="font:15px Jua;color:var(--ink2)">${sub}</div><div class="spinner"></div><div class="seats">${seats}</div><div style="font:17px Jua;margin-bottom:10px">${line}</div><button class="btn gray" data-act="leaveq">매칭 취소</button></div></div>`;
  if (w._h !== mhtml) { w._h = mhtml; w.innerHTML = mhtml; }
}
function onQueue() { if (S.screen === "plaza") { renderMatchWait(); updateWalkers(); if (S.menu === "game") renderMenu(); } }

/* 채팅 */
function onChat(m, type) {
  if (!m) return;
  if (m.room === "plaza") {
    if (m.hidden) { if (S.bubbles[m.sid]?.id === m.id) delete S.bubbles[m.sid]; }
    else if (type === "INSERT") S.bubbles[m.sid] = { id: m.id, text: m.text, until: Date.now() + 6000 };
    if (S.screen === "plaza") updateWalkers();
    if (m.sid === S.me.id && type === "INSERT") {}
  } else if (S.gameId && m.room === "game:" + S.gameId) {
    const i = S.chat.findIndex(x => x.id === m.id);
    if (i >= 0) S.chat[i] = m; else S.chat.push(m);
    S.chat = S.chat.slice(-40); renderChatMsgs();
  }
}
async function sendChat(room, input) {
  const t = input.value.trim(); if (!t) return;
  input.value = "";
  try { await rpc("omok_chat_send", { p_token: S.token, p_room: room, p_text: t }); }
  catch (e) { toast(e.message, "err"); if (e.code === "muted") { S.me.muted = true; } }
}

/* ═══ 게임 ═══ */
const myTeam = () => { if (!S.G) return null; const t = S.G.teams.findIndex(T => T.players.includes(S.me.id)); return t < 0 ? null : t; };
const isPlayer = () => myTeam() !== null;
async function enterGame(id) {
  const { data } = await sb.from("omok_games").select("*").eq("id", id).maybeSingle();
  if (!data) return;
  S.gameId = id; S.G = data; S.qlog = new Map(); S.lastSeq = data.seq; S.feed = []; S.pick = null; S.answered = false; S.menu = null; S.overlay = null;
  S.fxq = []; S.endG = null; S.chat = [];
  quizLog(data, S.qlog);
  if (isPlayer()) await refreshView();
  const { data: ch } = await sb.from("omok_chat").select("*").eq("room", "game:" + id).order("id", { ascending: false }).limit(30);
  S.chat = (ch || []).reverse();
  S.screen = "game"; render();
}
async function refreshView() {
  try { S.view = await rpc("omok_my_view", { p_token: S.token, p_game: S.gameId }); } catch (e) { S.view = null; }
}
async function onGame(G) {
  const prev = S.G, prevHand = (S.view?.hand || []).map(c => c.u);
  S.G = G; quizLog(G, S.qlog);
  if (isPlayer() && G.seq !== prev?.seq) await refreshView();
  if (prev && (prev.cur_player !== G.cur_player || prev.turn_no !== G.turn_no)) { S.answered = false; S.pick = null; }
  if (G.phase !== "action") S.pick = null;
  const evs = (G.events || []).filter(e => e.seq > S.lastSeq).sort((a, b) => a.seq - b.seq);
  S.lastSeq = Math.max(S.lastSeq, G.seq);
  for (const e of evs) handleEvent(e, prevHand);
  if (G.status !== "live") {
    if (G.status === "aborted") { toast("⛔ 선생님이 게임을 멈췄어요", "err"); leaveGame(); return; }
    S.endG = G; S.winUntil = Date.now() + 12000;
  }
  if (S.screen === "game") render();
}
function leaveGame() {
  S.gameId = null; S.G = null; S.view = null; S.endG = null; S.pick = null; S.fxq = []; S.fxBusy = false;
  const g = curGameId();
  if (g) enterGame(g); else { S.screen = "plaza"; render(); }
}
function pushFeed(t) { if (!t) return; S.feed.push(t); S.feed = S.feed.slice(-3); }
function handleEvent(e, prevHand) {
  const G = S.G, mt = myTeam();
  pushFeed(evText(G, e));
  if (e.type === "card_use") fx(useFxHTML(e), e.k === "roulette" || e.k === "gamble" ? 3200 : 2600, e.blocked || isGold(e.k) || ["bomb", "swap", "whirl"].includes(e.k));
  else if (e.type === "card_get") {
    if (mt === e.team && S.view?.hand) {
      const nw = S.view.hand.find(c => !prevHand.includes(c.u)) || S.view.hand[S.view.hand.length - 1];
      if (nw) fx(`<div class="burst ${e.gold ? "gold" : ""}"></div><div class="speed"></div><div class="big outline" ${e.gold ? 'style="color:var(--gold1)"' : ""}>${e.gold ? "✨ 황금카드 획득! ✨" : "카드 획득!"}</div><div class="flipin">${card(nw.k, { w: S.dev === "phone" ? 120 : 200, cls: "shine" })}</div><div class="who-line">${esc(CARD[nw.k][0])} — ${esc(CARD[nw.k][1])}</div><div class="desc">우리 팀 카드함에 들어갔어요 (${S.view.hand.length} / 2)</div>`, 2600);
    } else if (e.gold) fx(`<div class="burst gold"></div><div class="big outline" style="color:var(--gold1)">✨ 황금카드 획득! ✨</div><div class="flipin">${back("wob")}</div><div class="who-line">${esc(teamName(G, e.team))} ${esc(nameOf(e.player))} 미션 성공!</div>`, 2200);
  } else if (e.type === "mission_result" && !e.ok) {
    if (mt === e.team) toast(e.auto ? "⌛ 미션 시간이 끝났어요" : "❌ 미션 실패 — 이번엔 패스!", "err");
  } else if (e.type === "quiz" && e.player === S.me.id) {
    toast(e.result === "correct" ? "⭕ 정답! 카드를 받아요" : e.result === "wrong" ? `❌ 오답! 정답은 ${e.ans}` : "⌛ 시간 초과!", e.result === "correct" ? "ok" : "err");
  } else if (e.type === "timeout" && e.player === S.me.id) toast("⌛ 시간 초과! 차례가 넘어갔어요", "err");
}
function useFxHTML(e) {
  const G = S.G, k = e.k, gold = isGold(k), w = S.dev === "phone" ? 130 : 210;
  if (e.blocked) return `<div class="burst"></div><div class="big outline">🛡 방어 성공!</div><div style="display:flex;align-items:center;gap:14px;position:relative">${card(k, { w: w * .8 }).replace('class="cimg', 'style="filter:grayscale(.8) brightness(.7);transform:rotate(-14deg)" class="cimg')}<span style="font:60px 'Black Han Sans';color:#fff">✕</span><div class="zoomhit">${card("shield", { w, cls: "shine" })}</div></div><div class="who-line">${esc(teamName(G, 1 - e.team))}가 방어막으로 막았어요! 🛡</div>`;
  let extra = "";
  if (k === "roulette") extra = `<div class="desc" style="font:24px Jua;color:var(--gold1)">결과: ${ROUL[e.outcome] || e.outcome}</div>`;
  if (k === "gamble") extra = `<div class="desc" style="font:24px Jua;color:var(--gold1)">${e.outcome === "head" ? "🪙 앞면! 돌 3개!" : "🪙 뒷면… 이번 차례 끝"}</div>`;
  if (k === "sweep") extra = `<div class="desc">카드 ${e.n || 0}장을 빼앗았어요!</div>`;
  if (k === "steal") extra = `<div class="desc">${e.stolen ? "카드 1장을 훔쳤어요!" : "훔칠 카드가 없었어요…"}</div>`;
  return `<div class="burst ${gold ? "gold" : "red"}"></div><div class="speed"></div><div class="big outline" ${gold ? 'style="color:var(--gold1)"' : ""}>${gold ? "✨ " : "⚡ "}${esc(CARD[k][0])}!</div><div class="zoomhit">${card(k, { w, cls: "shine" })}</div><div class="who-line">${esc(teamName(G, e.team))} <b style="color:var(--gold1)">${esc(nameOf(e.player))}</b></div><div class="desc">${esc(CARD[k][1])}</div>${extra}`;
}
/* 연출 겹치지 않게 차례로 */
function fx(html, ms = 2400, shake = false) { S.fxq.push({ html, ms, shake }); if (!S.fxBusy) nextFx(); }
function nextFx() {
  const f = S.fxq.shift(); const L = $("#fxlayer");
  if (!f || !L) { S.fxBusy = false; if (L) L.innerHTML = ""; return; }
  S.fxBusy = true;
  L.innerHTML = `<div class="fx" id="fxnow">${f.html}</div>`;
  if (f.shake) { const g = $(".g"); g?.classList.add("shake"); setTimeout(() => g?.classList.remove("shake"), 500); }
  const done = () => { clearTimeout(t); L.innerHTML = ""; nextFx(); };
  const t = setTimeout(done, f.ms);
  $("#fxnow").onclick = done;
}

/* 게임 화면 그리기 */
function gameHTML() {
  const G = S.endG || S.G; if (!G) return "";
  if (S.endG) return winHTML(G);
  if (G.phase === "intro") return vsHTML(G);
  if (G.phase === "order") return orderHTML(G);
  return boardScreen(G);
}
function vsHTML(G) {
  const sz = S.dev === "phone" ? 50 : 76;
  const side = t => `<div class="vs-side ${TEAMCLS[t]}"><div class="vs-team outline">${esc(teamName(G, t))}</div><div class="vs-members">${G.teams[t].players.map(p => `<div class="who">${av(p, sz, t ? "#3d8bff" : "#ff5a5f")}<span class="nametag">${esc(nameOf(p))}</span></div>`).join("")}</div></div>`;
  const m = DATA.matches.find(x => x.id === G.match_id);
  const rn = m ? (m.round === 3 ? "결승" : m.round === 2 ? `4강 ${m.slot}경기` : `8강 ${m.slot}경기`) : "토너먼트";
  return `<div class="vs">${side(0)}${side(1)}<div class="speed"></div><div class="vs-count"><div class="msg">🏆 10초 뒤 토너먼트가 시작됩니다</div><div class="num outline" id="vsnum">${Math.ceil(leftSec(G.deadline))}</div></div><div class="vs-mid"><b class="outline">VS</b></div><div class="vs-round"><span class="chip gold" style="font-size:17px">${rn}</span></div></div>`;
}
function orderHTML(G) {
  const el = 8 - leftSec(G.deadline); // 0~8초
  const reel = (t, i) => {
    const pl = G.teams[t].players, col = t ? "#3d8bff" : "#ff5a5f", stopAt = 1.2 + t * 2.6 + i * .8;
    if (i >= pl.length) return "";
    const stop = el >= stopAt, pk = pl[i];
    return `<div class="reel ${stop ? "stop" : ""}">${stop ? `<span class="no">${i + 1}번</span>` : ""}<div class="strip">${stop ? `<div>${av(pk, 52, col)}<span class="nametag">${esc(nameOf(pk))}</span></div>` : [...pl, ...pl].map(s => `<div>${av(s, 52, col)}<span class="nametag">${esc(nameOf(s))}</span></div>`).join("")}</div></div>`;
  };
  const done = el >= 1.2 + 2.6 + Math.max(G.teams[1].players.length - 1, 0) * .8 + .3;
  return `<div class="order"><div class="outline" style="font:40px 'Black Han Sans'">🎰 순서 뽑기!</div><div style="font:17px Jua;color:#e7dcff;margin:4px 0 14px">릴이 멈추면 순서가 정해져요</div>
    <div class="machines">${[0, 1].map(t => `<div class="machine ${TEAMCLS[t]}"><div class="mt">${t ? "⚪" : "⚫"} ${esc(teamName(G, t))}</div><div class="reels">${[0, 1, 2].map(i => reel(t, i)).join("")}</div></div>`).join("")}</div>
    <div style="margin-top:16px;font:21px Jua;background:#000;color:#fff;border-radius:999px;padding:5px 16px;border:3px solid #fff;${done ? "" : "visibility:hidden"}">⚫ ${esc(teamName(G, 0))}가 흑돌 · 선공!</div></div>`;
}
function boardScreen(G) {
  const PH = S.dev === "phone", mt = myTeam(), player = mt !== null, myTurn = G.cur_player === S.me.id && G.status === "live";
  const qres = quizLog(G, S.qlog);
  const last = new Set();
  const hist = G.history || [];
  if (hist.length) { const lt = hist[hist.length - 1].t; for (let i = hist.length - 1; i >= 0 && hist[i].t === lt; i--) last.add(hist[i].i); }
  const col = String(G.cur_team + 1);
  const action = myTurn && G.phase === "action";
  let tgt = null, pick = null, bset = null, hint = "";
  if (action && S.pick) {
    const opp = String(2 - G.cur_team), b = G.board; tgt = new Set();
    if (S.pick.step === 2) { const r = Math.floor(S.pick.i / 15), c = S.pick.i % 15; pick = new Set([S.pick.i]); for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { const rr = r + dr, cc = c + dc; if ((dr || dc) && rr >= 0 && rr < 15 && cc >= 0 && cc < 15 && b[rr * 15 + cc] === "0") tgt.add(rr * 15 + cc); } hint = "옮길 <b style='color:var(--gold1)'>바로 옆 빈칸</b>을 누르세요"; }
    else if (TARGET[S.pick.k] === "opp") { for (let i = 0; i < 225; i++) if (b[i] === opp) tgt.add(i); hint = `${CARD[S.pick.k][0]}: <b style='color:var(--gold1)'>상대 돌</b>을 누르세요`; }
    else if (TARGET[S.pick.k] === "empty") { hint = `${CARD[S.pick.k][0]}: 막을 <b style='color:var(--gold1)'>빈칸</b>을 누르세요`; tgt = null; }
    else hint = `${CARD[S.pick.k][0]}: <b style='color:var(--gold1)'>가운데 칸</b>을 누르세요 (3×3)`;
  } else if (action) {
    bset = bans(G.board, col);
    hint = G.turn?.stones > 1 ? `돌 ${G.turn.stones}개 중 ${(G.turn.placed || 0) + 1}번째를 놓으세요` : "돌을 놓을 자리를 누르세요";
  } else if (myTurn && G.phase === "quiz") hint = "OX퀴즈!";
  else if (player && G.status === "live") hint = G.cur_team === mt ? `우리 팀 ${esc(nameOf(G.cur_player))} 차례예요` : `상대 팀 차례예요`;
  const bo = boardHTML({ board: G.board, last, walls: G.walls, turnNo: G.turn_no, bans: bset, tgt, pick, click: action });
  const top = `<div class="gtop"><span class="mode">${modeLabel(G)}</span>${player ? "" : `<span class="spec-tag">👀 관전 중</span>`}<div class="turn">${turnText(G, S.me.id)}</div>${timerHTML(G)}</div>`;
  const sq = G.phase === "quiz" || (G.quiz && G.quiz.result) ? specQ(G, qres) : "";
  let right = "";
  if (player) right = handHTML(G, mt, myTurn);
  else right = (PH ? sq : "") + chatboxHTML();
  const feed = `<div class="feed">${S.feed.map(t => `<div>${esc(t)}</div>`).join("")}</div>`;
  let over = "";
  if (myTurn && G.phase === "quiz" && G.quiz) over = quizHTML(G);
  else if (G.phase === "mission" && G.mission) over = missionHTML(G);
  if (S.vert) {
    const bottom = player ? handRowHTML(G, mt, myTurn) : chatboxHTML();
    const last1 = S.feed.length ? `<div class="feed1">${esc(S.feed[S.feed.length - 1])}</div>` : "";
    return `<div class="g">${top}<div class="strip2">${teamBox(G, 0, { mini: true, qres })}${teamBox(G, 1, { mini: true, qres })}</div>
      <div class="boardbox">${sq && !(myTurn && G.phase === "quiz") ? sq : ""}${hint ? `<div class="hint">${hint}</div>` : ""}${bo}${last1}</div>${bottom}</div>${over}`;
  }
  return `<div class="g">${top}<div class="col">${teamBox(G, 0, { qres })}${teamBox(G, 1, { qres })}</div>
    <div class="boardbox">${!PH && sq && !(myTurn && G.phase === "quiz") ? sq.replace('class="spec-q"', 'class="spec-q" style="max-width:680px"') : ""}${hint ? `<div class="hint">${hint}</div>` : ""}${bo}</div>
    <div class="col">${right}</div>${feed}</div>${over}`;
}
function handHTML(G, mt, myTurn) {
  const hand = S.view?.hand || [], PH = S.dev === "phone", cw = PH ? 88 : 140;
  const canUse = myTurn && G.phase === "action" && !G.turn?.card && !(G.turn?.placed > 0);
  const cards = hand.map(c => card(c.k, { w: cw, cls: (S.pick?.uid === c.u ? "sel" : "shine") + (canUse ? "" : " cant"), attrs: `data-card="${c.u}"` })).join("") || `${back("empty")}`;
  let note = "";
  if (hand.length > 2) note = `<div class="note">⚠ 카드가 ${hand.length}장! 차례가 끝나면 넘친 카드는 무작위로 버려져요${myTurn ? " — 한 장을 쓰거나 버린 뒤 돌을 놓으세요" : ""}</div>`;
  else if (myTurn && G.phase === "action" && G.turn?.card) note = `<div class="note">카드를 썼어요. 이제 돌을 놓으세요!</div>`;
  else if (myTurn && G.phase === "action" && hand.length) note = `<div class="note">카드를 누르면 쓸 수 있어요 (돌 놓기 전에만)</div>`;
  const peek = S.view?.peek && S.view.peek.turn_no >= G.turn_no - 2 ? `<div class="peek">🔭 상대 카드: ${(S.view.peek.cards || []).map(c => `<img src="${cardImg(c.k)}" title="${CARD[c.k][0]}">`).join("") || "없음"}</div>` : "";
  return `<div class="handbox"><div class="lbl">🃏 우리 팀 카드함${PH ? "" : " (팀원만 보여요)"}</div><div class="cards hand-cards">${cards}</div>${note}${peek}
    ${S.pick ? `<div class="acts"><button class="btn xs gray" data-act="cancelpick">카드 취소</button></div>` : ""}</div>`;
}
function handRowHTML(G, mt, myTurn) {
  const hand = S.view?.hand || [];
  const canUse = myTurn && G.phase === "action" && !G.turn?.card && !(G.turn?.placed > 0);
  const cards = hand.map(c => card(c.k, { w: 88, cls: (S.pick?.uid === c.u ? "sel" : "shine") + (canUse ? "" : " cant"), attrs: `data-card="${c.u}"` })).join("") || back("empty");
  const note = hand.length > 2 ? `⚠ 카드 ${hand.length}장! 하나를 쓰거나 버리세요` : myTurn && G.phase === "action" && G.turn?.card ? "카드를 썼어요. 돌을 놓으세요!" : myTurn && G.phase === "action" && hand.length ? "카드를 누르면 쓸 수 있어요 (돌 놓기 전)" : "🃏 우리 팀 카드함";
  const peek = S.view?.peek && S.view.peek.turn_no >= G.turn_no - 2 ? `<div class="peek">🔭 ${(S.view.peek.cards || []).map(c => `<img src="${cardImg(c.k)}">`).join("") || "없음"}</div>` : "";
  return `<div class="handrow"><div class="hand-cards" style="display:flex;gap:8px">${cards}</div><div class="acts"><div class="hnote">${note}</div>${peek}${S.pick ? `<button class="btn xs gray" data-act="cancelpick">카드 취소</button>` : ""}</div></div>`;
}
function quizHTML(G) {
  const started = now() >= new Date(G.quiz.start).getTime();
  if (!started) return `<div class="dim"><div class="quiz panel" style="text-align:center"><div class="big outline" style="font:40px 'Black Han Sans'">❓ 내 차례! OX퀴즈</div><div style="font:18px Jua;margin-top:8px">맞히면 카드 1장!</div></div></div>`;
  return `<div class="dim"><div class="quiz panel"><div class="ql"><div class="qhead"><span class="chip blue">📘 ${esc(G.quiz.subject)}</span><span class="chip gold">맞히면 카드 1장!</span><span class="qtimer" id="qtimer"></span></div><div class="qtext">${esc(G.quiz.q)}</div><div class="qbar"><i id="qbar" style="width:100%"></i></div></div>
    <div class="ox"><button class="o" data-ans="O" ${S.answered ? "disabled" : ""}>O</button><button class="x" data-ans="X" ${S.answered ? "disabled" : ""}>X</button></div></div></div>`;
}
function missionHTML(G) {
  const mine = G.cur_player === S.me.id;
  return `<div class="fx" style="background:radial-gradient(circle at 50% 30%,#fff3b0ee,#ffb300ee 60%,#b87400f0);cursor:default"><div class="burst gold"></div><div class="big outline">✨ 황금카드 찬스! ✨</div>
   <div class="mission-box"><div style="font:24px Jua">🎯 ${mine ? "미션! 지금 바로 해보세요" : "미션"}</div><div style="font:700 20px/1.45 Pretendard;margin:8px 0;word-break:keep-all">${esc(G.mission.text)}</div><div class="mtimer" id="mtimer"></div><div style="font:15px Jua;color:var(--ink2)" id="mnote">⏳ 선생님이 확인해요</div></div>
   <div class="who-line" style="color:var(--ink)">${esc(teamName(G, G.cur_team))} <b>${esc(nameOf(G.cur_player))}</b> 도전!</div></div>`;
}
function chatboxHTML() {
  return `<div class="chatbox"><h4>💬 관전 채팅<span>선수는 못 봐요</span></h4><div class="msgs" id="msgs">${chatMsgsHTML()}</div><form class="in" id="gchat"><input id="gchatin" maxlength="80" placeholder="${S.me.muted ? "채팅 금지 중" : "관전자끼리 채팅…"}" ${S.me.muted ? "disabled" : ""}><button class="btn xs purple">↵</button></form></div>`;
}
const chatMsgsHTML = () => S.chat.filter(m => !m.hidden).slice(-30).map(m => m.sid === "teacher" ? `<div class="msg t"><b>선생님</b>${esc(m.text)}</div>` : `<div class="msg"><b>${esc(m.name)}</b>${esc(m.text)}</div>`).join("");
function renderChatMsgs() { const m = $("#msgs"); if (m) { m.innerHTML = chatMsgsHTML(); m.scrollTop = m.scrollHeight; } }
function winHTML(G) {
  const w = G.winner, big = S.dev === "phone" ? 46 : 90;
  const qs = [...S.qlog.values()];
  const cardsUsed = (G.events || []).filter(e => e.type === "card_use").length;
  const title = w === -1 || w == null ? "무승부!" : `${esc(teamName(G, w))} 승리!`;
  const mem = w >= 0 ? G.teams[w].players : [...G.teams[0].players, ...G.teams[1].players];
  const m = DATA.matches.find(x => x.id === G.match_id);
  const sub = G.mode === "tournament" && m && w >= 0 ? (m.round === 3 ? "🏆 최종 우승!" : m.round === 2 ? "결승 진출!" : "4강 진출!") : (S.me && myTeam() === w ? "우리 팀이 이겼어요!" : "수고했어요!");
  const conf = Array.from({ length: 36 }, (_, i) => `<span class="confetti" style="left:${(i * 37) % 100}%;background:${["#ffe27a", "#fff", "#3d8bff", "#3ccf6e", "#ff7ac8"][i % 5]};animation-delay:${(i * .13) % 3}s;animation-duration:${2 + (i % 5) * .4}s"></span>`).join("");
  return `<div class="win">${conf}<div class="crown" style="font-size:${S.dev === "phone" ? 36 : 64}px;animation:bob 1.2s infinite">👑</div><div class="wt outline">${title}</div><div style="font:21px Jua;color:#fff;margin-top:6px">${sub} · <span id="winsec">12</span>초 뒤 교실로 돌아가요</div>
   <div class="podium">${mem.map((p, i) => `<div class="who" style="animation:bob 1.2s ${i * .2}s infinite">${av(p, big, w === 1 ? "#3d8bff" : "#ff5a5f")}<span class="nametag">${esc(nameOf(p))}</span></div>`).join("")}</div>
   <div class="stats"><div>⏱ ${G.turn_no + 1}턴</div><div>✅ 정답 ${qs.filter(q => q.result === "correct").length}개</div><div>🃏 카드 사용 ${cardsUsed}번</div></div><button class="btn gold" data-act="towin">🏫 교실로</button></div>`;
}

/* 오버레이: 대진표·카드도감 */
function overlayHTML() {
  if (S.overlay === "bracket") return `<div class="overlay"><div class="dex"><div class="dex-head"><div class="outline" style="font:24px Jua">🏆 1-1반 협동오목 토너먼트</div><button class="btn xs white" data-act="closeov" style="margin-left:auto">✕</button></div><div style="flex:1;min-height:0;overflow:auto">${S.vert ? bracketList() : bracketGame(S.dev)}</div></div></div>`;
  if (S.overlay?.startsWith("dex")) {
    const gold = S.overlay === "dexg", W = DATA.settings.weights || {};
    const set = gold ? W.golden || {} : W.chance || {}, tot = Object.values(set).reduce((a, b) => a + Math.max(0, +b), 0) || 1;
    const keys = gold ? GOLD_KEYS : CHANCE_KEYS;
    return `<div class="overlay"><div class="dex"><div class="dex-head"><div class="outline" style="font:26px Jua">🃏 카드 도감</div><div class="tabs" style="margin-left:auto"><span class="tab ${gold ? "" : "on"}" data-act="dexc">찬스카드</span><span class="tab ${gold ? "on" : ""}" data-act="dexg">★ 황금카드</span></div><button class="btn xs white" data-act="closeov">✕</button></div>
      ${gold ? `<div class="help" style="text-align:center;color:#fff;padding:4px">토너먼트에서 정답을 맞히면 ${esc(DATA.settings.golden_rate ?? 5)}% 확률로 황금카드 미션이 나와요 (선생님이 볼 때만)</div>` : ""}
      <div class="dex-grid">${keys.map(k => card(k, { pct: Math.round(Math.max(0, +(set[k] || 0)) / tot * 100), attrs: `data-info="${k}"` })).join("")}</div></div></div>`;
  }
  return "";
}
function infoHTML(k, { use = false, uid } = {}) {
  const w = S.dev === "phone" ? 90 : 150, shield = k === "shield";
  return `<div class="confirm" data-act="closeinfo"><div class="panel" data-act="noop">${card(k, { w })}<div class="t">${esc(CARD[k][0])}</div><div class="d">${esc(CARD[k][1])}</div>
    <div class="row">${use && !shield ? `<button class="btn red sm" data-use="${uid}">⚡ 사용하기</button>` : ""}${use ? `<button class="btn white sm" data-discard="${uid}">🗑 버리기</button>` : ""}<button class="btn gray sm" data-act="closeinfo">닫기</button></div>
    ${use && shield ? `<div class="help">방어막은 카드함에 두기만 하면 자동으로 막아줘요</div>` : ""}</div></div>`;
}

/* ═══ 그리기 ═══ */
function render() {
  if (S.screen === "login") { stage.innerHTML = loginHTML(); $("#loginForm").onsubmit = doLogin; return; }
  if (S.screen === "plaza") {
    stage.innerHTML = plazaHTML() + overlayHTML() + `<div id="infolayer"></div><div id="toasts"></div>`;
    renderPlazaHud(); updateWalkers();
    return;
  }
  if (S.screen === "game") {
    if (!$("#gscreen")) stage.innerHTML = `<div class="screen" id="gscreen"></div><div id="fxlayer"></div><div id="ovl"></div><div id="infolayer"></div><div id="toasts"></div>`;
    const ci0 = $("#gchatin"), keepChat = ci0?.value || "", focused = document.activeElement === ci0;
    $("#gscreen").innerHTML = gameHTML(); $("#ovl").innerHTML = overlayHTML();
    const ci = $("#gchatin"); if (ci) { ci.value = keepChat; if (focused) ci.focus(); }
    renderChatMsgs();
  }
}

/* ═══ 입력 ═══ */
stage.addEventListener("submit", e => {
  if (e.target.id === "chatbar") { e.preventDefault(); sendChat("plaza", $("#chatin")); }
  if (e.target.id === "gchat") { e.preventDefault(); sendChat("game:" + S.gameId, $("#gchatin")); }
});
stage.addEventListener("click", async e => {
  const t = e.target;
  if (S.screen === "plaza" && t.id === "roombg") { S.menu = null; renderMenu(); renderPlazaHud(); onPlazaTap(e); return; }
  const el = t.closest("[data-act],[data-menu],[data-q],[data-ov],[data-card],[data-use],[data-discard],[data-ans],[data-info],.cell,#menubtn");
  if (!el) return;
  if (el.id === "menubtn") { S.menu = S.menu ? null : "game"; S.menuFresh = !!S.menu; renderPlazaHud(); return; }
  if (el.dataset.menu) { S.menu = S.menu === el.dataset.menu ? null : el.dataset.menu; renderPlazaHud(); return; }
  if (el.dataset.q) { if (el.disabled) return; try { await rpc("omok_queue_join", { p_token: S.token, p_mode: el.dataset.q }); S.menu = null; await loadQueue(); renderPlazaHud(); } catch (er) { toast(er.message, "err"); } return; }
  if (el.dataset.ov) { S.overlay = el.dataset.ov === "dex" ? "dexc" : el.dataset.ov; S.menu = null; render(); return; }
  if (el.dataset.info) { $("#infolayer").innerHTML = infoHTML(el.dataset.info); return; }
  if (el.dataset.ans) { answer(el.dataset.ans, el); return; }
  if (el.dataset.card) { onCardTap(el.dataset.card); return; }
  if (el.dataset.use) { $("#infolayer").innerHTML = ""; useCard(el.dataset.use); return; }
  if (el.dataset.discard) { $("#infolayer").innerHTML = ""; try { await rpc("omok_discard", { p_token: S.token, p_game: S.gameId, p_uid: el.dataset.discard }); } catch (er) { toast(er.message, "err"); } return; }
  if (el.classList.contains("cell")) { onCell(+el.dataset.i); return; }
  const a = el.dataset.act;
  if (a === "leaveq") { try { await rpc("omok_queue_leave", { p_token: S.token }); await loadQueue(); onQueue(); } catch (er) { toast(er.message, "err"); } }
  else if (a === "closeov") { S.overlay = null; render(); }
  else if (a === "dexc" || a === "dexg") { S.overlay = a; render(); }
  else if (a === "closeinfo") $("#infolayer").innerHTML = "";
  else if (a === "noop") return;
  else if (a === "cancelpick") { S.pick = null; render(); }
  else if (a === "towin") { S.winUntil = 0; }
  else if (a === "spectate") { S.overlay = null; render(); }
  else if (a === "logout") { LS.del("omok_token"); location.reload(); }
});
async function answer(ans, btn) {
  if (S.answered) return; S.answered = true;
  $$(".ox button").forEach(b => b.disabled = true); btn.classList.add("picked");
  try { await rpc("omok_answer", { p_token: S.token, p_game: S.gameId, p_ans: ans }); }
  catch (e) { toast(e.message, "err"); }
}
function onCardTap(uid) {
  const G = S.G, c = (S.view?.hand || []).find(x => x.u === uid); if (!c) return;
  const myTurn = G.cur_player === S.me.id && G.phase === "action" && G.status === "live";
  const canUse = myTurn && !G.turn?.card && !(G.turn?.placed > 0);
  if (S.pick?.uid === uid) { S.pick = null; render(); return; }
  $("#infolayer").innerHTML = infoHTML(c.k, { use: myTurn && (canUse || (S.view.hand.length > 2)), uid });
  if (!canUse) { const b = $(`[data-use="${uid}"]`); if (b) b.remove(); }
}
async function useCard(uid) {
  const c = (S.view?.hand || []).find(x => x.u === uid); if (!c) return;
  if (TARGET[c.k]) { S.pick = { uid, k: c.k, step: 1 }; render(); return; }
  await fireCard(uid, {});
}
async function fireCard(uid, params) {
  const k = (S.view?.hand || []).find(x => x.u === uid)?.k;
  S.pick = null;
  try {
    const r = await rpc("omok_use_card", { p_token: S.token, p_game: S.gameId, p_uid: uid, p_params: params });
    if (k === "spy" && r?.peek) fx(`<div class="burst"></div><div class="big outline">🔭 상대 카드함</div><div style="display:flex;gap:12px;position:relative">${r.peek.length ? r.peek.map(c => card(c.k, { w: S.dev === "phone" ? 90 : 150 })).join("") : `<div class="who-line">텅 비어 있어요!</div>`}</div><div class="desc">우리 팀만 봤어요 🤫</div>`, 3500);
    if (k === "steal" && r?.got) fx(`<div class="burst"></div><div class="big outline">🧤 훔쳐왔다!</div><div class="flipin">${card(r.got.k, { w: S.dev === "phone" ? 110 : 180 })}</div>`, 2500);
  } catch (e) { toast(e.message, "err"); }
  render();
}
async function onCell(i) {
  const G = S.G; if (!G || G.cur_player !== S.me.id || G.phase !== "action") return;
  if (S.pick) {
    const p = S.pick, b = G.board, opp = String(2 - G.cur_team), T = TARGET[p.k];
    if (p.k === "move") {
      if (p.step === 1) { if (b[i] !== opp) return toast("상대 돌을 고르세요", "err"); S.pick = { ...p, step: 2, i }; render(); return; }
      return fireCard(p.uid, { i: p.i, j: i });
    }
    if (T === "opp" && b[i] !== opp) return toast("상대 돌을 고르세요", "err");
    if (T === "empty" && b[i] !== "0") return toast("빈칸을 고르세요", "err");
    return fireCard(p.uid, { i });
  }
  if (G.board[i] !== "0") return;
  const cell = $(`.cell[data-i="${i}"]`);
  if (cell && !cell.innerHTML) cell.innerHTML = `<div class="st ${G.cur_team ? "w" : "k"} fresh" style="opacity:.6"></div>`;
  try { await rpc("omok_place", { p_token: S.token, p_game: S.gameId, p_i: i }); }
  catch (e) { toast(e.message, "err"); if (cell) cell.innerHTML = G.board[i] === "0" ? "" : cell.innerHTML; render(); }
}

/* ═══ 매 0.25초: 시계·타이머·시간 넘기기 ═══ */
function loop() {
  const t = Date.now();
  if (S.screen === "plaza") {
    if (DATA.queue.some(q => q.sid === S.me.id) && t - S.lastLobby > 3000) { S.lastLobby = t; sb.rpc("omok_lobby_tick").then(({ data }) => { if (data) loadSettings().then(onSettings); }); }
    if (t % 1000 < 260) updateWalkers();
    return;
  }
  if (S.screen !== "game") return;
  if (S.endG) {
    const l = Math.ceil((S.winUntil - t) / 1000); const ws = $("#winsec"); if (ws) ws.textContent = Math.max(0, l);
    if (t >= S.winUntil) leaveGame();
    return;
  }
  const G = S.G; if (!G) return;
  const tm = $(".gtop .timer"); if (tm) tm.outerHTML = timerHTML(G);
  if (G.phase === "intro") { const n = $("#vsnum"); if (n) n.textContent = Math.ceil(leftSec(G.deadline)); }
  if (G.phase === "order") {
    const el = 8 - leftSec(G.deadline), n = [0, 1].flatMap(t => [0, 1, 2, 3].map(i => el >= 1.2 + t * 2.6 + i * .8)).filter(Boolean).length;
    if (n !== S.orderN) { S.orderN = n; const o = $("#gscreen"); if (o) o.innerHTML = orderHTML(G); }
  }
  if (G.phase === "quiz" && G.cur_player === S.me.id) {
    const started = now() >= new Date(G.quiz.start).getTime();
    if (started && !$("#qbar")) { const o = $("#gscreen"); if (o) o.innerHTML = gameHTML(); }
    const bar = $("#qbar"), l = leftSec(G.deadline); if (bar) bar.style.width = Math.min(100, l / (G.quiz.secs || 5) * 100) + "%";
    const qt = $("#qtimer"); if (qt) qt.textContent = Math.ceil(l) + "초";
  }
  if (G.phase === "mission" && G.mission) {
    const l = leftSec(G.mission.do_until), mt = $("#mtimer"), mn = $("#mnote");
    if (mt) mt.textContent = l > 0 ? Math.ceil(l) : "✋";
    if (mn && l <= 0) mn.textContent = "⏳ 선생님이 확인 중이에요…";
  }
  // 마감이 지났으면 누구든 서버에 "다음 단계로" 요청 (서버가 시간 확인)
  if (G.status === "live" && G.deadline && now() > new Date(G.deadline).getTime() + 400 + (hash(S.me.id) % 600) && t - S.lastTick > 1500) {
    S.lastTick = t; sb.rpc("omok_tick", { p_game: G.id }).then(() => {}, () => {});
  }
}

boot();
