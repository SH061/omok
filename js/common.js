/* ═══ 1-1반 협동오목 — 학생·교사 공통 ═══ */
const SB_URL = "https://avmbzfazchpxpskwvysp.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF2bWJ6ZmF6Y2hweHBza3d2eXNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAyMzYwNjgsImV4cCI6MjEwNTgxMjA2OH0.0viP9fVvMISonzFOZOF3BJX0VtfgHfTNl1W3uVUgcSk";
const sb = supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: false }, realtime: { params: { eventsPerSecond: 20 } } });

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ─── 서버 시간 맞추기 ─── */
let TOFF = 0;
async function syncTime() {
  try {
    const t0 = Date.now(); const { data } = await sb.rpc("omok_now"); const t1 = Date.now();
    if (data) TOFF = new Date(data).getTime() - (t0 + t1) / 2;
  } catch (e) {}
}
const now = () => Date.now() + TOFF;
const leftSec = iso => iso ? Math.max(0, (new Date(iso).getTime() - now()) / 1000) : 0;

/* ─── 서버 함수 호출 + 오류 문구 ─── */
const ERR = {
  not_found: "학번·이름·생일이 맞지 않아요.", bad_code: "교사 암호가 틀렸어요.", login_required: "다시 로그인해 주세요.",
  teacher_only: "교사만 할 수 있어요.", game_disabled: "지금은 게임이 꺼져 있어요.", no_group: "조가 정해지지 않았어요. 선생님께 말해주세요.",
  not_your_turn: "내 차례가 아니에요.", not_action: "지금은 돌을 놓을 수 없어요.", not_quiz: "문제 시간이 끝났어요.", too_late: "시간이 지났어요.",
  not_empty: "빈칸에만 놓을 수 있어요.", forbidden_33: "33 금지 자리예요! (열린 3이 두 개 생겨요)", hand_full: "카드가 3장이에요. 한 장을 쓰거나 버린 뒤 돌을 놓으세요.",
  bonus_no_five: "추가로 놓는 돌로는 5목을 완성할 수 없어요.", card_already_used: "카드는 한 턴에 한 장만 쓸 수 있어요.",
  card_before_stone: "카드는 돌을 놓기 전에 써야 해요.", shield_passive: "방어막은 가지고만 있으면 자동으로 막아줘요.",
  pick_opp_stone: "상대 돌을 골라야 해요.", pick_adjacent_empty: "바로 옆 빈칸을 골라야 해요.", move_makes_five: "그 자리로 옮기면 상대가 5목이 돼요. 다른 곳을 고르세요.",
  pick_empty: "빈칸을 골라야 해요.", pick_cell: "칸을 골라야 해요.", no_card: "그 카드가 없어요.", muted: "선생님이 채팅을 막았어요.",
  player_cannot_chat: "게임 중인 선수는 관전 채팅을 쓸 수 없어요.", game_live: "진행 중인 게임이 있어요.", match_not_ready: "두 조가 모두 정해져야 시작할 수 있어요.",
  empty_group: "조원이 없는 조가 있어요.", match_live: "진행 중인 경기가 있어서 대진표를 바꿀 수 없어요.", too_short: "암호는 4글자 이상이어야 해요.",
  own_trap: "내가 숨겨둔 함정이 있는 칸이에요. 다른 곳에 두세요.", trap_exists: "이미 함정이 있는 칸이에요.", trap_limit: "함정은 팀당 2개까지만 숨길 수 있어요.",
  not_trap_card: "이 카드는 함정으로 숨길 수 없어요.", bad_mode: "알 수 없는 게임 방식이에요.",
  not_mission: "미션 시간이 끝났어요.", teacher_cannot_play: "교사는 매칭에 들어갈 수 없어요."
};
async function rpc(fn, args = {}) {
  const { data, error } = await sb.rpc(fn, args);
  if (error) {
    const key = Object.keys(ERR).find(k => (error.message || "").includes(k));
    const e = new Error(key ? ERR[key] : (error.message || "오류가 났어요"));
    e.code = key; throw e;
  }
  return data;
}

/* ─── 알림 ─── */
function toast(msg, kind = "") {
  let box = $("#toasts");
  if (!box) { box = document.createElement("div"); box.id = "toasts"; (document.querySelector(".app") || document.body).appendChild(box); }
  const t = document.createElement("div"); t.className = "toast " + kind; t.textContent = msg; box.appendChild(t);
  setTimeout(() => t.classList.add("out"), 2600); setTimeout(() => t.remove(), 3100);
}

