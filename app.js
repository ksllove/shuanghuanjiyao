/* ═══════════════════════════════════════
   HTML 文件管理器 Pro - 主逻辑
   ═══════════════════════════════════════ */

// ═══ 全局变量 ═══
var OWNER = 'ksllove';
var REPO = 'shuanghuanjiyao';
var BRANCH = 'master';
var DIR = 'files';
var API = 'https://api.github.com';
var TOKEN = localStorage.getItem('gh_token') || '';
var FILES = [];
var ACTIVE = null;
var EDITING = null;
var QUEUE = [];
var prevTimer = null;
var previewVisible = true;
var DRAFT_KEY = 'draft_';

// ═══ DOM 工具 ═══
function $(id) { return document.getElementById(id) }
function esc(s) { var d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML }

function toast(m, t) {
  t = t || 'ok';
  var e = document.createElement('div');
  e.className = 'toast ' + t;
  e.textContent = m;
  document.body.appendChild(e);
  setTimeout(function() { e.remove() }, 3000);
}

function closeOv(id) { $(id).classList.remove('show') }
function openOv(id) { $(id).classList.add('show') }

function fmtSz(b) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(1) + ' MB';
}

function b64e(s) { return btoa(unescape(encodeURIComponent(s))) }
function b64d(s) { try { return decodeURIComponent(escape(atob(s))) } catch(e) { return atob(s) } }

// ═══ 主题管理 ═══
function initTheme() {
  var saved = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeBtn(saved);
}

function toggleTheme() {
  var current = document.documentElement.getAttribute('data-theme') || 'dark';
  var next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  updateThemeBtn(next);
}

function updateThemeBtn(t) {
  var btn = $('themeBtn');
  if (btn) btn.textContent = t === 'dark' ? '☀️' : '🌙';
}

// ═══ HTTP 工具 ═══
function hdrs() {
  var h = { 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' };
  if (TOKEN) h['Authorization'] = 'token ' + TOKEN;
  return h;
}

function apiFetch(url, opts) {
  opts = opts || {};
  opts.headers = hdrs();
  return fetch(url, opts).then(function(r) {
    if (r.status === 401) {
      TOKEN = '';
      localStorage.removeItem('gh_token');
      updateTokenUI();
      FILES = [];
      render();
      toast('⚠️ Token 已过期，请重新输入', 'er');
      setTimeout(function() { $('tokenInput').focus() }, 500);
    }
    return r;
  });
}

// ═══ Token 管理 ═══
function updateTokenUI() {
  var st = $('tokenSt');
  var inp = $('tokenInput');
  var warn = $('tokenWarn');
  if (TOKEN) {
    inp.value = TOKEN.substring(0, 10) + '••••';
    st.textContent = '已连接';
    st.className = 'st on';
    if (warn) warn.style.display = 'none';
  } else {
    inp.value = '';
    st.textContent = '未连接';
    st.className = 'st off';
    if (warn) warn.style.display = '';
  }
}

function doSaveToken() {
  var inp = $('tokenInput');
  var v = inp.value.trim();
  if (!v && TOKEN) {
    TOKEN = '';
    localStorage.removeItem('gh_token');
    updateTokenUI();
    FILES = [];
    render();
    toast('已断开');
    return;
  }
  if (!v) { toast('请输入 Token', 'er'); return }
  v = v.replace(/\s/g, '');
  TOKEN = v;
  localStorage.setItem('gh_token', TOKEN);
  toast('正在验证…');
  apiFetch(API + '/user')
    .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json() })
    .then(function(d) {
      toast('✅ 已连接: ' + d.login);
      updateTokenUI();
      ensureDir().then(loadList);
    })
    .catch(function(e) {
      toast('Token 无效: ' + e.message, 'er');
      TOKEN = '';
      localStorage.removeItem('gh_token');
      updateTokenUI();
    });
}

// ═══ GitHub API ═══
function apiList() {
  return apiFetch(API + '/repos/' + OWNER + '/' + REPO + '/contents/' + DIR + '?ref=' + BRANCH + '&_=' + Date.now())
    .then(function(r) { if (r.status === 404) return []; if (!r.ok) throw new Error('API ' + r.status); return r.json() });
}

