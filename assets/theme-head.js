(function () {
  try {
    var saved = localStorage.getItem("vs-theme");
    var mql = window.matchMedia("(prefers-color-scheme: dark)");
    var theme = saved === "light" || saved === "dark"
      ? saved
      : (mql.matches ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", theme);
  } catch (e) {
    document.documentElement.setAttribute("data-theme", "light");
  }
})();
