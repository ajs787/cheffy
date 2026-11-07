// The one place to set where people get the app: the App Store listing.
var DOWNLOAD_URL = 'https://apps.apple.com/us/app/cheffy-rank-your-creations/id6825135585';

document.querySelectorAll('[data-get-app]').forEach(function (el) {
  if (DOWNLOAD_URL) {
    el.href = DOWNLOAD_URL;
  } else {
    el.removeAttribute('href');
    el.setAttribute('aria-disabled', 'true');
    var label = el.querySelector('small');
    if (label) label.textContent = 'Coming soon to';
    else el.textContent = 'Cheffy is coming soon to iPhone';
  }
});
document.querySelectorAll('[data-year]').forEach(function (el) {
  el.textContent = String(new Date().getFullYear());
});