function apiGet(name) {
  return apiFetch(API + '/repos/' + OWNER + '/' + REPO + '/contents/' + DIR + '/' + encodeURIComponent(name) + '?ref=' + BRANCH)
    .then(function(r) { if (!r.ok) throw new Error('获取失败 ' + r.status); return r.json() });
}

function apiPut(name, content, sha) {
  var body = { message: (sha ? '更新: ' : '新建: ') + name, content: b64e(content), branch: BRANCH };
  if (sha) body.sha = sha;
  return apiFetch(API + '/repos/' + OWNER + '/' + REPO + '/contents/' + DIR + '/' + encodeURIComponent(name), {
    method: 'PUT', body: JSON.stringify(body)
  }).then(function(r) {
    if (!r.ok) return r.json().then(function(e) { throw new Error(e.message || '保存失败 ' + r.status) });
    return r.json().then(function(d) { return d.content });
  });
}

function apiDel(name, sha) {
  return apiFetch(API + '/repos/' + OWNER + '/' + REPO + '/contents/' + DIR + '/' + encodeURIComponent(name), {
    method: 'DELETE', body: JSON.stringify({ message: '删除: ' + name, sha: sha, branch: BRANCH })
  }).then(function(r) { if (!r.ok) throw new Error('删除失败 ' + r.status) });
}

function ensureDir() {
  return apiList().then(function(items) {
    if (items.length > 0) return;
    return apiPut('.gitkeep', '', null).catch(function() {});
  });
}

// ═══ 加载列表 ═══
function loadList() {
  if (!TOKEN) return Promise.resolve();
  return apiList()
    .then(function(items) {
      FILES = items
        .filter(function(i) { return i.type === 'file' && /\.html?$/i.test(i.name) && i.name !== 'index.html' })
        .map(function(i) { return { name: i.name, sha: i.sha, size: i.size } })
        .sort(function(a, b) { return b.name.localeCompare(a.name) });
      render();
    })
    .catch(function(e) {
      $('fL').innerHTML = '<div style="padding:20px;text-align:center;color:var(--red2);font-size:13px">' + esc(e.message) + '</div>';
      $('cnt').textContent = '错误';
    });
}

function render(q) {
  q = (q || '').toLowerCase();
  var ls = FILES.filter(function(f) { return f.name.toLowerCase().indexOf(q) >= 0 });
  $('cnt').textContent = FILES.length + ' 个文件';
  var el = $('fL');
  if (!ls.length) {
    el.innerHTML = '<div style="text-align:center;padding:32px;color:var(--text6);font-size:13px">' + (FILES.length ? '无匹配' : '暂无文件') + '</div>';
    return;
  }
  var html = '';
  for (var i = 0; i < ls.length; i++) {
    var f = ls[i];
    html += '<div class="fi' + (f.name === ACTIVE ? ' on' : '') + '" data-n="' + esc(f.name) + '">' +
      '<div class="fn">📄 ' + esc(f.name.replace(/\.html?$/i, '')) + '</div>' +
      '<div class="fm">' + fmtSz(f.size) + '</div></div>';
  }
  el.innerHTML = html;
}

// ═══ 查看 ═══
function view(name) {
  ACTIVE = name;
  render($('sI').value);
  $('mT').style.display = '';
  $('mTi').textContent = name.replace(/\.html?$/i, '');
  var mb = $('mB');
  mb.innerHTML = '<div style="text-align:center;padding:60px"><div class="ld"></div><p style="color:var(--text5);font-size:13px;margin-top:12px">加载中…</p></div>';
  apiGet(name)
    .then(function(d) {
      var content = b64d(d.content);
      mb.innerHTML = '<div class="info"><span>📎 ' + esc(name) + '</span><span>📏 ' + fmtSz(content.length) + '</span></div>' +
        '<div class="card"><iframe sandbox="allow-same-origin allow-scripts" onload="fitIfr(this)"></iframe></div>';
      var ifr = mb.querySelector('iframe');
      ifr.srcdoc = content;
      mb.scrollTop = 0;
    })
    .catch(function(e) { mb.innerHTML = '<div style="padding:40px;text-align:center;color:var(--red2)">' + esc(e.message) + '</div>' });
}

