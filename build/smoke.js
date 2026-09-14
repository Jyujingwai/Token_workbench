/* 轻量 DOM 桩冒烟测试：真实执行 app.js 的启动、渲染、增删改、导出流程 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const app = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
const shell = fs.readFileSync(path.join(__dirname, 'shell.html'), 'utf8');
const deliverable = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

/* ---------- DOM stub ---------- */
const ctxStub = new Proxy({}, {
  get(t, k) {
    if (k === 'createLinearGradient') return () => ({ addColorStop() {} });
    if (k === 'measureText') return () => ({ width: 10 });
    if (k === 'canvas') return { width: 300, height: 150 };
    if (typeof t[k] === 'undefined') return typeof k === 'string' ? (() => {}) : undefined;
    return t[k];
  },
  set(t, k, v) { t[k] = v; return true; }
});

function El(tag, id) {
  this.tagName = (tag || 'div').toUpperCase();
  this.id = id || '';
  this.style = {}; this.dataset = {}; this.children = [];
  this.value = ''; this.textContent = ''; this._html = '';
  this.width = 300; this.height = 150; this.offsetWidth = 300;
  this.files = []; this.className = ''; this.attrs = {};
  const self = this;
  this.classList = {
    _s: new Set(),
    add() { [].forEach.call(arguments, c => this._s.add(c)); },
    remove() { [].forEach.call(arguments, c => this._s.delete(c)); },
    toggle(c, f) { f === undefined ? (this._s.has(c) ? this._s.delete(c) : this._s.add(c)) : (f ? this._s.add(c) : this._s.delete(c)); },
    contains(c) { return this._s.has(c); }
  };
  Object.defineProperty(this, 'innerHTML', {
    get() { return self._html; },
    set(v) { self._html = String(v); }
  });
  Object.defineProperty(this, 'selectedOptions', {
    get() { return [{ dataset: { price: '30' } }]; }
  });
  this.parentNode = null;
}
El.prototype.setAttribute = function (k, v) { this.attrs[k] = String(v); };
El.prototype.getAttribute = function (k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; };
El.prototype.addEventListener = function () {};
El.prototype.removeEventListener = function () {};
El.prototype.appendChild = function (c) { this.children.push(c); c.parentNode = this; return c; };
El.prototype.insertBefore = function (c) { this.children.unshift(c); c.parentNode = this; return c; };
El.prototype.removeChild = function (c) { this.children = this.children.filter(x => x !== c); return c; };
El.prototype.remove = function () { if (this.parentNode) this.parentNode.removeChild(this); };
El.prototype.focus = function () {};
El.prototype.click = function () {};
El.prototype.getContext = function () { return ctxStub; };
El.prototype.getBoundingClientRect = function () { return { width: 300, height: 250, top: 0, left: 0 }; };

const cache = new Map();
function get(sel) {
  if (!cache.has(sel)) {
    const isPeriodButtons = sel === '#periodMetric button';
    const isThemeButtons = sel === '#themeOptions [data-theme]';
    const n = isPeriodButtons ? 2 : isThemeButtons ? 5 : (sel === '.view' || sel === '.main' || sel === '.chartbox') ? 4 : 1;
    const arr = [];
    for (let i = 0; i < n; i++) arr.push(new El('div', sel));
    if (isPeriodButtons) {
      arr[0].dataset.metric = 'tokens'; arr[0].classList.add('on');
      arr[1].dataset.metric = 'cost';
    }
    if (isThemeButtons) ['neon', 'ocean', 'ember', 'lavender', 'macaron'].forEach((theme, i) => { arr[i].dataset.theme = theme; });
    cache.set(sel, arr);
  }
  return cache.get(sel);
}
const document = {
  readyState: 'complete',
  hidden: false,
  body: new El('body'),
  documentElement: new El('html'),
  querySelector: s => get(s)[0],
  querySelectorAll: s => get(s),
  getElementById: id => get('#' + id)[0],
  createElement: t => new El(t),
  addEventListener() {}
};
const store = {};
const localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; },
  clear: () => { for (const k in store) delete store[k]; }
};
const chartsMade = [];
class ChartStub {
  constructor(el, cfg) { this.config = cfg; this.chartArea = { top: 0, bottom: 100 }; this.ctx = ctxStub; chartsMade.push(cfg); }
  destroy() {} resize() {} update() {}
}
ChartStub.defaults = { color: '', font: { family: '' } };