/* ─── 카드 ─── */
const CARD = {
  shield: ["방어막", "가지고 있으면 상대의 공격 카드(돌 제거·돌 이동·소매치기)를 한 번 자동으로 막아요."],
  remove: ["돌 제거", "상대 돌 1개를 없애요."],
  move: ["돌 이동", "상대 돌 1개를 바로 옆 빈칸으로 옮겨요."],
  wall: ["바리케이드", "빈칸 1곳을 막아요. 양 팀 모두 3턴 동안 못 놓아요."],
  slow: ["시간 도둑", "상대의 다음 차례 시간이 줄어요 (퀴즈 3초·착수 8초)."],
  spy: ["투시경", "상대 팀 카드함을 몰래 봐요."],
  steal: ["카드 소매치기", "상대 카드 1장을 무작위로 가져와요."],
  double: ["더블 착수", "이번 차례에 돌 2개! (두 번째 돌로는 5목 완성 불가)"],
  roulette: ["운명의 룰렛", "룰렛을 돌려요. 과연 어떤 효과가?"],
  whirl: ["회오리", "고른 칸 주변 3×3의 돌을 마구 섞어요."],
  gamble: ["도박사", "동전 앞면: 돌 3개! 뒷면: 이번 차례 돌을 못 놓아요."],
  swap: ["흑백 반전", "판 위의 모든 돌 색이 바뀌어요."],
  timemachine: ["타임머신", "상대 팀이 최근에 둔 착수 2개를 취소해요."],
  bomb: ["폭격", "원하는 칸을 중심으로 3×3 범위의 모든 돌을 없애요."],
  sweep: ["싹쓸이", "상대 카드함을 전부 빼앗아요."],
  triple: ["트리플 착수", "이번 차례에 돌 3개를 놓아요."]
};
const CHANCE_KEYS = ["shield", "remove", "move", "wall", "slow", "spy", "steal", "double", "roulette", "whirl", "gamble"];
const GOLD_KEYS = ["bomb", "timemachine", "sweep", "triple", "swap"];
const ROUL = { boom2: "💥 상대 돌 2개 제거", clear: "🧹 상대 카드 초기화", extra: "➕ 돌 1개 더", miss: "⚪ 꽝!", back: "🌬 역풍 (내 돌 1개 사라짐)" };
/* 판에 숨겨둘 수 있는 카드 (상대가 그 칸에 돌을 두면 발동) */
const TRAP_KEYS = ["wall", "remove", "move", "slow", "steal", "whirl", "bomb"];
const TRAP_TEXT = {
  wall: "상대가 이 칸에 두면 그 돌은 무효! 이 칸이 바리케이드로 변해 3턴 동안 막혀요.",
  remove: "상대가 이 칸에 두면 그 돌은 무효! 거기에 더해 상대 돌 1개가 무작위로 사라져요.",
  move: "상대가 이 칸에 두면 돌이 미끄러져서 옆 빈칸으로 밀려나요.",
  slow: "상대가 이 칸에 두면 그 팀의 다음 차례 시간이 확 줄어요.",
  steal: "상대가 이 칸에 두면 그 팀 카드 1장을 무작위로 뺏어와요.",
  whirl: "상대가 이 칸에 두면 그 주변 3×3 돌이 마구 섞여요.",
  bomb: "지뢰! 상대가 이 칸에 두면 3×3이 모두 터져 사라지고, 그 돌도 무효예요."
};
const isTrapKey = k => TRAP_KEYS.includes(k);
const TARGET = { remove: "opp", move: "opp", wall: "empty", whirl: "any", bomb: "any" };
const isGold = k => GOLD_KEYS.includes(k);
const cardImg = k => `assets/cards/${k}.webp`;
const sparks = (n = 5) => Array.from({ length: n }, (_, i) => `<i class="spark" style="left:${[8, 82, 90, 4, 50, 70][i % 6]}%;top:${[6, 12, 70, 62, -4, 92][i % 6]}%;animation-delay:${i * .27}s"></i>`).join("");
function card(k, { w, cls = "", pct, ribbon = true, attrs = "" } = {}) {
  const g = isGold(k);
  return `<div class="cimg ${g ? "gold" : ""} ${cls}" ${w ? `style="width:${w}px"` : ""} ${attrs}><img src="${cardImg(k)}" alt="${CARD[k]?.[0] || k}" draggable="false">${g && ribbon ? `<span class="ribbon">★ 황금카드</span>` + sparks(4) : ""}${pct != null ? `<span class="pct ${pct <= 5 ? "low" : ""}">${pct}%</span>` : ""}</div>`;
}
const back = (cls = "") => `<div class="cback ${cls}"></div>`;

