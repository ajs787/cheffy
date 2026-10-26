// The one place to set where people get the app: the public TestFlight beta
// now, the App Store link at launch (then change the button labels too).
var DOWNLOAD_URL = 'https://testflight.apple.com/join/DHn7FPJp';

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