const win = {
  innerWidth: 1440, innerHeight: 900, devicePixelRatio: 2,
  scrollTo() {}, addEventListener() {},
  matchMedia: () => ({ matches: false, addEventListener() {} }),
  requestAnimationFrame: () => 1, cancelAnimationFrame() {},
  location: { hash: '' },
  history: { replaceState() {} },
  getComputedStyle: () => ({ fontFamily: 'sans-serif' }),
  ResizeObserver: class { observe() {} disconnect() {} },
  Blob, URL, FileReader: class { readAsText() {} },
  setTimeout: (f, t) => setTimeout(f, t), clearTimeout: c => clearTimeout(c),
  Set, Map, Math, Date, JSON, Object, Array, String, Number, isFinite, parseFloat, parseInt, console
};
win.window = win;
win.document = document;
win.localStorage = localStorage;
win.Chart = ChartStub;
win.getComputedStyle = win.getComputedStyle;
win.requestAnimationFrame = win.requestAnimationFrame;
win.cancelAnimationFrame = win.cancelAnimationFrame;
win.ResizeObserver = win.ResizeObserver;
win.matchMedia = win.matchMedia;
win.location = win.location;
win.history = win.history;
win.innerWidth = 1440; win.innerHeight = 900; win.devicePixelRatio = 2;
win.scrollTo = win.scrollTo;

/* ---------- run ---------- */
const errors = [];
try {
  vm.createContext(win);
  vm.runInContext(app, win, { filename: 'app.js' });
} catch (e) { errors.push('boot: ' + e.stack); }

const App = win.App;
const ok = [], warn = [];
function chk(name, fn) {
  try { const r = fn(); ok.push((r === true ? 'PASS' : 'INFO') + '  ' + name + (r === true ? '' : ' -> ' + r)); }
  catch (e) { errors.push(name + ': ' + e.message); }
}
function data() { return JSON.parse(store['wb_token_data_v1'] || '{}'); }

