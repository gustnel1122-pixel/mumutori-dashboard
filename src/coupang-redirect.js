// Old coupang.html bookmarks keep working, now pointing at the wider ads.html.
(function () {
  'use strict';
  var link = document.getElementById('ads-link');
  if (!link) return;
  location.replace(link.href);
})();
