/* ═══ 1-1반 협동오목 — 교사 페이지 ═══ */
const T = { token: null, tab: "live", G: null, gameId: null, detail: null, qlog: new Map(), lastSeq: 0, feed: [], chat: [], plazaChat: [],
  presence: {}, stu: [], quiz: [], qstats: {}, missions: [], grpEdit: null, sel: null, lastTick: 0, dirty: false };
const LS = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} }, del: k => { try { localStorage.removeItem(k); } catch (e) {} } };
const app = $("#tapp");
const vert = () => innerWidth < 760;
function setBodyClass() { document.body.className = "tbody " + (vert() ? "tphone vert vert-t" : "pc"); }
addEventListener("resize", () => { const v = document.body.classList.contains("vert"); setBodyClass(); if (v !== vert()) render(); else fitLive(); });

/* ─── 로그인 ─── */
function loginHTML(msg = "") {
  return `<div class="tlogin"><form class="panel" id="tlf"><div style="font:28px Jua">🧑‍🏫 교사 페이지</div><div class="help">1-1반 협동오목 관리</div>
    <input type="password" id="tcode" placeholder="교사 암호" autocomplete="current-password"><button class="btn green" style="width:100%">들어가기</button>
    <div style="font:14px Jua;color:var(--red-d);margin-top:8px">${esc(msg)}</div><a href="index.html" class="help" style="display:block;margin-top:10px">← 학생 화면</a></form></div>`;
}
async function boot() {
  setBodyClass();
  const tok = LS.get("omok_ttoken");
  if (tok) { try { const me = await rpc("omok_me", { p_token: tok }); if (me?.role === "teacher") { T.token = tok; return start(); } } catch (e) {} LS.del("omok_ttoken"); }
  app.innerHTML = loginHTML();
}
app.addEventListener("submit", async e => {
  if (e.target.id === "tlf") {
    e.preventDefault();
    try { const r = await rpc("omok_t_login", { p_code: $("#tcode").value }); T.token = r.token; LS.set("omok_ttoken", r.token); start(); }
    catch (er) { app.innerHTML = loginHTML(er.message); }
  }
});
async function start() {
  await Promise.all([syncTime(), loadRoster(), loadGroups(), loadSettings(), loadQueue(), loadMatches(), loadStudents()]);
  subscribe(); joinPlaza();
  const gid = curGameId(); if (gid) await enterGame(gid);
  const { data } = await sb.from("omok_chat").select("*").eq("room", "plaza").order("id", { ascending: false }).limit(40); T.plazaChat = (data || []).reverse();
  T.tab = LS.get("omok_ttab") || "live";
  render();
  ping(); setInterval(ping, 10000);
  setInterval(loop, 300); setInterval(poll, 4000); setInterval(syncTime, 60000);
}
const ping = () => sb.rpc("omok_t_ping", { p_token: T.token }).then(() => {}, () => {});
async function loadStudents() { try { T.stu = await rpc("omok_t_students", { p_token: T.token }); } catch (e) { if (e.code === "teacher_only") { LS.del("omok_ttoken"); location.reload(); } } }

/* ─── 실시간 ─── */
function subscribe() {
  sb.channel("omok_db_t")
    .on("postgres_changes", { event: "*", schema: "public", table: "omok_settings" }, p => { if (p.new?.id) { DATA.settings[p.new.id] = p.new.value; onSettings(p.new.id); } })
    .on("postgres_changes", { event: "*", schema: "public", table: "omok_queue" }, () => loadQueue().then(() => { renderSide(); if (T.tab === "room") updateWalkers(); if (T.tab === "set") render(); }))
    .on("postgres_changes", { event: "*", schema: "public", table: "omok_matches" }, () => loadMatches().then(() => { if (T.tab === "tbracket") render(); }))
    .on("postgres_changes", { event: "*", schema: "public", table: "omok_games" }, p => { if (p.new?.id === T.gameId) onGame(p.new); })
    .on("postgres_changes", { event: "*", schema: "public", table: "omok_chat" }, p => onChat(p.new, p.eventType))
    .subscribe();
}
async function poll() {
  const before = curGameId(); await loadSettings();
  if (curGameId() !== before) onSettings("current_game");
  if (T.gameId) { const { data } = await sb.from("omok_games").select("*").eq("id", T.gameId).maybeSingle(); if (data && (data.seq !== T.G?.seq || data.status !== T.G?.status)) onGame(data); }
}
function onSettings(k) {
  if (k === "current_game") { const g = curGameId(); if (g && g !== T.gameId) enterGame(g).then(render); else if (!g && T.G && T.G.status === "live") { T.G = null; T.gameId = null; render(); } else renderSide(); return; }
  renderSide();
}
let plazaCh = null;
function joinPlaza() {
  plazaCh = sb.channel("omok_plaza", { config: { presence: { key: "teacher" } } });
  plazaCh.on("presence", { event: "sync" }, () => { T.presence = plazaCh.presenceState(); renderSide(); if (T.tab === "room") updateWalkers(); if (T.tab === "students") render(); })
    .subscribe(st => { if (st === "SUBSCRIBED") plazaCh.track({ id: "teacher", name: "선생님", x: 50, y: 70 }).catch(() => {}); });
}
const online = () => { const o = {}; for (const [k, v] of Object.entries(T.presence)) { const m = v[v.length - 1]; if (m) o[k] = m; } return o; };