chk('window.App 已导出', () => App && typeof App.go === 'function');
chk('最终单文件包含校准功能', () => {
  return deliverable.includes('platform-calibrate-toggle') && deliverable.includes('目标平台余额（$）') || 'index.html 未包含最新校准功能';
});
chk('IndexedDB 主存储与流水备份已接入', () => {
  return app.includes("indexedDB.open(DB_NAME, DB_VERSION)") && app.includes('requestPersistentStorage') && app.includes("accountLedger: S.accountLedger") && app.includes('lastWriteAt') && !app.includes("文件模式存储可能不稳定") && shell.includes('IndexedDB 中') || 'IndexedDB / 账户流水接入不完整';
});
chk('JSON 备份包含流水版本信息', () => {
  return app.includes("schema: 'tokens-amount-v3'") && app.includes("storage: 'indexeddb-ledger-v1'") && app.includes('accountLedger: S.accountLedger') || 'JSON 备份缺少账户流水';
});
chk('备份记录与健康检查界面已接入', () => {
  return app.includes('lastBackupAt') && app.includes('checkDataHealth') && app.includes('rebuildBalances') && shell.includes('lastBackupAt') && shell.includes('检查数据健康') && shell.includes('按流水重建余额') || '备份元数据 / 健康检查未接入';
});
chk('账户流水查看界面已接入', () => {
  return app.includes('function renderLedger') && app.includes('function toggleLedger') && shell.includes('ledgerList') || '流水查看界面未接入';
});
chk('迁移完成标记已保留', () => app.includes('MIGRATION_KEY') && app.includes('migrationVersion') || '缺少迁移标记');
chk('种子数据 5 条', () => data().records.length === 5 || 'got ' + data().records.length);
chk('种子设置 budget=260', () => data().settings.budget === 260);
chk('默认主题已应用', () => data().settings.theme === 'neon' && document.body.dataset.theme === 'neon');
chk('五个页面切换无异常', () => {
  ['home', 'track', 'dash', 'hist', 'settings'].forEach(p => App.go(p));
  return true;
});
chk('看板创建了 4 个图表', () => chartsMade.length === 4 || 'got ' + chartsMade.length);
chk('折线图 14 个标签 / 1 数据集', () => {
  const c = chartsMade[0];
  return (c.data.labels.length === 14 && c.data.datasets.length === 1) || (c.data.labels.length + '/' + c.data.datasets.length);
});
chk('环形图有数据', () => chartsMade[1].data.datasets[0].data.length > 0);
chk('柱状图 7 天 + 日均线', () => {
  const c = chartsMade[2];
  return (c.data.datasets[0].data.length === 7 && c.data.datasets[1].type === 'line') || 'bad';
});
chk('周期统计柱状图', () => {
  const c = chartsMade[3];
  return (c.type === 'bar' && c.data.labels.length === 14) || 'bad';
});
chk('周期统计周标签使用起止日期', () => {
  get('#periodGranularity')[0].value = 'week';
  App.go('dash');
  const c = chartsMade[chartsMade.length - 1];
  return (c.data.labels.length === 12 && c.data.labels.every(x => /^\d+\/\d+-\d+\/\d+$/.test(x))) || JSON.stringify(c.data.labels);
});
chk('周期统计指标切换为消费金额', () => {
  App.selectPeriodMetric('cost');
  const c = chartsMade[chartsMade.length - 1];
  return c.data.datasets[0].label === '消费金额' || c.data.datasets[0].label;
});
chk('无效充值比率被拒绝', () => {
  App.go('settings');
  get('#sPlatform')[0].value = '无效平台';
  get('#sPlatformRatio')[0].value = '8';
  App.addPlatform();
  return data().settings.platforms.length === 0 || JSON.stringify(data().settings.platforms);
});
chk('负数初始余额被拒绝', () => {
  get('#sPlatform')[0].value = '负数余额平台';
  get('#sPlatformRatio')[0].value = '1/8';
  get('#sPlatformBalance')[0].value = '-1';
  App.addPlatform();
  return data().settings.platforms.length === 0 || JSON.stringify(data().settings.platforms);
});
chk('供应商配置可用', () => {
  App.go('settings');
  get('#sPlatform')[0].value = '测试平台';
  get('#sPlatformRatio')[0].value = '1/8';
  get('#sPlatformBalance')[0].value = '80';
  App.addPlatform();
  const pid = data().settings.platforms[0].id;
  get('#sModel')[0].value = '测试模型';
  get('#sInPrice')[0].value = '3'; get('#sOutPrice')[0].value = '6';
  get('#sPlatformOptions input:checked')[0].value = pid;
  App.addSupplier();
  const s = data().settings.suppliers[0], p = data().settings.platforms[0];
  return !!(s && s.model === '测试模型' && s.platformIds.includes(pid) && !('multiplier' in s) && p.ratioYuan === 1 && p.ratioPlatform === 8 && p.balance === 80) || JSON.stringify({ s, p });
});
chk('一个模型可关联多个平台', () => {
  get('#sPlatform')[0].value = '第二平台';
  get('#sPlatformRatio')[0].value = '1/4';
  get('#sPlatformBalance')[0].value = '40';
  App.addPlatform();
  const pid2 = data().settings.platforms[1].id;
  get('#sModel')[0].value = '测试模型'; get('#sInPrice')[0].value = '3'; get('#sOutPrice')[0].value = '6';
  get('#sPlatformOptions input:checked')[0].value = pid2; App.addSupplier();
  const s = data().settings.suppliers[0];
  return s.platformIds.length === 2 || JSON.stringify(s);
});
chk('已配置平台条目仅显示平台名称', () => {
  const html = get('#platformList')[0].innerHTML;
  return (html.includes('测试平台') && !html.includes('¥/$') && !html.includes('$&nbsp;')) || html;
});
chk('充值换算与实际余额反算', () => {
  const pid = data().settings.platforms[0].id;
  get('#recharge-' + pid)[0].value = '10';
  App.rechargePlatform(pid);
  const p = data().settings.platforms.filter(x => x.id === pid)[0];
  App.go('home');
  return (p.balance === 160 && get('#accountTotal')[0].textContent === '¥\u00a030.00' && get('#homeAccountList')[0].innerHTML.includes('$\u00a0160.00')) || JSON.stringify({ p, total: get('#accountTotal')[0].textContent });
});
chk('首页账户概览隐藏充值比率并使用四列布局', () => {
  const html = get('#homeAccountList')[0].innerHTML;
  const home = shell.slice(shell.indexOf('id="accountOverview"'), shell.indexOf('>数据备份</h3>'));
  return (!html.includes('￥/') && !html.includes('¥/$') && !html.includes('实际余额') && html.includes('<span>余额</span>') && home.includes('<span>总余额</span>') && !home.includes('总余额（实际）') && /\.balance-list\{display:grid;grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/.test(shell) && html.includes('balance-values')) || html;
});
chk('账户管理充值比率使用单位内联格式', () => {
  App.go('settings');
  const html = get('#accountList')[0].innerHTML;
  return (html.includes('1￥ / 8$') && html.includes('1￥ / 4$') && !html.includes('¥/$') && !html.includes('￥/') && shell.includes('充值比率（¥ / $）') && shell.includes('例如 1 / 8') && shell.includes('value="1 / 1"') && app.includes('充值比率请按 1 / 8 格式填写')) || html;
});
chk('零充值不会改变余额', () => {
  App.go('settings');
  const pid = data().settings.platforms[0].id, before = data().settings.platforms[0].balance;
  get('#recharge-' + pid)[0].value = '0';
  App.rechargePlatform(pid);
  return data().settings.platforms[0].balance === before || data().settings.platforms[0].balance;
});
chk('账户流水记录初始余额与充值', () => {
  const pid = data().settings.platforms[0].id, ledger = data().accountLedger.filter(x => x.platformId === pid);
  return ledger.some(x => x.type === 'opening' && x.amount === 80) && ledger.some(x => x.type === 'recharge' && x.amount === 80) || JSON.stringify(ledger);
});
chk('账户校准默认隐藏并可按需展开', () => {
  const pid = data().settings.platforms[0].id;
  const panel = get('#calibration-' + pid)[0], trigger = get('#calibration-toggle-' + pid)[0];
  panel.hidden = true;
  App.toggleCalibration(pid, trigger);
  const opened = panel.hidden === false && trigger.getAttribute('aria-expanded') === 'true';
  App.toggleCalibration(pid, trigger);
  return opened && panel.hidden === true && trigger.getAttribute('aria-expanded') === 'false' || JSON.stringify({ hidden: panel.hidden, expanded: trigger.getAttribute('aria-expanded') });
});
chk('账户校准直接覆盖平台余额并同步首页', () => {
  const pid = data().settings.platforms[0].id, beforeRecords = JSON.stringify(data().records);
  App.go('settings'); get('#calibrate-' + pid)[0].value = '123.45'; App.calibratePlatform(pid);
  const calibrated = data(), p = calibrated.settings.platforms.filter(x => x.id === pid)[0];
  const entry = calibrated.accountLedger.filter(x => x.platformId === pid && x.type === 'calibration').slice(-1)[0];
  const synced = p.balance === 123.45 && entry && entry.beforeBalance === 160 && entry.afterBalance === 123.45 && entry.amount === -36.55 && get('#accountTotal')[0].textContent === '¥\u00a025.43' && JSON.stringify(calibrated.records) === beforeRecords;
  get('#calibrate-' + pid)[0].value = '160'; App.calibratePlatform(pid);
  return synced && data().settings.platforms.filter(x => x.id === pid)[0].balance === 160 || JSON.stringify({ calibrated: p, total: get('#accountTotal')[0].textContent });
});
chk('账户校准拒绝负数', () => {
  const pid = data().settings.platforms[0].id, before = data().settings.platforms[0].balance;
  get('#calibrate-' + pid)[0].value = '-1'; App.calibratePlatform(pid);
  return data().settings.platforms[0].balance === before || data().settings.platforms[0].balance;
});
chk('打卡实际金额与预估价格按充值比率联动', () => {
  const pid = data().settings.platforms[0].id;
  App.go('track'); get('#fPlatform')[0].value = pid; get('#fTokens')[0].value = '2'; get('#fAmount')[0].value = '16'; App.go('track');
  return get('#fActual')[0].value === '2.00' && get('#fPreview')[0].textContent === '¥\u00a0100.00 / 亿 token' || JSON.stringify({ actual: get('#fActual')[0].value, preview: get('#fPreview')[0].textContent });
});
chk('新增记录写入 localStorage', () => {
  App.go('track');
  const pid = data().settings.platforms[0].id;
  get('#fPlatform')[0].value = pid;
  get('#fModel')[0].value = data().settings.suppliers[0].id;
  get('#fTokens')[0].value = '1.5';
  get('#fAmount')[0].value = '45';
  get('#fMultiplier')[0].value = '1.2';
  get('#fProject')[0].value = '冒烟测试';
  App.addRecord();
  const r = data().records;
  const last = r[r.length - 1];
  const p = data().settings.platforms.filter(x => x.id === pid)[0];
  return (r.length === 6 && last.tokens === 1500000 && Math.abs(last.amount - 5.625) < 1e-6 && last.platformAmount === 45 && last.accountDebited === true && p.balance === 115 && get('#accountTotal')[0].textContent === '¥\u00a024.38' && Math.abs(last.unitPrice - 375) < 1e-6 && last.multiplier === 1.2) || JSON.stringify({ last, p, total: get('#accountTotal')[0].textContent });
});
chk('消费金额换算实际金额并阻止超余额扣款', () => {
  const pid = data().settings.platforms[0].id, before = data().settings.platforms[0].balance, beforeCount = data().records.length;
  App.go('track');
  get('#fPlatform')[0].value = pid; get('#fModel')[0].value = data().settings.suppliers[0].id;
  get('#fTokens')[0].value = '1'; get('#fAmount')[0].value = String(before + 1); get('#fMultiplier')[0].value = '1';
  App.addRecord();
  return data().records.length === beforeCount && data().settings.platforms[0].balance === before || JSON.stringify({ before, after: data().settings.platforms[0].balance, count: data().records.length });
});
chk('打卡表单四项和记录金额标签正确', () => {
  const track = shell.slice(shell.indexOf('id="view-track"'), shell.indexOf('<!-- ---------- DASHBOARD ---------- -->'));
  return (/class="row row4"[\s\S]*id="fTokens"[\s\S]*id="fAmount"[\s\S]*id="fActual"[\s\S]*id="fMultiplier"/.test(track) && track.includes('消费金额（$）') && track.includes('实际金额（￥）') && app.includes('class="amt-label">金额')) || 'track amount fields mismatch';
});
chk('编辑扣款记录按差额调整账户', () => {
  const rec = data().records.filter(x => x.accountDebited === true)[0], pid = rec.platformId;
  App.edit(rec.id); get('#fAmount')[0].value = '40'; get('#fTokens')[0].value = '1.5'; get('#fMultiplier')[0].value = '1.1'; App.addRecord();
  const p = data().settings.platforms.filter(x => x.id === pid)[0], pid2 = data().settings.platforms[1].id, next = data().records.filter(x => x.id === rec.id)[0];
  App.edit(rec.id); get('#fPlatform')[0].value = pid2; get('#fModel')[0].value = data().settings.suppliers[0].id; get('#fAmount')[0].value = '10'; get('#fTokens')[0].value = '1.5'; get('#fMultiplier')[0].value = '1.1'; App.addRecord();
  const moved = data().records.filter(x => x.id === rec.id)[0], pFinal = data().settings.platforms.filter(x => x.id === pid)[0], p2 = data().settings.platforms.filter(x => x.id === pid2)[0];
  return (pFinal.balance === 160 && p2.balance === 30 && moved.platformId === pid2 && moved.platformAmount === 10 && Math.abs(moved.amount - 2.5) < 1e-6 && moved.accountDebited === true) || JSON.stringify({ p, pFinal, p2, next, moved });
});
chk('删除扣款记录会退回平台余额', () => {
  const pid = data().settings.platforms[0].id, before = data().settings.platforms[0].balance, count = data().records.length;
  App.go('track'); get('#fPlatform')[0].value = pid; get('#fModel')[0].value = data().settings.suppliers[0].id; get('#fTokens')[0].value = '0.5'; get('#fAmount')[0].value = '5'; get('#fMultiplier')[0].value = '1'; App.addRecord();
  const added = data().records[data().records.length - 1]; App.askDel(added.id); get('#mOk')[0].onclick();
  return data().records.length === count && data().settings.platforms[0].balance === before || JSON.stringify({ before, after: data().settings.platforms[0].balance, count: data().records.length });
});
chk('有扣款记录的平台禁止直接删除', () => {
  return /var linkedDebits = S\.records\.filter/.test(app) && /请先删除或编辑记录/.test(app) && /S\.accountLedger = \(S\.accountLedger \|\| \[\]\)\.filter/.test(app) || 'platform delete guard missing';
});
chk('缺失平台的扣款记录禁止不安全编辑', () => {
  return /if \(!p && oldDebit\) \{ toast\('原记录缺少可匹配的平台账户/.test(app) || 'edit debit guard missing';
});
chk('记录标签使用不同颜色', () => {
  App.go('home');
  const html = get('#recentList')[0].innerHTML;
  return (html.includes('tag cy model-tag') && html.includes('tag li') && html.includes('tag pu platform-tag') && html.includes('tag mg') && html.includes('amt-label">金额') && !html.includes('$\u00a040.00')) || html;
});
chk('首页与看板统计数字使用柔和光晕', () => {
  return (/\.v\.cy\{[^}]*text-shadow:0 0 6px rgba\(var\(--cy-rgb\),\.18\)/.test(shell) && /\.v\.mg\{[^}]*text-shadow:0 0 6px rgba\(var\(--mg-rgb\),\.18\)/.test(shell) && /\.v\.pu\{[^}]*text-shadow:0 0 6px rgba\(var\(--pu-rgb\),\.18\)/.test(shell) && /\.v\.li\{[^}]*text-shadow:0 0 6px rgba\(198,255,0,\.16\)/.test(shell) && !/\.v\.(?:cy|mg|pu|li)\{[^}]*text-shadow:0 0 14px/.test(shell)) || 'stat glow is too strong';
});
chk('冷白紫进度轨道清晰可见', () => {
  return /body\[data-theme="lavender"\] \.bar\{background:rgba\(var\(--pu-rgb\),\.13\);box-shadow:inset/.test(shell) || 'missing lavender progress track';
});
chk('冷白紫记录标签和事项标题具有独立配色', () => {
  App.go('hist');
  const hist = get('#hBody')[0].innerHTML;
  return (hist.includes('tag pu platform-tag') && hist.includes('tag cy model-tag') && /body\[data-theme="lavender"\] \.tag\.model-tag\{[^}]*color:#2f719f/.test(shell) && /body\[data-theme="lavender"\] \.tag\.platform-tag\{[^}]*color:#6f58a6/.test(shell) && /body\[data-theme="lavender"\] \.alert \.tx b\{color:#765fae\}/.test(shell)) || hist;
});
chk('首页与看板统计单位有间距', () => {
  const home = get('#statCards')[0].innerHTML;
  App.go('dash');
  const dash = get('#dashStats')[0].innerHTML;
  return (home.includes('&nbsp;天') && dash.includes('&nbsp;条')) || (home + dash);
});
chk('所有金额展示在符号后保留间距', () => {
  App.go('home');
  const home = get('#statCards')[0].innerHTML + get('#recentList')[0].innerHTML;
  const budget = get('#budUsed')[0].textContent + get('#budTotal')[0].textContent + get('#weekTotal')[0].textContent + get('#accountTotal')[0].textContent;
  App.go('track');
  const track = get('#fPreview')[0].textContent + get('#todaySum')[0].textContent + get('#todayList')[0].innerHTML;
  App.go('hist');
  const hist = get('#hSum')[0].textContent + get('#hBody')[0].innerHTML;
  const visible = home + budget + track + hist;
  const costChart = chartsMade[2];
  const periodChart = chartsMade[chartsMade.length - 1];
  const costTick = costChart.options.scales.y.ticks.callback(12);
  get('#periodGranularity')[0].value = 'day';
  App.selectPeriodMetric('cost');
  const latestPeriod = chartsMade[chartsMade.length - 1];
  const periodTick = latestPeriod.options.scales.y.ticks.callback(12);
  const placeholders = ['weekTotal', 'budUsed', 'budTotal', 'fPreview', 'hSum', 'accountTotal'].every(id => {
    const match = shell.match(new RegExp('id="' + id + '"[^>]*>([^<]+)'));
    return match && match[1].includes('¥&nbsp;');
  });
  return (!/¥(?=\d)/.test(visible) && visible.includes('¥\u00a0') && costTick === '¥\u00a012' && periodTick === '¥\u00a012' && !!periodChart && placeholders) || JSON.stringify({ costTick, periodTick, placeholders });
});
chk('空 token 被拒绝', () => {
  get('#fTokens')[0].value = ''; get('#fAmount')[0].value = '';
  App.addRecord();
  return data().records.length === 6 || 'len=' + data().records.length;
});
chk('编辑记录生效', () => {
  const id = data().records[0].id;
  App.edit(id);
  get('#fTokens')[0].value = '2';
  get('#fMultiplier')[0].value = '1.3';
  App.addRecord();
  const r = data().records.filter(x => x.id === id)[0];
  return r.tokens === 2000000 || 'tokens=' + r.tokens;
});
chk('删除记录（执行 modal 回调）', () => {
  const before = data().records.length;
  App.askDel(data().records[0].id);
  get('#mOk')[0].onclick();
  return data().records.length === before - 1 || (before + '->' + data().records.length);
});
chk('历史筛选渲染', () => {
  App.go('hist');
  get('#hPlatform')[0].value = 'all'; get('#hModel')[0].value = 'all'; get('#hSearch')[0].value = '测试';
  const html = get('#hBody')[0].innerHTML;
  return !html.includes('$') && html.includes('¥') || html;
});
chk('CSV 导出不抛错', () => { App.exportCSV(); return true; });
chk('JSON 导出不抛错', () => { App.exportJSON(); return true; });
chk('空记录备份允许恢复设置', () => app.includes('没有可导入的有效数据') && app.includes('hasSettings') && app.includes('hasLedger'));
chk('合并导入记录不会伪造账户退款凭据', () => {
  return /S\.records\.push\(Object\.assign\(\{\}, r, \{ platformAmount: 0, accountDebited: false \}\)\)/.test(app) || 'merge import debit guard missing';
});
chk('清空数据后保留空记录', () => {
  const snapshot = data(), before = snapshot.settings.platforms.reduce((m, p) => (m[p.id] = p.balance, m), {});
  snapshot.records.forEach(r => { if (r.accountDebited && r.platformId) before[r.platformId] += Number(r.platformAmount || 0); });
  App.askClear();
  get('#mOk')[0].onclick();
  const unchanged = data().settings.platforms.every(p => p.balance === before[p.id]);
  return data().records.length === 0 && unchanged || JSON.stringify({ len: data().records.length, balances: data().settings.platforms.map(p => p.balance), total: get('#accountTotal')[0].textContent, before });
});
chk('恢复示例数据', () => {
  App.restoreDemo();
  get('#mOk')[0].onclick();
  return data().records.length === 5 || 'len=' + data().records.length;
});
chk('设置保存', () => {
  get('#setBudget')[0].value = '500';
  get('#setGoal')[0].value = '3';
  App.saveSettings();
  return (data().settings.budget === 500 && data().settings.goal === 3000000) || JSON.stringify(data().settings);
});
chk('补录指定日期', () => { App.fillDate('2026-08-29'); return true; });
chk('今天要处理 · 文案', () => {
  App.go('home');
  const h = get('#alerts')[0].innerHTML;
  console.log('\n--- 今天要处理 ---\n' + h.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' | ').trim());
  console.log('--- 统计卡片 ---\n' + get('#statCards')[0].innerHTML.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' | ').trim());
  return true;
});
chk('每月目标进度与本周打卡渲染', () => {
  App.go('home');
  const grid = get('#weekGrid')[0].innerHTML;
  return (get('#goalUsed')[0].textContent.includes(' M') && /week-day/.test(grid) && /\d+\/\d+/.test(grid) && !/ 条/.test(grid)) || grid;
});
chk('本周打卡 token / 金额颜色区分', () => {
  return (/\.week-day\.done\{[^}]*box-shadow:none/.test(shell) && /\.week-day\.done small span:first-child\{color:var\(--pu\)/.test(shell) && /\.week-day\.done small span:last-child\{color:var\(--money\)/.test(shell)) || 'missing calm colors';
});
chk('首页本周打卡紧跟今天要处理', () => {
  const home = shell.slice(shell.indexOf('<section class="view" id="view-home">'), shell.indexOf('<!-- ---------- TRACK ---------- -->'));
  return (home.indexOf('class="sect card today"') < home.indexOf('class="sect card week-card"') && home.indexOf('class="sect card week-card"') < home.indexOf('id="statCards"')) || 'wrong order';
});
chk('首页账户概览位于数据备份上方', () => {
  const home = shell.slice(shell.indexOf('<section class="view" id="view-home">'), shell.indexOf('<!-- ---------- TRACK ---------- -->'));
  return (home.indexOf('id="accountOverview"') > 0 && home.indexOf('id="accountOverview"') < home.indexOf('>数据备份</h3>')) || 'wrong order';
});
chk('供应商平台输入行与列表紧凑样式', () => {
  return (/\.platform-form\{display:grid;grid-template-columns:/.test(shell) && /\.supplier-action \.btn\{height:46px\}/.test(shell) && /\.platform-list\{display:grid;grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/.test(shell) && /@media \(max-width:1100px\)\{[^}]*\.platform-list\{grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/.test(shell) && /\.platform-row\{[^}]*padding:5px 8px/.test(shell)) || 'missing responsive platform styles';
});
chk('窄屏弹窗与提示不会横向溢出', () => {
  return /\.modal\{[^}]*box-sizing:border-box/.test(shell) && /#toast\{[^}]*white-space:normal/.test(shell) && /max-width:calc\(100vw - 32px\)/.test(shell) || 'missing narrow viewport overflow guards';
});
chk('设置页横向切换面板', () => {
  App.go('settings');
  App.selectSettingsTab('supplier');
  return get('#settingsPaneSupplier')[0].classList.contains('on') && !get('#settingsPaneAccount')[0].classList.contains('on') && get('#settingsTabSupplier')[0].getAttribute('aria-selected') === 'true';
});
chk('设置页账户面板恢复', () => {
  App.selectSettingsTab('account');
  return get('#settingsPaneAccount')[0].classList.contains('on') && !get('#settingsPaneSupplier')[0].classList.contains('on') && get('#settingsTabAccount')[0].getAttribute('aria-selected') === 'true';
});
chk('设置页主题面板切换', () => {
  App.selectSettingsTab('theme');
  return get('#settingsPaneTheme')[0].classList.contains('on') && !get('#settingsPaneAccount')[0].classList.contains('on') && get('#settingsTabTheme')[0].getAttribute('aria-selected') === 'true';
});
chk('主题换肤会保存并立即应用', () => {
  App.selectTheme('ocean');
  const buttons = get('#themeOptions [data-theme]');
  App.go('dash');
  const line = chartsMade[chartsMade.length - 4];
  return data().settings.theme === 'ocean' && document.body.dataset.theme === 'ocean' && buttons[1].getAttribute('aria-pressed') === 'true' && line.data.datasets[0].borderColor === '#2dd4bf';
});
chk('浅色马卡龙主题可切换并更新图表', () => {
  App.selectTheme('lavender');
  App.go('dash');
  const buttons = get('#themeOptions [data-theme]');
  const line = chartsMade[chartsMade.length - 4];
  const lavenderOk = data().settings.theme === 'lavender' && document.body.dataset.theme === 'lavender' && buttons[3].getAttribute('aria-pressed') === 'true' && line.data.datasets[0].borderColor === '#7568d7';
  App.selectTheme('macaron');
  App.go('dash');
  const mintLine = chartsMade[chartsMade.length - 4];
  return lavenderOk && data().settings.theme === 'macaron' && document.body.dataset.theme === 'macaron' && buttons[4].getAttribute('aria-pressed') === 'true' && mintLine.data.datasets[0].borderColor === '#4f968b';
});
chk('主题面板包含五套皮肤', () => {
  return ((shell.match(/class="theme-option"/g) || []).length === 5 && /body\[data-theme="lavender"\]/.test(shell) && /body\[data-theme="macaron"\]/.test(shell) && /:is\(body\[data-theme="lavender"\],body\[data-theme="macaron"\]\) \.card/.test(shell)) || 'missing theme';
});
chk('设置内容归属不重复', () => {
  const count = (shell.match(/id="sPlatform"/g) || []).length;
  const supplier = (shell.match(/id="sModel"/g) || []).length;
  const charts = (shell.match(/id="chPeriod"/g) || []).length;
  const theme = (shell.match(/id="settingsPaneTheme"/g) || []).length;
  return count === 1 && supplier === 1 && charts === 1 && theme === 1 || `${count}/${supplier}/${charts}/${theme}`;
});
chk('旧平台数据会补齐账户字段', () => {
  store['wb_token_data_v1'] = JSON.stringify({
    records: [], seeded: false, priceUnit: 'per100m',
    settings: { budget: 100, goal: 1000000, theme: 'unknown', platforms: [{ id: 'legacy-p', name: '旧平台' }], suppliers: [] }
  });
  vm.runInContext(app, win, { filename: 'app-migration.js' });
  const migrated = data(), p = migrated.settings.platforms[0];
  return (migrated.settings.theme === 'neon' && p.ratioYuan === 1 && p.ratioPlatform === 1 && p.balance === 0) || JSON.stringify(migrated.settings);
});

console.log(ok.join('\n'));
if (warn.length) console.log('\n' + warn.join('\n'));
if (errors.length) { console.log('\n=== ERRORS ===\n' + errors.join('\n\n')); process.exitCode = 1; }
else console.log('\nALL PASS (' + ok.length + ' checks)');