/* ─── 임시 캐릭터 (학번으로 모양이 정해짐) ─── */
function hash(s) { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }
/* assets/avatars/<학번>.webp 그림이 있는 학생: 학생 명단에 주소를 따로 안 적어도 자동으로 이 그림을 씀 */
const AVATAR_FILES = new Set(["10101"]);
function avatar(id, size = 60, shirt, url) {
  if (!url && AVATAR_FILES.has(String(id))) url = `assets/avatars/${id}.webp`;
  if (url) return `<img class="avatar av-img" src="${esc(url)}" style="width:${size}px;height:${size * 1.2}px;object-fit:contain;border-radius:50%;filter:drop-shadow(0 2px 2px #0006)" alt="">`;
  const h = hash(id), p = (n, m) => Math.floor(h / n) % m;
  const skin = ["#ffe0c2", "#f9d2ae", "#f1c197", "#e8b184"][p(1, 4)], hair = ["#1d1b26", "#3b2a20", "#5a3a22", "#2b2f4a", "#6b4a2e"][p(7, 5)];
  const style = p(31, 5), glasses = p(97, 4) === 0, mouth = p(211, 3), brow = p(13, 2);
  shirt = shirt || ["#ff5a5f", "#3d8bff", "#3ccf6e", "#9b5cff", "#ffb300", "#ff7ac8"][p(53, 6)];
  const hp = [`<path d="M20 40 Q20 14 50 13 Q80 14 80 40 Q74 26 50 27 Q26 26 20 40Z" fill="${hair}"/>`,
    `<path d="M18 44 Q16 12 50 11 Q84 12 82 44 Q78 30 66 28 L60 36 L54 28 Q40 30 30 28 Q22 32 18 44Z" fill="${hair}"/>`,
    `<path d="M19 42 Q18 13 50 12 Q82 13 81 42 L75 30 Q62 20 44 24 Q30 27 25 34Z" fill="${hair}"/><path d="M44 12 Q50 2 58 10" stroke="${hair}" stroke-width="5" fill="none" stroke-linecap="round"/>`,
    `<path d="M20 42 Q20 12 50 12 Q80 12 80 42 L80 30 Q70 20 50 22 Q30 20 20 30Z" fill="${hair}"/><rect x="18" y="26" width="64" height="8" rx="4" fill="${hair}"/>`,
    `<path d="M18 46 Q14 10 50 10 Q86 10 82 46 Q80 24 64 22 Q70 32 58 34 Q60 26 50 24 Q36 24 28 30 Q22 34 18 46Z" fill="${hair}"/>`][style];
  const m = ["M42 60 Q50 67 58 60", "M44 61 Q50 64 56 61", "M43 59 Q50 69 57 59 Z"][mouth];
  return `<svg class="avatar" width="${size}" height="${size * 1.2}" viewBox="0 0 100 120"><ellipse cx="50" cy="116" rx="26" ry="4" fill="#0003"/>
  <path d="M22 118 Q22 84 50 82 Q78 84 78 118Z" fill="${shirt}" stroke="#1d2340" stroke-width="3"/><path d="M42 84 L50 94 L58 84" fill="#fff" stroke="#1d2340" stroke-width="2"/>
  <circle cx="50" cy="44" r="31" fill="${skin}" stroke="#1d2340" stroke-width="3"/>${hp}
  <circle cx="19" cy="48" r="6" fill="${skin}" stroke="#1d2340" stroke-width="2.5"/><circle cx="81" cy="48" r="6" fill="${skin}" stroke="#1d2340" stroke-width="2.5"/>
  <path d="M${brow ? "34 38 L44 37" : "34 37 Q39 34 44 37"}" stroke="#1d2340" stroke-width="2.5" fill="none" stroke-linecap="round"/><path d="M${brow ? "56 37 L66 38" : "56 37 Q61 34 66 37"}" stroke="#1d2340" stroke-width="2.5" fill="none" stroke-linecap="round"/>
  <ellipse cx="39" cy="47" rx="4" ry="5" fill="#1d2340"/><ellipse cx="61" cy="47" rx="4" ry="5" fill="#1d2340"/><circle cx="40.5" cy="45" r="1.5" fill="#fff"/><circle cx="62.5" cy="45" r="1.5" fill="#fff"/>
  ${glasses ? `<circle cx="39" cy="47" r="9" fill="none" stroke="#1d2340" stroke-width="2.5"/><circle cx="61" cy="47" r="9" fill="none" stroke="#1d2340" stroke-width="2.5"/><path d="M48 47 L52 47" stroke="#1d2340" stroke-width="2.5"/>` : ""}
  <ellipse cx="31" cy="56" rx="5" ry="3" fill="#ff8a8a88"/><ellipse cx="69" cy="56" rx="5" ry="3" fill="#ff8a8a88"/><path d="${m}" stroke="#1d2340" stroke-width="2.5" fill="${mouth === 2 ? "#c9303b" : "none"}" stroke-linecap="round"/></svg>`;
}

/* ─── 명단·조 (공개 정보만) ─── */
const DATA = { roster: [], groups: [], settings: {}, queue: [], matches: [] };
const stu = id => DATA.roster.find(s => s.id === id) || { id, name: id === "teacher" ? "선생님" : id, grp: null };
const nameOf = id => stu(id).name;
const av = (id, size, shirt) => avatar(id, size, shirt, stu(id).avatar);
const grpName = g => (DATA.groups.find(x => x.grp === g) || {}).name || (g ? g + "조" : "");
async function loadRoster() { const { data } = await sb.from("omok_roster").select("*").order("id"); if (data) DATA.roster = data; }
async function loadGroups() { const { data } = await sb.from("omok_groups").select("*").order("grp"); if (data) DATA.groups = data; }
async function loadSettings() {
  const { data } = await sb.from("omok_settings").select("*");
  if (data) data.forEach(r => DATA.settings[r.id] = r.value);
}
/* 실시간 연결이 막힌 폰도 보이도록, DB에 적힌 "최근 20초 안에 있었던 사람" 목록 */
async function loadPresence() {
  const since = new Date(now() - 20000).toISOString();
  const { data } = await sb.from("omok_presence").select("*").gte("seen", since);
  if (data) DATA.pres = data;
}
function mergePresence(live, me) {
  const o = {};
  for (const r of DATA.pres || []) o[r.sid] = { id: r.sid, name: r.name, x: r.x, y: r.y };
  for (const [k, v] of Object.entries(live || {})) { const m = v[v.length - 1]; if (m) o[k] = m; }
  if (me) o[me.id] = o[me.id] || { id: me.id, name: me.name, x: me.x, y: me.y };
  return o;
}
async function loadQueue() { const { data } = await sb.from("omok_queue").select("*").order("joined_at"); if (data) DATA.queue = data; }
async function loadMatches() { const { data } = await sb.from("omok_matches").select("*").order("round").order("slot"); if (data) DATA.matches = data; }
const curGameId = () => { const v = DATA.settings.current_game; return v == null || v === "null" ? null : Number(v); };

