(function () {
  var root = document.documentElement;
  var STORAGE = "vs-theme";
  var SUN = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  var MOON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';

  document.body.insertAdjacentHTML(
    "beforeend",
    '<button class="vs-theme-toggle" type="button" aria-label="Toggle dark mode"></button>'
  );
  var btn = document.body.lastElementChild;

  function render() {
    var dark = root.getAttribute("data-theme") === "dark";
    btn.innerHTML = dark ? SUN : MOON;
    btn.setAttribute("aria-pressed", dark ? "true" : "false");
  }
  render();

  btn.addEventListener("click", function () {
    var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try { localStorage.setItem(STORAGE, next); } catch (e) {}
    render();
  });

  var mql = window.matchMedia("(prefers-color-scheme: dark)");
  mql.addEventListener("change", function (e) {
    var hasChoice = false;
    try { var s = localStorage.getItem(STORAGE); hasChoice = s === "light" || s === "dark"; } catch (x) {}
    if (hasChoice) return;
    root.setAttribute("data-theme", e.matches ? "dark" : "light");
    render();
  });
})();
