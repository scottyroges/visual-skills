(function() {
  'use strict';

  // Sidebar toggle
  var toggle = document.getElementById('sidebar-toggle');
  var sidebar = document.getElementById('sidebar');
  var overlay = document.getElementById('sidebar-overlay');

  function openSidebar() {
    sidebar.classList.add('is-open');
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    toggle.setAttribute('aria-expanded', 'true');
  }

  function closeSidebar() {
    sidebar.classList.remove('is-open');
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    toggle.setAttribute('aria-expanded', 'false');
  }

  if (toggle) {
    toggle.addEventListener('click', function() {
      if (sidebar.classList.contains('is-open')) {
        closeSidebar();
      } else {
        openSidebar();
      }
    });
  }

  if (overlay) {
    overlay.addEventListener('click', closeSidebar);
  }

  // Close sidebar on nav click (mobile)
  var outlineLinks = document.querySelectorAll('.outline-item, .file-item');
  outlineLinks.forEach(function(link) {
    link.addEventListener('click', function() {
      if (window.innerWidth <= 900) {
        closeSidebar();
      }
    });
  });

  // Scroll-spy for outline
  var outlineItems = document.querySelectorAll('.outline-item[data-target]');
  var sections = Array.prototype.map.call(outlineItems, function(it) {
    var t = it.getAttribute('data-target');
    return { id: t, target: t };
  });

  function updateActive(activeId) {
    outlineItems.forEach(function(item) {
      var t = item.getAttribute('data-target');
      if (t === activeId) {
        item.classList.add('is-active');
      } else {
        item.classList.remove('is-active');
      }
    });
  }

  var topbarH = 52;

  function onScroll() {
    var scrollY = window.scrollY || window.pageYOffset;
    var winH = window.innerHeight;
    var active = null;

    for (var i = sections.length - 1; i >= 0; i--) {
      var el = document.getElementById(sections[i].id);
      if (el) {
        var rect = el.getBoundingClientRect();
        if (rect.top <= topbarH + 32) {
          active = sections[i].target;
          break;
        }
      }
    }

    if (active) {
      updateActive(active);
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Progress rail: highlight chapter based on scroll
  var progressSteps = document.querySelectorAll('.progress-step');
  var chapters = Array.prototype.map.call(progressSteps, function(s) {
    var h = s.getAttribute('href') || '';
    return h.charAt(0) === '#' ? document.getElementById(h.slice(1)) : null;
  });

  function updateProgress() {
    var scrollY = window.scrollY || window.pageYOffset;
    var active = 0;
    for (var i = chapters.length - 1; i >= 0; i--) {
      if (chapters[i]) {
        var rect = chapters[i].getBoundingClientRect();
        if (rect.top <= topbarH + 48) {
          active = i;
          break;
        }
      }
    }
    progressSteps.forEach(function(step, idx) {
      if (idx === active) {
        step.classList.add('is-active');
      } else {
        step.classList.remove('is-active');
      }
    });
  }

  window.addEventListener('scroll', updateProgress, { passive: true });
  updateProgress();

})();

(function(){
  'use strict';
  var ov=document.getElementById('zoom-overlay'), stage=document.getElementById('zoom-stage');
  var cur,scale=1,tx=0,ty=0,drag=false,moved=false,lx=0,ly=0;
  function apply(){ if(cur) cur.style.transform='translate('+tx+'px,'+ty+'px) scale('+scale+')'; }
  function openSvg(svg){ stage.innerHTML=''; cur=svg.cloneNode(true); cur.removeAttribute('width'); cur.removeAttribute('height'); stage.appendChild(cur); scale=1;tx=0;ty=0;apply(); ov.classList.add('is-open'); ov.setAttribute('aria-hidden','false'); document.body.style.overflow='hidden'; }
  function closeOv(){ ov.classList.remove('is-open'); ov.setAttribute('aria-hidden','true'); document.body.style.overflow=''; }
  document.querySelectorAll('.diagram-box').forEach(function(box){
    var svg=box.querySelector('svg.diagram-svg'); if(!svg) return;
    box.addEventListener('click', function(){ openSvg(svg); });
  });
  document.getElementById('zoom-close').addEventListener('click', closeOv);
  document.getElementById('zoom-reset').addEventListener('click', function(){ scale=1;tx=0;ty=0;apply(); });
  document.getElementById('zoom-in').addEventListener('click', function(){ scale=Math.min(8,scale*1.25); apply(); });
  document.getElementById('zoom-out').addEventListener('click', function(){ scale=Math.max(0.3,scale/1.25); apply(); });
  document.addEventListener('keydown', function(e){ if(e.key==='Escape') closeOv(); });
  stage.addEventListener('wheel', function(e){ e.preventDefault(); scale=Math.min(8,Math.max(0.3, scale*(e.deltaY<0?1.12:0.89))); apply(); }, {passive:false});
  stage.addEventListener('pointerdown', function(e){ drag=true; moved=false; lx=e.clientX; ly=e.clientY; try{stage.setPointerCapture(e.pointerId);}catch(_){} });
  stage.addEventListener('pointermove', function(e){ if(!drag)return; moved=true; tx+=e.clientX-lx; ty+=e.clientY-ly; lx=e.clientX; ly=e.clientY; apply(); });
  stage.addEventListener('pointerup', function(){ drag=false; });
  stage.addEventListener('pointercancel', function(){ drag=false; });
  stage.addEventListener('click', function(e){ if(!moved && e.target===stage) closeOv(); });
})();

(function(){
  'use strict';
  function openTo(hash){
    if(!hash || hash.charAt(0) !== '#') return;
    var el = document.getElementById(hash.slice(1));
    if(!el) return;
    var p = el;
    while(p){ if(p.tagName && p.tagName.toLowerCase() === 'details') p.open = true; p = p.parentElement; }
    if(el.tagName && el.tagName.toLowerCase() === 'details') el.open = true;
    var d = el.querySelector && el.querySelector('details.file-diff');
    if(d) d.open = true;
  }
  window.addEventListener('hashchange', function(){ openTo(location.hash); });
  if(location.hash) openTo(location.hash);
})();