/* ─── 판 규칙 (화면 표시용 — 판정은 서버가 함) ─── */
function runLen(b, i, col, dr, dc) {
  let n = 1; const r = Math.floor(i / 15), c = i % 15;
  for (const s of [1, -1]) { let rr = r + dr * s, cc = c + dc * s; while (rr >= 0 && rr < 15 && cc >= 0 && cc < 15 && b[rr * 15 + cc] === col) { n++; rr += dr * s; cc += dc * s; } }
  return n;
}
const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];
const isFive = (b, i, col) => DIRS.some(([dr, dc]) => runLen(b, i, col, dr, dc) >= 5);
function openEnds(b, i, col, dr, dc) {
  const r = Math.floor(i / 15), c = i % 15;
  for (const s of [1, -1]) {
    let rr = r + dr * s, cc = c + dc * s;
    while (rr >= 0 && rr < 15 && cc >= 0 && cc < 15 && b[rr * 15 + cc] === col) { rr += dr * s; cc += dc * s; }
    if (!(rr >= 0 && rr < 15 && cc >= 0 && cc < 15) || b[rr * 15 + cc] !== "0") return false;
  }
  return true;
}
function is33(b, i, col) {
  const a = b.split(""); a[i] = col; const b2 = a.join("");
  if (isFive(b2, i, col)) return false;
  let cnt = 0;
  for (const [dr, dc] of DIRS) {
    if (runLen(b2, i, col, dr, dc) >= 4) continue;
    for (let s = -4; s <= 4; s++) {
      if (!s) continue;
      const er = Math.floor(i / 15) + dr * s, ec = i % 15 + dc * s;
      if (er < 0 || er > 14 || ec < 0 || ec > 14) continue;
      const e = er * 15 + ec; if (b2[e] !== "0") continue;
      const a3 = b2.split(""); a3[e] = col; const b3 = a3.join("");
      if (runLen(b3, i, col, dr, dc) === 4 && openEnds(b3, i, col, dr, dc)) { cnt++; break; }
    }
  }
  return cnt >= 2;
}
function bans(b, col) {
  const out = new Set();
  for (let i = 0; i < 225; i++) {
    if (b[i] !== "0") continue;
    const r = Math.floor(i / 15), c = i % 15; let near = 0;
    for (let dr = -2; dr <= 2 && near < 2; dr++) for (let dc = -2; dc <= 2; dc++) { const rr = r + dr, cc = c + dc; if (rr >= 0 && rr < 15 && cc >= 0 && cc < 15 && b[rr * 15 + cc] === col) near++; }
    if (near >= 2 && is33(b, i, col)) out.add(i);
  }
  return out;
}

/* 판 그리기: o = {board, last:Set, walls:{i:turn}, turnNo, bans:Set, tgt:Set, pick:Set, click:bool} */
function boardHTML(o) {
  const b = o.board || "0".repeat(225); let h = `<div class="board ${o.click ? "clickable" : ""}"><div class="grid">`;
  for (let i = 0; i < 225; i++) {
    const v = b[i]; let inner = "";
    if (v === "1") inner = `<div class="st k ${o.last?.has(i) ? "last" : ""}"></div>`;
    else if (v === "2") inner = `<div class="st w ${o.last?.has(i) ? "last" : ""}"></div>`;
    else if (v === "3") inner = `<div class="wall"><b>${Math.max(1, (o.walls?.[i] ?? 0) - (o.turnNo ?? 0))}</b></div>`;
    else if (o.bans?.has(i)) inner = `<span class="ban">✕</span>`;
    if (o.traps?.has(i) && v === "0") { const tp = o.traps.get(i); inner += `<span class="trapmk ${tp.team === 1 ? "t1" : ""}" title="${esc(CARD[tp.k]?.[0] || "")} 함정">🪤<i>${CARD[tp.k] ? esc(CARD[tp.k][0].slice(0, 2)) : ""}</i></span>`; }
    if (o.tgt?.has(i)) inner += `<span class="tgt"></span>`;
    if (o.pick?.has(i)) inner += `<span class="pick"></span>`;
    h += `<div class="cell" data-i="${i}">${inner}</div>`;
  }
  h += "</div>" + [[3, 3], [3, 11], [7, 7], [11, 3], [11, 11]].map(([r, c]) => `<span class="star" style="left:${3 + (c + .5) / 15 * 94}%;top:${3 + (r + .5) / 15 * 94}%"></span>`).join("");
  return h + "</div>";
}