function fitIfr(ifr) {
  try {
    var d = ifr.contentDocument || ifr.contentWindow.document;
    var r = function() { ifr.style.height = Math.max(400, d.body.scrollHeight + 30) + 'px' };
    r();
    new ResizeObserver(r).observe(d.body);
  } catch(e) {}
}

// ═══ 上传 ═══
function doUpload() {
  QUEUE = [];
  $('nN').value = '';
  $('nC').value = '';
  $('fQ').innerHTML = '';
  $('fIn').value = '';
  togM();
  openOv('nOv');
}

function togM() { $('mI').style.display = QUEUE.length ? 'none' : '' }

$('fIn').addEventListener('change', function(e) { addQ(e.target.files); e.target.value = '' });

var uz = $('upZ');
uz.addEventListener('dragover', function(e) { e.preventDefault(); uz.classList.add('dg') });
uz.addEventListener('dragleave', function() { uz.classList.remove('dg') });
uz.addEventListener('drop', function(e) { e.preventDefault(); uz.classList.remove('dg'); addQ(e.dataTransfer.files) });

function addQ(fl) {
  var pending = [];
  for (var i = 0; i < fl.length; i++) { if (/\.html?$/i.test(fl[i].name)) pending.push(fl[i]); }
  if (!pending.length && fl.length) { toast('选 .html 文件', 'er'); return }
  Promise.all(pending.map(function(f) {
    return f.text().then(function(text) { QUEUE.push({ name: f.name, content: text, size: f.size }) });
  })).then(renderQ);
}

function renderQ() {
  var html = '';
  for (var i = 0; i < QUEUE.length; i++) {
    var f = QUEUE[i];
    html += '<div class="qi"><span class="qn">📄 ' + esc(f.name) + '</span><span class="qs">' + fmtSz(f.size) + '</span>' +
      '<span class="qst" id="qs' + i + '"></span><button onclick="rmQ(' + i + ')">✕</button></div>';
  }
  $('fQ').innerHTML = html;
  togM();
}

function rmQ(i) { QUEUE.splice(i, 1); renderQ() }

function doSave() {
  var btn = event.target; btn.disabled = true;
  function finish() { btn.disabled = false }
  if (QUEUE.length) {
    var ok = 0, fail = 0, total = QUEUE.length;
    function next(i) {
      if (i >= total) {
        toast(ok + ' 个成功' + (fail ? '，' + fail + ' 失败' : ''), fail ? 'er' : 'ok');
        loadList().then(function() { closeOv('nOv'); finish() });
        return;
      }
      var f = QUEUE[i]; var st = $('qs' + i);
      st.textContent = '上传…'; st.className = 'qst ld';
      apiGet(f.name).catch(function() { return null })
        .then(function(ex) { return apiPut(f.name, f.content, ex ? ex.sha : null) })
        .then(function() { st.textContent = '✓'; st.className = 'qst ok'; ok++; next(i + 1) })
        .catch(function(e) { st.textContent = '✗ ' + e.message; st.className = 'qst er'; fail++; next(i + 1) });
    }
    next(0);
  } else {
    var nm = $('nN').value.trim();
    var ct = $('nC').value.trim();
    if (!ct) { toast('输入内容', 'er'); finish(); return }
    var fn = (nm || new Date().toISOString().slice(0, 10)) + '.html';
    apiGet(fn).catch(function() { return null })
      .then(function(ex) { return apiPut(fn, ct, ex ? ex.sha : null) })
      .then(function() { toast('「' + fn + '」已上传'); return loadList() })
      .then(function() { closeOv('nOv'); finish() })
      .catch(function(e) { toast('失败: ' + e.message, 'er'); finish() });
  }
}

// ═══ 新建 ═══
function doNew() {
  EDITING = null;
  var content = '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n  <meta charset="UTF-8">\n  <title>新页面</title>\n</head>\n<body>\n  <h1>Hello</h1>\n</body>\n</html>';
  openEditor('📝 新文件', content);
}

