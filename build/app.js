/* =========================================================
   Token 消耗打卡台 · 应用逻辑
   存储：IndexedDB（localStorage 仅作旧数据迁移与降级备份）
   图表：Chart.js v4.4.1（已内联，离线可用）
   ========================================================= */
(function () {
  'use strict';

  var KEY = 'wb_token_data_v1';
  var MIGRATION_KEY = KEY + '_migration_v3';
  var DB_NAME = 'wb_token_data_db';
  var DB_VERSION = 1;
  var THEMES = {
    neon: { meta: '#05060f', cy: '#00f0ff', cyRgb: '0,240,255', mg: '#ff2d95', mgRgb: '255,45,149', pu: '#a855f7', puRgb: '168,85,247', tx: '#e8f1ff', tx2: '#8fa0cc', panel: '#0b0f26', palette: ['#00f0ff', '#ff2d95', '#a855f7', '#c6ff00', '#ff9f1c', '#00ffa3', '#5b8cff', '#ff6b3d'] },
    ocean: { meta: '#041014', cy: '#2dd4bf', cyRgb: '45,212,191', mg: '#fb7185', mgRgb: '251,113,133', pu: '#60a5fa', puRgb: '96,165,250', tx: '#e5f7f5', tx2: '#91b8b5', panel: '#071d22', palette: ['#2dd4bf', '#fb7185', '#60a5fa', '#bef264', '#fbbf24', '#34d399', '#a78bfa', '#fb923c'] },
    ember: { meta: '#120d12', cy: '#fbbf24', cyRgb: '251,191,36', mg: '#f43f5e', mgRgb: '244,63,94', pu: '#c084fc', puRgb: '192,132,252', tx: '#fff4e8', tx2: '#c5a99d', panel: '#21151d', palette: ['#fbbf24', '#f43f5e', '#c084fc', '#34d399', '#fb923c', '#22d3ee', '#f472b6', '#a3e635'] },
    lavender: { meta: '#f6f7fb', cy: '#7568d7', cyRgb: '117,104,215', mg: '#cc6f9d', mgRgb: '204,111,157', pu: '#9275ce', puRgb: '146,117,206', tx: '#302d40', tx2: '#686278', panel: '#ffffff', palette: ['#7568d7', '#cc6f9d', '#6e9ed0', '#76a982', '#dda36f', '#79aea5', '#a486cf', '#d98787'] },
    macaron: { meta: '#f3faf8', cy: '#4f968b', cyRgb: '79,150,139', mg: '#cf7899', mgRgb: '207,120,153', pu: '#8978c2', puRgb: '137,120,194', tx: '#2d3b3b', tx2: '#647675', panel: '#ffffff', palette: ['#4f968b', '#cf7899', '#8978c2', '#74a7ca', '#d5a46f', '#73a984', '#b28ac2', '#d6857b'] }
  };
  var particleRefresh = function () {};

  /* ---------------- utils ---------------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function today() { return ymd(new Date()); }
  function addDays(d, n) { var x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; }
  function parseD(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function validDate(s) {
    var v = String(s == null ? '' : s).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return '';
    var d = parseD(v);
    return isFinite(d.getTime()) && ymd(d) === v ? v : '';
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }
  function num(v) {
    if (v == null || String(v).trim() === '') return 0;
    var n = typeof v === 'number' ? v : Number(String(v).trim());
    return isFinite(n) && n >= 0 ? n : 0;
  }
  function money(n) { return '¥\u00a0' + (isFinite(n) ? n : 0).toFixed(2); }
  function dollar(n) { return '$\u00a0' + (isFinite(n) ? n : 0).toFixed(2); }
  function round2(n) { return Math.round((num(n) + Number.EPSILON) * 100) / 100; }
  function roundSigned2(n) { var v = signedNum(n); return Math.round((v + (v >= 0 ? Number.EPSILON : -Number.EPSILON)) * 100) / 100; }
  function plainNum(n) { return String(Number(num(n).toFixed(4))); }
  function fmtInt(n) { return (Math.round(n) || 0).toLocaleString('en-US'); }
  function fmtTok(n) {
    var m = num(n) / 1e6;
    var digits = m >= 100 ? 0 : m >= 10 ? 1 : m >= 1 ? 2 : 3;
    return m.toFixed(digits) + ' M';
  }
  function uid() { return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function monthOf(s) { return String(s).slice(0, 7); }
  function dayLabel(s) { var p = String(s).split('-'); return p[1] + '月' + p[2] + '日'; }
  function relDay(s) {
    var diff = Math.round((parseD(today()) - parseD(s)) / 86400000);
    if (diff === 0) return '今天';
    if (diff === 1) return '昨天';
    if (diff === 2) return '前天';
    return diff + '天前';
  }

  var ICON = {
    home: '<path d="M3 10.5L12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9.5 21v-6h5v6"/>',
    track: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
    dash: '<path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/>',
    hist: '<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3 4v5h5"/><path d="M12 7.5V12l3 1.8"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.8 1.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5v.2h-2.6v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1-1.8-1.8.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H7v-2.6h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1 1.8-1.8.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5V5h2.6v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1 1.8 1.8-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.2v2.6h-.2a1.7 1.7 0 0 0-1.5 1z"/>',
    bolt: '<path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z"/>',
    coin: '<circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.5h5M9.5 14.5h5"/>',
    fire: '<path d="M12 2s5 4.5 5 9a5 5 0 0 1-10 0c0-1.6.7-3 1.5-4.2"/><path d="M12 22a5 5 0 0 0 5-5"/>',
    chart: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
    token: '<circle cx="12" cy="12" r="9"/><path d="M9 9h6M9 13h6M9 17h3"/>',
    clock: '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/>',
    warn: '<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    check: '<path d="M22 11.1V12a10 10 0 1 1-5.9-9.1"/><polyline points="22 4 12 14.1 9 11.1"/>',
    edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z"/>',
    trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/>',
    save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>',
    empty: '<circle cx="11" cy="11" r="7"/><line x1="20" y1="20" x2="16" y2="16"/>',
    reset: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><polyline points="3 3 3 8 8 8"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13l3.5 7v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z"/>'
  };
  function svg(n, cls) { return '<svg viewBox="0 0 24 24"' + (cls ? ' class="' + cls + '"' : '') + '>' + (ICON[n] || '') + '</svg>'; }

  /* ---------------- state ---------------- */
  function defaultSettings() { return { budget: 260, goal: 200000, theme: 'neon', platforms: [], suppliers: [] }; }
  var S = { records: [], accountLedger: [], settings: defaultSettings(), seeded: false, priceUnit: 'per100m', meta: { migrationVersion: 0, migratedAt: '', lastBackupAt: '', backupCount: 0, backupHistory: [] } };
  var dbPromise = null, idbReady = false, idbLoading = false, pendingLocalChanges = false, saveChain = Promise.resolve(), legacyStateTimestamp = 0;
  var editId = null;
  var charts = {};
  var curPage = 'home';
  var histLimit = 100;
  var settingsTab = 'account';

  function normalizeTheme(theme) { return Object.prototype.hasOwnProperty.call(THEMES, theme) ? theme : 'neon'; }
  function normalizeMeta(raw) {
    var src = raw && typeof raw === 'object' ? raw : {}, history = Array.isArray(src.backupHistory) ? src.backupHistory.filter(function (v) { return typeof v === 'string' && v; }).slice(-10) : [];
    return { migrationVersion: num(src.migrationVersion), migratedAt: String(src.migratedAt || ''), lastBackupAt: String(src.lastBackupAt || ''), backupCount: Math.max(0, Math.floor(num(src.backupCount))), backupHistory: history, lastWriteAt: Math.max(0, Math.floor(num(src.lastWriteAt))) };
  }
  function themeConfig() { return THEMES[normalizeTheme(S.settings && S.settings.theme)]; }
  function applyTheme(theme) {
    var key = normalizeTheme(theme), cfg = THEMES[key];
    if (document.body) document.body.dataset.theme = key;
    var meta = $('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', cfg.meta);
    particleRefresh();
  }
  function parseRechargeRatio(value) {
    var text = String(value == null ? '' : value).trim().replace(/：/g, '/').replace(/:/g, '/');
    var m = text.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
    if (!m) return null;
    var yuan = Number(m[1]), platform = Number(m[2]);
    return isFinite(yuan) && isFinite(platform) && yuan > 0 && platform > 0 ? { yuan: yuan, platform: platform } : null;
  }
  function platformRatio(p) {
    var yuan = num(p && p.ratioYuan), platform = num(p && p.ratioPlatform);
    return { yuan: yuan > 0 ? yuan : 1, platform: platform > 0 ? platform : 1 };
  }
  function ratioLabel(p) {
    var ratio = platformRatio(p);
    return plainNum(ratio.yuan) + '￥ / ' + plainNum(ratio.platform) + '$';
  }
  function actualBalance(p) {
    var ratio = platformRatio(p);
    return num(p && p.balance) * ratio.yuan / ratio.platform;
  }
  function platformAmountToYuan(p, amount) {
    var ratio = platformRatio(p);
    return num(amount) * ratio.yuan / ratio.platform;
  }

  function safeId(id) {
    var v = String(id == null ? '' : id);
    return /^[A-Za-z0-9_-]{1,80}$/.test(v) ? v : uid();
  }
  function normalizePlatform(p) {
    if (p && typeof p === 'object') {
      var name = String(p.name || p.platform || '').trim().slice(0, 40);
      if (!name) return null;
      var directRatio = { yuan: num(p.ratioYuan), platform: num(p.ratioPlatform) };
      var parsedRatio = parseRechargeRatio(p.ratio || p.rechargeRatio);
      var ratio = directRatio.yuan > 0 && directRatio.platform > 0 ? directRatio : (parsedRatio || { yuan: 1, platform: 1 });
      return {
        id: safeId(p.id), name: name,
        ratioYuan: ratio.yuan, ratioPlatform: ratio.platform,
        balance: round2(p.balance != null ? p.balance : p.platformBalance)
      };
    }
    var text = String(p == null ? '' : p).trim().slice(0, 40);
    return text ? { id: uid(), name: text, ratioYuan: 1, ratioPlatform: 1, balance: 0 } : null;
  }
  function normalizeSupplier(s) {
    if (!s || typeof s !== 'object') return null;
    var model = String(s.model || s.name || '').trim().slice(0, 60);
    if (!model) return null;
    var ids = [];
    (Array.isArray(s.platformIds) ? s.platformIds : []).forEach(function (id) {
      id = String(id || '').trim(); if (id && ids.indexOf(id) < 0) ids.push(id);
    });
    if (s.platform) ids.push('__legacy__' + String(s.platform).trim());
    if (Array.isArray(s.platforms)) s.platforms.forEach(function (p) { ids.push('__legacy__' + String(p && p.name || p || '').trim()); });
    ids = ids.filter(function (id, i) { return id && ids.indexOf(id) === i; });
    return {
      id: safeId(s.id), model: model,
      inPrice: num(s.inPrice), outPrice: num(s.outPrice), platformIds: ids
    };
  }
  function normalizeSettings(raw) {
    var src = raw && typeof raw === 'object' ? raw : {}, out = defaultSettings();
    out.budget = src.budget == null ? out.budget : num(src.budget);
    out.goal = src.goal == null ? out.goal : num(src.goal);
    out.theme = normalizeTheme(src.theme);
    var platforms = [], byName = {}, byId = {}, usedIds = {};
    function ensurePlatform(value, preferredId) {
      var source = value && typeof value === 'object' ? Object.assign({}, value) : { name: value };
      if (preferredId) source.id = preferredId;
      var p = normalizePlatform(source);
      if (!p) return null;
      if (byName[p.name]) return byName[p.name];
      if (usedIds[p.id]) p.id = uid();
      usedIds[p.id] = 1; byName[p.name] = p; byId[p.id] = p; platforms.push(p); return p;
    }
    (Array.isArray(src.platforms) ? src.platforms : []).forEach(function (p) {
      if (p && typeof p === 'object') ensurePlatform(p, p.id); else ensurePlatform(p);
    });
    var oldToNew = {}, models = [], byModel = {}, usedModelIds = {};
    var rawModels = Array.isArray(src.suppliers) ? src.suppliers : (Array.isArray(src.models) ? src.models : []);
    rawModels.forEach(function (rawModel) {
      var n = normalizeSupplier(rawModel); if (!n) return;
      var m = byModel[n.model];
      if (!m) {
        m = { id: n.id, model: n.model, inPrice: n.inPrice, outPrice: n.outPrice, platformIds: [] };
        if (usedModelIds[m.id]) m.id = uid();
        usedModelIds[m.id] = 1; byModel[m.model] = m; models.push(m);
      } else {
        if (!m.inPrice && n.inPrice) m.inPrice = n.inPrice;
        if (!m.outPrice && n.outPrice) m.outPrice = n.outPrice;
      }
      if (rawModel.id) oldToNew[String(rawModel.id)] = m.id;
      var names = [];
      if (rawModel.platform) names.push(rawModel.platform);
      if (Array.isArray(rawModel.platforms)) rawModel.platforms.forEach(function (p) { names.push(p && p.name || p); });
      if (Array.isArray(rawModel.platformIds)) rawModel.platformIds.forEach(function (id) {
        var existing = byId[String(id)]; if (existing) names.push(existing.name);
      });
      names.forEach(function (name) {
        var p = ensurePlatform(name); if (p && m.platformIds.indexOf(p.id) < 0) m.platformIds.push(p.id);
      });
    });
    out.platforms = platforms; out.suppliers = models;
    return { settings: out, oldToNew: oldToNew };
  }
  function normalizeRecord(r, seen, legacyPrice, supplierMap) {
    if (!r || typeof r !== 'object') return null;
    var date = validDate(r.date);
    if (!date || date > today()) return null;
    var legacyTokens = num(r.inTok) + num(r.outTok);
    var tokens = num(r.tokens != null ? r.tokens : legacyTokens);
    var legacyAmount = legacyTokens / 1e6 * num(r.price);
    var amount = num(r.amount != null ? r.amount : legacyAmount);
    var calculatedPrice = tokens > 0 ? amount / tokens * 1e8 : 0;
    var unitPrice = r.estimatedPrice != null ? num(r.estimatedPrice) :
      (r.pricePer100m != null ? num(r.pricePer100m) :
        (r.unitPrice != null ? num(r.unitPrice) * (legacyPrice ? 100 : 1) : calculatedPrice));
    var id = safeId(r.id);
    if (seen && seen[id]) id = uid();
    if (seen) seen[id] = 1;
    return {
      id: id, date: date,
      supplierId: (supplierMap && supplierMap[String(r.supplierId || '')]) || String(r.supplierId || '').trim().slice(0, 80),
      platform: String(r.platform || '').trim().slice(0, 40),
      model: String(r.model || '未命名模型').trim().slice(0, 60),
      tokens: Math.round(tokens), amount: amount, unitPrice: unitPrice,
      platformId: String(r.platformId || '').trim().slice(0, 80),
      platformAmount: round2(r.platformAmount != null ? r.platformAmount : r.consumeAmount),
      accountDebited: r.accountDebited === true && num(r.platformAmount != null ? r.platformAmount : r.consumeAmount) > 0,
      multiplier: num(r.multiplier) || 1,
      project: String(r.project || '').trim().slice(0, 24),
      note: String(r.note || '').trim().slice(0, 60),
      createdAt: isFinite(Number(r.createdAt)) ? Number(r.createdAt) : Date.now()
    };
  }
  function signedNum(v) {
    if (v == null || String(v).trim() === '') return 0;
    var n = typeof v === 'number' ? v : Number(String(v).trim());
    return isFinite(n) ? n : 0;
  }
  function normalizeLedgerEntry(e, seen) {
    if (!e || typeof e !== 'object') return null;
    var platformId = String(e.platformId || '').trim().slice(0, 80);
    if (!platformId) return null;
    var id = safeId(e.id);
    if (seen && seen[id]) id = uid();
    if (seen) seen[id] = 1;
    var amount = roundSigned2(e.amount);
    return {
      id: id, platformId: platformId,
      type: String(e.type || 'adjustment').trim().slice(0, 24) || 'adjustment',
      amount: amount,
      beforeBalance: round2(signedNum(e.beforeBalance)),
      afterBalance: round2(signedNum(e.afterBalance)),
      relatedRecordId: String(e.relatedRecordId || '').trim().slice(0, 80),
      reason: String(e.reason || '').trim().slice(0, 120),
      createdAt: isFinite(Number(e.createdAt)) ? Number(e.createdAt) : Date.now()
    };
  }
  function migrationLedger(platforms) {
    return (platforms || []).map(function (p) {
      var balance = round2(num(p.balance));
      return { id: uid(), platformId: p.id, type: 'migration_snapshot', amount: balance,
        beforeBalance: 0, afterBalance: balance, relatedRecordId: '',
        reason: '从旧版本地数据迁移时的余额快照', createdAt: Date.now() };
    });
  }
  function rebuildBalancesFromLedger() {
    var sums = {};
    (S.accountLedger || []).forEach(function (e) { sums[e.platformId] = roundSigned2((sums[e.platformId] || 0) + signedNum(e.amount)); });
    (S.settings.platforms || []).forEach(function (p) { if (Object.prototype.hasOwnProperty.call(sums, p.id)) p.balance = round2(Math.max(0, sums[p.id])); });
  }
  function ensureLedger() {
    var raw = Array.isArray(S.accountLedger) ? S.accountLedger : [], seen = {}, clean = [];
    raw.forEach(function (e) { var n = normalizeLedgerEntry(e, seen); if (n) clean.push(n); });
    S.accountLedger = clean;
    var covered = {};
    clean.forEach(function (e) { covered[e.platformId] = 1; });
    (S.settings.platforms || []).forEach(function (p) {
      if (!covered[p.id]) { S.accountLedger.push(migrationLedger([p])[0]); }
    });
    rebuildBalancesFromLedger();
  }
  function cloneState() { return JSON.parse(JSON.stringify(S)); }
  function readLegacyState() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return false;
      var o = JSON.parse(raw);
      if (!o || !Array.isArray(o.records)) return false;
      var migrated = normalizeSettings(o.settings || {}), seen = {};
      S.settings = migrated.settings;
      S.priceUnit = 'per100m';
      var legacyPrice = o.priceUnit !== 'per100m';
      S.records = o.records.map(function (r) { return normalizeRecord(r, seen, legacyPrice, migrated.oldToNew); }).filter(Boolean);
      S.accountLedger = Array.isArray(o.accountLedger) ? o.accountLedger : [];
      S.seeded = !!o.seeded;
      S.meta = normalizeMeta(o.meta);
      legacyStateTimestamp = S.meta.lastWriteAt;
      if (!S.meta.migrationVersion) { S.meta.migrationVersion = 3; S.meta.migratedAt = new Date().toISOString(); }
      ensureLedger();
      return true;
    } catch (e) { return false; }
  }
  function openDB() {
    if (!window.indexedDB) return Promise.reject(new Error('indexedDB unavailable'));
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      var req;
      try { req = window.indexedDB.open(DB_NAME, DB_VERSION); } catch (e) { reject(e); return; }
      req.onupgradeneeded = function () { if (!req.result.objectStoreNames.contains('state')) req.result.createObjectStore('state', { keyPath: 'id' }); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error('indexedDB open failed')); };
    });
    return dbPromise;
  }
  function readIndexedState(db) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction('state', 'readonly'), req = tx.objectStore('state').get('current');
      req.onsuccess = function () { resolve(req.result && req.result.state ? req.result.state : null); };
      req.onerror = function () { reject(req.error || new Error('indexedDB read failed')); };
    });
  }
  function writeIndexedState(snapshot) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction('state', 'readwrite');
        tx.objectStore('state').put({ id: 'current', state: snapshot });
        tx.oncomplete = function () { try { localStorage.setItem(MIGRATION_KEY, snapshot.meta && snapshot.meta.migratedAt || new Date().toISOString()); } catch (e) {} resolve(); };
        tx.onerror = function () { reject(tx.error || new Error('indexedDB write failed')); };
        tx.onabort = function () { reject(tx.error || new Error('indexedDB write aborted')); };
      });
    });
  }
  function requestPersistentStorage() {
    if (typeof navigator === 'undefined' || !navigator.storage || !navigator.storage.persist) return;
    try { navigator.storage.persist(); } catch (e) {}
  }
  function load() {
    var hasLegacy = readLegacyState();
    if (!hasLegacy) { seed(); ensureLedger(); S.meta = normalizeMeta(S.meta); S.meta.migrationVersion = 3; S.meta.migratedAt = S.meta.migratedAt || new Date().toISOString(); }
    if (!window.indexedDB) { save(); return; }
    idbLoading = true;
    openDB().then(function (db) { return readIndexedState(db).then(function (state) { return { db: db, state: state }; }); })
      .then(function (result) {
        var idbTimestamp = result.state && result.state.meta ? normalizeMeta(result.state.meta).lastWriteAt : 0;
        if (!pendingLocalChanges && result.state && result.state.settings && Array.isArray(result.state.records) && legacyStateTimestamp <= idbTimestamp) {
          var raw = result.state, migrated = normalizeSettings(raw.settings || {}), seen = {};
          S.settings = migrated.settings; S.priceUnit = 'per100m';
          S.records = raw.records.map(function (r) { return normalizeRecord(r, seen, raw.priceUnit !== 'per100m', migrated.oldToNew); }).filter(Boolean);
          S.accountLedger = Array.isArray(raw.accountLedger) ? raw.accountLedger : [];
          S.seeded = !!raw.seeded; S.meta = normalizeMeta(raw.meta); ensureLedger();
        } else {
          ensureLedger();
        }
        idbLoading = false; idbReady = true; requestPersistentStorage(); save(); refresh();
      })
      .catch(function () {
        idbLoading = false; idbReady = false; save();
        toast('IndexedDB 不可用，已临时使用浏览器降级存储，请及时导出备份', 'err');
      });
  }
  function save() {
    var snapshot = cloneState();
    snapshot.meta = normalizeMeta(snapshot.meta);
    if (snapshot.meta.migrationVersion < 3) { snapshot.meta.migrationVersion = 3; snapshot.meta.migratedAt = snapshot.meta.migratedAt || new Date().toISOString(); S.meta = snapshot.meta; }
    snapshot.meta.lastWriteAt = Date.now(); S.meta.lastWriteAt = snapshot.meta.lastWriteAt;
    if (idbLoading) pendingLocalChanges = true;
    var localSaved = true;
    try { localStorage.setItem(KEY, JSON.stringify(snapshot)); } catch (e) { localSaved = false; setSync(false); }
    if (idbReady) {
      saveChain = saveChain.then(function () { return writeIndexedState(snapshot); }).then(function () { setSync(true); }).catch(function () {
        setSync(false); toast('IndexedDB 保存失败，请立即导出备份', 'err');
      });
      return;
    }
    try { if (snapshot.meta.migrationVersion >= 3) localStorage.setItem(MIGRATION_KEY, snapshot.meta.migratedAt || new Date().toISOString()); setSync(localSaved); }
    catch (e) { setSync(false); toast('保存失败：存储空间不足或被禁用', 'err'); }
  }
  function setSync(ok) {
    var d = $('#syncDot'), t = $('#syncTxt');
    if (!d) return;
    d.className = 'dot' + (ok ? '' : ' warn');
    t.textContent = ok ? (idbReady ? 'IndexedDB 已连接' : (location.protocol === 'file:' ? '降级存储，请定期备份' : '本地降级存储')) : '存储不可用（离线）';
    if (!idbReady && ok) d.className = 'dot warn';
  }
  function seed() {
    var now = new Date();
    var d = function (n) { return ymd(addDays(now, -n)); };
    S.records = [
      { id: uid(), date: d(5), platform: '', model: 'GPT-4o', tokens: 2270000, amount: 68.10, unitPrice: 3000, multiplier: 1, project: '代码助手', note: '重构订单模块', createdAt: Date.now() - 5e8 },
      { id: uid(), date: d(4), platform: '', model: 'DeepSeek', tokens: 2780000, amount: 22.24, unitPrice: 800, multiplier: 1, project: '批量摘要', note: '日报自动摘要', createdAt: Date.now() - 4e8 },
      { id: uid(), date: d(4), platform: '', model: 'Claude', tokens: 850000, amount: 38.25, unitPrice: 4500, multiplier: 1, project: '长文档分析', note: '合同审阅', createdAt: Date.now() - 4e8 + 1000 },
      { id: uid(), date: d(3), platform: '', model: 'GPT-4o', tokens: 1470000, amount: 44.10, unitPrice: 3000, multiplier: 1, project: '客服机器人', note: '话术调优', createdAt: Date.now() - 3e8 },
      { id: uid(), date: d(2), platform: '', model: '通义千问', tokens: 3720000, amount: 44.64, unitPrice: 1200, multiplier: 1, project: '数据清洗', note: '标注数据预处理', createdAt: Date.now() - 2e8 }
    ];
    S.seeded = true;
  }

  /* ---------------- derived ---------------- */
  function costOf(r) {
    if (r && r.amount != null) return num(r.amount);
    return (num(r.inTok) + num(r.outTok)) / 1e6 * num(r.price);
  }
  function tokOf(r) { return r && r.tokens != null ? num(r.tokens) : num(r.inTok) + num(r.outTok); }
  function platformById(id) { return (S.settings.platforms || []).filter(function (p) { return p.id === id; })[0] || null; }
  function platformForRecord(r) {
    var p = platformById(r && r.platformId);
    if (p) return p;
    return (S.settings.platforms || []).filter(function (x) { return x.name === String(r && r.platform || ''); })[0] || null;
  }
  function debitOf(r) { return r && r.accountDebited === true ? round2(r.platformAmount) : 0; }
  function refundRecordDebits(records) {
    var list = records || [], entries = [];
    for (var i = 0; i < list.length; i++) {
      var debit = debitOf(list[i]);
      if (!debit) continue;
      var p = platformForRecord(list[i]);
      if (!p) return false;
      entries.push({ record: list[i], platform: p, amount: debit });
    }
    entries.forEach(function (entry) {
      accountDelta(entry.platform, entry.amount, 'refund', entry.record.id, '删除或清理打卡记录退回扣款');
    });
    return true;
  }
  function accountDelta(p, delta, type, relatedRecordId, reason) {
    if (!p) return;
    var before = round2(num(p.balance)), amount = roundSigned2(delta), after = round2(before + amount);
    p.balance = after;
    if (!Array.isArray(S.accountLedger)) S.accountLedger = [];
    S.accountLedger.push({ id: uid(), platformId: p.id, type: type || 'adjustment', amount: amount,
      beforeBalance: before, afterBalance: after, relatedRecordId: relatedRecordId || '',
      reason: reason || '', createdAt: Date.now() });
  }
  function platformName(id) { var p = platformById(id); return p ? p.name : ''; }
  function modelPlatforms(s) { return (s && Array.isArray(s.platformIds) ? s.platformIds : []).map(platformName).filter(Boolean); }
  function modelAvailableOn(s, platformId) { return !!(s && platformId && Array.isArray(s.platformIds) && s.platformIds.indexOf(platformId) >= 0); }
  function supplierLabel(s) { return String(s.model || '未命名模型') + '（' + (modelPlatforms(s).join('、') || '未关联平台') + '）'; }
  function monthRecords(m) { m = m || monthOf(today()); return S.records.filter(function (r) { return monthOf(r.date) === m; }); }
  function sumTok(list) { return list.reduce(function (a, r) { return a + tokOf(r); }, 0); }
  function sumCost(list) { return list.reduce(function (a, r) { return a + costOf(r); }, 0); }
  function streak() {
    var set = {};
    S.records.forEach(function (r) { set[r.date] = 1; });
    var cur = new Date(), n = 0;
    if (!set[ymd(cur)]) cur = addDays(cur, -1);
    while (set[ymd(cur)]) { n++; cur = addDays(cur, -1); }
    return n;
  }
  function missingDays(back) {
    var set = {}, out = [];
    S.records.forEach(function (r) { set[r.date] = 1; });
    for (var i = 1; i <= back; i++) {
      var ds = ymd(addDays(new Date(), -i));
      if (!set[ds]) out.push(ds);
    }
    return out;
  }

  function renderWeek() {
    var start = floorPeriod(new Date(), 'week');
    var names = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    var todayStr = today(), done = 0, totalTok = 0, totalCost = 0;
    var byDate = {};
    S.records.forEach(function (r) {
      byDate[r.date] = (byDate[r.date] || 0) + 1;
    });
    var html = [];
    for (var i = 0; i < 7; i++) {
      var date = addDays(start, i), ds = ymd(date), count = byDate[ds] || 0;
      var dayRec = S.records.filter(function (r) { return r.date === ds; });
      var isDone = count > 0, isFuture = ds > todayStr;
      if (isDone) { done++; totalTok += sumTok(dayRec); totalCost += sumCost(dayRec); }
      html.push('<div class="week-day' + (isDone ? ' done' : '') + (ds === todayStr ? ' today' : '') + (isFuture ? ' future' : '') + '">' +
        '<span class="wd-name">' + names[i] + '</span><b>' + (date.getMonth() + 1) + '/' + date.getDate() + '</b><small>' +
        (isDone ? '<span>' + esc(fmtTok(sumTok(dayRec))) + '</span><span>' + esc(money(sumCost(dayRec))) + '</span>' : (isFuture ? '待开始' : '未打卡')) + '</small></div>');
    }
    $('#weekCount').textContent = done + '/7 天';
    $('#weekCount').className = 'tag ' + (done === 7 ? 'gr' : done > 0 ? 'cy' : 'mg');
    $('#weekHint').textContent = done ? '本周已打卡 ' + done + ' 天，继续保持节奏' : '本周还没有打卡记录';
    $('#weekTotal').textContent = fmtTok(totalTok) + ' · ' + money(totalCost);
    $('#weekGrid').innerHTML = html.join('');
  }

  function renderAccountOverview() {
    var list = S.settings.platforms || [];
    var total = list.reduce(function (sum, p) { return sum + actualBalance(p); }, 0);
    $('#accountTotal').textContent = money(total);
    $('#accountPlatformCount').textContent = list.length + ' 个平台';
    $('#homeAccountList').innerHTML = list.map(function (p) {
      return '<div class="balance-item">' +
        '<div class="balance-name"><b>' + esc(p.name) + '</b></div>' +
        '<div class="balance-values"><div class="balance-value"><span>余额</span><b>' + esc(money(actualBalance(p))) + '</b></div>' +
        '<div class="balance-value platform"><span>平台余额</span><b>' + esc(dollar(num(p.balance))) + '</b></div></div>' +
        '</div>';
    }).join('');
    $('#homeAccountEmpty').style.display = list.length ? 'none' : 'block';
    renderLedger();
  }
  function ledgerTypeLabel(type) {
    return ({ opening: '初始余额', recharge: '充值', consume: '消费', refund: '退款', calibration: '校准', migration_snapshot: '迁移快照' }[type] || type || '调整');
  }
  function renderLedger() {
    var box = $('#ledgerList'); if (!box) return;
    var list = (S.accountLedger || []).slice().sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); }).slice(0, 20);
    box.innerHTML = list.map(function (e) {
      var p = platformById(e.platformId), amount = signedNum(e.amount);
      return '<div class="ledger-item"><span class="ledger-type">' + esc(ledgerTypeLabel(e.type)) + '</span><span class="ledger-reason">' + esc((p ? p.name + ' · ' : '') + (e.reason || '')) + '</span><span class="ledger-amount" style="color:' + (amount < 0 ? 'var(--mg)' : 'var(--cy)') + '">' + (amount > 0 ? '+' : '') + dollar(amount) + '</span></div>';
    }).join('') || '<div class="empty" style="padding:14px">暂无流水</div>';
  }
  function toggleLedger() {
    var list = $('#ledgerList'), button = $('#ledgerToggle'); if (!list) return;
    var open = !list.classList.contains('on'); list.classList.toggle('on', open);
    if (button) { button.setAttribute('aria-expanded', open ? 'true' : 'false'); button.textContent = open ? '收起流水' : '查看流水'; }
  }
  function formatBackupTime(value) {
    if (!value) return '尚未导出';
    var d = new Date(value); return isFinite(d.getTime()) ? d.toLocaleString() : '已记录';
  }
  function renderBackupMeta() {
    var meta = normalizeMeta(S.meta), at = $('#lastBackupAt'), count = $('#backupCount');
    if (at) at.textContent = formatBackupTime(meta.lastBackupAt);
    if (count) count.textContent = '备份次数：' + meta.backupCount;
    var history = $('#backupHistory');
    if (history) history.textContent = meta.backupHistory.length ? formatBackupTime(meta.backupHistory[meta.backupHistory.length - 1]) : '—';
  }
  function rebuildBalances() {
    ensureLedger(); save(); renderAccountOverview(); renderBackupMeta(); toast('已按账户流水重建平台余额', 'ok');
  }
  function checkDataHealth() {
    var issues = [], ids = {}, platformIds = {};
    (S.settings.platforms || []).forEach(function (p) { platformIds[p.id] = 1; if (num(p.balance) < 0) issues.push('平台“' + p.name + '”余额为负数'); });
    (S.records || []).forEach(function (r) {
      if (ids[r.id]) issues.push('发现重复记录 ID：' + r.id); ids[r.id] = 1;
      if (r.accountDebited && (!r.platformId || !platformIds[r.platformId])) issues.push('记录“' + (r.date || r.id) + '”的扣款平台不存在');
    });
    var sums = {};
    (S.accountLedger || []).forEach(function (e) {
      sums[e.platformId] = roundSigned2((sums[e.platformId] || 0) + signedNum(e.amount));
      if (!platformIds[e.platformId]) issues.push('流水“' + e.id + '”引用了不存在的平台');
    });
    (S.settings.platforms || []).forEach(function (p) { if (Object.prototype.hasOwnProperty.call(sums, p.id) && Math.abs(round2(sums[p.id]) - round2(p.balance)) > 0.01) issues.push('平台“' + p.name + '”余额与流水汇总不一致'); });
    (S.settings.suppliers || []).forEach(function (s) { (s.platformIds || []).forEach(function (id) { if (!platformIds[id]) issues.push('模型“' + s.model + '”关联了不存在的平台'); }); });
    var text = issues.length ? '发现 ' + issues.length + ' 项问题：\n\n' + issues.slice(0, 12).map(function (x) { return '• ' + x; }).join('\n') + (issues.length > 12 ? '\n• 其余问题已省略' : '') : '数据健康检查通过。\n\n未发现重复记录、孤立流水、余额不一致或失效的平台关联。';
    modal('数据健康检查', text, '关闭');
  }

  /* ---------------- routing ---------------- */
  var PAGES = [
    { id: 'home', name: '首页', title: '今日概览', icon: 'home', sub: '一眼看清今天该做什么' },
    { id: 'track', name: '打卡', title: '消耗打卡', icon: 'track', sub: '记录每一次 token 消耗' },
    { id: 'dash', name: '看板', title: '数据看板', icon: 'dash', sub: '趋势、占比与花费分析' },
    { id: 'hist', name: '历史', title: '历史记录', icon: 'hist', sub: '全部记录，可筛选可编辑' },
    { id: 'settings', name: '设置', title: '通用设置', icon: 'settings', sub: '管理账户、供应商与主题' }
  ];
  function go(page) {
    if (!PAGES.some(function (p) { return p.id === page; })) page = 'home';
    curPage = page;
    var p = PAGES.filter(function (x) { return x.id === page; })[0];
    $$('.view').forEach(function (v) { v.classList.remove('on'); });
    var el = $('#view-' + page);
    if (el) { void el.offsetWidth; el.classList.add('on'); }
    $$('#navPC button, #navM button').forEach(function (b) { b.classList.toggle('on', b.dataset.p === page); });
    $('#pgTitle').textContent = p.title;
    $('#pgSub').textContent = p.sub;
    if (location.hash !== '#/' + page) { try { history.pushState({ page: page }, '', '#/' + page); } catch (e) { location.hash = '#/' + page; } }
    window.scrollTo({ top: 0, behavior: 'auto' });
    if (page === 'home') renderHome();
    if (page === 'track') renderTrack();
    if (page === 'dash') renderDash();
    if (page === 'hist') renderHist();
    if (page === 'settings') renderSettings();
  }

  /* ---------------- nav build ---------------- */
  function buildNav() {
    var pc = $('#navPC'), m = $('#navM');
    var html = PAGES.map(function (p) {
      return '<button data-p="' + p.id + '" onclick="App.go(\'' + p.id + '\')">' + svg(p.icon) + '<span>' + p.name + '</span></button>';
    }).join('');
    pc.innerHTML = html;
    m.innerHTML = PAGES.map(function (p) {
      return '<button data-p="' + p.id + '" onclick="App.go(\'' + p.id + '\')">' + svg(p.icon) + '<span>' + p.name + '</span></button>';
    }).join('');
  }

  /* ---------------- HOME ---------------- */
  function renderHome() {
    var mRec = monthRecords(), tRec = S.records.filter(function (r) { return r.date === today(); });
    var mTok = sumTok(mRec), mCost = sumCost(mRec);
    var bud = num(S.settings.budget), pct = bud > 0 ? mCost / bud * 100 : 0;
    var days = new Set(mRec.map(function (r) { return r.date; })).size || 1;
    var goal = num(S.settings.goal), goalPct = goal > 0 ? mTok / goal * 100 : 0;

    /* stat cards */
    $('#statCards').innerHTML = [
      statCard('bolt', '本月总消耗', fmtTok(mTok), 'token', 'cy', '活跃日均 ' + fmtTok(mTok / days)),
      statCard('coin', '本月花费', money(mCost), '', 'mg', mRec.length + ' 条记录 · ' + days + ' 天'),
      statCard('fire', '连续打卡', streak(), '天', 'li', streak() > 0 ? '保持住，别断签' : '已中断，今天补上'),
      statCard('token', '今日消耗', fmtTok(sumTok(tRec)), 'token', 'pu', goal > 0 ? '本月目标 ' + fmtTok(goal) + ' · 完成 ' + Math.min(999, Math.round(goalPct)) + '%' : '未设每月目标')
    ].join('');

    /* budget */
    $('#budUsed').textContent = money(mCost);
    $('#budTotal').textContent = '/ ' + money(bud);
    $('#budPct').textContent = Math.round(pct) + '%';
    $('#budPct').className = 'tag ' + (pct >= 100 ? 'red' : pct >= 80 ? 'or' : 'cy');
    var bar = $('#budBar');
    bar.style.width = Math.min(100, pct) + '%';
    bar.className = pct >= 100 ? 'over' : pct >= 80 ? 'hot' : '';
    $('#goalUsed').textContent = fmtTok(mTok);
    $('#goalTotal').textContent = '/ ' + fmtTok(goal);
    $('#goalPct').textContent = Math.round(goalPct) + '%';
    $('#goalPct').className = 'tag ' + (goalPct >= 100 ? 'red' : goalPct >= 80 ? 'or' : 'cy');
    var goalBar = $('#goalBar');
    goalBar.style.width = Math.min(100, goalPct) + '%';
    goalBar.className = goalPct >= 100 ? 'over' : goalPct >= 80 ? 'hot' : '';
    $('#setBudget').value = S.settings.budget;
    $('#setGoal').value = num(S.settings.goal) / 1e6;

    renderWeek();
    renderAccountOverview();
    renderBackupMeta();

    /* today todo */
    var alerts = [], sk = streak();
    if (tRec.length === 0) {
      alerts.push({
        k: 'over', icon: 'warn',
        t: '今天还没打卡',
        s: sk > 0 ? ('已连续 ' + sk + ' 天，今天不补就断签') : '连续记录已中断，今天补一条重新起算',
        b: '去打卡', f: "App.go('track')"
      });
    }
    var miss = missingDays(7);
    if (miss.length) {
      alerts.push({
        k: 'over', icon: 'clock',
        t: '最近漏打卡 ' + miss.length + ' 天',
        s: '待补录：' + miss.slice(0, 3).map(dayLabel).join('、') + (miss.length > 3 ? ' 等' : ''),
        b: '补录' + relDay(miss[0]), f: "App.fillDate('" + miss[0] + "')"
      });
    }
    if (bud > 0 && pct >= 100) {
      alerts.push({ k: 'over', icon: 'coin', t: '本月预算已超支 ' + money(mCost - bud), s: '已用 ' + Math.round(pct) + '% · 考虑降本或调预算', b: '看数据', f: "App.go('dash')" });
    } else if (bud > 0 && pct >= 80) {
      alerts.push({ k: 'warn', icon: 'warn', t: '预算已用 ' + Math.round(pct) + '%', s: '剩余 ' + money(bud - mCost) + '，注意控制节奏', b: '看数据', f: "App.go('dash')" });
    }
    if (S.records.length >= 30) {
      alerts.push({ k: 'warn', icon: 'save', t: '数据已积累 ' + S.records.length + ' 条', s: '建议导出一份 JSON 备份，换设备不丢', b: '导出', f: 'App.exportJSON()' });
    }
    var lastBackup = S.meta && S.meta.lastBackupAt ? new Date(S.meta.lastBackupAt).getTime() : 0;
    if (S.records.length && (!lastBackup || Date.now() - lastBackup > 30 * 86400000)) {
      alerts.push({ k: 'warn', icon: 'save', t: '备份提醒', s: lastBackup ? '距离上次备份已超过 30 天' : '还没有导出过 JSON 备份', b: '立即备份', f: 'App.exportJSON()' });
    }
    if (!alerts.length) {
      alerts.push({ k: 'ok', icon: 'check', t: '今天已打卡，一切正常', s: '连续 ' + streak() + ' 天 · 本月已用 ' + Math.round(pct) + '% 预算', b: '继续记录', f: "App.go('track')" });
    }
    var actN = alerts.filter(function (a) { return a.k !== 'ok'; }).length;
    $('#todoCount').textContent = actN + ' 项';
    $('#todoCount').className = 'tag ' + (actN === 0 ? 'gr' : 'mg');
    $('#todoHint').textContent = actN === 0 ? '全部处理完毕，保持节奏' : '有 ' + actN + ' 项待处理，逾期项已标红';
    $('#alerts').innerHTML = alerts.map(function (a) {
      return '<div class="alert ' + a.k + '">' +
        '<div class="ic">' + svg(a.icon) + '</div>' +
        '<div class="tx"><b>' + esc(a.t) + '</b><span>' + esc(a.s) + '</span></div>' +
        '<button class="btn sm gh" onclick="' + a.f + '">' + esc(a.b) + '</button></div>';
    }).join('');

    /* recent */
    var recent = S.records.slice().sort(cmpRec).slice(0, 4);
    $('#recentList').innerHTML = recent.length ? recent.map(recRow).join('')
      : '<div class="empty" style="padding:20px">' + svg('empty') + '<div>还没有记录，去打卡页添加第一条</div></div>';
  }
  function statCard(icon, k, v, unit, color, d) {
    return '<div class="card stat"><div class="k">' + svg(icon) + esc(k) + '</div>' +
      '<div class="v ' + color + '">' + esc(v) + (unit ? '<small>&nbsp;' + esc(unit) + '</small>' : '') + '</div>' +
      '<div class="d">' + esc(d) + '</div></div>';
  }
  function cmpRec(a, b) {
    if (a.date === b.date) return (b.createdAt || 0) - (a.createdAt || 0);
    return a.date < b.date ? 1 : -1;
  }
  function recRow(r) {
    var tk = tokOf(r);
    return '<div class="rec">' +
      '<div class="av">' + esc(String(r.model || '?').slice(0, 2)) + '</div>' +
      '<div class="mid"><div class="t1"><span class="tag cy model-tag">' + esc(r.model) + '</span>' +
      '<span class="tag li">' + esc(relDay(r.date)) + '</span>' +
      (r.platform ? '<span class="tag pu platform-tag">' + esc(r.platform) + '</span>' : '') +
      (r.project ? '<span class="tag mg">' + esc(r.project) + '</span>' : '') + '</div>' +
      '<div class="t2">' + esc(dayLabel(r.date)) + ' · ' + fmtTok(tk) + ' token' + (r.note ? ' · ' + esc(r.note) : '') + '</div></div>' +
      '<div class="amt"><span class="amt-label">金额</span><b>' + money(costOf(r)) + '</b><span>' + money(num(r.unitPrice)) + ' / 亿 token</span><span>倍率 ' + num(r.multiplier).toFixed(2) + 'x</span></div>' +
      '<div class="ops">' +
      '<button class="iconbtn" title="编辑" aria-label="编辑" data-action="edit" data-id="' + esc(r.id) + '">' + svg('edit') + '</button>' +
      '<button class="iconbtn del" title="删除" aria-label="删除" data-action="delete" data-id="' + esc(r.id) + '">' + svg('trash') + '</button>' +
      '</div></div>';
  }

  /* ---------------- TRACK ---------------- */
  function supplierById(id) { return S.settings.suppliers.filter(function (s) { return s.id === id; })[0] || null; }
  function platformOptions(sel, legacy) {
    var list = S.settings.platforms.slice();
    if (legacy && !list.some(function (p) { return p.id === legacy.id; })) list.unshift(legacy);
    return '<option value="">请选择平台</option>' + list.map(function (p) {
      return '<option value="' + esc(p.id) + '"' + (p.id === sel ? ' selected' : '') + '>' + esc(p.name) + '</option>';
    }).join('');
  }
  function modelOptions(sel, platformId, legacy) {
    var list = platformId ? S.settings.suppliers.filter(function (s) { return modelAvailableOn(s, platformId); }) : [];
    if (legacy && !list.some(function (s) { return s.id === legacy.id; })) list.unshift(legacy);
    var placeholder = platformId ? '请选择模型' : '请先选择平台';
    return '<option value="">' + placeholder + '</option>' + list.map(function (s) {
      return '<option value="' + esc(s.id) + '"' + (s.id === sel ? ' selected' : '') + '>' + esc(s.model) + '</option>';
    }).join('');
  }
  function selectedSupplier() { return supplierById($('#fModel').value); }
  function renderTrack() {
    var currentPlatform = $('#fPlatform').value, currentModel = $('#fModel').value;
    $('#fPlatform').innerHTML = platformOptions(currentPlatform);
    currentPlatform = $('#fPlatform').value;
    $('#fModel').innerHTML = modelOptions(currentModel, currentPlatform);
    $('#fDate').max = today();
    syncSupplierInfo();
    updatePreview();
    var tRec = S.records.filter(function (r) { return r.date === today(); });
    $('#todayCount').textContent = tRec.length + ' 条';
    $('#todaySum').textContent = tRec.length
      ? '今日合计 ' + fmtTok(sumTok(tRec)) + ' token · 花费 ' + money(sumCost(tRec))
      : '今天还没有记录';
    $('#todayList').innerHTML = tRec.length ? tRec.slice().sort(cmpRec).map(recRow).join('')
      : '<div class="empty" style="padding:20px">' + svg('inbox') + '<div>今天还是空的，上面填一条吧</div></div>';
  }
  function syncSupplierInfo() {
    var s = selectedSupplier(), hint = $('#fSupplierHint');
    if (hint) hint.textContent = s
      ? '参考价：输入 ' + money(s.inPrice) + '/M · 输出 ' + money(s.outPrice) + '/M'
      : (S.settings.suppliers.length ? '请选择模型配置' : '暂无模型配置，请先到「设置」添加');
    updatePreview();
  }
  function updatePreview() {
    var tokens = num($('#fTokens').value) * 1e6, platformAmount = num($('#fAmount').value);
    var p = platformById($('#fPlatform').value);
    var amount = p ? platformAmountToYuan(p, platformAmount) : 0;
    $('#fActual').value = amount.toFixed(2);
    var estimated = tokens > 0 ? amount / tokens * 1e8 : 0;
    $('#fPreview').textContent = money(estimated) + ' / 亿 token';
  }
  function addRecord() {
    var date = validDate($('#fDate').value) || today();
    var sid = $('#fModel').value, s = selectedSupplier(), p = platformById($('#fPlatform').value);
    var tokens = num($('#fTokens').value) * 1e6, platformAmount = round2($('#fAmount').value);
    var multiplier = num($('#fMultiplier').value);
    var old = editId ? S.records.filter(function (r) { return r.id === editId; })[0] : null;
    var oldDebit = debitOf(old), oldPlatform = oldDebit ? platformForRecord(old) : null;
    if (!p && oldDebit) { toast('原记录缺少可匹配的平台账户，无法安全编辑', 'err'); return; }
    if (!p && !(old && !old.platform)) { toast('请先选择有效平台，可在设置中管理', 'err'); $('#fPlatform').focus(); return; }
    if (!sid) { toast('请先选择模型，可在设置中管理', 'err'); $('#fModel').focus(); return; }
    if (p && s && !modelAvailableOn(s, p.id)) { toast('该模型未关联所选平台，请重新选择', 'err'); $('#fModel').focus(); return; }
    if (tokens <= 0) { toast('请填写消耗 token', 'err'); $('#fTokens').focus(); return; }
    if (p && platformAmount <= 0) { toast('请填写消费金额', 'err'); $('#fAmount').focus(); return; }
    if (multiplier <= 0) { toast('请填写有效倍率', 'err'); $('#fMultiplier').focus(); return; }
    if (oldDebit && !oldPlatform) { toast('原记录对应的平台账户不存在，无法安全调整余额', 'err'); return; }
    if (p) {
      var available = num(p.balance) + (oldPlatform && oldPlatform.id === p.id ? oldDebit : 0);
      if (platformAmount > available + 0.0001) {
        toast('平台余额不足，当前可用 ' + dollar(available), 'err'); $('#fAmount').focus(); return;
      }
    }
    var amount = p ? platformAmountToYuan(p, platformAmount) : num($('#fAmount').value);
    var rec = {
      id: editId || uid(), date: date,
      supplierId: s ? s.id : (old ? old.supplierId || '' : ''),
      platformId: p ? p.id : (old ? old.platformId || '' : ''),
      platform: p ? p.name : (old ? old.platform : ''), model: s ? s.model : (old ? old.model : '未命名模型'),
      tokens: Math.round(tokens), amount: amount,
      unitPrice: tokens > 0 ? amount / tokens * 1e8 : 0,
      platformAmount: p ? platformAmount : 0, accountDebited: !!p,
      multiplier: multiplier,
      project: ($('#fProject').value || '').trim().slice(0, 24), note: ($('#fNote').value || '').trim().slice(0, 60),
      createdAt: old && old.createdAt || Date.now()
    };
    if (oldDebit && oldPlatform) accountDelta(oldPlatform, oldDebit, 'refund', rec.id, '编辑记录退回原扣款');
    if (p) accountDelta(p, -platformAmount, 'consume', rec.id, '打卡消费');
    if (editId) {
      S.records = S.records.map(function (r) { return r.id === editId ? rec : r; });
      editId = null; setFormMode(false); toast('已保存修改', 'ok');
    } else {
      S.records.push(rec); toast('打卡成功 · 实际金额 ' + money(amount), 'ok');
    }
    save(); resetForm(); renderTrack(); renderAccountOverview();
  }
  function resetForm() {
    $('#fDate').value = today();
    $('#fPlatform').innerHTML = platformOptions('');
    $('#fModel').innerHTML = modelOptions('', '');
    $('#fProject').value = ''; $('#fTokens').value = ''; $('#fAmount').value = ''; $('#fActual').value = '0.00';
    $('#fMultiplier').value = '1'; syncSupplierInfo();
  }
  function setFormMode(editing) {
    var b = $('#view-track .btn.pri'), r = $('#view-track .btn.gh');
    if (b) b.innerHTML = (editing ? svg('save') : svg('bolt')) + (editing ? '保存修改' : '提交打卡');
    if (r) {
      r.innerHTML = editing ? '取消编辑' : svg('reset') + '重置';
      r.onclick = editing ? App.cancelEdit : App.resetForm;
    }
  }
  function fillDate(d) { go('track'); $('#fDate').value = validDate(d) || today(); $('#fTokens').focus(); toast('已切换到 ' + dayLabel(d) + '，补录一条', ''); }

  /* ---------------- DASHBOARD ---------------- */
  function dashCard(icon, k, v, unit, color, d) {
    return '<div class="card stat"><div class="k">' + svg(icon) + esc(k) + '</div>' +
      '<div class="v ' + color + '">' + esc(v) + (unit ? '<small>&nbsp;' + esc(unit) + '</small>' : '') + '</div>' +
      '<div class="d">' + esc(d) + '</div></div>';
  }
  function renderDash() {
    var all = S.records;
    var total = sumTok(all), cost = sumCost(all);
    var mRec = monthRecords();
    $('#dashStats').innerHTML = [
      dashCard('inbox', '累计记录', all.length, '条', 'cy', '覆盖 ' + new Set(all.map(function (r) { return r.date; })).size + ' 天'),
      dashCard('token', '累计消耗', fmtTok(total), '', 'pu', '平均 ' + fmtTok(all.length ? total / all.length : 0) + ' / 次'),
      dashCard('coin', '累计花费', money(cost), '', 'mg', '本月 ' + money(sumCost(mRec))),
      dashCard('chart', '单次均值', all.length ? money(cost / all.length) : money(0), '', 'li', all.length ? '每次消费金额' : '暂无数据')
    ].join('');
    drawCharts();
    drawPeriodicChart();
  }

  function baseOpts() {
    var cfg = themeConfig();
    return {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: cfg.panel, borderColor: 'rgba(' + cfg.cyRgb + ',.4)', borderWidth: 1,
          titleColor: cfg.cy, bodyColor: cfg.tx, padding: 11, cornerRadius: 10,
          titleFont: { size: 13, weight: '700' }, bodyFont: { size: 12 }, displayColors: true, boxPadding: 4
        }
      },
      scales: {
        x: { grid: { color: 'rgba(' + cfg.cyRgb + ',.07)', drawBorder: false }, ticks: { color: cfg.tx2, font: { size: 11 } }, border: { display: false } },
        y: { beginAtZero: true, grid: { color: 'rgba(' + cfg.cyRgb + ',.07)', drawBorder: false }, ticks: { color: cfg.tx2, font: { size: 11 } }, border: { display: false } }
      }
    };
  }
  function grad(ctx, c1, c2) {
    var a = ctx.chart.ctx, ar = ctx.chart.chartArea;
    if (!ar) return c1;
    var g = a.createLinearGradient(0, ar.top, 0, ar.bottom);
    g.addColorStop(0, c1); g.addColorStop(1, c2); return g;
  }
  function destroy(k) { if (charts[k]) { try { charts[k].destroy(); } catch (e) {} charts[k] = null; } }

  function drawCharts() {
    if (typeof Chart === 'undefined') {
      $$('.chartbox').forEach(function (b) { b.innerHTML = '<div class="empty">' + svg('warn') + '<div>图表库未加载</div></div>'; });
      return;
    }
    var cfg = themeConfig(), palette = cfg.palette;
    Chart.defaults.color = cfg.tx2;
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;

    /* --- last 14 days --- */
    var days = [], map = {};
    for (var i = 13; i >= 0; i--) {
      var ds = ymd(addDays(new Date(), -i));
      days.push(ds); map[ds] = 0;
    }
    S.records.forEach(function (r) { if (map[r.date] !== undefined) map[r.date] += tokOf(r); });
    var labels = days.map(function (d) { return d.slice(5).replace('-', '/'); });
    destroy('line');
    charts.line = new Chart($('#chLine'), {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: '消耗 token', data: days.map(function (d) { return map[d]; }),
          borderColor: cfg.cy, backgroundColor: function (c) { return grad(c, 'rgba(' + cfg.cyRgb + ',.42)', 'rgba(' + cfg.cyRgb + ',0)'); },
          fill: true, tension: .35, borderWidth: 2, pointRadius: 0, pointHoverRadius: 5,
          pointHoverBackgroundColor: cfg.cy, pointHoverBorderColor: cfg.meta, pointHoverBorderWidth: 2
        }]
      },
      options: Object.assign(baseOpts(), {
        scales: {
          x: baseOpts().scales.x,
          y: {
            stacked: false, beginAtZero: true, grid: { color: 'rgba(' + cfg.cyRgb + ',.07)' },
            ticks: { color: cfg.tx2, font: { size: 11 }, callback: function (v) { return fmtTok(v); } }, border: { display: false }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: Object.assign({}, baseOpts().plugins.tooltip, {
            callbacks: { label: function (c) { return c.dataset.label + '：' + fmtTok(c.parsed.y) + ' token'; } }
          })
        }
      })
    });

    /* --- model doughnut --- */
    var byM = {};
    S.records.forEach(function (r) { byM[r.model || '未知'] = (byM[r.model || '未知'] || 0) + tokOf(r); });
    var entries = Object.keys(byM).map(function (k) { return [k, byM[k]]; }).sort(function (a, b) { return b[1] - a[1]; });
    if (entries.length > 8) {
      var rest = entries.slice(7).reduce(function (sum, e) { return sum + e[1]; }, 0);
      entries = entries.slice(0, 7).concat([['其他', rest]]);
    }
    destroy('pie');
    charts.pie = new Chart($('#chPie'), {
      type: 'doughnut',
      data: {
        labels: entries.map(function (e) { return e[0]; }),
        datasets: [{
          data: entries.map(function (e) { return e[1]; }),
          backgroundColor: entries.map(function (_, i) { return palette[i % palette.length]; }),
          borderColor: cfg.panel, borderWidth: 2, hoverOffset: 10
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '66%',
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: cfg.panel, borderColor: 'rgba(' + cfg.puRgb + ',.45)', borderWidth: 1,
            titleColor: cfg.pu, bodyColor: cfg.tx, padding: 11, cornerRadius: 10,
            callbacks: {
              label: function (c) {
                var t = entries.reduce(function (a, e) { return a + e[1]; }, 0) || 1;
                return ' ' + fmtTok(c.parsed) + ' token · ' + (c.parsed / t * 100).toFixed(1) + '%';
              }
            }
          }
        }
      }
    });
    var tot = entries.reduce(function (a, e) { return a + e[1]; }, 0) || 1;
    $('#pieLegend').innerHTML = entries.slice(0, 8).map(function (e, i) {
      return '<span class="lg"><i style="background:' + palette[i % palette.length] + '"></i>' +
        esc(e[0]) + ' ' + (e[1] / tot * 100).toFixed(0) + '%</span>';
    }).join('') || '<span class="lg">暂无数据</span>';

    /* --- last 7 days cost (bar + avg line) --- */
    var d7 = [], m7 = {};
    for (var j = 6; j >= 0; j--) { var ds2 = ymd(addDays(new Date(), -j)); d7.push(ds2); m7[ds2] = 0; }
    S.records.forEach(function (r) { if (m7[r.date] !== undefined) m7[r.date] += costOf(r); });
    var vals = d7.map(function (d) { return m7[d]; });
    var avg = vals.reduce(function (a, b) { return a + b; }, 0) / 7;
    destroy('bar');
    charts.bar = new Chart($('#chBar'), {
      data: {
        labels: d7.map(function (d) { return d.slice(5).replace('-', '/'); }),
        datasets: [
          {
            type: 'bar', label: '花费', data: vals,
            backgroundColor: function (c) { return grad(c, 'rgba(' + cfg.mgRgb + ',.95)', 'rgba(' + cfg.puRgb + ',.55)'); },
            borderRadius: 7, borderSkipped: false, maxBarThickness: 34, order: 2
          },
          {
            type: 'line', label: '日均', data: vals.map(function () { return avg; }),
            borderColor: 'rgba(' + cfg.cyRgb + ',.75)', borderWidth: 2, borderDash: [6, 5],
            pointRadius: 0, tension: 0, order: 1
          }
        ]
      },
      options: Object.assign(baseOpts(), {
        plugins: {
          legend: { display: false },
          tooltip: Object.assign({}, baseOpts().plugins.tooltip, {
            callbacks: { label: function (c) { return (c.dataset.label === '日均' ? '' : '') + c.dataset.label + '：' + money(c.parsed.y); } }
          })
        },
        scales: {
          x: baseOpts().scales.x,
          y: {
            beginAtZero: true, grid: { color: 'rgba(' + cfg.cyRgb + ',.07)' },
            ticks: { color: cfg.tx2, font: { size: 11 }, callback: function (v) { return '¥\u00a0' + v; } }, border: { display: false }
          }
        }
      })
    });
  }

  function floorPeriod(d, type) {
    var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (type === 'week') { var day = x.getDay() || 7; x.setDate(x.getDate() - day + 1); }
    if (type === 'month') x.setDate(1);
    if (type === 'year') { x.setMonth(0); x.setDate(1); }
    return x;
  }
  function movePeriod(d, type, n) {
    var x = new Date(d.getTime());
    if (type === 'day') x.setDate(x.getDate() + n);
    if (type === 'week') x.setDate(x.getDate() + n * 7);
    if (type === 'month') x.setMonth(x.getMonth() + n);
    if (type === 'year') x.setFullYear(x.getFullYear() + n);
    return x;
  }
  function periodMetricValue() {
    var active = $$('#periodMetric button').filter(function (b) { return b.classList.contains('on'); })[0];
    return active && active.dataset.metric === 'cost' ? 'cost' : 'tokens';
  }
  function selectPeriodMetric(metric) {
    var value = metric === 'cost' ? 'cost' : 'tokens';
    $$('#periodMetric button').forEach(function (b) {
      var on = b.dataset.metric === value;
      b.classList.toggle('on', on);
      if (b.setAttribute) b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    renderDash();
  }
  function periodLabel(start, type) {
    if (type === 'day') return ymd(start).slice(5).replace('-', '/');
    if (type === 'week') {
      var end = addDays(start, 6);
      return (start.getMonth() + 1) + '/' + start.getDate() + '-' + (end.getMonth() + 1) + '/' + end.getDate();
    }
    if (type === 'month') return start.getFullYear() + '/' + pad(start.getMonth() + 1);
    return String(start.getFullYear());
  }
  function drawPeriodicChart() {
    if (typeof Chart === 'undefined' || !$('#chPeriod')) return;
    var cfg = themeConfig();
    var type = $('#periodGranularity').value || 'day';
    var metric = periodMetricValue();
    var count = type === 'day' ? 14 : type === 'week' ? 12 : type === 'month' ? 12 : 5;
    var latest = floorPeriod(new Date(), type), buckets = [], map = {};
    for (var i = count - 1; i >= 0; i--) {
      var start = movePeriod(latest, type, -i), key = ymd(start);
      buckets.push({ key: key, label: periodLabel(start, type) });
      map[key] = 0;
    }
    S.records.forEach(function (r) {
      var key = ymd(floorPeriod(parseD(r.date), type));
      if (map[key] !== undefined) map[key] += metric === 'tokens' ? tokOf(r) / 1e6 : costOf(r);
    });
    destroy('period');
    charts.period = new Chart($('#chPeriod'), {
      type: 'bar',
      data: {
        labels: buckets.map(function (b) { return b.label; }),
        datasets: [{ label: metric === 'tokens' ? '消耗 token' : '消费金额', data: buckets.map(function (b) { return map[b.key]; }),
          backgroundColor: function (c) { return grad(c, metric === 'tokens' ? 'rgba(' + cfg.cyRgb + ',.9)' : 'rgba(' + cfg.mgRgb + ',.95)', 'rgba(' + cfg.puRgb + ',.55)'); },
          borderRadius: 7, borderSkipped: false, maxBarThickness: 34 }]
      },
      options: Object.assign(baseOpts(), {
        plugins: { legend: { display: false }, tooltip: Object.assign({}, baseOpts().plugins.tooltip, {
          callbacks: { label: function (c) { return c.dataset.label + '：' + (metric === 'tokens' ? Number(c.parsed.y).toFixed(3) + ' M token' : money(c.parsed.y)); } }
        }) },
        scales: { x: baseOpts().scales.x, y: { beginAtZero: true, grid: { color: 'rgba(' + cfg.cyRgb + ',.07)' },
          ticks: { color: cfg.tx2, font: { size: 11 }, callback: function (v) { return metric === 'tokens' ? v + ' M' : '¥\u00a0' + v; } }, border: { display: false } } }
      })
    });
  }

  /* ---------------- HISTORY ---------------- */
  function monthOptions() {
    var set = { 'all': 1 };
    S.records.forEach(function (r) { set[monthOf(r.date)] = 1; });
    var list = Object.keys(set).filter(function (k) { return k !== 'all'; }).sort().reverse();
    var cur = $('#hMonth').value || 'all';
    return '<option value="all">全部月份</option>' + list.map(function (m) {
      return '<option value="' + m + '"' + (m === cur ? ' selected' : '') + '>' + m.replace('-', ' 年 ') + ' 月</option>';
    }).join('');
  }
  function distinctSupplierValues(field, platform) {
    var set = {}, out = [];
    if (field === 'platform') {
      (S.settings.platforms || []).forEach(function (p) { if (!set[p.name]) { set[p.name] = 1; out.push(p.name); } });
    } else {
      var platformId = platform && platform !== 'all' ? ((S.settings.platforms || []).filter(function (p) { return p.name === platform; })[0] || {}).id : '';
      S.settings.suppliers.forEach(function (s) {
        if (platformId && !modelAvailableOn(s, platformId)) return;
        if (s.model && !set[s.model]) { set[s.model] = 1; out.push(s.model); }
      });
    }
    return out.sort(function (a, b) { return a.localeCompare(b, 'zh-CN'); });
  }
  function filterOptions(id, label, values, selected) {
    var html = '<option value="all">' + label + '</option>';
    return html + values.map(function (v) {
      return '<option value="' + esc(v) + '"' + (v === selected ? ' selected' : '') + '>' + esc(v) + '</option>';
    }).join('');
  }
  function renderHist() {
    $('#hMonth').innerHTML = monthOptions();
    var curM = $('#hMonth').value || 'all';
    var curPlatform = $('#hPlatform').value || 'all';
    var curMod = $('#hModel').value || 'all';
    $('#hPlatform').innerHTML = filterOptions('hPlatform', '全部平台', distinctSupplierValues('platform'), curPlatform);
    curPlatform = $('#hPlatform').value || 'all';
    $('#hModel').innerHTML = filterOptions('hModel', '全部模型', distinctSupplierValues('model', curPlatform), curMod);
    curMod = $('#hModel').value || 'all';
    var kw = ($('#hSearch').value || '').trim().toLowerCase();
    var allList = S.records.filter(function (r) {
      if (curM !== 'all' && monthOf(r.date) !== curM) return false;
      if (curPlatform !== 'all' && r.platform !== curPlatform) return false;
      if (curMod !== 'all' && r.model !== curMod) return false;
      if (kw && (String(r.project || '') + ' ' + String(r.note || '') + ' ' + String(r.platform || '') + ' ' + String(r.model || '')).toLowerCase().indexOf(kw) < 0) return false;
      return true;
    }).sort(cmpRec);
    var list = allList.slice(0, histLimit);

    $('#hCount').textContent = allList.length > list.length ? list.length + '/' + allList.length + ' 条' : allList.length + ' 条';
    $('#hSum').textContent = money(sumCost(allList)) + ' · ' + fmtTok(sumTok(allList)) + ' token';
    $('#hEmpty').style.display = allList.length ? 'none' : 'block';
    if ($('#hMore')) $('#hMore').style.display = allList.length > list.length ? 'block' : 'none';

    $('#hBody').innerHTML = list.map(function (r) {
      return '<tr>' +
        '<td>' + esc(dayLabel(r.date)) + ' <span style="color:var(--tx3);font-size:11px">' + esc(relDay(r.date)) + '</span></td>' +
        '<td><span class="tag pu platform-tag">' + esc(r.platform || '未配置') + '</span></td>' +
        '<td><span class="tag cy model-tag">' + esc(r.model) + '</span></td>' +
        '<td>' + esc(r.project || '—') + (r.note ? '<div style="font-size:11px;color:var(--tx3)">' + esc(r.note) + '</div>' : '') + '</td>' +
        '<td class="num" style="text-align:right;font-weight:700">' + fmtTok(tokOf(r)) + '</td>' +
        '<td class="cost" style="text-align:right">' + money(costOf(r)) + '</td>' +
        '<td class="num" style="text-align:right">' + money(num(r.unitPrice)) + ' / 亿 token</td>' +
        '<td class="num" style="text-align:right">' + num(r.multiplier).toFixed(2) + 'x</td>' +
        '<td style="text-align:right;white-space:nowrap">' +
        '<button class="iconbtn" title="编辑" aria-label="编辑" data-action="edit" data-id="' + esc(r.id) + '">' + svg('edit') + '</button>' +
        '<button class="iconbtn del" title="删除" aria-label="删除" data-action="delete" data-id="' + esc(r.id) + '">' + svg('trash') + '</button>' +
        '</td></tr>';
    }).join('');

    $('#hList').innerHTML = list.map(recRow).join('');
  }
  function filterHistory() { histLimit = 100; renderHist(); }

  /* ---------------- SETTINGS ---------------- */
  function selectSettingsTab(tab) {
    settingsTab = ['account', 'supplier', 'theme'].indexOf(tab) >= 0 ? tab : 'account';
    ['account', 'supplier', 'theme'].forEach(function (key) {
      var name = key.charAt(0).toUpperCase() + key.slice(1);
      var panel = $('#settingsPane' + name), button = $('#settingsTab' + name), on = settingsTab === key;
      if (panel) { panel.classList.toggle('on', on); panel.setAttribute('aria-hidden', on ? 'false' : 'true'); }
      if (button) { button.classList.toggle('on', on); button.setAttribute('aria-selected', on ? 'true' : 'false'); }
    });
  }
  function supplierRow(s) {
    return '<div class="supplier-row">' +
      '<div class="supplier-main"><b>' + esc(s.model) + '</b><span>输入 ' + money(s.inPrice) + '/M · 输出 ' + money(s.outPrice) + '/M · 平台：' + esc(modelPlatforms(s).join('、') || '未关联') + '</span></div>' +
      '<button class="iconbtn del" title="删除配置" aria-label="删除配置" data-action="supplier-delete" data-id="' + esc(s.id) + '">' + svg('trash') + '</button>' +
      '</div>';
  }
  function renderPlatforms() {
    var list = S.settings.platforms || [];
    $('#platformCount').textContent = list.length + ' 个';
    $('#platformList').innerHTML = list.map(function (p) {
      return '<div class="platform-row"><b>' + esc(p.name) + '</b><button class="iconbtn del" title="删除平台" aria-label="删除平台" data-action="platform-delete" data-id="' + esc(p.id) + '">' + svg('trash') + '</button></div>';
    }).join('');
    $('#platformEmpty').style.display = list.length ? 'none' : 'block';
    $('#sPlatformOptions').innerHTML = list.map(function (p) {
      return '<label class="check-option"><input type="checkbox" value="' + esc(p.id) + '">' + esc(p.name) + '</label>';
    }).join('') || '<span class="field-hint">请先添加平台</span>';
  }
  function renderAccounts() {
    var list = S.settings.platforms || [];
    $('#accountCount').textContent = list.length + ' 个';
    $('#accountList').innerHTML = list.map(function (p) {
      return '<div class="account-row">' +
        '<div class="account-head"><b>' + esc(p.name) + '</b><div class="account-head-actions"><span class="tag cy">' + esc(ratioLabel(p)) + '</span><button type="button" class="account-calibrate-toggle" id="calibration-toggle-' + esc(p.id) + '" data-action="platform-calibrate-toggle" data-id="' + esc(p.id) + '" aria-expanded="false" aria-controls="calibration-' + esc(p.id) + '">校准</button></div></div>' +
        '<div class="account-balances"><span>实际余额 <b>' + esc(money(actualBalance(p))) + '</b></span><span>平台余额 <b>' + esc(dollar(num(p.balance))) + '</b></span></div>' +
        '<div class="calibration-panel" id="calibration-' + esc(p.id) + '" hidden><label class="f" for="calibrate-' + esc(p.id) + '">目标平台余额（$）</label><div><input type="number" id="calibrate-' + esc(p.id) + '" min="0" step="0.01" placeholder="输入目标余额" inputmode="decimal"><button type="button" class="btn gh" data-action="platform-calibrate" data-id="' + esc(p.id) + '">确认</button></div></div>' +
        '<div class="recharge-row"><label class="f" for="recharge-' + esc(p.id) + '">充值金额（¥）</label><div><input type="number" id="recharge-' + esc(p.id) + '" min="0" step="0.01" placeholder="0.00" inputmode="decimal"><button class="btn pri" data-action="platform-recharge" data-id="' + esc(p.id) + '">充值</button></div></div>' +
        '</div>';
    }).join('');
    $('#accountEmpty').style.display = list.length ? 'none' : 'block';
  }
  function renderThemeOptions() {
    var active = normalizeTheme(S.settings.theme);
    $$('#themeOptions [data-theme]').forEach(function (button) {
      var on = button.dataset.theme === active;
      button.classList.toggle('on', on);
      button.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }
  function renderSettings() {
    var list = S.settings.suppliers || [];
    $('#supplierCount').textContent = list.length + ' 条';
    $('#supplierList').innerHTML = list.map(supplierRow).join('');
    $('#supplierEmpty').style.display = list.length ? 'none' : 'block';
    renderPlatforms();
    renderAccounts();
    renderThemeOptions();
  }
  function addPlatform() {
    var name = ($('#sPlatform').value || '').trim().slice(0, 40);
    var ratio = parseRechargeRatio($('#sPlatformRatio').value);
    var balanceRaw = String($('#sPlatformBalance').value || '').trim();
    var balanceValue = balanceRaw === '' ? 0 : Number(balanceRaw);
    if (!name) { toast('请填写平台名称', 'err'); $('#sPlatform').focus(); return; }
    if (!ratio) { toast('充值比率请按 1 / 8 格式填写', 'err'); $('#sPlatformRatio').focus(); return; }
    if (!isFinite(balanceValue) || balanceValue < 0) { toast('平台余额不能为负数', 'err'); $('#sPlatformBalance').focus(); return; }
    if (S.settings.platforms.some(function (p) { return p.name === name; })) { toast('该平台已存在', 'err'); return; }
    var platform = { id: uid(), name: name, ratioYuan: ratio.yuan, ratioPlatform: ratio.platform, balance: 0 };
    S.settings.platforms.push(platform);
    accountDelta(platform, balanceValue, 'opening', '', '新增平台初始余额');
    $('#sPlatform').value = ''; $('#sPlatformRatio').value = '1 / 1'; $('#sPlatformBalance').value = '';
    save(); renderSettings(); renderAccountOverview(); toast('已增加平台 ' + name, 'ok');
  }
  function rechargePlatform(id) {
    var p = platformById(id), input = $('#recharge-' + safeId(id));
    if (!p || !input) return;
    var amount = num(input.value);
    if (amount <= 0) { toast('请填写大于 0 的充值金额', 'err'); input.focus(); return; }
    var ratio = platformRatio(p), added = round2(amount * ratio.platform / ratio.yuan);
    accountDelta(p, added, 'recharge', '', '人民币充值');
    input.value = '';
    save(); renderSettings(); renderAccountOverview();
    toast('已充值 ' + money(amount) + '，平台余额增加 ' + dollar(added), 'ok');
  }
  function toggleCalibration(id, trigger) {
    var safe = safeId(id), panel = $('#calibration-' + safe);
    if (!platformById(id) || !panel) return;
    var open = panel.hidden;
    panel.hidden = !open;
    var button = trigger || $('#calibration-toggle-' + safe);
    if (button) button.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      var input = $('#calibrate-' + safe);
      setTimeout(function () { if (input && input.focus) input.focus(); }, 0);
    }
  }
  function calibratePlatform(id) {
    var p = platformById(id), input = $('#calibrate-' + safeId(id));
    if (!p || !input) return;
    var raw = String(input.value == null ? '' : input.value).trim();
    if (raw === '') { toast('请输入校准后的平台余额', 'err'); input.focus(); return; }
    var value = Number(raw);
    if (!isFinite(value) || value < 0) { toast('校准余额不能为负数', 'err'); input.focus(); return; }
    var before = round2(p.balance), target = round2(value), delta = roundSigned2(target - before);
    accountDelta(p, delta, 'calibration', '', '手动校准平台余额');
    input.value = '';
    save(); renderSettings(); renderAccountOverview();
    toast('已校准 ' + p.name + '：' + dollar(before) + ' → ' + dollar(target), 'ok');
  }
  function selectTheme(theme) {
    var key = normalizeTheme(theme);
    S.settings.theme = key;
    applyTheme(key);
    save(); renderThemeOptions();
    if (curPage === 'dash') renderDash();
    toast('已切换主题', 'ok');
  }
  function addSupplier() {
    var model = ($('#sModel').value || '').trim();
    var platformIds = $$('#sPlatformOptions input:checked').map(function (input) { return input.value; });
    if (!model) { toast('请填写模型', 'err'); return; }
    if (!platformIds.length) { toast('请至少关联一个平台', 'err'); return; }
    var s = normalizeSupplier({
      id: uid(), model: model, platformIds: platformIds,
      inPrice: $('#sInPrice').value, outPrice: $('#sOutPrice').value
    });
    if (!s) { toast('供应商配置无效', 'err'); return; }
    var existing = S.settings.suppliers.filter(function (x) { return x.model === s.model; })[0];
    if (existing) {
      s.platformIds.forEach(function (id) { if (existing.platformIds.indexOf(id) < 0) existing.platformIds.push(id); });
      existing.inPrice = s.inPrice; existing.outPrice = s.outPrice;
      save(); renderSettings();
      $('#sModel').value = ''; $('#sInPrice').value = ''; $('#sOutPrice').value = '';
      toast('已更新 ' + s.model + ' 的平台关联', 'ok'); return;
    }
    S.settings.suppliers.push(s); save(); renderSettings();
    $('#sModel').value = ''; $('#sInPrice').value = ''; $('#sOutPrice').value = '';
    toast('已增加 ' + supplierLabel(s), 'ok');
  }
  function askDeletePlatform(id) {
    var p = platformById(id); if (!p) return;
    var linkedDebits = S.records.filter(function (r) { var rp = platformForRecord(r); return debitOf(r) > 0 && rp && rp.id === id; });
    if (linkedDebits.length) { toast('该平台仍有 ' + linkedDebits.length + ' 条扣款记录，请先删除或编辑记录', 'err'); return; }
    modal('删除平台？', p.name + '\n当前平台余额 ' + dollar(num(p.balance)) + '。已有关联模型会解除该平台，但历史记录会保留。', '删除', function () {
      S.settings.platforms = S.settings.platforms.filter(function (x) { return x.id !== id; });
      S.settings.suppliers.forEach(function (s) { s.platformIds = s.platformIds.filter(function (x) { return x !== id; }); });
      /* 删除账户时一并移除其账户流水，避免留下无法重建的孤立流水；历史打卡记录仍保留名称快照。 */
      S.accountLedger = (S.accountLedger || []).filter(function (e) { return e.platformId !== id; });
      save(); renderSettings(); renderAccountOverview(); renderTrack(); renderHist(); toast('已删除平台', 'ok');
    });
  }
  function askDeleteSupplier(id) {
    var s = supplierById(id);
    if (!s) return;
    modal('删除供应商配置？', supplierLabel(s) + '\n已有历史记录会保留，但之后不能再从打卡下拉菜单选择。', '删除', function () {
      S.settings.suppliers = S.settings.suppliers.filter(function (x) { return x.id !== id; });
      save(); renderSettings();
      if (curPage === 'track') renderTrack();
      if (curPage === 'hist') renderHist();
      toast('已删除配置', 'ok');
    });
  }

  /* ---------------- CRUD ops ---------------- */
  function edit(id) {
    var r = S.records.filter(function (x) { return x.id === id; })[0];
    if (!r) return;
    editId = id;
    go('track');
    $('#fDate').value = r.date;
    var sid = r.supplierId || '', s = supplierById(sid);
    var pid = ((S.settings.platforms || []).filter(function (p) { return p.name === r.platform; })[0] || {}).id || '';
    var legacyPlatform = (!pid && r.platform) ? { id: 'legacy-platform-' + safeId(r.id), name: r.platform } : null;
    if (legacyPlatform) pid = legacyPlatform.id;
    var legacy = (!s) ? { id: 'legacy-' + safeId(r.id), model: r.model || '未命名模型', inPrice: 0, outPrice: 0, platformIds: legacyPlatform ? [legacyPlatform.id] : [] } : null;
    var editModel = legacy || s;
    $('#fPlatform').innerHTML = platformOptions(pid, legacyPlatform);
    $('#fModel').innerHTML = modelOptions(sid || (legacy && legacy.id), $('#fPlatform').value, editModel);
    $('#fProject').value = r.project || '';
    $('#fTokens').value = (tokOf(r) / 1e6).toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
    var editPlatform = platformById(pid);
    $('#fAmount').value = editPlatform ? (debitOf(r) || costOf(r) * platformRatio(editPlatform).platform / platformRatio(editPlatform).yuan).toFixed(2) : costOf(r).toFixed(2);
    $('#fMultiplier').value = num(r.multiplier || 1).toFixed(2);
    $('#fNote').value = r.note || '';
    setFormMode(true); syncSupplierInfo(); updatePreview();
    toast('正在编辑 ' + dayLabel(r.date) + ' 的记录', '');
  }
  function cancelEdit() { editId = null; setFormMode(false); resetForm(); toast('已取消编辑', ''); }
  function askDel(id) {
    var r = S.records.filter(function (x) { return x.id === id; })[0];
    if (!r) return;
    modal('删除这条记录？', dayLabel(r.date) + ' · ' + (r.model || '未命名模型') + '（' + (r.platform || '未配置') + '） · ' + money(costOf(r)) + '\n删除后无法恢复（可用备份文件还原）。', '删除', function () {
      var debit = debitOf(r), p = debit ? platformForRecord(r) : null;
      if (debit && !p) { toast('对应的平台账户不存在，无法安全删除', 'err'); return; }
      if (debit) accountDelta(p, debit, 'refund', r.id, '删除打卡记录退回扣款');
      S.records = S.records.filter(function (x) { return x.id !== id; });
      if (editId === id) { editId = null; setFormMode(false); }
      save(); renderAccountOverview(); refresh(); toast('已删除', 'ok');
    });
  }
  function askClear() {
    modal('清空全部记录？', '将删除全部 ' + S.records.length + ' 条记录，但会保留每月目标、账户、供应商和主题设置。\n建议先「导出 JSON 备份」。此操作不可撤销。', '确认清空', function () {
      if (!refundRecordDebits(S.records)) { toast('存在无法匹配平台账户的扣款记录，未清空数据', 'err'); return; }
      S.records = []; editId = null; setFormMode(false); S.seeded = false;
      $('#hSearch').value = ''; $('#hMonth').value = 'all'; $('#hPlatform').value = 'all'; $('#hModel').value = 'all';
      save(); renderAccountOverview(); refresh(); toast('已清空全部记录', 'ok');
    });
  }
  function restoreDemo() {
    modal('恢复示例数据？', '将用 5 条示例记录替换当前记录，每月目标、账户、供应商和主题设置会保留。', '恢复示例', function () {
      if (!refundRecordDebits(S.records)) { toast('存在无法匹配平台账户的扣款记录，未恢复示例', 'err'); return; }
      seed(); save(); renderAccountOverview(); refresh(); toast('已恢复示例数据', 'ok');
    });
  }
  function saveSettings() {
    S.settings.budget = num($('#setBudget').value);
    S.settings.goal = num($('#setGoal').value) * 1e6;
    save(); renderHome(); toast('设置已保存', 'ok');
  }
  function refresh() {
    if (curPage === 'home') renderHome();
    else if (curPage === 'track') renderTrack();
    else if (curPage === 'dash') renderDash();
    else if (curPage === 'hist') renderHist();
    else if (curPage === 'settings') renderSettings();
  }

  /* ---------------- backup ---------------- */
  function download(name, text, mime) {
    var blob = new Blob([text], { type: (mime || 'application/json') + ';charset=utf-8' });
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 400);
    toast('已导出 ' + name, 'ok');
  }
  function exportJSON() {
    var exportedAt = new Date().toISOString();
    S.meta = normalizeMeta(S.meta); S.meta.lastBackupAt = exportedAt; S.meta.backupCount += 1; S.meta.backupHistory = S.meta.backupHistory.concat([exportedAt]).slice(-10);
    download('token-backup-' + today() + '.json', JSON.stringify({
      app: 'Token消耗打卡台', version: 3, schema: 'tokens-amount-v3', storage: 'indexeddb-ledger-v1', priceUnit: 'per100m', exportedAt: exportedAt,
      settings: S.settings, records: S.records, accountLedger: S.accountLedger, meta: S.meta
    }, null, 2));
    save(); renderBackupMeta();
  }
  function exportCSV() {
    var head = ['日期', '平台', '模型', '场景', '消耗(M token)', '预估价格(¥/亿 token)', '金额(¥)', '倍率', '备注'];
    var lines = [head.join(',')];
    S.records.slice().sort(cmpRec).forEach(function (r) {
      lines.push([r.date, q(r.platform), q(r.model), q(r.project), (tokOf(r) / 1e6).toFixed(6), num(r.unitPrice).toFixed(4), costOf(r).toFixed(2), num(r.multiplier).toFixed(2), q(r.note)].join(','));
    });
    function q(v) {
      var text = String(v == null ? '' : v);
      /* Prevent spreadsheet formula execution when a user opens the CSV. */
      if (/^[=+\-@]/.test(text)) text = "'" + text;
      return '"' + text.replace(/"/g, '""') + '"';
    }
    download('token-records-' + today() + '.csv', '\ufeff' + lines.join('\r\n'), 'text/csv');
  }
  function pickImport() { $('#fileIn').click(); }
  function doImport(file) {
    var fr = new FileReader();
    fr.onload = function () {
      var o;
      try { o = JSON.parse(fr.result); } catch (e) { toast('文件不是有效的 JSON', 'err'); return; }
      var recs = Array.isArray(o) ? o : (o && Array.isArray(o.records) ? o.records : null);
      if (!recs) { toast('文件里没有找到记录数据', 'err'); return; }
      var clean = [], seen = {};
      recs.forEach(function (r) {
        var n = normalizeRecord(r, seen, !(o && o.priceUnit === 'per100m'));
        if (n && n.tokens > 0) clean.push(n);
      });
      var hasSettings = !!(o && o.settings && typeof o.settings === 'object');
      var hasLedger = !!(o && Array.isArray(o.accountLedger));
      if (!clean.length && !hasSettings && !hasLedger) { toast('没有可导入的有效数据', 'err'); return; }
      modal('导入 ' + clean.length + ' 条记录？', '选择「合并」会保留现有数据并追加；选择「覆盖」将替换全部现有数据。', '合并导入', function () {
        var have = {};
        S.records.forEach(function (r) { have[r.id] = 1; });
        clean.forEach(function (r) {
          if (!have[r.id]) {
            /* Merge keeps the current account snapshot; imported records are historical and must not refund it later. */
            S.records.push(Object.assign({}, r, { platformAmount: 0, accountDebited: false }));
            have[r.id] = 1;
          }
        });
        if (o && o.settings) {
          var imported = normalizeSettings(o.settings), platformNames = {};
          S.settings.platforms.forEach(function (p) { platformNames[p.name] = p.id; });
          imported.settings.platforms.forEach(function (p) {
            if (!platformNames[p.name]) {
              var np = normalizePlatform({ id: uid(), name: p.name, ratioYuan: p.ratioYuan, ratioPlatform: p.ratioPlatform, balance: 0 });
              S.settings.platforms.push(np); platformNames[p.name] = np.id;
              accountDelta(np, p.balance, 'opening', '', '合并导入账户快照');
            }
          });
          imported.settings.suppliers.forEach(function (s) {
            if (!S.settings.suppliers.some(function (x) { return x.model === s.model; })) {
              s.platformIds = s.platformIds.map(function (id) { var p = imported.settings.platforms.filter(function (x) { return x.id === id; })[0]; return p && platformNames[p.name]; }).filter(Boolean);
              S.settings.suppliers.push(s);
            }
          });
        }
        save(); refresh(); toast('已合并导入 ' + clean.length + ' 条', 'ok');
      });
      var ok = $('#mOk');
      var extra = document.createElement('button');
      extra.className = 'btn gh extra'; extra.textContent = '覆盖导入';
      extra.onclick = function () {
        S.records = clean;
        if (o && o.settings) {
          S.settings = normalizeSettings(o.settings).settings;
          applyTheme(S.settings.theme);
        }
        S.accountLedger = o && Array.isArray(o.accountLedger) ? o.accountLedger : [];
        S.meta = normalizeMeta(o && o.meta);
        ensureLedger();
        save(); refresh(); closeModal(); toast('已覆盖导入 ' + clean.length + ' 条', 'ok');
      };
      if (ok && ok.parentNode) ok.parentNode.insertBefore(extra, ok);
    };
    fr.onerror = function () { toast('读取文件失败', 'err'); };
    fr.readAsText(file);
  }

  /* ---------------- modal / toast ---------------- */
  var toastT;
  var modalReturnFocus = null;
  function toast(msg, kind) {
    var t = $('#toast');
    t.textContent = msg;
    t.className = 'on ' + (kind || '');
    clearTimeout(toastT);
    toastT = setTimeout(function () { t.className = ''; }, 2300);
  }
  function modal(title, text, okText, onOk) {
    modalReturnFocus = document.activeElement;
    $('#mTitle').textContent = title;
    $('#mText').textContent = text;
    var ok = $('#mOk'), box = ok.parentNode;
    $$('.modal .acts .btn.extra').forEach(function (b) { b.remove(); });
    ok.textContent = okText || '确定';
    ok.onclick = function () { closeModal(); onOk && onOk(); };
    $('#mask').classList.add('on');
    setTimeout(function () { if (ok && ok.focus) ok.focus(); }, 0);
  }
  function closeModal() {
    $('#mask').classList.remove('on');
    if (modalReturnFocus && modalReturnFocus.focus) modalReturnFocus.focus();
    modalReturnFocus = null;
  }

  /* ---------------- particle background ---------------- */
  function particles() {
    var cv = $('#bg'); if (!cv) return;
    var c = cv.getContext('2d'), W = 0, H = 0, ps = [], raf = null, colors = themeConfig();
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function resize() {
      colors = themeConfig();
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth; H = window.innerHeight;
      cv.width = W * dpr; cv.height = H * dpr;
      cv.style.width = W + 'px'; cv.style.height = H + 'px';
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      var n = Math.max(22, Math.min(64, Math.round(W / 20)));
      ps = [];
      for (var i = 0; i < n; i++) {
        ps.push({
          x: Math.random() * W, y: Math.random() * H,
          vx: (Math.random() - .5) * .32, vy: (Math.random() - .5) * .32,
          r: Math.random() * 1.7 + .6,
          c: Math.random() > .5 ? colors.cyRgb : (Math.random() > .5 ? colors.mgRgb : colors.puRgb)
        });
      }
      if (reduce) draw();
    }
    function draw() {
      c.clearRect(0, 0, W, H);
      for (var i = 0; i < ps.length; i++) {
        var p = ps[i];
        p.x += p.vx; p.y += p.vy;
        if (p.x < -20) p.x = W + 20; if (p.x > W + 20) p.x = -20;
        if (p.y < -20) p.y = H + 20; if (p.y > H + 20) p.y = -20;
        c.beginPath(); c.arc(p.x, p.y, p.r, 0, 6.2832);
        c.fillStyle = 'rgba(' + p.c + ',.75)';
        c.shadowBlur = 8; c.shadowColor = 'rgba(' + p.c + ',.7)'; c.fill(); c.shadowBlur = 0;
        for (var j = i + 1; j < ps.length; j++) {
          var q = ps[j], dx = p.x - q.x, dy = p.y - q.y, d2 = dx * dx + dy * dy;
          if (d2 < 13200) {
            c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(q.x, q.y);
            c.strokeStyle = 'rgba(' + colors.cyRgb + ',' + (0.11 * (1 - d2 / 13200)).toFixed(3) + ')';
            c.lineWidth = 1; c.stroke();
          }
        }
      }
    }
    particleRefresh = resize;
    function loop() { draw(); raf = requestAnimationFrame(loop); }
    resize();
    window.addEventListener('resize', resize);
    if (reduce) return;
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { if (raf) { cancelAnimationFrame(raf); raf = null; } }
      else if (!raf) loop();
    });
    loop();
  }

  /* ---------------- boot ---------------- */
  function boot() {
    load();
    applyTheme(S.settings.theme);
    buildNav();
    particles();

    $('#fDate').value = today();
    $('#fPlatform').innerHTML = platformOptions('');
    $('#fModel').innerHTML = modelOptions('', '');
    syncSupplierInfo();
    setFormMode(false);

    ['fTokens', 'fAmount'].forEach(function (id) {
      $('#' + id).addEventListener('input', updatePreview);
    });
    $('#fPlatform').addEventListener('change', function () {
      $('#fModel').innerHTML = modelOptions('', $('#fPlatform').value);
      syncSupplierInfo();
    });
    $('#fModel').addEventListener('change', syncSupplierInfo);
    ['hMonth', 'hPlatform', 'hModel'].forEach(function (id) { $('#' + id).addEventListener('change', filterHistory); });
    $('#hSearch').addEventListener('input', filterHistory);
    $('#hMore').addEventListener('click', function () { histLimit += 100; renderHist(); });
    $('#periodGranularity').addEventListener('change', renderDash);
    $$('#periodMetric button').forEach(function (b) { b.addEventListener('click', function () { selectPeriodMetric(b.dataset.metric); }); });
    $('#fileIn').addEventListener('change', function (e) {
      if (e.target.files && e.target.files[0]) doImport(e.target.files[0]);
      e.target.value = '';
    });
    document.addEventListener('click', function (e) {
      var b = e.target && e.target.closest ? e.target.closest('[data-action]') : null;
      if (!b) return;
      var id = b.getAttribute('data-id'), action = b.getAttribute('data-action');
      if (action === 'edit') edit(id);
      else if (action === 'delete') askDel(id);
       else if (action === 'supplier-delete') askDeleteSupplier(id);
      else if (action === 'platform-delete') askDeletePlatform(id);
      else if (action === 'platform-recharge') rechargePlatform(id);
      else if (action === 'platform-calibrate-toggle') toggleCalibration(id, b);
      else if (action === 'platform-calibrate') calibratePlatform(id);
    });
    $('#mask').addEventListener('click', function (e) { if (e.target === $('#mask')) closeModal(); });
    document.addEventListener('keydown', function (e) {
      if (!$('#mask').classList.contains('on')) return;
      if (e.key === 'Escape') { closeModal(); return; }
      if (e.key === 'Tab') {
        var focusables = $$('.modal button').filter(function (b) { return !b.disabled; });
        if (!focusables.length) return;
        var idx = focusables.indexOf(document.activeElement);
        if (e.shiftKey && idx <= 0) { e.preventDefault(); focusables[focusables.length - 1].focus(); }
        else if (!e.shiftKey && idx === focusables.length - 1) { e.preventDefault(); focusables[0].focus(); }
      }
    });
    window.addEventListener('hashchange', function () {
      go((location.hash || '').replace('#/', '') || 'home');
    });
    window.addEventListener('popstate', function () {
      go((location.hash || '').replace('#/', '') || 'home');
    });
    var r = new ResizeObserver(function () {
      Object.keys(charts).forEach(function (k) { if (charts[k]) { try { charts[k].resize(); } catch (err) {} } });
    });
    $$('.main').forEach(function (m) { try { r.observe(m); } catch (e) {} });

    go((location.hash || '').replace('#/', '') || 'home');
  }

  var App = {
    go: go, edit: edit, cancelEdit: cancelEdit, askDel: askDel, askClear: askClear,
    addRecord: addRecord, resetForm: resetForm, saveSettings: saveSettings, fillDate: fillDate, addSupplier: addSupplier, addPlatform: addPlatform, rechargePlatform: rechargePlatform, toggleCalibration: toggleCalibration, calibratePlatform: calibratePlatform, toggleLedger: toggleLedger, checkDataHealth: checkDataHealth, rebuildBalances: rebuildBalances, restoreDemo: restoreDemo,
    selectPeriodMetric: selectPeriodMetric,
    exportJSON: exportJSON, exportCSV: exportCSV, pickImport: pickImport,
    closeModal: closeModal, refresh: refresh, selectSettingsTab: selectSettingsTab, selectTheme: selectTheme
  };
  window.App = App;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