/* ─── 벽시계 (실제 시각) ─── */
function wallClock(sz) {
  const ticks = Array.from({ length: 12 }, (_, i) => { const a = i * 30 * Math.PI / 180, r1 = i % 3 ? 38 : 35, r2 = 42; return `<line x1="${50 + r1 * Math.sin(a)}" y1="${50 - r1 * Math.cos(a)}" x2="${50 + r2 * Math.sin(a)}" y2="${50 - r2 * Math.cos(a)}" stroke="#3a2a1a" stroke-width="${i % 3 ? 1.6 : 3}" stroke-linecap="round"/>`; }).join("");
  const nums = [[12, 50, 22], [3, 79, 54], [6, 50, 84], [9, 21, 54]].map(([n, x, y]) => `<text x="${x}" y="${y}" text-anchor="middle" font-family="Jua" font-size="11" fill="#3a2a1a">${n}</text>`).join("");
  return `<svg width="${sz}" height="${sz}" viewBox="0 0 100 100"><defs><radialGradient id="cf" cx=".4" cy=".35"><stop offset="0" stop-color="#fffdf6"/><stop offset="1" stop-color="#efe3c8"/></radialGradient><linearGradient id="cr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d9a466"/><stop offset=".5" stop-color="#8a5a2b"/><stop offset="1" stop-color="#5a3a1a"/></linearGradient></defs>
  <circle cx="50" cy="50" r="48" fill="url(#cr)" stroke="#2b1f14" stroke-width="2"/><circle cx="50" cy="50" r="42.5" fill="url(#cf)" stroke="#6b4a2e" stroke-width="1.5"/>${ticks}${nums}
  <line class="hh" x1="50" y1="50" x2="50" y2="30" stroke="#2b1f14" stroke-width="4" stroke-linecap="round"/><line class="mh" x1="50" y1="50" x2="50" y2="18" stroke="#2b1f14" stroke-width="2.6" stroke-linecap="round"/><line class="sh" x1="50" y1="56" x2="50" y2="16" stroke="#e63946" stroke-width="1.2" stroke-linecap="round"/><circle cx="50" cy="50" r="3.2" fill="#e63946" stroke="#2b1f14"/>
  <ellipse cx="38" cy="28" rx="18" ry="8" fill="#fff" opacity=".35" transform="rotate(-30 38 28)"/></svg>`;
}
setInterval(() => {
  const d = new Date(), h = d.getHours() % 12, m = d.getMinutes(), sec = d.getSeconds();
  $$(".wclock").forEach(c => { const set = (k, deg) => { const e = c.querySelector(k); if (e) e.setAttribute("transform", `rotate(${deg} 50 50)`); }; set(".hh", h * 30 + m / 2); set(".mh", m * 6); set(".sh", sec * 6); });
}, 1000);

/* ─── 우승컵 ─── */
function trophySVG() {
  return `<svg class="trophy" viewBox="0 0 200 270" xmlns="http://www.w3.org/2000/svg"><defs>
   <linearGradient id="tgH" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#6b3f00"/><stop offset=".12" stop-color="#b87a08"/><stop offset=".3" stop-color="#ffd966"/><stop offset=".4" stop-color="#fffbe6"/><stop offset=".5" stop-color="#ffd23a"/><stop offset=".72" stop-color="#c48a0a"/><stop offset=".88" stop-color="#8a5500"/><stop offset="1" stop-color="#5a3300"/></linearGradient>
   <linearGradient id="tgV" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#fff3b8"/><stop offset=".45" stop-color="#e9b020"/><stop offset="1" stop-color="#7a4800"/></linearGradient>
   <linearGradient id="tgIn" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#3a2200"/><stop offset="1" stop-color="#a86d00"/></linearGradient>
   <linearGradient id="tgWood" x1="0" x2="1"><stop offset="0" stop-color="#140c1c"/><stop offset=".35" stop-color="#3b2a4e"/><stop offset=".5" stop-color="#4c3866"/><stop offset="1" stop-color="#120a18"/></linearGradient>
   <linearGradient id="tgHandle" gradientUnits="userSpaceOnUse" x1="0" y1="40" x2="0" y2="110"><stop offset="0" stop-color="#fff0a8"/><stop offset=".5" stop-color="#d69a10"/><stop offset="1" stop-color="#7a4800"/></linearGradient></defs>
  <ellipse cx="100" cy="258" rx="74" ry="9" fill="#000" opacity=".45"/>
  <path d="M52 206 L148 206 L156 252 L44 252 Z" fill="url(#tgWood)"/><rect x="44" y="246" width="112" height="8" rx="2" fill="url(#tgH)"/><rect x="50" y="202" width="100" height="8" rx="2" fill="url(#tgH)"/>
  <rect x="70" y="216" width="60" height="24" rx="3" fill="url(#tgH)" stroke="#5a3300" stroke-width="1"/><text x="100" y="232" text-anchor="middle" font-family="Black Han Sans" font-size="11" fill="#4a2a00">1-1반 우승</text>
  <path d="M82 202 L118 202 L112 184 L88 184 Z" fill="url(#tgH)"/><ellipse cx="100" cy="184" rx="14" ry="4" fill="url(#tgV)"/><path d="M94 184 L106 184 L103 158 L97 158 Z" fill="url(#tgH)"/><ellipse cx="100" cy="156" rx="13" ry="6" fill="url(#tgH)"/><path d="M92 150 L108 150 L104 138 L96 138 Z" fill="url(#tgH)"/>
  <path d="M42 50 C6 44 4 100 62 112" fill="none" stroke="#4a2a00" stroke-width="13" stroke-linecap="round"/><path d="M42 50 C6 44 4 100 62 112" fill="none" stroke="url(#tgHandle)" stroke-width="9" stroke-linecap="round"/>
  <path d="M158 50 C194 44 196 100 138 112" fill="none" stroke="#4a2a00" stroke-width="13" stroke-linecap="round"/><path d="M158 50 C194 44 196 100 138 112" fill="none" stroke="url(#tgHandle)" stroke-width="9" stroke-linecap="round"/>
  <path d="M30 60 C20 72 22 90 40 100" fill="none" stroke="#fff8d0" stroke-width="2" stroke-linecap="round" opacity=".8"/>
  <path d="M38 40 C38 104 72 136 94 140 L106 140 C128 136 162 104 162 40 Z" fill="url(#tgH)" stroke="#4a2a00" stroke-width="2"/>
  <path d="M40 58 C60 64 140 64 160 58" fill="none" stroke="#7a4800" stroke-width="2" opacity=".6"/><path d="M42 62 C60 68 140 68 158 62" fill="none" stroke="#fff5c8" stroke-width="1.5" opacity=".7"/>
  <path d="M100 74 L106 90 L123 90 L109 100 L114 116 L100 106 L86 116 L91 100 L77 90 L94 90 Z" fill="url(#tgV)" stroke="#6b3f00" stroke-width="2" stroke-linejoin="round"/>
  <path d="M54 46 C54 86 68 114 84 128 C72 110 62 84 62 46 Z" fill="#fff" opacity=".6"/><path d="M140 50 C140 80 132 102 120 118 C134 104 146 82 146 50 Z" fill="#fff" opacity=".25"/>
  <ellipse cx="100" cy="40" rx="62" ry="11" fill="url(#tgV)" stroke="#4a2a00" stroke-width="2"/><ellipse cx="100" cy="40" rx="55" ry="7.5" fill="url(#tgIn)"/>
  <g class="tw"><path d="M60 30 L63 38 L71 41 L63 44 L60 52 L57 44 L49 41 L57 38 Z" fill="#fff"/></g>
  <g class="tw" style="animation-delay:.7s"><path d="M150 96 L152 101 L157 103 L152 105 L150 110 L148 105 L143 103 L148 101 Z" fill="#fff"/></g>
  <g class="tw" style="animation-delay:1.2s"><path d="M112 176 L114 180 L118 182 L114 184 L112 188 L110 184 L106 182 L110 180 Z" fill="#fff"/></g></svg>`;
}

