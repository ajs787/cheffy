// The one place to set where people get the app. Paste the public TestFlight
// link now (https://testflight.apple.com/join/…), the App Store link later.
var DOWNLOAD_URL = '';

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
