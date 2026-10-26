// Old bookmarks keep working without creating another checklist or touching stored checks.
(function () {
  'use strict';
  var link = document.getElementById('project-shopping-link');
  if (!link) return;
  var target = new URL(link.href);
  var share = new URLSearchParams(location.search).get('share');
  if (share && /^[A-Za-z0-9_-]{43}$/.test(share)) target.searchParams.set('share', share);
  link.href = target.href;
  location.replace(target.href);
})();