/* ─── 게임식 대진표 (8강 → 4강 → 결승) ─── */
const GCOL = ["#8b93d8", "#ff5a5f", "#ff9f1a", "#e6b800", "#3ccf6e", "#1fb5c9", "#3d8bff", "#9b5cff", "#ff5fb0", "#8d6e63", "#607d8b"];
const gcol = g => GCOL[g % GCOL.length] || GCOL[0];
function bracketGame(dev, { spectate = false } = {}) {
  const M8 = DATA.matches; const find = (r, s) => M8.find(m => m.round === r && m.slot === s);
  const av0 = dev === "phone" ? 15 : dev === "tablet" ? 30 : 22;
  const team = (g, st) => {
    if (!g) return `<div class="t q"><span class="emb">?</span><b>대기 중</b></div>`;
    const mem = DATA.roster.filter(s => s.grp === g).map(s => av(s.id, av0, gcol(g))).join("");
    return `<div class="t ${st || ""}" style="--gc:${gcol(g)}"><span class="emb" style="background:${gcol(g)}">${g}</span><b>${esc(grpName(g))}</b><span class="mav">${mem}</span>${st === "w" ? '<span class="res">WIN</span>' : ""}</div>`;
  };
  const X = { l8: [1, 21], l4: [25, 16.5], f: [42.5, 15], r4: [58.5, 16.5], r8: [78, 21] };
  const Y = { a: 30, b: 74, s: 52, f: 74 };
  const stTag = (m, name) => !m ? name : m.status === "done" ? name + " · 종료" : m.status === "live" ? name + " · 진행 중" : name + " · 대기";
  const box = (m, x, w, y, name, r) => {
    const a = m?.grp_a, b = m?.grp_b, win = m?.winner, live = m?.status === "live";
    const sa = win ? (win === a ? "w" : "l") : "", sbb = win ? (win === b ? "w" : "l") : "";
    return `<div class="m ${r ? "r" : ""} ${live ? "live" : ""}" style="left:${x}%;width:${w}%;top:${y}%"><span class="tag">${stTag(m, name)}</span>${team(a, sa)}${team(b, sbb)}${live ? `<div class="live-b"><span>● LIVE</span>${spectate ? `<button data-act="spectate">👀 관전</button>` : ""}</div>` : ""}</div>`;
  };
  const lc = m => !m ? "" : m.status === "done" && m.winner ? "win" : m.status === "live" ? "live" : "";
  const P = (pts, c) => `<polyline class="ln ${c || ""}" points="${pts.map(p => p.join(",")).join(" ")}"/>`;
  const e1 = X.l8[0] + X.l8[1], j1 = (e1 + X.l4[0]) / 2, e2 = X.l4[0] + X.l4[1], j2 = (e2 + X.f[0]) / 2;
  const s1 = X.r8[0], k1 = (X.r4[0] + X.r4[1] + s1) / 2, s2 = X.r4[0], k2 = (X.f[0] + X.f[1] + s2) / 2;
  const m11 = find(1, 1), m12 = find(1, 2), m13 = find(1, 3), m14 = find(1, 4), m21 = find(2, 1), m22 = find(2, 2), m31 = find(3, 1);
  const lines = [P([[e1, Y.a], [j1, Y.a], [j1, Y.s], [X.l4[0], Y.s]], lc(m11)), P([[e1, Y.b], [j1, Y.b], [j1, Y.s]], lc(m12)),
    P([[e2, Y.s], [j2, Y.s], [j2, Y.f], [X.f[0], Y.f]], lc(m21)),
    P([[s1, Y.a], [k1, Y.a], [k1, Y.s], [X.r4[0] + X.r4[1], Y.s]], lc(m13)), P([[s1, Y.b], [k1, Y.b], [k1, Y.s]], lc(m14)),
    P([[s2, Y.s], [k2, Y.s], [k2, Y.f], [X.f[0] + X.f[1], Y.f]], lc(m22))].join("");
  const stars = [[8, 12], [35, 20], [64, 14], [92, 24], [48, 93], [20, 92], [80, 90]].map(([x, y], i) => `<span class="star" style="left:${x}%;top:${y}%;animation-delay:${i * .23}s">✦</span>`).join("");
  const champ = m31?.winner ? `👑 ${esc(grpName(m31.winner))} 우승!` : "🏆 우승 ?";
  const empty = !M8.length;
  return `<div class="bk"><div class="beam l"></div><div class="beam r"></div>${stars}<div class="floor"></div>
   <svg class="lines" viewBox="0 0 100 100" preserveAspectRatio="none">${lines}</svg>
   <span class="rl" style="left:${X.l8[0] + X.l8[1] / 2}%">8강</span><span class="rl" style="left:${X.l4[0] + X.l4[1] / 2}%">4강</span><span class="rl fin" style="left:50%">🏆 결승</span><span class="rl" style="left:${X.r4[0] + X.r4[1] / 2}%">4강</span><span class="rl" style="left:${X.r8[0] + X.r8[1] / 2}%">8강</span>
   ${box(m11, X.l8[0], X.l8[1], Y.a, "1경기")}${box(m12, X.l8[0], X.l8[1], Y.b, "2경기")}${box(m21, X.l4[0], X.l4[1], Y.s, "4강 1경기")}
   ${box(m13, X.r8[0], X.r8[1], Y.a, "3경기", 1)}${box(m14, X.r8[0], X.r8[1], Y.b, "4경기", 1)}${box(m22, X.r4[0], X.r4[1], Y.s, "4강 2경기", 1)}
   ${box(m31, X.f[0], X.f[1], Y.f, "결승")}
   <div class="champ2"><div class="rays"></div><div class="glow"></div>${trophySVG()}<div class="podium"></div><div class="who">${champ}</div></div>
   ${empty ? `<div class="bk-empty">아직 대진표가 없어요. 선생님이 만들면 여기에 나와요.</div>` : ""}</div>`;
}
/* 세로 화면용 목록형 대진표 */
function bracketList() {
  const bm = m => {
    const a = m.grp_a, b = m.grp_b, w = m.winner, live = m.status === "live";
    return `<div class="bm ${live ? "live" : ""}"><div class="${w ? (w === a ? "w" : "l") : ""}">${a ? esc(grpName(a)) : "?"}${live ? '<span class="chip red" style="font-size:11px;padding:0 6px">LIVE</span>' : ""}</div><div class="${w ? (w === b ? "w" : "l") : ""}">${b ? esc(grpName(b)) : "?"}</div></div>`;
  };
  const R = r => DATA.matches.filter(m => m.round === r).map(bm).join("");
  const f = DATA.matches.find(m => m.round === 3);
  return `<div class="bracket"><div class="round"><h5>8강</h5>${R(1)}</div><div class="round"><h5>4강</h5>${R(2)}</div><div class="round"><h5>결승</h5>${R(3)}</div><div class="champ"><div style="font-size:52px">🏆</div>우승<br>${f?.winner ? esc(grpName(f.winner)) : "?"}</div></div>`;
}

