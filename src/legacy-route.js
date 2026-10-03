// Preserve bookmarked URLs from the previous single-page ERP.
(()=>{const page=location.hash.slice(1);if(['finance','bank','products','purchases','sales','stock','partners','audit','settings'].includes(page))location.replace(page+'.html'+location.search);})();