/* ─── 게임 ─── */
async function enterGame(id) {
  const { data } = await sb.from("omok_games").select("*").eq("id", id).maybeSingle(); if (!data) return;
  T.gameId = id; T.G = data; T.qlog = new Map(); T.lastSeq = data.seq; T.feed = [];
  quizLog(data, T.qlog); await loadDetail();
  const { data: ch } = await sb.from("omok_chat").select("*").eq("room", "game:" + id).order("id", { ascending: false }).limit(40); T.chat = (ch || []).reverse();
}
async function loadDetail() { try { T.detail = await rpc("omok_t_game_detail", { p_token: T.token, p_game: T.gameId }); } catch (e) { T.detail = null; } }
async function onGame(G) {
  const prev = T.G; T.G = G; quizLog(G, T.qlog);
  if (G.seq !== prev?.seq) await loadDetail();
  const evs = (G.events || []).filter(e => e.seq > T.lastSeq).sort((a, b) => a.seq - b.seq);
  T.lastSeq = Math.max(T.lastSeq, G.seq);
  evs.forEach(e => { const t = evText(G, e); if (t) { T.feed.push(t); T.feed = T.feed.slice(-12); } if (e.type === "mission") { try { new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=").play(); } catch (er) {} } });
  if (T.tab === "live") renderLive(); else renderSide();
}
function onChat(m, type) {
  if (!m) return;
  const list = m.room === "plaza" ? T.plazaChat : (T.gameId && m.room === "game:" + T.gameId ? T.chat : null);
  if (!list) return;
  const i = list.findIndex(x => x.id === m.id); if (i >= 0) list[i] = m; else list.push(m);
  if (list.length > 60) list.splice(0, list.length - 60);
  if (m.room === "plaza" && type === "INSERT" && !m.hidden) T.bubbles = { ...(T.bubbles || {}), [m.sid]: { text: m.text, until: Date.now() + 6000 } };
  if (T.tab === "room") updateWalkers();
  if (T.tab === "live") { const b = $("#tmsgs"); if (b) { b.innerHTML = msgsHTML(T.chat); b.scrollTop = 1e6; } }
  if (T.tab === "set") renderChatAdmin();
}

/* ═══ 공통 틀 ═══ */
const TS = [["live", "🎮", "실시간 관전"], ["room", "🏫", "우리반"], ["students", "👥", "학생 명단"], ["groups", "🧩", "조 편성"], ["tbracket", "🏆", "대진표"], ["tquiz", "❓", "OX문제"], ["tmission", "🎯", "미션"], ["prob", "🃏", "카드 확률"], ["set", "⚙️", "채팅·설정"]];
const gameOn = () => DATA.settings.game_enabled !== false && DATA.settings.game_enabled !== "false";
function sideHTML() {
  const n = Object.keys(online()).filter(k => k !== "teacher").length;
  return `<div class="brand">🎲 협동오목 · 교사</div>${TS.map(([k, i, l]) => `<a class="${k === T.tab ? "on" : ""}" data-tab="${k}"><i>${i}</i>${l}</a>`).join("")}
   <div class="sw"><span class="switch ${gameOn() ? "" : "off"}" data-act="toggleGame"><i></i>${gameOn() ? "게임 가능" : "게임 불가능"}</span><br>접속 ${n} / ${DATA.roster.length}명 · 대기 ${DATA.queue.length}명<br>${curGameId() ? `<span style="color:#ff9aa2">● 게임 진행 중</span><br>` : ""}<span style="color:var(--gold1)">✨ 황금카드 활성 (이 페이지 열림)</span><br><a data-act="logout" style="padding:4px 0;font-size:12px">로그아웃</a></div>`;
}
function renderSide() { const s = $(".t-side"); if (s) s.innerHTML = sideHTML(); }
function render() {
  if (!T.token) return;
  app.innerHTML = `<div class="teacher"><nav class="t-side">${sideHTML()}</nav><div class="t-main" id="tmain"></div></div><div id="tpop"></div>`;
  const m = $("#tmain");
  ({ live: pageLive, room: pageRoom, students: pageStudents, groups: pageGroups, tbracket: pageBracket, tquiz: pageQuiz, tmission: pageMission, prob: pageProb, set: pageSet }[T.tab] || pageLive)(m);
}
app.addEventListener("click", async e => {
  const a = e.target.closest("[data-tab],[data-act]"); if (!a) return;
  if (a.dataset.tab) { if (T.dirty && !confirm("저장하지 않은 변경이 있어요. 이동할까요?")) return; T.dirty = false; T.tab = a.dataset.tab; LS.set("omok_ttab", T.tab); T.grpEdit = null; render(); return; }
  const act = a.dataset.act;
  try {
    if (act === "toggleGame") { await rpc("omok_t_set", { p_token: T.token, p_key: "game_enabled", p_value: !gameOn() }); DATA.settings.game_enabled = !gameOn(); renderSide(); if (T.tab === "set") render(); toast(gameOn() ? "게임을 켰어요" : "게임을 껐어요 (대기열도 비웠어요)", "ok"); }
    else if (act === "logout") { LS.del("omok_ttoken"); location.reload(); }
    else if (ACTIONS[act]) await ACTIONS[act](a, e);
  } catch (er) { toast(er.message, "err"); }
});
const ACTIONS = {};

/* ═══ 🎮 실시간 관전 ═══ */
function pageLive(m) {
  m.innerHTML = `<div class="t-h"><h2>🎮 실시간 관전</h2><span id="livechip"></span><button class="btn xs red" data-act="abort">⛔ 게임 중단</button></div>
   <div class="t-live"><div class="livebox" id="livebox"></div><div class="col-r" id="liver"></div></div>`;
  renderLive();
}
function renderLive() {
  renderSide();
  const box = $("#livebox"), right = $("#liver"), chip = $("#livechip"); if (!box) return;
  const G = T.G;
  if (!G) {
    chip.innerHTML = `<span class="chip">대기 중</span>`;
    box.innerHTML = `<div class="no-game"><div class="outline" style="font:30px Jua">지금은 게임이 없어요</div><div>학생들이 매칭하거나, [🏆 대진표]에서 경기를 시작하면 여기에 나와요</div></div>`;
    right.innerHTML = queueCard() + chatCard("💬 교실 채팅 (최근)", T.plazaChat, false);
    return;
  }
  chip.innerHTML = G.status === "live" ? `<span class="chip red">● LIVE ${esc(modeLabel(G))}</span>` : `<span class="chip gold">끝남 · ${G.winner >= 0 ? esc(teamName(G, G.winner)) + " 승" : "무승부/중단"}</span>`;
  box.innerHTML = `<div class="stage-in tablet" id="livein" style="width:1100px;height:720px">${liveGame(G)}</div>`;
  fitLive();
  const d = T.detail || {};
  let appr = "";
  if (G.status === "live" && G.phase === "mission" && G.mission) appr = `<div class="approve"><h3>✨ 황금카드 미션 확인</h3><div style="font:600 14px Pretendard;margin:4px 0 8px">${esc(teamName(G, G.cur_team))} <b>${esc(nameOf(G.cur_player))}</b> — "${esc(G.mission.text)}"</div><div style="display:flex;gap:8px;align-items:center"><button class="btn sm green" data-act="judgeOk">⭕ 승인</button><button class="btn sm red" data-act="judgeNo">❌ 거절(패스)</button><span id="jtimer" style="font:24px 'Black Han Sans';color:var(--red);margin-left:auto"></span></div></div>`;
  const hands = (d.hands || [[], []]).map((h, t) => `<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;font:14px Jua;flex-wrap:wrap">${t ? "⚪" : "⚫"} ${esc(teamName(G, t))} ${h.length ? h.map(c => `<span class="mini ${c.g ? "gold" : ""}"><img src="${cardImg(c.k)}">${esc(CARD[c.k][0])}</span>`).join("") : `<span class="help" style="margin:0">없음</span>`}</div>`).join("");
  const q = G.quiz ? `<div class="t-card"><h3>❓ 현재 문제</h3><div style="font:600 14px Pretendard">[${esc(G.quiz.subject)}] ${esc(G.quiz.q)}</div><div style="margin-top:4px;font:16px Jua">정답 <span class="${d.ans === "O" ? "ok" : "x"}">${esc(d.ans || "?")}</span>${d.expl ? ` · ${esc(d.expl)}` : ""} ${G.quiz.result ? `· ${qMark(G.quiz.result)}` : ""}</div></div>` : "";
  right.innerHTML = appr + `<div class="t-card"><h3>🃏 양 팀 카드함 (교사만)</h3>${hands}</div>` + q +
    `<div class="t-card"><h3>📜 기록</h3><div style="font:13px Jua;line-height:1.7;max-height:150px;overflow:auto">${T.feed.slice().reverse().map(t => `<div>${esc(t)}</div>`).join("") || "<div class='help'>아직 없어요</div>"}</div></div>` +
    chatCard("💬 관전 채팅", T.chat, true);
  const mm = $("#tmsgs"); if (mm) mm.scrollTop = 1e6;
}
function fitLive() { const b = $("#livebox"), i = $("#livein"); if (!b || !i) return; const k = Math.min(b.clientWidth / 1100, b.clientHeight / 720); i.style.transform = `scale(${k})`; }
function liveGame(G) {
  if (G.phase === "intro" || G.phase === "order") return `<div class="order"><div class="outline" style="font:44px 'Black Han Sans'">${G.phase === "intro" ? "🏆 곧 시작해요" : "🎰 순서 뽑는 중"}</div><div style="font:22px Jua;color:#fff;margin-top:10px">${esc(teamName(G, 0))} (흑) vs ${esc(teamName(G, 1))} (백)</div><div class="outline" style="font:60px 'Black Han Sans';margin-top:10px" id="ordnum"></div></div>`;
  const qres = quizLog(G, T.qlog), last = new Set(), h = G.history || [];
  if (h.length) { const lt = h[h.length - 1].t; for (let i = h.length - 1; i >= 0 && h[i].t === lt; i--) last.add(h[i].i); }
  const d = T.detail || {};
  const handCol = [0, 1].map(t => `<div class="handbox" style="width:100%"><div class="lbl">${t ? "⚪" : "⚫"} ${esc(teamName(G, t))} 카드</div><div class="cards" style="flex-direction:row;gap:8px">${(d.hands?.[t] || []).map(c => card(c.k, { w: 96 })).join("") || back("empty")}</div></div>`).join("");
  return `<div class="g"><div class="gtop"><span class="mode">${esc(modeLabel(G))}</span><div class="turn">${turnText(G, "")}</div>${timerHTML(G)}</div>
    <div class="col">${teamBox(G, 0, { qres })}${teamBox(G, 1, { qres })}</div>
    <div class="boardbox">${G.quiz ? specQ(G, qres) : ""}${boardHTML({ board: G.board, last, walls: G.walls, turnNo: G.turn_no })}</div>
    <div class="col">${handCol}</div></div>`;
}
function queueCard() {
  const by = {}; DATA.queue.forEach(q => (by[q.mode] = by[q.mode] || []).push(q));
  const L = { solo: "⚔️ 1:1", random: "🎲 3:3 랜덤", group: "🛡️ 조별" };
  return `<div class="t-card"><h3>🎲 매칭 대기열 <span class="chip">${DATA.queue.length}명</span></h3>${Object.keys(by).length ? Object.entries(by).map(([k, a]) => `<div style="font:14px Jua;margin:4px 0">${L[k]}: ${a.map(q => esc(nameOf(q.sid)) + (k === "group" ? `(${esc(grpName(q.grp))})` : "")).join(", ")}</div>`).join("") : `<div class="help">대기 중인 학생이 없어요</div>`}
    <div class="row"><button class="btn xs" data-act="force">⏩ 지금 시작 (모인 인원으로)</button><button class="btn xs gray" data-act="qclear">대기열 비우기</button></div></div>`;
}
const msgsHTML = list => list.filter(m => !m.hidden).slice(-40).map(m => m.sid === "teacher" ? `<div class="msg t"><b>선생님</b>${esc(m.text)}</div>` : `<div class="msg"><b>${esc(m.name)}</b>${esc(m.text)}</div>`).join("");
function chatCard(title, list, game) {
  return `<div style="height:260px;display:flex;flex-shrink:0"><div class="chatbox"><h4>${title}<span>선생님도 참여</span></h4><div class="msgs" id="tmsgs" style="overflow:auto;justify-content:flex-start">${msgsHTML(list)}</div><form class="in" id="${game ? "tgchat" : "tpchat"}"><input maxlength="80" placeholder="선생님 말은 빨간색으로 보여요"><button class="btn xs red">↵</button></form></div></div>`;
}
app.addEventListener("submit", async e => {
  if (e.target.id === "addstu") { e.preventDefault(); try { await addStudent(); } catch (er) { toast(er.message, "err"); } return; }
  const id = e.target.id; if (!["tgchat", "tpchat", "troomchat"].includes(id)) return;
  e.preventDefault(); const inp = e.target.querySelector("input"), t = inp.value.trim(); if (!t) return; inp.value = "";
  try { await rpc("omok_chat_send", { p_token: T.token, p_room: id === "tgchat" ? "game:" + T.gameId : "plaza", p_text: t }); } catch (er) { toast(er.message, "err"); }
});
ACTIONS.abort = async () => { if (!curGameId()) return toast("진행 중인 게임이 없어요"); if (!confirm("지금 게임을 중단할까요? (토너먼트 경기는 '대기'로 돌아가요)")) return; await rpc("omok_t_abort", { p_token: T.token }); toast("게임을 중단했어요", "ok"); };
ACTIONS.judgeOk = async () => { await rpc("omok_t_judge", { p_token: T.token, p_game: T.gameId, p_ok: true }); toast("⭕ 승인! 황금카드가 나가요", "ok"); };
ACTIONS.judgeNo = async () => { await rpc("omok_t_judge", { p_token: T.token, p_game: T.gameId, p_ok: false }); toast("❌ 거절했어요"); };
ACTIONS.force = async () => { const g = await rpc("omok_t_force_match", { p_token: T.token }); toast(g ? "게임을 시작했어요" : "시작할 수 있는 조합이 없어요 (1:1은 2명, 랜덤은 2명 이상, 조별은 두 조가 각 2명 이상)", g ? "ok" : "err"); };
ACTIONS.qclear = async () => { await rpc("omok_t_queue_clear", { p_token: T.token }); toast("대기열을 비웠어요", "ok"); };

/* ═══ 🏫 우리반 ═══ */
function pageRoom(m) {
  m.innerHTML = `<div class="t-h"><h2>🏫 우리반 (교실)</h2><span class="chip">매칭 대기 ${DATA.queue.length}명</span><button class="btn xs" data-act="force">⏩ 대기열 지금 시작</button></div>
    <div class="roombox"><div class="room"><div class="roombg"></div><div class="warm"></div><div id="walkers"></div>
    <div class="hud-top"><span class="plate">🏫 우리반 <small style="font-size:13px">선생님 보기</small></span><span class="chip ${gameOn() ? "green" : "gray"}" data-act="toggleGame" style="cursor:pointer">${gameOn() ? "🎮 게임 가능" : "⛔ 게임 불가"} ▾</span><span class="chip" style="margin-left:auto">👥 접속 ${Object.keys(online()).filter(k => k !== "teacher").length} / ${DATA.roster.length}</span></div>
    <form class="chatbar" id="troomchat"><input maxlength="80" placeholder="선생님 말은 빨간 말풍선으로 떠요 · 학생 캐릭터를 누르면 채팅 관리"><button class="btn red">보내기</button></form><div id="wpop"></div></div></div>`;
  updateWalkers();
}
function updateWalkers() {
  const box = $("#walkers"); if (!box) return;
  const on = online(), qs = new Set(DATA.queue.map(q => q.sid)), B = T.bubbles || {}, sz = vert() ? 36 : 50;
  box.innerHTML = Object.entries(on).map(([id, p]) => {
    const isT = id === "teacher", s = stu(id), b = B[id] && B[id].until > Date.now() ? B[id] : null;
    const x = isT ? 50 : p.x, y = Math.max(64, Math.min(95, isT ? 70 : p.y));
    return `<div class="walker ${isT ? "is-t" : "clickable"}" data-act="${isT ? "" : "wsel"}" data-id="${esc(id)}" style="left:${x}%;top:${y}%;z-index:${3 + Math.round(y)}">${b ? `<div class="bubble ${isT ? "t" : ""}">${esc(b.text)}</div>` : qs.has(id) ? `<div class="q-badge">🎲 매칭 대기</div>` : ""}<div class="who">${isT ? avatar("T-0001", sz * 1.1, "#2b3366") : av(id, sz)}<span class="nametag">${isT ? "🧑‍🏫 선생님" : esc(s.name)}${s.muted ? " 🔇" : ""}</span></div></div>`;
  }).join("");
}
ACTIONS.wsel = async a => {
  const id = a.dataset.id, s = T.stu.find(x => x.id === id) || stu(id), last = [...T.plazaChat].reverse().find(m => m.sid === id && !m.hidden);
  const w = $("#wpop"); const x = parseFloat(a.style.left), y = parseFloat(a.style.top);
  w.innerHTML = `<div class="pop" style="left:${Math.min(x, 70)}%;top:${Math.min(y, 78)}%"><b>${esc(s.name)}</b> · ${esc(grpName(s.grp) || "조 없음")} · 🟢 접속 중${last ? `<div class="help" style="margin:4px 0 0">마지막 말: ${esc(last.text)}</div>` : ""}
    <div style="display:flex;gap:6px;margin-top:6px"><button class="btn xs ${s.muted ? "green" : "red"}" data-act="mute" data-id="${esc(id)}" data-v="${s.muted ? 0 : 1}">${s.muted ? "🔊 채팅 허용" : "🔇 채팅 금지"}</button>${last ? `<button class="btn xs white" data-act="hideMsg" data-id="${last.id}">💬 말 숨기기</button>` : ""}<button class="btn xs gray" data-act="closewpop">닫기</button></div></div>`;
};
ACTIONS.closewpop = () => { $("#wpop").innerHTML = ""; };
ACTIONS.mute = async a => { await rpc("omok_t_mute", { p_token: T.token, p_id: a.dataset.id, p_mute: a.dataset.v === "1" }); await Promise.all([loadStudents(), loadRoster()]); toast(a.dataset.v === "1" ? "채팅을 막았어요" : "채팅을 허용했어요", "ok"); if ($("#wpop")) $("#wpop").innerHTML = ""; if (T.tab === "room") updateWalkers(); else render(); };
ACTIONS.hideMsg = async a => { await rpc("omok_t_chat_hide", { p_token: T.token, p_id: +a.dataset.id }); toast("말을 숨겼어요", "ok"); if ($("#wpop")) $("#wpop").innerHTML = ""; };

/* ═══ 👥 학생 명단 ═══ */
function pageStudents(m) {
  const on = online();
  m.innerHTML = `<div class="t-h"><h2>👥 학생 명단</h2><span class="chip">${T.stu.length}명</span><button class="btn xs green" data-act="stuSave">💾 표 저장</button></div>
   <div class="g2"><div class="t-card"><h3>➕ 한 명씩 추가 <span class="help" style="margin:0">휴대폰에서 바로</span></h3>
    <form class="addstu" id="addstu" autocomplete="off">
     <label>학번<input id="as_id" inputmode="numeric" placeholder="10106" maxlength="10"></label>
     <label>이름<input id="as_name" placeholder="박지호" maxlength="20"></label>
     <label>생일 8자리<input id="as_birth" inputmode="numeric" placeholder="20090315" maxlength="10"></label>
     <label>조<select id="as_grp"><option value="">나중에</option>${DATA.groups.map(g => `<option value="${g.grp}">${esc(g.name)}</option>`).join("")}</select></label>
     <button class="btn sm green">➕ 추가</button></form>
    <div class="help">추가하면 칸이 비워져서 다음 학생을 바로 적을 수 있어요. 같은 학번을 다시 적으면 그 학생 정보가 바뀌어요.</div></div>
   <div class="t-card"><h3>📋 명단 붙여넣기 (엑셀)</h3><textarea class="paste" id="stupaste" placeholder="10101	강하늘	20090312	1&#10;10102	김도윤	20090728	1"></textarea>
    <div class="help">엑셀에서 [학번 · 이름 · 생일 8자리 · 조(비워도 됨)] 순서로 복사 → 붙여넣기 → [명단 반영]. 같은 학번은 덮어써요.</div><button class="btn xs" data-act="stuPaste" style="margin-top:6px">명단 반영</button></div>
   </div>
   <div class="t-card"><h3>🧑‍🎓 학생 <span class="help" style="margin:0">칸을 고친 뒤 [💾 표 저장]</span></h3>${T.stu.length ? `<div class="tbwrap"><table class="tb" id="stutb"><tr><th>접속</th><th>학번</th><th>이름</th><th>생일</th><th>조</th><th>캐릭터 이미지 주소</th><th>채팅</th><th></th></tr>
    ${T.stu.map(s => `<tr data-id="${esc(s.id)}"><td>${on[s.id] ? "🟢" : "⚪"}</td><td>${esc(s.id)}</td><td><input data-f="name" value="${esc(s.name)}"></td><td><input data-f="birth" type="password" value="${esc(s.birth)}" style="width:100px" onfocus="this.type='text'" onblur="this.type='password'"></td>
     <td><select data-f="grp"><option value="">-</option>${DATA.groups.map(g => `<option value="${g.grp}" ${g.grp === s.grp ? "selected" : ""}>${esc(g.name)}</option>`).join("")}</select></td>
     <td style="display:flex;gap:4px;align-items:center">${avatar(s.id, 20, null, s.avatar)}<input data-f="avatar" value="${esc(s.avatar || "")}" placeholder="비우면 자동"></td>
     <td><button class="btn xs ${s.muted ? "green" : "white"}" data-act="mute" data-id="${esc(s.id)}" data-v="${s.muted ? 0 : 1}">${s.muted ? "🔊 허용" : "🔇 금지"}</button></td><td><button class="btn xs gray" data-act="stuDel" data-id="${esc(s.id)}">삭제</button></td></tr>`).join("")}</table></div>` : `<div class="empty-note">아직 학생이 없어요. 왼쪽 위에 명단을 붙여넣어 주세요.</div>`}</div>`;
  m.oninput = () => { T.dirty = true; };
}
ACTIONS.stuPaste = async () => {
  const rows = $("#stupaste").value.split(/\r?\n/).map(l => l.split(/\t|,/).map(x => x.trim())).filter(c => c[0] && c[1]);
  if (!rows.length) return toast("붙여넣은 내용이 없어요", "err");
  const bad = rows.filter(c => !/^\d{8}$/.test((c[2] || "").replace(/\D/g, "")) && !T.stu.find(s => s.id === c[0]));
  if (bad.length) return toast(`생일 8자리가 없는 줄이 있어요: ${bad.map(c => c[1]).join(", ")}`, "err");
  const n = await rpc("omok_t_students_save", { p_token: T.token, p_rows: rows.map(c => ({ id: c[0], name: c[1], birth: c[2] || "", grp: c[3] ? String(parseInt(c[3])) : (T.stu.find(s => s.id === c[0])?.grp ?? "") })) });
  await Promise.all([loadStudents(), loadRoster()]); T.dirty = false; toast(`${n}명 반영했어요`, "ok"); render();
};
async function addStudent() {
  const id = $("#as_id").value.trim(), name = $("#as_name").value.trim(), birth = $("#as_birth").value.replace(/\D/g, ""), grp = $("#as_grp").value;
  if (!/^\w{3,10}$/.test(id)) { $("#as_id").focus(); return toast("학번을 적어 주세요", "err"); }
  if (!name) { $("#as_name").focus(); return toast("이름을 적어 주세요", "err"); }
  if (!/^\d{8}$/.test(birth)) { $("#as_birth").focus(); return toast("생일은 8자리 숫자예요 (예: 20090315)", "err"); }
  const old = T.stu.find(s => s.id === id);
  if (old && !confirm(`${id} ${old.name} 학생이 이미 있어요. ${name}(으)로 바꿀까요?`)) return;
  await rpc("omok_t_students_save", { p_token: T.token, p_rows: [{ id, name, birth, grp: grp || (old?.grp != null ? String(old.grp) : "") }] });
  await Promise.all([loadStudents(), loadRoster()]);
  toast(`${name} 학생을 ${old ? "고쳤어요" : "추가했어요"} (총 ${T.stu.length}명)`, "ok");
  const keepGrp = grp; render(); $("#as_grp").value = keepGrp; $("#as_id").value = String(+id + 1 || ""); $("#as_name").focus();
}
ACTIONS.stuSave = async () => {
  const rows = $$("#stutb tr[data-id]").map(tr => { const g = f => tr.querySelector(`[data-f="${f}"]`).value; return { id: tr.dataset.id, name: g("name"), birth: g("birth"), grp: g("grp"), avatar: g("avatar") }; });
  if (rows.some(r => !r.name.trim())) return toast("이름이 빈 학생이 있어요", "err");
  if (rows.some(r => !/^\d{8}$/.test(r.birth.replace(/\D/g, "")))) return toast("생일은 8자리 숫자여야 해요", "err");
  await rpc("omok_t_students_save", { p_token: T.token, p_rows: rows });
  await Promise.all([loadStudents(), loadRoster()]); T.dirty = false; toast("저장했어요", "ok"); render();
};
ACTIONS.stuDel = async a => { const s = T.stu.find(x => x.id === a.dataset.id); if (!confirm(`${s?.name} 학생을 지울까요?`)) return; await rpc("omok_t_student_del", { p_token: T.token, p_id: a.dataset.id }); await Promise.all([loadStudents(), loadRoster()]); toast("지웠어요", "ok"); render(); };

/* ═══ 🧩 조 편성 ═══ */
function grpInit() {
  if (T.grpEdit) return T.grpEdit;
  T.grpEdit = { groups: DATA.groups.map(g => ({ grp: g.grp, name: g.name, size: g.size ?? 3 })), mem: Object.fromEntries(T.stu.map(s => [s.id, s.grp ?? null])) };
  if (!T.grpEdit.groups.length) T.grpEdit.groups = [1, 2, 3, 4, 5, 6, 7, 8].map(g => ({ grp: g, name: g + "조", size: 3 }));
  return T.grpEdit;
}
function pageGroups(m) {
  const E = grpInit(), total = E.groups.reduce((a, g) => a + (+g.size || 0), 0), N = T.stu.length;
  const cnt = g => T.stu.filter(s => E.mem[s.id] === g).length;
  const tag = s => `<div class="m" draggable="true" data-sid="${esc(s.id)}">${av(s.id, 18)}${esc(s.name)}<span class="x" data-act="gpick" data-sid="${esc(s.id)}">⋮</span></div>`;
  const un = T.stu.filter(s => !E.groups.some(g => g.grp === E.mem[s.id]));
  m.innerHTML = `<div class="t-h"><h2>🧩 조 편성</h2><button class="btn xs purple" data-act="gRandom">🎲 무작위 편성</button><button class="btn xs white" data-act="gOrder">🔢 번호순 편성</button><button class="btn xs gray" data-act="gClear">🧹 모두 미배정으로</button><button class="btn xs green" data-act="gSave">💾 저장</button></div>
   <div class="t-card"><h3>⚙️ 조 설정</h3><div class="gset"><label>조 개수 <input id="gcount" value="${E.groups.length}" style="width:52px" inputmode="numeric"> 개</label><label>기본 인원 <input id="gdef" value="3" style="width:52px" inputmode="numeric"> 명</label><button class="btn xs" data-act="gApply">모든 조에 적용</button>
     <span class="chip ${total === N ? "green" : "red"}" style="margin-left:auto">${total === N ? "✅" : "⚠"} 정원 합계 ${total}명 ${total === N ? "=" : "≠"} 학생 ${N}명</span></div>
     <div class="caps">${E.groups.map((g, i) => `<div class="cap ${+g.size !== 3 ? "diff" : ""}"><b>${esc(g.name)}</b><input data-cap="${i}" value="${g.size}" inputmode="numeric"><span>명</span></div>`).join("")}</div>
     <div class="help">조 개수를 바꾸면 뒤쪽 조가 늘거나 줄어요(줄어든 조의 학생은 미배정). 토너먼트 대진표는 최대 8조까지 그려요.</div></div>
   <div class="t-card"><h3>👥 조원 <span class="help" style="margin:0">이름표를 끌어서 옮기거나 ⋮ 를 눌러 조 선택</span></h3>
     <div class="groups">${E.groups.map((g, i) => { const k = cnt(g.grp); return `<div class="grp ${k !== +g.size ? "bad" : ""}" data-drop="${g.grp}"><h4><input class="gname" data-gname="${i}" value="${esc(g.name)}"><span class="cnt">${k} / ${g.size}</span></h4>${T.stu.filter(s => E.mem[s.id] === g.grp).map(tag).join("")}${k < g.size ? `<div class="m empty">+ 빈자리 ${g.size - k}</div>` : ""}</div>`; }).join("")}</div>
     <div class="unassigned" data-drop=""><b>📦 미배정</b>${un.map(tag).join("") || `<span class="help" style="margin:0">(지금 0명)</span>`}</div><div id="gpop"></div></div>`;
  wireGroups(m);
}
function wireGroups(m) {
  const E = T.grpEdit;
  m.addEventListener("dragstart", e => { const t = e.target.closest("[data-sid]"); if (t) { e.dataTransfer.setData("text/plain", t.dataset.sid); t.classList.add("drag"); } });
  m.addEventListener("dragover", e => { const d = e.target.closest("[data-drop]"); if (d) { e.preventDefault(); d.classList.add("over"); } });
  m.addEventListener("dragleave", e => { const d = e.target.closest("[data-drop]"); if (d) d.classList.remove("over"); });
  m.addEventListener("drop", e => { const d = e.target.closest("[data-drop]"); if (!d) return; e.preventDefault(); const sid = e.dataTransfer.getData("text/plain"); E.mem[sid] = d.dataset.drop === "" ? null : +d.dataset.drop; T.dirty = true; pageGroups(m); });
  m.addEventListener("change", e => {
    const c = e.target.dataset.cap, n = e.target.dataset.gname;
    if (c != null) { E.groups[+c].size = Math.max(1, parseInt(e.target.value) || 1); T.dirty = true; pageGroups(m); }
    if (n != null) { E.groups[+n].name = e.target.value.trim() || E.groups[+n].grp + "조"; T.dirty = true; }
    if (e.target.id === "gcount") {
      const k = Math.max(2, Math.min(12, parseInt(e.target.value) || 2)), def = parseInt($("#gdef").value) || 3;
      while (E.groups.length < k) { const g = E.groups.length + 1; E.groups.push({ grp: g, name: g + "조", size: def }); }
      E.groups.length = k; T.dirty = true; pageGroups(m);
    }
  });
}
function fillBySize(order) {
  const E = T.grpEdit; T.stu.forEach(s => E.mem[s.id] = null);
  let i = 0; for (const g of E.groups) for (let k = 0; k < +g.size && i < order.length; k++) E.mem[order[i++].id] = g.grp;
  T.dirty = true; render();
  if (i < order.length) toast(`정원이 모자라서 ${order.length - i}명이 미배정이에요`, "err");
}
ACTIONS.gRandom = () => fillBySize([...T.stu].sort(() => Math.random() - .5));
ACTIONS.gOrder = () => fillBySize([...T.stu].sort((a, b) => a.id.localeCompare(b.id)));
ACTIONS.gClear = () => { T.stu.forEach(s => T.grpEdit.mem[s.id] = null); T.dirty = true; render(); };
ACTIONS.gApply = () => { const d = Math.max(1, parseInt($("#gdef").value) || 3); T.grpEdit.groups.forEach(g => g.size = d); T.dirty = true; render(); };
ACTIONS.gpick = a => {
  const sid = a.dataset.sid, E = T.grpEdit;
  $("#gpop").innerHTML = `<div class="pop2">${esc(nameOf(sid))} → <select id="gpsel"><option value="">미배정</option>${E.groups.map(g => `<option value="${g.grp}" ${E.mem[sid] === g.grp ? "selected" : ""}>${esc(g.name)}</option>`).join("")}</select> <button class="btn xs" data-act="gmove" data-sid="${esc(sid)}">이동</button></div>`;
};
ACTIONS.gmove = a => { const v = $("#gpsel").value; T.grpEdit.mem[a.dataset.sid] = v === "" ? null : +v; T.dirty = true; render(); };
ACTIONS.gSave = async () => {
  const E = T.grpEdit;
  await rpc("omok_t_groups_save", { p_token: T.token, p_rows: E.groups.map(g => ({ grp: g.grp, name: g.name, size: +g.size })) });
  await rpc("omok_t_members_save", { p_token: T.token, p_rows: T.stu.map(s => ({ id: s.id, grp: E.mem[s.id] == null ? "" : String(E.mem[s.id]) })) });
  await Promise.all([loadGroups(), loadStudents(), loadRoster()]); T.grpEdit = null; T.dirty = false; toast("조 편성을 저장했어요", "ok"); render();
};

/* ═══ 🏆 대진표 ═══ */
function pageBracket(m) {
  const V = vert(), R1 = [1, 2, 3, 4].map(s => DATA.matches.find(x => x.round === 1 && x.slot === s) || { round: 1, slot: s });
  const opt = v => `<option value="">(부전승)</option>${DATA.groups.map(g => `<option value="${g.grp}" ${g.grp === v ? "selected" : ""}>${esc(g.name)}</option>`).join("")}`;
  const rn = x => x.round === 3 ? "결승" : x.round === 2 ? `4강 ${x.slot}` : `8강 ${x.slot}`;
  const stat = x => x.status === "done" ? `<span class="chip gold">${x.winner ? esc(grpName(x.winner)) + " 승" : "끝"}</span>` : x.status === "live" ? `<span class="chip red">진행 중</span>` : x.grp_a && x.grp_b && x.id ? `<button class="btn xs green" data-act="mstart" data-id="${x.id}">▶ 시작</button>` : `<span class="help" style="margin:0">대기</span>`;
  m.innerHTML = `<div class="t-h"><h2>🏆 대진표</h2><button class="btn xs purple" data-act="bRandom">🎲 무작위 대진</button><button class="btn xs white" data-act="bOrder">순서대로</button><button class="btn xs green" data-act="bSave">💾 대진 저장 (처음부터)</button></div>
   <div class="t-card" style="padding:0;height:${V ? "auto" : "360px"};overflow:hidden">${V ? bracketList() : `<div class="pc" style="height:100%">${bracketGame("pc")}</div>`}</div>
   <div class="g2"><div class="t-card"><h3>✏️ 8강 대진 짜기</h3><table class="tb" id="btb"><tr><th>경기</th><th>A</th><th>B</th></tr>${R1.map(x => `<tr><td>8강 ${x.slot}</td><td><select data-b="${x.slot}a">${opt(x.grp_a)}</select></td><td><select data-b="${x.slot}b">${opt(x.grp_b)}</select></td></tr>`).join("")}</table>
     <div class="help">조를 고른 뒤 [💾 대진 저장]을 누르면 4강·결승 칸이 새로 만들어져요(기존 결과는 지워져요). 한쪽이 비면 부전승으로 바로 올라가요.</div></div>
    <div class="t-card"><h3>▶ 경기 진행</h3>${DATA.matches.length ? `<table class="tb"><tr><th>경기</th><th>A</th><th>B</th><th>상태</th></tr>${DATA.matches.map(x => `<tr><td>${rn(x)}</td><td>${x.grp_a ? esc(grpName(x.grp_a)) : "?"}</td><td>${x.grp_b ? esc(grpName(x.grp_b)) : "?"}</td><td>${stat(x)}</td></tr>`).join("")}</table>` : `<div class="empty-note">아직 대진이 없어요</div>`}
     <div class="help">▶ 시작을 누르면 모든 학생 화면에 "10초 뒤 토너먼트가 시작됩니다"가 떠요. 경기가 끝나면 이긴 조가 자동으로 다음 칸에 올라가요.</div></div></div>`;
}
function bFill(list) { list = list.slice(0, 8); [1, 2, 3, 4].forEach((s, i) => { $(`[data-b="${s}a"]`).value = list[i * 2] ?? ""; $(`[data-b="${s}b"]`).value = list[i * 2 + 1] ?? ""; }); toast("아래 [💾 대진 저장]을 눌러야 적용돼요"); }
ACTIONS.bRandom = () => bFill(DATA.groups.map(g => g.grp).sort(() => Math.random() - .5));
ACTIONS.bOrder = () => bFill(DATA.groups.map(g => g.grp));
ACTIONS.bSave = async () => {
  if (DATA.matches.some(x => x.status !== "ready") && !confirm("이미 치른 경기 결과가 지워져요. 새로 저장할까요?")) return;
  const rows = [];
  [1, 2, 3, 4].forEach(s => {
    const a = $(`[data-b="${s}a"]`).value, b = $(`[data-b="${s}b"]`).value;
    const bye = (a && !b) ? a : (!a && b) ? b : "";
    rows.push({ round: 1, slot: s, grp_a: a, grp_b: b, winner: bye, status: bye || (!a && !b) ? "done" : "ready" });
  });
  const used = rows.flatMap(r => [r.grp_a, r.grp_b]).filter(Boolean);
  if (new Set(used).size !== used.length) return toast("같은 조가 두 번 들어갔어요", "err");
  if (used.length < 2) return toast("조를 2개 이상 넣어 주세요", "err");
  rows.push({ round: 2, slot: 1 }, { round: 2, slot: 2 }, { round: 3, slot: 1 });
  await rpc("omok_t_matches_save", { p_token: T.token, p_rows: rows }); await loadMatches(); toast("대진을 저장했어요", "ok"); render();
};
ACTIONS.mstart = async a => { if (!confirm("이 경기를 시작할까요? 모든 학생 화면이 경기로 바뀌어요.")) return; await rpc("omok_t_match_start", { p_token: T.token, p_match: +a.dataset.id }); toast("경기를 시작했어요! [🎮 실시간 관전]에서 보세요", "ok"); T.tab = "live"; render(); };

/* ═══ ❓ OX문제 ═══ */
async function pageQuiz(m) {
  m.innerHTML = `<div class="empty-note">불러오는 중…</div>`;
  [T.quiz, T.qstats] = await Promise.all([rpc("omok_t_quiz_list", { p_token: T.token }), rpc("omok_t_quiz_stats", { p_token: T.token })]);
  const N = DATA.roster.length || 1, subj = {};
  T.quiz.forEach(q => { const s = subj[q.subject] = subj[q.subject] || { t: 0, seen: 0 }; s.t++; s.seen += (T.qstats[q.id] || 0); });
  m.innerHTML = `<div class="t-h"><h2>❓ OX문제</h2><span class="chip">총 ${T.quiz.length}문제</span><span class="chip gold">학생 1명당 평균 남은 문제 ${Math.max(0, Math.round(T.quiz.length - Object.values(T.qstats).reduce((a, b) => a + b, 0) / N))}</span><button class="btn xs gray" data-act="qReset">🔄 본 기록 초기화</button></div>
   <div class="g2"><div class="t-card"><h3>➕ 붙여넣어 추가</h3><textarea class="paste" id="qpaste" placeholder="과학	물은 1기압에서 100℃에 끓는다.	O&#10;수학	모든 소수는 홀수이다.	X	2는 짝수인 소수"></textarea><div class="help">엑셀에서 [과목 · 문제 · O/X · 해설(선택)] 순서로 복사 → 붙여넣기</div><button class="btn xs" data-act="qAdd" style="margin-top:6px">추가하기</button></div>
   <div class="t-card"><h3>📊 과목별</h3>${Object.entries(subj).map(([s, v]) => { const left = Math.max(0, v.t - v.seen / N); return `<div style="display:flex;align-items:center;gap:8px;margin:5px 0;font:13px Jua"><span style="width:60px">${esc(s)}</span><div class="bar" style="flex:1"><i style="width:${left / v.t * 100}%"></i></div><span style="width:120px;text-align:right">평균 남음 ${left.toFixed(1)} / ${v.t}</span></div>`; }).join("") || `<div class="help">문제가 없어요</div>`}<div class="help">한 학생에게 같은 문제는 다시 나오지 않아요. 다 보면 가장 오래전에 본 문제부터 다시 나와요.</div></div></div>
   <div class="t-card"><h3>📚 문제 목록 <button class="btn xs red" data-act="qDelSel" style="margin-left:auto">선택 삭제</button></h3><table class="tb"><tr><th style="width:30px"><input type="checkbox" id="qall"></th><th style="width:80px">과목</th><th>문제</th><th style="width:60px">정답</th><th>해설</th><th style="width:70px">본 학생</th><th style="width:60px"></th></tr>
    ${T.quiz.map(q => `<tr data-qid="${q.id}"><td><input type="checkbox" class="qchk"></td><td><input data-f="subject" value="${esc(q.subject)}"></td><td><input data-f="q" value="${esc(q.q)}"></td><td><select data-f="ans"><option ${q.ans === "O" ? "selected" : ""}>O</option><option ${q.ans === "X" ? "selected" : ""}>X</option></select></td><td><input data-f="expl" value="${esc(q.expl || "")}"></td><td>${T.qstats[q.id] || 0}명</td><td><button class="btn xs" data-act="qUpd">저장</button></td></tr>`).join("")}</table></div>`;
  $("#qall").onchange = e => $$(".qchk").forEach(c => c.checked = e.target.checked);
}
ACTIONS.qAdd = async () => {
  const rows = $("#qpaste").value.split(/\r?\n/).map(l => l.split("\t").map(x => x.trim())).filter(c => c.length >= 3 && c[1]).map(c => ({ subject: c[0], q: c[1], ans: c[2], expl: c[3] || "" }));
  if (!rows.length) return toast("[과목 · 문제 · O/X] 순서로 붙여넣어 주세요", "err");
  const n = await rpc("omok_t_quiz_add", { p_token: T.token, p_rows: rows }); toast(`${n}문제 추가했어요${n < rows.length ? ` (${rows.length - n}줄은 O/X를 못 읽어서 뺐어요)` : ""}`, "ok"); render();
};
ACTIONS.qUpd = async a => { const tr = a.closest("tr"), g = f => tr.querySelector(`[data-f="${f}"]`).value; await rpc("omok_t_quiz_update", { p_token: T.token, p_row: { id: +tr.dataset.qid, subject: g("subject"), q: g("q"), ans: g("ans"), expl: g("expl") } }); toast("저장했어요", "ok"); };
ACTIONS.qDelSel = async () => { const ids = $$(".qchk:checked").map(c => +c.closest("tr").dataset.qid); if (!ids.length) return toast("지울 문제를 체크하세요", "err"); if (!confirm(`${ids.length}문제를 지울까요?`)) return; await rpc("omok_t_quiz_del", { p_token: T.token, p_ids: ids }); toast("지웠어요", "ok"); render(); };
ACTIONS.qReset = async () => { if (!confirm("학생들이 본 문제 기록을 모두 지울까요? (모든 문제가 다시 나올 수 있어요)")) return; await rpc("omok_t_quiz_reset", { p_token: T.token }); toast("초기화했어요", "ok"); render(); };

/* ═══ 🎯 미션 ═══ */
async function pageMission(m) {
  if (!T.dirty || !T.missions.length) T.missions = await rpc("omok_t_missions", { p_token: T.token });
  m.innerHTML = `<div class="t-h"><h2>🎯 황금카드 미션</h2><button class="btn xs" data-act="mAdd">➕ 추가</button><button class="btn xs green" data-act="mSave">💾 저장</button></div>
   <div class="t-card"><table class="tb" id="mtb"><tr><th style="width:70px">사용</th><th>미션 내용</th><th style="width:60px"></th></tr>${T.missions.map((x, i) => `<tr data-i="${i}"><td><span class="switch ${x.active ? "" : "off"}" data-act="mTog"><i></i></span></td><td><input data-f="text" value="${esc(x.text)}"></td><td><button class="btn xs gray" data-act="mDel">삭제</button></td></tr>`).join("")}</table>
   <div class="help">토너먼트에서 정답을 맞히면 ${esc(DATA.settings.golden_rate ?? 5)}% 확률로 켜진 미션 중 하나가 무작위로 나와요. 이 교사 페이지가 열려 있을 때만 나와요.</div></div>`;
  m.oninput = e => { const tr = e.target.closest("tr[data-i]"); if (tr) { T.missions[+tr.dataset.i].text = e.target.value; T.dirty = true; } };
}
ACTIONS.mAdd = () => { T.missions.push({ text: "", active: true }); T.dirty = true; render(); setTimeout(() => $$("#mtb input").pop()?.focus(), 50); };
ACTIONS.mDel = a => { T.missions.splice(+a.closest("tr").dataset.i, 1); T.dirty = true; render(); };
ACTIONS.mTog = a => { const x = T.missions[+a.closest("tr").dataset.i]; x.active = !x.active; T.dirty = true; render(); };
ACTIONS.mSave = async () => { await rpc("omok_t_missions_save", { p_token: T.token, p_rows: T.missions }); T.dirty = false; T.missions = []; toast("미션을 저장했어요", "ok"); render(); };

/* ═══ 🃏 카드 확률 ═══ */
function pageProb(m) {
  const W = DATA.settings.weights || {};
  const tbl = (key, keys, label, gold) => {
    const set = W[key] || {}, tot = keys.reduce((a, k) => a + Math.max(0, +(set[k] || 0)), 0) || 1;
    return `<div class="t-card"><h3>${label}</h3><table class="tb" data-w="${key}">${keys.map(k => { const v = +(set[k] || 0), p = v / tot * 100; return `<tr><td style="width:44px">${key === "roulette" ? "" : `<img src="${cardImg(k)}" style="width:36px;border-radius:4px">`}</td><td>${key === "roulette" ? ROUL[k] : esc(CARD[k][0])}</td><td style="width:66px"><input data-k="${k}" value="${v}" inputmode="decimal"></td><td style="width:34%"><div class="bar ${gold ? "g" : ""}"><i style="width:${p}%"></i></div></td><td style="font:13px Jua;width:44px;text-align:right">${p.toFixed(0)}%</td></tr>`; }).join("")}</table></div>`;
  };
  m.innerHTML = `<div class="t-h"><h2>🃏 카드 확률</h2><label class="chip gold">황금카드 미션 등장 <input id="grate" value="${esc(DATA.settings.golden_rate ?? 5)}" style="width:44px;border:0;background:#fff;border-radius:6px;text-align:center;font:14px Jua">%</label><button class="btn xs green" data-act="pSave">💾 저장</button></div>
   <div class="help" style="margin-bottom:8px">숫자는 비율이에요. 합이 100이 아니어도 자동으로 %가 돼요. 판도를 크게 바꾸는 카드일수록 낮게!</div>
   <div class="g2">${tbl("chance", CHANCE_KEYS, "찬스카드")}<div>${tbl("golden", GOLD_KEYS, "✨ 황금카드", true)}${tbl("roulette", Object.keys(ROUL), "🎰 운명의 룰렛 결과")}</div></div>`;
  m.oninput = e => { if (e.target.dataset.k) { T.dirty = true; const t = e.target.closest("table"), inputs = $$("input", t), tot = inputs.reduce((a, i) => a + Math.max(0, +i.value || 0), 0) || 1; inputs.forEach(i => { const tr = i.closest("tr"), p = Math.max(0, +i.value || 0) / tot * 100; tr.querySelector(".bar i").style.width = p + "%"; tr.lastElementChild.textContent = p.toFixed(0) + "%"; }); } };
}
ACTIONS.pSave = async () => {
  const w = {}; $$("table[data-w]").forEach(t => { w[t.dataset.w] = {}; $$("input", t).forEach(i => w[t.dataset.w][i.dataset.k] = Math.max(0, +i.value || 0)); });
  const gr = Math.max(0, Math.min(100, +$("#grate").value || 0));
  await rpc("omok_t_set", { p_token: T.token, p_key: "weights", p_value: w }); await rpc("omok_t_set", { p_token: T.token, p_key: "golden_rate", p_value: gr });
  await loadSettings(); T.dirty = false; toast("확률을 저장했어요", "ok"); render();
};

/* ═══ ⚙️ 채팅·설정 ═══ */
function pageSet(m) {
  const tm = DATA.settings.timers || {}, muted = T.stu.filter(s => s.muted);
  const ti = (k, l, note = "") => `<tr><td>${l}</td><td><input data-t="${k}" value="${tm[k] ?? ""}" style="width:60px" inputmode="numeric"> 초 <span class="help">${note}</span></td></tr>`;
  m.innerHTML = `<div class="t-h"><h2>⚙️ 채팅 · 설정</h2></div>
   <div class="g2"><div><div class="t-card"><h3>🎮 게임</h3><span class="switch ${gameOn() ? "" : "off"}" data-act="toggleGame"><i></i>${gameOn() ? "연습 게임 가능" : "연습 게임 불가능"}</span><div class="help">끄면 학생들은 매칭 버튼을 못 눌러요. 토너먼트는 상관없이 시작돼요.</div>
     <div class="row"><button class="btn xs" data-act="force">⏩ 대기열 지금 시작</button><button class="btn xs gray" data-act="qclear">대기열 비우기</button><button class="btn xs red" data-act="abort">⛔ 게임 중단</button></div></div>
    <div class="t-card"><h3>⏱ 시간</h3><table class="tb">${ti("quiz", "OX퀴즈")}${ti("place", "착수")}${ti("slow_quiz", "시간 도둑 · 퀴즈")}${ti("slow_place", "시간 도둑 · 착수")}${ti("mission", "황금 미션 수행")}${ti("judge", "선생님 판정 대기", "(지나면 자동 거절)")}</table><button class="btn xs green" data-act="tSave" style="margin-top:6px">💾 시간 저장</button></div>
    <div class="t-card"><h3>🔑 교사 암호</h3><input type="password" id="newpw" class="inp" placeholder="새 암호 (4글자 이상)"> <button class="btn xs" data-act="pwSave">변경</button><div class="help">지금 암호가 1111이라면 꼭 바꿔 주세요.</div></div></div>
   <div><div class="t-card"><h3>💬 채팅 관리 <button class="btn xs red" data-act="chatClear" style="margin-left:auto">전체 삭제</button></h3><div id="chatadmin" class="chatlog"></div></div>
    <div class="t-card"><h3>🔇 채팅 금지 중</h3>${muted.length ? muted.map(s => `<span class="chip" style="margin:2px">${esc(s.name)} <a data-act="mute" data-id="${esc(s.id)}" data-v="0" style="cursor:pointer">✕</a></span>`).join("") : `<div class="help">없어요. [🏫 우리반]에서 캐릭터를 누르거나 [👥 학생 명단]에서 막을 수 있어요.</div>`}</div></div></div>`;
  renderChatAdmin();
}
function renderChatAdmin() {
  const b = $("#chatadmin"); if (!b) return;
  const all = [...T.plazaChat.map(x => ({ ...x, w: "교실" })), ...T.chat.map(x => ({ ...x, w: "관전" }))].sort((a, b) => b.id - a.id).slice(0, 40);
  b.innerHTML = all.length ? `<table class="tb"><tr><th>곳</th><th>이름</th><th>내용</th><th></th></tr>${all.map(x => `<tr style="${x.hidden ? "opacity:.4" : ""}"><td>${x.w}</td><td>${esc(x.name)}</td><td>${esc(x.text)}</td><td>${x.hidden ? "숨김" : x.sid === "teacher" ? "" : `<button class="btn xs gray" data-act="hideMsg" data-id="${x.id}">숨기기</button>`}</td></tr>`).join("")}</table>` : `<div class="help">채팅이 없어요</div>`;
}
ACTIONS.tSave = async () => { const t = { ...(DATA.settings.timers || {}) }; $$("[data-t]").forEach(i => t[i.dataset.t] = Math.max(1, parseInt(i.value) || 1)); await rpc("omok_t_set", { p_token: T.token, p_key: "timers", p_value: t }); await loadSettings(); toast("시간을 저장했어요", "ok"); };
ACTIONS.pwSave = async () => { await rpc("omok_t_passcode", { p_token: T.token, p_new: $("#newpw").value }); $("#newpw").value = ""; toast("암호를 바꿨어요", "ok"); };
ACTIONS.chatClear = async () => { if (!confirm("모든 채팅을 지울까요?")) return; await rpc("omok_t_chat_clear", { p_token: T.token }); T.plazaChat = []; T.chat = []; toast("채팅을 지웠어요", "ok"); render(); };

/* ─── 매 0.3초 ─── */
function loop() {
  const G = T.G;
  if (G && T.tab === "live") {
    const tm = $("#livein .gtop .timer"); if (tm) tm.outerHTML = timerHTML(G);
    const jt = $("#jtimer"); if (jt && G.mission) { const l = leftSec(G.mission.do_until); jt.textContent = l > 0 ? Math.ceil(l) : "판정!"; }
    const on = $("#ordnum"); if (on) on.textContent = Math.ceil(leftSec(G.deadline));
  }
  if (T.tab === "room" && Date.now() % 2000 < 320) updateWalkers();
  if (G && G.status === "live" && G.deadline && now() > new Date(G.deadline).getTime() + 900 && Date.now() - T.lastTick > 1500) {
    T.lastTick = Date.now(); sb.rpc("omok_tick", { p_game: G.id }).then(() => {}, () => {});
  }
}
boot();
