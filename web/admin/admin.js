// Cheffy moderation dashboard (cheffy.me/admin/moderation/).
//
// Security model: this page holds no privileges of its own. It signs a
// moderator in with their own Cheffy account, then calls database functions
// (admin_*) that each check public.is_moderator() on the server. Hiding this
// page would add nothing; the server is what says no.
//
// Everything user-written (content, notes, usernames) is inserted with
// textContent, never innerHTML.
(function () {
  'use strict';

  var CFG = window.CHEFFY_ADMIN_CONFIG || {};
  var API = String(CFG.supabaseUrl || '').replace(/\/$/, '');
  var KEY = String(CFG.publishableKey || '');
  var SESSION_KEY = 'cheffy-admin-session';
  var IDLE_LIMIT_MS = 30 * 60 * 1000; // sign out after 30 minutes idle
  var REFRESH_MS = 60 * 1000;
  var PAGE = 50;

  var STATUS_LABEL = { open: 'Pending', reviewed: 'Under review', actioned: 'Resolved', dismissed: 'Dismissed' };
  var PRIORITY_LABEL = { urgent: 'Urgent', normal: 'Normal', low: 'Low' };
  var TYPE_LABEL = { post: 'Post', comment: 'Comment', user: 'Profile' };
  var REASON_LABEL = {
    inappropriate: 'Inappropriate', harassment: 'Harassment', spam: 'Spam',
    not_homemade: 'Not homemade', intellectual_property: 'Intellectual property', other: 'Other',
  };
  var ACTION_LABEL = {
    review: 'Started review', resolve: 'Resolved', dismiss: 'Dismissed', reopen: 'Reopened',
    note: 'Note', remove: 'Removed content', restore: 'Restored content', suspend: 'Suspended account',
    unsuspend: 'Unsuspended account', auto_hide: 'Hidden automatically',
  };

  var session = null; // { access_token, refresh_token, expires_at, email }
  var lastActivity = Date.now();
  var lastPending = null;
  var queueOffset = 0;
  var refreshTimer = null;

  // ---------------------------------------------------------------- helpers
  function $(id) { return document.getElementById(id); }
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.indexOf('on') === 0) node.addEventListener(k.slice(2), attrs[k]);
        else node.setAttribute(k, attrs[k]);
      });
    }
    (children || []).forEach(function (c) {
      if (c == null || c === false) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function show(view) {
    ['view-signin', 'view-queue', 'view-detail', 'view-denied'].forEach(function (v) { $(v).hidden = v !== view; });
  }
  function fmtDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }
  function ago(iso) {
    var mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 60) return mins + 'm ago';
    var h = Math.round(mins / 60);
    return h < 48 ? h + 'h ago' : Math.round(h / 24) + 'd ago';
  }
  var toastTimer;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 3500);
  }
  function pill(text, cls) { return el('span', { class: 'pill ' + (cls || ''), text: text }); }

  // ---------------------------------------------------------------- auth
  function saveSession(s) {
    session = s;
    try {
      if (s) sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
      else sessionStorage.removeItem(SESSION_KEY);
    } catch (e) { /* storage blocked: session lives in memory only */ }
  }
  function loadSession() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { return null; }
  }
  function fromTokenResponse(body, email) {
    return {
      access_token: body.access_token,
      refresh_token: body.refresh_token,
      expires_at: Date.now() + (Number(body.expires_in) || 3600) * 1000,
      email: (body.user && body.user.email) || email || '',
    };
  }
  function authRequest(grant, payload) {
    return fetch(API + '/auth/v1/token?grant_type=' + grant, {
      method: 'POST',
      headers: { apikey: KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (body) {
        if (!res.ok) {
          var err = new Error(body.error_description || body.msg || body.message || 'Sign-in failed');
          err.status = res.status;
          throw err;
        }
        return body;
      });
    });
  }
  function refreshIfNeeded() {
    if (!session) return Promise.reject(new Error('signed out'));
    if (session.expires_at - Date.now() > 60 * 1000) return Promise.resolve();
    return authRequest('refresh_token', { refresh_token: session.refresh_token })
      .then(function (body) { saveSession(fromTokenResponse(body, session.email)); })
      .catch(function (e) { signOut(true); throw e; });
  }
  function signOut(silent) {
    var token = session && session.access_token;
    saveSession(null);
    clearInterval(refreshTimer);
    if (token) {
      fetch(API + '/auth/v1/logout', { method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + token } })
        .catch(function () {});
    }
    $('session').hidden = true;
    document.title = 'Cheffy moderation';
    if (!silent) toast('Signed out.');
    show('view-signin');
  }

  // ---------------------------------------------------------------- API
  function rpc(fn, args) {
    return refreshIfNeeded().then(function () {
      return fetch(API + '/rest/v1/rpc/' + fn, {
        method: 'POST',
        headers: {
          apikey: KEY,
          Authorization: 'Bearer ' + session.access_token,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(args || {}),
      });
    }).then(function (res) {
      return res.text().then(function (text) {
        var body = text ? JSON.parse(text) : null;
        if (!res.ok) {
          var err = new Error((body && body.message) || 'Request failed (' + res.status + ')');
          err.code = body && body.code;
          err.status = res.status;
          if (res.status === 401) signOut(true);
          throw err;
        }
        return body;
      });
    });
  }
  // Storage paths come from user data: only plain relative paths, never
  // "." or ".." segments, so a crafted path can't redirect a request that
  // carries the moderator's token. (The database enforces the same format.)
  var SAFE_PATH = /^[A-Za-z0-9_-][A-Za-z0-9._-]*(\/[A-Za-z0-9_-][A-Za-z0-9._-]*)*$/;
  function safePath(path) {
    return typeof path === 'string' && path.length <= 300 && SAFE_PATH.test(path);
  }

  // Short-lived (5 minute) links for private post photos.
  function signedPhoto(path) {
    if (!safePath(path)) return Promise.resolve(null);
    return refreshIfNeeded().then(function () {
      return fetch(API + '/storage/v1/object/sign/post-images/' + path.split('/').map(encodeURIComponent).join('/'), {
        method: 'POST',
        headers: { apikey: KEY, Authorization: 'Bearer ' + session.access_token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiresIn: 300 }),
      });
    }).then(function (res) {
      if (!res.ok) return null;
      return res.json().then(function (b) { return b.signedURL ? API + '/storage/v1' + b.signedURL : null; });
    }).catch(function () { return null; });
  }
  function avatarUrl(path) {
    if (!safePath(path)) return '';
    return API + '/storage/v1/object/public/avatars/' + path.split('/').map(encodeURIComponent).join('/');
  }

  // ---------------------------------------------------------------- start
  function start() {
    $('session').hidden = false;
    $('who').textContent = session.email;
    rpc('admin_report_counts').then(function () {
      route();
      clearInterval(refreshTimer);
      refreshTimer = setInterval(function () {
        if (Date.now() - lastActivity > IDLE_LIMIT_MS) { signOut(); toast('Signed out after 30 minutes idle.'); return; }
        loadCounts();
      }, REFRESH_MS);
    }).catch(function (e) {
      if (e.code === '42501') {
        saveSession(null);
        $('session').hidden = true;
        show('view-denied');
      } else {
        toast(e.message);
        show('view-signin');
      }
    });
  }

  $('signin-form').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var form = ev.target;
    var btn = form.querySelector('button');
    $('signin-error').textContent = '';
    btn.disabled = true;
    authRequest('password', { email: form.email.value.trim(), password: form.password.value })
      .then(function (body) {
        form.password.value = '';
        saveSession(fromTokenResponse(body, form.email.value.trim()));
        start();
      })
      .catch(function (e) {
        $('signin-error').textContent = e.status === 400 ? 'That email and password don’t match.' : e.message;
      })
      .finally(function () { btn.disabled = false; });
  });
  $('sign-out').addEventListener('click', function () { signOut(); });
  ['click', 'keydown', 'scroll'].forEach(function (evt) {
    document.addEventListener(evt, function () { lastActivity = Date.now(); }, { passive: true });
  });

  // ---------------------------------------------------------------- routing
  function route() {
    if (!session) return show('view-signin');
    var m = location.hash.match(/^#\/report\/([0-9a-f-]{36})$/i);
    if (m) return openReport(m[1]);
    show('view-queue');
    loadCounts();
    loadQueue(true);
  }
  window.addEventListener('hashchange', function () { if (session) route(); });

  // ---------------------------------------------------------------- overview
  function loadCounts() {
    return rpc('admin_report_counts').then(function (rows) {
      var c = rows && rows[0] ? rows[0] : {};
      var pending = Number(c.pending || 0);
      var pillEl = $('pending-pill');
      pillEl.textContent = String(pending);
      pillEl.classList.toggle('has', pending > 0);
      document.title = (pending ? '(' + pending + ') ' : '') + 'Cheffy moderation';
      if (lastPending !== null && pending > lastPending) toast('New report received.');
      lastPending = pending;
      renderCards(c);
      $('refreshed').textContent = 'Updated ' + new Date().toLocaleTimeString();
    }).catch(function (e) { if (e.status !== 401) toast(e.message); });
  }
  function renderCards(c) {
    var current = $('filters').status.value;
    var cards = [
      ['open', 'Pending', c.pending],
      ['urgent', 'Urgent', c.urgent, true],
      ['overdue', 'Over 24 hours', c.overdue, true],
      ['reviewed', 'Under review', c.under_review],
      ['actioned', 'Resolved', c.resolved],
      ['dismissed', 'Dismissed', c.dismissed],
    ];
    var wrap = $('cards');
    clear(wrap);
    cards.forEach(function (card) {
      var n = Number(card[2] || 0);
      var active = card[0] === current || (card[0] === 'urgent' && $('filters').priority.value === 'urgent' && current === 'active');
      wrap.appendChild(el('button', {
        type: 'button',
        class: 'card' + (card[3] && n > 0 ? ' alert' : '') + (active ? ' active' : ''),
        onclick: function () {
          var f = $('filters');
          f.priority.value = '';
          if (card[0] === 'urgent') { f.status.value = 'active'; f.priority.value = 'urgent'; }
          else if (card[0] === 'overdue') { f.status.value = 'active'; }
          else f.status.value = card[0];
          loadQueue(true);
          renderCards(c);
        },
      }, [el('b', { text: String(n) }), el('span', { text: card[1] })]));
    });
  }

  // ---------------------------------------------------------------- queue
  var searchTimer;
  $('filters').addEventListener('change', function () { loadQueue(true); });
  $('filters').addEventListener('input', function (ev) {
    if (ev.target.name !== 'search') return;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () { loadQueue(true); }, 300);
  });
  $('filters').addEventListener('submit', function (ev) { ev.preventDefault(); });
  $('load-more').addEventListener('click', function () { loadQueue(false); });

  function loadQueue(reset) {
    var f = $('filters');
    if (reset) queueOffset = 0;
    var to = f.to.value ? new Date(f.to.value + 'T00:00:00') : null;
    if (to) to.setDate(to.getDate() + 1);
    return rpc('admin_reports', {
      p_status: f.status.value || 'active',
      p_type: f.type.value || null,
      p_reason: f.reason.value || null,
      p_priority: f.priority.value || null,
      p_from: f.from.value ? new Date(f.from.value + 'T00:00:00').toISOString() : null,
      p_to: to ? to.toISOString() : null,
      p_search: f.search.value.trim() || null,
      p_limit: PAGE,
      p_offset: queueOffset,
    }).then(function (rows) {
      var body = $('rows');
      if (reset) clear(body);
      (rows || []).forEach(function (r) { body.appendChild(queueRow(r)); });
      queueOffset += (rows || []).length;
      $('load-more').hidden = (rows || []).length < PAGE;
      $('queue-empty').hidden = body.children.length > 0;
    }).catch(function (e) { toast(e.message); });
  }

  function queueRow(r) {
    var open = function () { location.hash = '#/report/' + r.id; };
    var statusCell = el('td', null, [pill(STATUS_LABEL[r.status] || r.status, r.status)]);
    if (r.overdue) statusCell.appendChild(el('div', null, [pill('Over 24h', 'overdue')]));
    var preview = el('td', { class: 'preview' }, [r.preview || '—']);
    if (r.is_hidden) preview.appendChild(el('div', null, [pill(r.target_type === 'user' ? 'Suspended' : 'Hidden', 'hidden-content')]));
    if (Number(r.target_reports) > 1) preview.appendChild(el('div', { class: 'muted small', text: r.target_reports + ' reports on this' }));
    return el('tr', {
      class: 'clickable',
      tabindex: '0',
      onclick: open,
      onkeydown: function (ev) { if (ev.key === 'Enter') open(); },
    }, [
      el('td', { class: 'id', text: r.id.slice(0, 8) }),
      el('td', { text: TYPE_LABEL[r.target_type] || r.target_type }),
      el('td', { text: REASON_LABEL[r.reason] || r.reason }),
      preview,
      el('td', { text: r.owner_username ? '@' + r.owner_username : '—' }),
      el('td', { class: 'nowrap', title: fmtDate(r.created_at), text: ago(r.created_at) }),
      statusCell,
      el('td', null, [pill(PRIORITY_LABEL[r.priority] || r.priority, r.priority)]),
      el('td', null, [el('button', { type: 'button', class: 'secondary', text: 'Review', onclick: function (ev) { ev.stopPropagation(); open(); } })]),
    ]);
  }

  // ---------------------------------------------------------------- detail
  function openReport(id) {
    show('view-detail');
    var host = $('detail');
    clear(host);
    host.appendChild(el('p', { class: 'muted', text: 'Loading…' }));
    return rpc('admin_report_detail', { p_report: id }).then(function (d) {
      renderDetail(d);
      loadCounts();
    }).catch(function (e) {
      clear(host);
      host.appendChild(el('p', { class: 'error', text: e.message }));
    });
  }

  function facts(pairs) {
    var dl = el('dl', { class: 'facts' });
    pairs.forEach(function (p) {
      if (p[1] == null || p[1] === '') return;
      dl.appendChild(el('dt', { text: p[0] }));
      dl.appendChild(el('dd', null, [typeof p[1] === 'string' ? p[1] : p[1]]));
    });
    return dl;
  }
  function quote(text) { return text ? el('div', { class: 'quote', text: text }) : null; }

  function photosFor(list) {
    var grid = el('div', { class: 'photos' });
    (list || []).forEach(function (img) {
      var node = el('img', { alt: 'Reported photo', loading: 'lazy', referrerpolicy: 'no-referrer' });
      grid.appendChild(node);
      signedPhoto(img.path).then(function (url) {
        if (url) node.src = url;
        else node.replaceWith(el('div', { class: 'muted small', text: 'Photo no longer available' }));
      });
    });
    return (list || []).length ? grid : null;
  }

  function contentPanel(title, data, type, isSnapshot) {
    var panel = el('section', { class: 'panel' }, [el('h3', { text: title })]);
    if (!data || data.exists === false) {
      panel.appendChild(el('p', { class: 'muted', text: isSnapshot ? 'No copy was kept.' : 'Deleted since the report.' }));
      return panel;
    }
    if (data.scrubbed) {
      panel.appendChild(el('p', { class: 'muted', text: 'The author deleted their account, so the copy was removed as the Privacy Policy promises.' }));
      return panel;
    }
    if (type === 'post') {
      panel.appendChild(el('p', null, [el('b', { text: data.title || '(untitled)' })]));
      panel.appendChild(facts([
        ['Visibility', data.visibility],
        ['Status', data.status === 'removed' ? 'Removed' + (data.removed_reason ? ' — ' + data.removed_reason : '') : data.status],
      ]));
      var r = quote(data.review); if (r) panel.appendChild(r);
      var s = quote(data.story); if (s) panel.appendChild(s);
      var p = photosFor(data.images); if (p) panel.appendChild(p);
    } else if (type === 'comment') {
      panel.appendChild(quote(data.body || ''));
      if (!isSnapshot) {
        panel.appendChild(facts([
          ['On post', data.post_title || ''],
          ['Status', data.hidden ? 'Hidden' + (data.hidden_reason ? ' — ' + data.hidden_reason : '') : 'Visible'],
        ]));
      }
    } else {
      if (data.avatar_path && avatarUrl(data.avatar_path)) panel.appendChild(el('img', { src: avatarUrl(data.avatar_path), alt: 'Profile photo', class: 'avatar', width: '96', height: '96', referrerpolicy: 'no-referrer' }));
      panel.appendChild(facts([
        ['Username', data.username ? '@' + data.username : ''],
        ['Name', data.display_name || ''],
        ['Status', isSnapshot ? '' : (data.suspended ? 'Suspended' + (data.suspended_reason ? ' — ' + data.suspended_reason : '') : 'Active')],
      ]));
      var b = quote(data.bio); if (b) panel.appendChild(b);
    }
    return panel;
  }

  function renderDetail(d) {
    var host = $('detail');
    clear(host);
    var r = d.report;
    var cur = d.current || {};
    var hidden = r.target_type === 'post' ? cur.status === 'removed'
      : r.target_type === 'comment' ? !!cur.hidden : !!cur.suspended;
    var closed = r.status === 'actioned' || r.status === 'dismissed';

    host.appendChild(el('div', { class: 'detail-head' }, [
      el('h1', { text: (TYPE_LABEL[r.target_type] || '') + ' report' }),
      pill(STATUS_LABEL[r.status] || r.status, r.status),
      pill(PRIORITY_LABEL[r.priority] || r.priority, r.priority),
      hidden ? pill(r.target_type === 'user' ? 'Account suspended' : 'Content hidden', 'hidden-content') : null,
    ]));
    host.appendChild(el('p', { class: 'muted small', text: 'Report ' + r.id }));

    // Actions
    var actions = el('div', { class: 'actions' });
    function act(label, cls, handler) { actions.appendChild(el('button', { type: 'button', class: cls, text: label, onclick: handler })); }
    if (r.status === 'open') act('Start review', 'primary', function () { setStatus(r, 'reviewed', false); });
    if (!closed) {
      if (cur.exists !== false && !hidden && r.target_type !== 'user') {
        act('Remove content', 'danger', function () { moderate(r, 'remove'); });
      }
      if (cur.exists !== false && hidden && r.target_type !== 'user') {
        // Auto-hidden pending review: make it a moderator decision with a reason.
        act('Confirm removal', 'danger', function () { moderate(r, 'remove'); });
      }
      if (cur.exists !== false && !hidden && r.target_type === 'user') {
        act('Suspend account', 'danger', function () { moderate(r, 'suspend'); });
      }
      act('Resolve', 'secondary', function () { setStatus(r, 'actioned', true); });
      act('Dismiss', 'secondary', function () { setStatus(r, 'dismissed', true); });
    } else {
      act('Reopen', 'secondary', function () { setStatus(r, 'open', true, true); });
    }
    if (hidden && cur.exists !== false) {
      act(r.target_type === 'user' ? 'Unsuspend account' : 'Restore content', 'secondary', function () {
        moderate(r, r.target_type === 'user' ? 'unsuspend' : 'restore');
      });
    }
    act('Add note', 'secondary', function () { addNote(r); });
    host.appendChild(actions);

    var left = el('div');
    var right = el('div');
    left.appendChild(contentPanel('As reported', d.snapshot, r.target_type, true));
    left.appendChild(contentPanel('Now', cur, r.target_type, false));

    right.appendChild(el('section', { class: 'panel' }, [
      el('h3', { text: 'Report' }),
      facts([
        ['Reason', REASON_LABEL[r.reason] || r.reason],
        ['Submitted', fmtDate(r.created_at)],
        ['Reviewed', r.reviewed_at ? fmtDate(r.reviewed_at) + (r.reviewed_by ? ' by @' + r.reviewed_by : '') : ''],
        ['Decision note', r.resolution_note || ''],
      ]),
      r.details ? el('p', { class: 'muted small', text: 'Reporter’s explanation:' }) : null,
      quote(r.details),
    ]));

    if (d.author) {
      right.appendChild(el('section', { class: 'panel' }, [
        el('h3', { text: 'Author' }),
        facts([
          ['Account', '@' + d.author.username + (d.author.display_name ? ' (' + d.author.display_name + ')' : '')],
          ['Joined', fmtDate(d.author.joined)],
          ['Posts', String(d.author.posts) + (Number(d.author.removed_posts) ? ' (' + d.author.removed_posts + ' removed)' : '')],
          ['Reports about them', String(d.author.reports_against)],
          ['Status', d.author.suspended ? 'Suspended' : 'Active'],
        ]),
      ]));
    }

    var related = el('section', { class: 'panel' }, [el('h3', { text: 'Other reports on this (' + d.related.length + ')' })]);
    if (!d.related.length) related.appendChild(el('p', { class: 'muted', text: 'None.' }));
    else {
      var ul = el('ul', { class: 'timeline' });
      d.related.forEach(function (x) {
        ul.appendChild(el('li', null, [
          el('a', { href: '#/report/' + x.id, text: REASON_LABEL[x.reason] || x.reason }), ' · ',
          STATUS_LABEL[x.status] || x.status, ' · ', fmtDate(x.created_at),
          x.details ? el('div', { class: 'muted small', text: x.details }) : null,
        ]));
      });
      related.appendChild(ul);
    }
    right.appendChild(related);

    var hist = el('section', { class: 'panel' }, [el('h3', { text: 'Moderation history' })]);
    if (!d.history.length) hist.appendChild(el('p', { class: 'muted', text: 'No actions yet.' }));
    else {
      var tl = el('ul', { class: 'timeline' });
      d.history.forEach(function (h) {
        tl.appendChild(el('li', null, [
          el('b', { text: ACTION_LABEL[h.action] || h.action }),
          ' by ', h.moderator === 'automatic' || h.moderator === 'former moderator' ? h.moderator : '@' + h.moderator,
          ' · ', fmtDate(h.created_at),
          h.note ? el('div', { class: 'quote', text: h.note }) : null,
        ]));
      });
      hist.appendChild(tl);
    }
    right.appendChild(hist);

    host.appendChild(el('div', { class: 'grid' }, [left, right]));
  }

  // ---------------------------------------------------------------- actions
  function confirmDialog(opts) {
    var dlg = $('confirm');
    var form = $('confirm-form');
    $('confirm-title').textContent = opts.title;
    $('confirm-body').textContent = opts.body;
    $('confirm-error').textContent = '';
    form.note.value = '';
    form.typed.value = '';
    $('confirm-note-label').hidden = !opts.note;
    $('confirm-type-label').hidden = !opts.typeWord;
    $('confirm-word').textContent = opts.typeWord || '';
    var ok = $('confirm-ok');
    ok.textContent = opts.okLabel || 'Confirm';
    ok.className = opts.danger ? 'danger' : 'primary';
    return new Promise(function (resolve) {
      function done() {
        dlg.removeEventListener('close', done);
        if (dlg.returnValue !== 'ok') return resolve(null);
        resolve({ note: form.note.value.trim() });
      }
      form.onsubmit = function (ev) {
        if (ev.submitter && ev.submitter.value === 'cancel') return;
        if (opts.noteRequired && !form.note.value.trim()) {
          ev.preventDefault();
          $('confirm-error').textContent = 'Please add a note.';
        } else if (opts.typeWord && form.typed.value.trim().toUpperCase() !== opts.typeWord) {
          ev.preventDefault();
          $('confirm-error').textContent = 'Type ' + opts.typeWord + ' to confirm.';
        }
      };
      dlg.addEventListener('close', done);
      dlg.returnValue = '';
      dlg.showModal();
    });
  }

  function afterChange(r, msg) {
    toast(msg);
    return openReport(r.id);
  }
  function onError(r, e) {
    if (e.code === '40001') { toast('Someone else changed this report. Showing the latest.'); return openReport(r.id); }
    toast(e.message);
  }

  function setStatus(r, to, ask, noteRequired) {
    var labels = { reviewed: 'Start review', actioned: 'Resolve report', dismissed: 'Dismiss report', open: 'Reopen report' };
    var bodies = {
      reviewed: 'Marks the report as under review so other moderators know you have it.',
      actioned: 'Closes the report as handled. Use Remove content first if something needs to come down.',
      dismissed: 'Closes the report with no action. The content stays as it is.',
      open: 'Puts the report back in the pending queue.',
    };
    var go = ask
      ? confirmDialog({ title: labels[to], body: bodies[to], note: true, noteRequired: !!noteRequired, okLabel: labels[to] })
      : Promise.resolve({ note: '' });
    return go.then(function (res) {
      if (!res) return;
      return rpc('admin_set_report_status', { p_report: r.id, p_status: to, p_expected: r.status, p_note: res.note })
        .then(function () { return afterChange(r, STATUS_LABEL[to] + '.'); })
        .catch(function (e) { onError(r, e); });
    });
  }

  function moderate(r, action) {
    var copy = {
      remove: ['Remove this ' + (r.target_type === 'post' ? 'post' : 'comment') + '?',
        'It disappears for everyone but its author. Nothing is deleted, and you can restore it. All open reports about it are resolved.', 'REMOVE', true],
      restore: ['Restore this content?', 'It becomes visible again to the people who could see it before.', null, false],
      suspend: ['Suspend this account?',
        'They are signed out and can’t sign in, and all their posts and comments are hidden. Reversible with Unsuspend.', 'SUSPEND', true],
      unsuspend: ['Unsuspend this account?', 'They can sign in again and the posts hidden by the suspension come back.', null, false],
    }[action];
    return confirmDialog({
      title: copy[0], body: copy[1], note: true, noteRequired: copy[3], typeWord: copy[2], danger: copy[3],
      okLabel: copy[0].replace('?', ''),
    }).then(function (res) {
      if (!res) return;
      return rpc('admin_moderate_report', { p_report: r.id, p_action: action, p_expected: r.status, p_note: res.note })
        .then(function () { return afterChange(r, 'Done.'); })
        .catch(function (e) { onError(r, e); });
    });
  }

  function addNote(r) {
    return confirmDialog({ title: 'Add a note', body: 'Visible to moderators only, kept in the history.', note: true, noteRequired: true, okLabel: 'Add note' })
      .then(function (res) {
        if (!res) return;
        return rpc('admin_add_report_note', { p_report: r.id, p_note: res.note })
          .then(function () { return afterChange(r, 'Note added.'); })
          .catch(function (e) { onError(r, e); });
      });
  }

  // ---------------------------------------------------------------- boot
  if (!API || !KEY) {
    show('view-signin');
    $('signin-error').textContent = 'The dashboard isn’t configured.';
    return;
  }
  session = loadSession();
  if (session && session.refresh_token) start();
  else show('view-signin');
})();
