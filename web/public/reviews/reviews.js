// Share button (single review pages) + list rendering (/reviews/). Plain script, no build step.
(function () {
  var SELF = document.currentScript ? document.currentScript.src : location.href;
  var MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return MAP[c]; }); };

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-share]');
    if (!btn) return;
    var status = document.querySelector('.rv-status');
    var say = function (m) { if (status) { status.textContent = m; setTimeout(function () { status.textContent = ''; }, 3500); } };
    var link = (document.querySelector('link[rel=canonical]') || {}).href || location.href;
    if (navigator.share) {
      navigator.share({ title: btn.dataset.title, text: btn.dataset.text, url: link }).catch(function () { /* cancelled */ });
      return;
    }
    var done = function () { say('Link copied. Paste it anywhere to share.'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(done, function () { window.prompt('Copy this link:', link); });
    else window.prompt('Copy this link:', link);
  });

  // "Share as Story": draws the Story card in the visitor's browser (same drawing code as the admin), then opens the share sheet
  document.addEventListener('click', function (e) {
    var sb = e.target.closest('[data-share-story]');
    if (!sb) return;
    var status = document.querySelector('.rv-status'), data;
    var say = function (m) { if (status) { status.textContent = m; setTimeout(function () { status.textContent = ''; }, 7000); } };
    try { data = JSON.parse(sb.dataset.story); } catch (err) { return; }
    var link = (document.querySelector('link[rel=canonical]') || {}).href || location.href;
    var copy = function () { try { return navigator.clipboard.writeText(link).then(function () { return true; }, function () { return false; }); } catch (err) { return Promise.resolve(false); } };
    sb.disabled = true; say('Drawing your Story card…');
    import(new URL('story-card.js', SELF).href).then(function (m) {
      var poster = document.querySelector('.rvp-poster img');
      return m.drawStoryCard(data, { artBase: new URL('art/', SELF).href, coverSrc: poster ? poster.src : '', footText: location.host + location.pathname.replace(/\/$/, '') });
    }).then(function (blob) {
      var file = new File([blob], 'story-' + (data.slug || 'review') + '.png', { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        return copy().then(function (ok) {
          say(ok ? 'Link copied. Pick Instagram, then add a Link sticker and paste it.' : '');
          return navigator.share({ files: [file], title: data.title });
        });
      }
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
      return copy().then(function (ok) { say(ok ? 'Story card saved and the link is copied. Post it in Instagram and add a Link sticker.' : 'Story card saved. Copy this page address to use as a Link sticker.'); });
    }).catch(function (err) { if (!err || err.name !== 'AbortError') say('Could not make the Story card. Please try again.'); })
      .then(function () { sb.disabled = false; });
  });

  var grid = document.getElementById('rv-grid');
  if (!grid) return;
  var filter = document.getElementById('rv-filter'), stats = document.getElementById('rv-stats');
  var qBox = document.getElementById('rv-q'), sortSel = document.getElementById('rv-sort');
  var starsOf = function (n) {
    var s = ''; for (var i = 1; i <= 5; i++) s += '<span class="' + (i <= n ? 'on' : 'off') + '" aria-hidden="true">★</span>';
    return '<span class="stars" role="img" aria-label="' + n + ' out of 5 stars">' + s + '</span>';
  };
  var newest = function (a, b) { return String(b.publishedAt).localeCompare(String(a.publishedAt)); };

  // Poster-only card: just the cover with its rating. The title shows on hover or focus (and on the placeholder when there is no cover).
  function card(x) {
    var rating = Math.max(0, Math.min(5, Math.round(x.rating) || 0));
    var art = x.cover ? '<img src="../' + esc(x.cover) + '" alt="" loading="lazy" decoding="async">' : '<span class="rvp-none" aria-hidden="true"><i>★</i>' + esc(x.title) + '</span>';
    return '<li><a class="rvk" href="' + esc(x.slug) + '/" aria-label="' + esc(x.title) + ', ' + rating + ' out of 5 stars">' +
      '<span class="rvk-art">' + art + '</span>' +
      '<span class="rvk-rate" aria-hidden="true">' + starsOf(rating) + '<b>' + rating + '/5</b></span>' +
      '<span class="rvk-title" aria-hidden="true">' + esc(x.title) + '</span></a></li>';
  }

  fetch('../data/reviews.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }).then(function (d) {
    var list = d.reviews || [];
    if (!list.length) { grid.innerHTML = '<li class="rv-empty">No reviews yet. Check back soon.</li>'; document.querySelector('.rv-tools').hidden = true; return; }
    var cats = Array.from(new Set(list.map(function (x) { return x.category; })));
    var avg = list.reduce(function (a, x) { return a + (x.rating || 0); }, 0) / list.length;
    stats.innerHTML = '<b>' + list.length + '</b> review' + (list.length === 1 ? '' : 's') + ' <i>·</i> avg <b>' + avg.toFixed(1) + '</b> <span class="avg-star">★</span>';
    var current = 'All', term = '', sort = 'new';

    function visible() {
      var out = list.filter(function (x) {
        return (current === 'All' || x.category === current) &&
          (!term || (x.title + ' ' + (x.creator || '') + ' ' + (x.excerpt || '') + ' ' + x.category).toLowerCase().indexOf(term) >= 0);
      });
      if (sort === 'top') out.sort(function (a, b) { return b.rating - a.rating || newest(a, b); });
      else if (sort === 'az') out.sort(function (a, b) { return a.title.localeCompare(b.title); });
      else out.sort(newest);
      return out;
    }
    function draw() {
      var out = visible();
      grid.innerHTML = out.length ? out.map(card).join('') : '<li class="rv-empty">Nothing matches. Try another search or category.</li>';
    }

    if (cats.length > 1) {
      var count = function (c) { return c === 'All' ? list.length : list.filter(function (x) { return x.category === c; }).length; };
      filter.innerHTML = ['All'].concat(cats).map(function (c) {
        return '<button type="button" class="rv-chip" data-cat="' + esc(c) + '" aria-pressed="' + (c === current) + '">' + esc(c) + ' <small>' + count(c) + '</small></button>';
      }).join('');
      filter.addEventListener('click', function (e) {
        var b = e.target.closest('.rv-chip'); if (!b) return;
        current = b.dataset.cat;
        filter.querySelectorAll('.rv-chip').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        draw();
      });
    }
    qBox.addEventListener('input', function () { term = qBox.value.trim().toLowerCase(); draw(); });
    sortSel.addEventListener('change', function () { sort = sortSel.value; draw(); });
    draw();
  }).catch(function () { grid.innerHTML = '<li class="rv-empty">Could not load reviews. Please refresh.</li>'; });
})();