// ═══ 编辑 ═══
function doEdit() {
  if (!ACTIVE) return;
  EDITING = ACTIVE;
  apiGet(ACTIVE)
    .then(function(d) { openEditor('✏️ <span style="color:var(--accent2);font-weight:400">' + esc(ACTIVE) + '</span>', b64d(d.content), d.sha) })
    .catch(function(e) { toast('加载失败: ' + e.message, 'er') });
}

// ═══ 预览 ═══
function doPreview() {
  if (!ACTIVE) return;
  apiGet(ACTIVE).then(function(d) {
    var w = window.open('', '_blank');
    w.document.open(); w.document.write(b64d(d.content)); w.document.close();
  }).catch(function() { toast('失败', 'er') });
}

// ═══ 删除（带确认输入） ═══
function doDel() {
  if (!ACTIVE) return;
  $('delConfirmName').textContent = ACTIVE;
  $('delConfirmInput').value = '';
  $('delConfirmBtn').disabled = true;
  openOv('delOv');
  setTimeout(function() { $('delConfirmInput').focus() }, 100);
}

function onDelConfirmInput() {
  var input = $('delConfirmInput').value.trim();
  $('delConfirmBtn').disabled = (input !== ACTIVE);
}

function doDelConfirm() {
  var name = ACTIVE;
  closeOv('delOv');
  apiGet(name).then(function(d) { return apiDel(name, d.sha) })
    .then(function() {
      toast('已删除');
      clearDraft(name);
      ACTIVE = null;
      $('mT').style.display = 'none';
      $('mB').innerHTML = '<div class="empty"><div class="ei">🌐</div><p>选择或上传文件</p></div>';
      return loadList();
    }).catch(function() { toast('删除失败', 'er') });
}

// ═══ 草稿管理 ═══
function saveDraft(name, content) {
  if (!name || !content) return;
  try { localStorage.setItem(DRAFT_KEY + name, content) } catch(e) {}
}

function getDraft(name) {
  try { return localStorage.getItem(DRAFT_KEY + name) } catch(e) { return null }
}

function clearDraft(name) {
  try { localStorage.removeItem(DRAFT_KEY + name) } catch(e) {}
}

function getAllDrafts() {
  var drafts = [];
  for (var i = 0; i < localStorage.length; i++) {
    var k = localStorage.key(i);
    if (k && k.indexOf(DRAFT_KEY) === 0) {
      drafts.push(k.substring(DRAFT_KEY.length));
    }
  }
  return drafts;
}

// ═══ 编辑器：草稿自动保存 ═══
var draftSaveTimer = null;

function onEditorChange() {
  clearTimeout(prevTimer);
  if ($('autoRefresh').checked) prevTimer = setTimeout(doRefreshPrev, 300);

  // 自动保存草稿
  clearTimeout(draftSaveTimer);
  draftSaveTimer = setTimeout(function() {
    var name = EDITING || '_new_';
    var content = getEditorContent();
    if (content) saveDraft(name, content);
  }, 1000);
}

function checkDraft(name) {
  var draft = getDraft(name);
  if (draft) {
    var banner = $('draftBanner');
    if (banner) {
      banner.classList.add('show');
      banner.querySelector('.draft-text').textContent = '发现未保存的草稿（' + fmtSz(draft.length) + '）';
      banner._draftContent = draft;
    }
  }
}

function restoreDraft() {
  var banner = $('draftBanner');
  if (banner && banner._draftContent) {
    setEditorContent(banner._draftContent);
    banner.classList.remove('show');
    toast('已恢复草稿');
  }
}

function dismissDraft() {
  var banner = $('draftBanner');
  if (banner) {
    var name = EDITING || '_new_';
    clearDraft(name);
    banner.classList.remove('show');
  }
}


