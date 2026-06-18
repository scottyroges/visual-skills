/* Self-contained recap viewer — runs on file://, no external loads.
   (1) click any .vs-zoomable diagram -> full-screen overlay: drag to pan, wheel/pinch to zoom.
   (2) open <details> ancestors of a hash target so in-page links land on visible content. */
(function () {
  "use strict";

  function openAncestors(el) {
    for (var n = el; n; n = n.parentElement) {
      if (n.tagName === "DETAILS") n.open = true;
    }
  }
  function revealHash() {
    if (!location.hash) return;
    var target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (!target) return;
    openAncestors(target);
    target.scrollIntoView();
  }

  var overlay, stage, img, scale = 1, tx = 0, ty = 0, dragging = false, lastX = 0, lastY = 0;

  function apply() {
    if (img) img.style.transform = "translate(" + tx + "px," + ty + "px) scale(" + scale + ")";
  }
  function hide() { if (overlay) overlay.classList.remove("open"); }

  function build() {
    overlay = document.createElement("div");
    overlay.className = "vs-zoom-overlay";
    stage = document.createElement("div");
    stage.className = "vs-zoom-stage";
    var reset = document.createElement("button");
    reset.type = "button"; reset.className = "vs-zoom-reset"; reset.textContent = "Reset";
    var close = document.createElement("button");
    close.type = "button"; close.className = "vs-zoom-close";
    close.setAttribute("aria-label", "Close"); close.textContent = "✕";
    overlay.appendChild(stage); overlay.appendChild(reset); overlay.appendChild(close);
    document.body.appendChild(overlay);

    overlay.addEventListener("click", function (e) { if (e.target === overlay) hide(); });
    close.addEventListener("click", hide);
    reset.addEventListener("click", function () { scale = 1; tx = 0; ty = 0; apply(); });
    overlay.addEventListener("wheel", function (e) {
      e.preventDefault();
      scale = Math.min(20, Math.max(0.2, scale * (e.deltaY < 0 ? 1.1 : 0.9)));
      apply();
    }, { passive: false });
    stage.addEventListener("pointerdown", function (e) {
      dragging = true; lastX = e.clientX; lastY = e.clientY;
      try { stage.setPointerCapture(e.pointerId); } catch (_) {}
    });
    stage.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      tx += e.clientX - lastX; ty += e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY; apply();
    });
    stage.addEventListener("pointerup", function () { dragging = false; });
  }

  function show(svg) {
    if (!overlay) build();
    stage.innerHTML = "";
    img = svg.cloneNode(true);
    img.removeAttribute("width"); img.removeAttribute("height");
    img.classList.add("vs-zoom-svg");
    stage.appendChild(img);
    scale = 1; tx = 0; ty = 0; apply();
    overlay.classList.add("open");
  }

  document.addEventListener("keydown", function (e) { if (e.key === "Escape") hide(); });
  document.addEventListener("click", function (e) {
    if (e.target.closest && e.target.closest("a")) return; // let edit links work
    var z = e.target.closest && e.target.closest(".vs-zoomable");
    if (!z) return;
    var svg = z.querySelector("svg");
    if (svg) show(svg);
  });

  if (document.readyState !== "loading") revealHash();
  else document.addEventListener("DOMContentLoaded", revealHash);
  window.addEventListener("hashchange", revealHash);
})();