/* ─── 게임 화면 조각 (학생·교사 공통) ─── */
const TEAMCLS = ["a", "b"];
const teamName = (G, t) => G.teams[t].grp ? grpName(G.teams[t].grp) : G.teams[t].name;
const whoL = (G, t, p) => { const tn = teamName(G, t), n = nameOf(p); return tn === n ? n : tn + " " + n; };
const modeLabel = G => ({ solo: "⚔️ 1:1 연습", random: "🎲 3:3 랜덤", group: "🛡️ 조별 연습", tournament: "🏆 토너먼트" }[G.mode] || "게임") + (G.noitem ? " · 🚫노템" : "");
const trapN = (G, t) => +(G.effects?.trapn?.[t] || 0);
/* 선수별 이번 게임 퀴즈 기록 (이벤트에서 모음) */
function quizLog(G, log) {
  for (const e of G.events || []) if (e.type === "quiz" && !log.has(e.seq)) log.set(e.seq, e);
  const by = {};
  [...log.values()].sort((a, b) => a.seq - b.seq).forEach(e => { by[e.player] = e.result; });
  return by;
}
function qMark(r) { return r === "correct" ? "✅" : r === "wrong" ? "❌" : r === "timeout" ? "⌛" : ""; }
function teamBox(G, t, { mini = false, qres = {}, handN } = {}) {
  const T = G.teams[t], a = t === 0, cls = TEAMCLS[t], col = a ? "#ff5a5f" : "#3d8bff";
  const n = handN ?? (G.hand_count?.[t] ?? 0);
  const tn = trapN(G, t);
  const backs = G.noitem ? `<span class="noitem-tag">🚫 노템</span>` : [0, 1].map(k => back("sm " + (k < n ? "" : "empty"))).join("") + (n > 2 ? `<b style="margin-left:2px">+${n - 2}</b>` : "") + (tn ? `<b class="trapcnt" title="숨겨진 함정">🪤${tn}</b>` : "");
  const now = G.cur_team === t ? G.cur_player : null;
  if (mini) return `<div class="tmini ${cls}"><div class="tn"><span class="sic ${a ? "k" : "w"}"></span>${esc(teamName(G, t))}<span class="backs">${backs}</span></div>
    <div class="faces">${T.players.map((p, i) => `<div class="face ${now === p ? "now" : ""}"><span class="o">${i + 1}</span>${qres[p] ? `<span class="r">${qMark(qres[p])}</span>` : ""}${av(p, 24, col)}<span>${esc(nameOf(p))}</span></div>`).join("")}</div></div>`;
  return `<div class="team ${cls}"><div class="tn"><span class="sic ${a ? "k" : "w"}"></span>${esc(teamName(G, t))}<small>${a ? "흑 · 선공" : "백"}</small></div>
    <div class="members">${T.players.map((p, i) => `<div class="mem ${now === p ? "now" : ""}"><span class="ord">${i + 1}</span>${av(p, 26, col)}<div>${esc(nameOf(p))}${qres[p] ? `<span class="qs">${qMark(qres[p])}</span>` : ""}</div></div>`).join("")}</div>
    <div class="backs">${G.noitem ? "" : `카드 ${n}/2 `}${backs}</div></div>`;
}
function timerHTML(G) {
  if (!G.deadline || G.status !== "live") return `<div class="timer"><span>-</span></div>`;
  const total = G.phase === "quiz" ? (G.quiz?.secs || 5) : G.phase === "mission" ? 50 : G.phase === "action" ? (G.turn?.slow ? 8 : (DATA.settings.timers?.place || 20)) : 10;
  const l = leftSec(G.deadline), pct = Math.max(0, Math.min(100, l / total * 100));
  return `<div class="timer ${l < 4 ? "hurry" : ""}" style="background:conic-gradient(var(--gold2) 0 ${pct}%,#ffffff33 0)"><span>${Math.ceil(l)}</span></div>`;
}
function turnText(G, meId) {
  if (G.status !== "live") return G.winner === -1 ? "무승부" : G.winner != null ? `<b>${esc(teamName(G, G.winner))}</b> 승리!` : "게임 끝";
  if (G.phase === "intro") return "곧 시작해요";
  if (G.phase === "order") return "🎰 순서 뽑는 중…";
  const who = G.cur_player === meId ? "나" : nameOf(G.cur_player);
  const what = { quiz: "OX퀴즈", mission: "✨ 황금 미션", action: "돌을 놓을 차례" }[G.phase] || "";
  const extra = G.phase === "action" && G.turn?.stones > 1 ? ` (${(G.turn.placed || 0) + 1}/${G.turn.stones}번째 돌)` : "";
  const tn = teamName(G, G.cur_team);
  return `${G.turn_no + 1}턴 · <b>${tn === nameOf(G.cur_player) ? esc(who) : esc(tn) + " " + esc(who)}</b> · ${what}${extra}${G.turn?.slow ? " ⏳" : ""}`;
}
function specQ(G, qres) {
  if (!G.quiz) return "";
  const r = G.quiz.result;
  const res = r === "correct" ? `<span class="res" style="color:var(--green-d)">✅ 정답!</span>` : r === "wrong" ? `<span class="res" style="color:var(--red-d)">❌ 오답</span>` : r === "timeout" ? `<span class="res" style="color:var(--ink2)">⌛ 시간 초과</span>` : `<span class="res">🤔</span>`;
  return `<div class="spec-q"><span class="chip blue">${esc(G.quiz.subject)}</span><span class="qq">${esc(nameOf(G.cur_player))}: ${esc(G.quiz.q)}</span>${res}</div>`;
}
/* 이벤트 → 한 줄 문구 */
function evText(G, e) {
  const who = e.player ? whoL(G, e.team, e.player) : "";
  switch (e.type) {
    case "trap_set": return `🪤 ${who} 함정을 숨겼어요! (어디에 뭘 숨겼는지는 비밀)`;
    case "trap_hit": return e.blocked ? `🛡 ${teamName(G, e.victim)} 방어막이 ${teamName(G, e.team)}의 ${CARD[e.k][0]} 함정을 막았다!` : `💥 ${teamName(G, e.victim)} ${nameOf(e.player)} → ${teamName(G, e.team)}의 ${CARD[e.k][0]} 함정 발동!`;
    case "card_get": return e.gold ? `✨ ${who} 황금카드 획득!` : `🃏 ${who} 카드 획득!`;
    case "card_use": return e.blocked ? `🛡 ${teamName(G, 1 - e.team)} 방어막 발동! ${CARD[e.k][0]} 막았다!` : `⚡ ${who} → ${CARD[e.k][0]}${e.outcome && ROUL[e.outcome] ? " · " + ROUL[e.outcome] : e.outcome === "head" ? " · 앞면! 돌 3개" : e.outcome === "tail" ? " · 뒷면… 이번 턴 끝" : ""}`;
    case "quiz": return `${qMark(e.result)} ${who} ${e.result === "correct" ? "정답" : e.result === "wrong" ? "오답" : "시간 초과"}`;
    case "mission": return `✨ ${who} 황금카드 미션 도전!`;
    case "mission_result": return e.ok ? `⭕ ${who} 미션 성공!` : `❌ ${who} 미션 실패${e.auto ? " (시간 초과)" : ""}`;
    case "timeout": return `⌛ ${who} 시간 초과 — 차례가 넘어가요`;
    case "discard": return `🗑 ${who} 카드 1장 버림`;
    case "end": return e.winner === -1 ? "무승부!" : `👑 ${teamName(G, e.winner)} 승리!`;
    case "abort": return "⛔ 선생님이 게임을 멈췄어요";
    default: return "";
  }
}