function loadScript(src) {
  return new Promise(function(resolve, reject) {
    var s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}


// 备用：纯 textarea 编辑器
function openEditorFallback(title, content, sha) {
  $('editorOverlay').classList.add('show');
  $('eoTitle').innerHTML = title;
  var container = $('cmContainer');
  container.innerHTML = '';
  var ta = document.createElement('textarea');
  ta.style.cssText = 'flex:1;width:100%;height:100%;padding:14px;background:var(--bg-gutter);color:var(--text);border:none;outline:none;resize:none;font-family:var(--mono);font-size:13px;line-height:1.7;tab-size:2;min-height:0';
  ta.value = content || '';
  ta.id = 'fallbackEditor';
  ta.spellcheck = false;
  container.appendChild(ta);
  if (sha) ta.dataset.sha = sha;

  ta.addEventListener('keydown', function(e) {
    if (e.key === 'Tab') {
      e.preventDefault();
      var s = ta.selectionStart, en = ta.selectionEnd;
      ta.value = ta.value.substring(0, s) + '  ' + ta.value.substring(en);
      ta.selectionStart = ta.selectionEnd = s + 2;
    }
  });

  ta.addEventListener('input', function() { onEditorChange() });

  var name = EDITING || '_new_';
  checkDraft(name);
  doRefreshPrev();
  setTimeout(function() { ta.focus() }, 100);
}

async function openEditor(title, content, sha) {
  // 检查草稿
  var name = EDITING || '_new_';
  var draft = getDraft(name);
  if (draft && draft !== content) {
    content = draft; // 默认使用草稿
  }

  openEditorFallback(title, content, sha);
}

function getEditorContent() {
  var fb = document.getElementById('fallbackEditor');
  return fb ? fb.value : '';
}

function setEditorContent(content) {
  var fb = document.getElementById('fallbackEditor');
  if (fb) fb.value = content;
}

function doRefreshPrev() {
  var f = $('prevFrame');
  var c = getEditorContent();
  try { var d = f.contentDocument || f.contentWindow.document; d.open(); d.write(c); d.close() } catch(e) {}
}

function closeEditor() {
  // 清理草稿定时器
  clearTimeout(draftSaveTimer);

  // 隐藏草稿提示
  var banner = $('draftBanner');
  if (banner) banner.classList.remove('show');

  $('editorOverlay').classList.remove('show');
  $('cmContainer').innerHTML = '';
}

function doSaveEdit() {
  var nm = EDITING || ('未命名-' + Date.now().toString(36) + '.html');
  var ct = getEditorContent();
  var fb = document.getElementById('fallbackEditor');
  var sha = (fb && fb.dataset.sha) || null;

  if (!EDITING) {
    var name = prompt('文件名:', nm);
    if (!name) return;
    nm = name.endsWith('.html') ? name : name + '.html';
  }

  apiPut(nm, ct, sha)
    .then(function(r) {
      if (fb) fb.dataset.sha = r.sha;
      EDITING = nm; ACTIVE = nm;
      clearDraft(nm);
      toast('「' + nm + '」已保存');
      return loadList();
    })
    .then(function() { render($('sI').value) })
    .catch(function(e) { toast('保存失败: ' + e.message, 'er') });
}

// ═══ 格式化（改进版） ═══
function doFmt() {
  var code = getEditorContent();
  if (!code.trim()) return;

  try {
    // 简单但更可靠的 HTML 格式化
    var formatted = formatHTML(code);

    var fb = document.getElementById('fallbackEditor');
    if (fb) fb.value = formatted;
    toast('已格式化');
  } catch(e) {
    toast('格式化失败', 'er');
  }
}

function formatHTML(html) {
  // 保留原始内容，不做破坏性处理
  var result = '';
  var indent = 0;
  var inTag = false;
  var inContent = false;
  var tagBuffer = '';
  var contentBuffer = '';
  var selfCloseTags = /^(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/i;
  var skipTags = /^(script|style|pre|code|textarea)$/i;
  var inSkip = false;
  var skipDepth = 0;

  // 先处理 >\s< 的换行
  var tokens = html.replace(/>\s+</g, '>\n<').split('\n');

  for (var i = 0; i < tokens.length; i++) {
    var token = tokens[i].trim();
    if (!token) continue;

    // 检查是否是跳过标签
    var skipMatch = token.match(/^<(script|style|pre|code|textarea)[\s>]/i);
    var skipEnd = token.match(/^<\/(script|style|pre|code|textarea)>/i);

    if (skipMatch && !inSkip) {
      inSkip = true;
      skipDepth = 0;
    }

    if (inSkip) {
      result += '  '.repeat(indent) + token + '\n';
      if (skipMatch) skipDepth++;
      if (skipEnd) {
        skipDepth--;
        if (skipDepth <= 0) inSkip = false;
      }
      continue;
    }

    // 关闭标签
    if (token.match(/^<\//)) {
      indent = Math.max(0, indent - 1);
      result += '  '.repeat(indent) + token + '\n';
      continue;
    }

    // 自闭合标签
    if (token.match(/^<\w[^>]*\/>$/) || token.match(new RegExp('^<' + selfCloseTags.source + '[\\s>]', 'i'))) {
      result += '  '.repeat(indent) + token + '\n';
      continue;
    }

    // 开放标签
    if (token.match(/^<\w/)) {
      result += '  '.repeat(indent) + token + '\n';
      // 检查是否同时有开闭标签（如 <div>...</div>）
      if (!token.match(/<\/\w+>$/) && !token.match(/\/>$/)) {
        indent++;
      }
      continue;
    }

    // 文本内容
    result += '  '.repeat(indent) + token + '\n';
  }

  return result.replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

function togglePreview() {
  var prev = $('eoPreview');
  var handle = $('resizeHandle');
  previewVisible = !previewVisible;
  if (previewVisible) {
    prev.style.display = ''; handle.style.display = '';
    $('prevToggleBtn').style.borderColor = ''; $('prevToggleBtn').style.color = '';
    doRefreshPrev();
  } else {
    prev.style.display = 'none'; handle.style.display = 'none';
    $('prevToggleBtn').style.borderColor = 'var(--accent)'; $('prevToggleBtn').style.color = 'var(--accent)';
  }
}

function toggleWrap() {
  var fb = document.getElementById('fallbackEditor');
  if (fb) fb.style.whiteSpace = fb.style.whiteSpace === 'pre-wrap' ? 'pre' : 'pre-wrap';
  $('wrapBtn').style.borderColor = $('wrapBtn').style.borderColor ? '' : 'var(--accent)';
}


// ═══ 拖拽分屏 ═══
(function() {
  var handle, editorPanel, previewPanel;
  var dragging = false, startX, startEditorW;

  function init() {
    handle = $('resizeHandle');
    editorPanel = $('eoEditor');
    previewPanel = $('eoPreview');
    if (!handle) return;

    handle.addEventListener('mousedown', function(e) {
      dragging = true; startX = e.clientX;
      startEditorW = editorPanel.getBoundingClientRect().width;
      handle.classList.add('active');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });

    document.addEventListener('mousemove', function(e) {
      if (!dragging) return;
      var dx = e.clientX - startX;
      var container = document.querySelector('.eo-body');
      var totalW = container.getBoundingClientRect().width - 5;
      var newEditorW = Math.max(200, Math.min(totalW - 200, startEditorW + dx));
      editorPanel.style.flex = 'none';
      editorPanel.style.width = (newEditorW / totalW * 100) + '%';
      previewPanel.style.flex = '1';
    });

    document.addEventListener('mouseup', function() {
      if (!dragging) return;
      dragging = false;
      handle.classList.remove('active');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

// ═══ 事件 ═══
$('fL').addEventListener('click', function(e) { var it = e.target.closest('.fi'); if (it) view(it.dataset.n) });

var searchTimer;
$('sI').addEventListener('input', function(e) { clearTimeout(searchTimer); searchTimer = setTimeout(function() { render(e.target.value) }, 150) });

window.addEventListener('online', function() { $('offBar').classList.remove('show') });
window.addEventListener('offline', function() { $('offBar').classList.add('show') });

document.addEventListener('keydown', function(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'n') { e.preventDefault(); doNew() }
  if (e.key === 'Escape') {
    if ($('editorOverlay').classList.contains('show')) { closeEditor(); return }
    if ($('delOv').classList.contains('show')) { closeOv('delOv'); return }
    closeOv('nOv');
  }
});

$('nOv').addEventListener('click', function(e) { if (e.target === this) closeOv('nOv') });

// ═══ 初始化 ═══
initTheme();
updateTokenUI();
if (TOKEN) ensureDir().then(loadList);

// 检查是否有未保存的草稿
(function() {
  var drafts = getAllDrafts();
  if (drafts.length > 0) {
    toast('有 ' + drafts.length + ' 个未保存的草稿', 'warn');
  }
})();
