/* ============================================================
   Lens Around the Sun — gallery, filters & lightbox
   No dependencies. Reads the PHOTOS list from photos.js
   ============================================================ */
(function () {
  "use strict";

  var photos = Array.isArray(window.PHOTOS) ? window.PHOTOS : (typeof PHOTOS !== "undefined" ? PHOTOS : []);
  var gallery = document.getElementById("gallery");
  var filtersEl = document.getElementById("filters");

  /* ---- Build category filters ---- */
  var cats = [];
  photos.forEach(function (p) {
    if (p.category && cats.indexOf(p.category) === -1) cats.push(p.category);
  });

  var currentFilter = "All";

  function makeFilterBtn(label) {
    var b = document.createElement("button");
    b.className = "filter-btn" + (label === currentFilter ? " is-active" : "");
    b.type = "button";
    b.textContent = label;
    b.addEventListener("click", function () {
      currentFilter = label;
      Array.prototype.forEach.call(filtersEl.children, function (c) {
        c.classList.toggle("is-active", c.textContent === label);
      });
      render();
    });
    return b;
  }

  if (cats.length > 1 && filtersEl) {
    filtersEl.appendChild(makeFilterBtn("All"));
    cats.forEach(function (c) { filtersEl.appendChild(makeFilterBtn(c)); });
  }

  /* ---- Render gallery ---- */
  var visible = []; // photos currently shown, in order (for lightbox nav)
  var io = ("IntersectionObserver" in window)
    ? new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
        });
      }, { rootMargin: "0px 0px -8% 0px" })
    : null;

  function render() {
    gallery.innerHTML = "";
    visible = photos.filter(function (p) {
      return currentFilter === "All" || p.category === currentFilter;
    });

    visible.forEach(function (p, i) {
      var tile = document.createElement("a");
      tile.className = "tile";
      tile.href = p.src;
      tile.setAttribute("role", "button");
      tile.setAttribute("aria-label", "Open " + (p.title || "photo"));
      tile.tabIndex = 0;

      var img = document.createElement("img");
      img.src = p.src;
      img.alt = p.title || "Photograph";
      img.loading = "lazy";
      img.decoding = "async";
      tile.appendChild(img);

      if (p.title || p.category) {
        var ov = document.createElement("div");
        ov.className = "tile-overlay";
        if (p.category) {
          var c = document.createElement("div");
          c.className = "tile-cat";
          c.textContent = p.category;
          ov.appendChild(c);
        }
        if (p.title) {
          var t = document.createElement("div");
          t.className = "tile-title";
          t.textContent = p.title;
          ov.appendChild(t);
        }
        tile.appendChild(ov);
      }

      function open(ev) { ev.preventDefault(); openLightbox(i); }
      tile.addEventListener("click", open);
      tile.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter" || ev.key === " ") open(ev);
      });

      gallery.appendChild(tile);
      if (io) io.observe(tile); else tile.classList.add("in");
    });
  }

  /* ---- Lightbox ---- */
  var lb = document.getElementById("lightbox");
  var lbImg = document.getElementById("lbImg");
  var lbCaption = document.getElementById("lbCaption");
  var idx = 0;
  var lastFocus = null;

  function showAt(i) {
    if (!visible.length) return;
    idx = (i + visible.length) % visible.length;
    var p = visible[idx];
    lbImg.src = p.src;
    lbImg.alt = p.title || "Photograph";
    var cap = [p.title, p.category].filter(Boolean).join("  ·  ");
    lbCaption.textContent = cap;
  }

  function openLightbox(i) {
    lastFocus = document.activeElement;
    showAt(i);
    lb.classList.add("open");
    lb.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    document.getElementById("lbClose").focus();
  }

  function closeLightbox() {
    lb.classList.remove("open");
    lb.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    lbImg.src = "";
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  document.getElementById("lbClose").addEventListener("click", closeLightbox);
  document.getElementById("lbNext").addEventListener("click", function () { showAt(idx + 1); });
  document.getElementById("lbPrev").addEventListener("click", function () { showAt(idx - 1); });

  lb.addEventListener("click", function (e) {
    // click on the dark backdrop (not the image/buttons) closes
    if (e.target === lb || e.target.classList.contains("lb-figure")) closeLightbox();
  });

  document.addEventListener("keydown", function (e) {
    if (!lb.classList.contains("open")) return;
    if (e.key === "Escape") closeLightbox();
    else if (e.key === "ArrowRight") showAt(idx + 1);
    else if (e.key === "ArrowLeft") showAt(idx - 1);
  });

  /* ---- Touch swipe on lightbox ---- */
  var tx = 0;
  lb.addEventListener("touchstart", function (e) { tx = e.changedTouches[0].clientX; }, { passive: true });
  lb.addEventListener("touchend", function (e) {
    var dx = e.changedTouches[0].clientX - tx;
    if (Math.abs(dx) > 50) showAt(dx < 0 ? idx + 1 : idx - 1);
  }, { passive: true });

  /* ---- Init ---- */
  if (!photos.length) {
    gallery.innerHTML = '<p style="color:var(--fg-dim)">No photos yet. Add some in <code>js/photos.js</code>.</p>';
  } else {
    render();
  }

  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();
})();
