(function () {
  "use strict";

  /* ---------- Images: try .png, .gif, .jpg, .webp, then show a placeholder ---------- */
  var EXTS = ["png", "gif", "jpg", "jpeg", "webp"];

  function markMissing(img) {
    var frame = img.parentElement;
    if (!frame || frame.classList.contains("missing")) return;
    frame.classList.add("missing");
    var label = document.createElement("span");
    label.textContent = "Add image: " + img._base + " (.png or .gif)";
    frame.appendChild(label);
    var shot = img.closest(".shot");
    if (shot) shot.classList.add("empty");
  }

  function tryNext(img) {
    var i = img._i + 1;
    if (i >= EXTS.length) { markMissing(img); return; }
    img._i = i;
    img.src = img._base + "." + EXTS[i];
  }

  document.querySelectorAll(".frame img").forEach(function (img) {
    var src = img.getAttribute("src") || "";
    var m = src.match(/^(.*)\.([a-z0-9]+)$/i);
    img._base = m ? m[1] : src;
    var idx = m ? EXTS.indexOf(m[2].toLowerCase()) : -1;
    img._i = idx < 0 ? 0 : idx;
    img.addEventListener("error", function () { tryNext(img); });
    if (img.complete && img.naturalWidth === 0) tryNext(img);
  });

  /* ---------- Lightbox ---------- */
  var box = document.getElementById("lightbox");
  var big = box.querySelector("img");

  document.querySelectorAll(".shot").forEach(function (shot) {
    shot.tabIndex = 0;
    shot.setAttribute("role", "button");
    function open() {
      if (shot.classList.contains("empty")) return;
      var img = shot.querySelector("img");
      big.src = img.currentSrc || img.src;
      big.alt = img.alt;
      box.showModal();
    }
    shot.addEventListener("click", open);
    shot.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
    });
  });
  box.addEventListener("click", function () { box.close(); });

  /* ---------- Draggable windows ---------- */
  var wins = Array.prototype.slice.call(document.querySelectorAll(".win"));
  var narrow = window.matchMedia("(max-width: 700px)");
  var zTop = 10;
  var drag = null;
  var raf = 0;

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function setPos(w, x, y) {
    w._x = x;
    w._y = y;
    w.style.transform = x || y ? "translate(" + x + "px," + y + "px)" : "";
  }

  function front(w) { w.style.zIndex = ++zTop; }

  // Keep each window fully inside the page so it can't be lost.
  function bounds(w) {
    var r = w.getBoundingClientRect();
    var baseLeft = r.left - w._x;
    var baseTop = r.top + window.pageYOffset - w._y;
    var docW = document.documentElement.clientWidth;
    var docH = document.documentElement.scrollHeight;
    return {
      minX: -baseLeft,
      maxX: docW - baseLeft - r.width,
      minY: -baseTop,
      maxY: docH - baseTop - r.height
    };
  }

  function toggleMin(w, btn) {
    var min = w.classList.toggle("min");
    btn.setAttribute("aria-expanded", String(!min));
  }

  wins.forEach(function (w) {
    w._x = 0;
    w._y = 0;

    var bar = w.querySelector(":scope > .bar");
    var ctl = bar.querySelector(".ctl");
    var title = bar.querySelector(".t").textContent;

    // Minimize + reset buttons
    var minBtn = document.createElement("button");
    minBtn.type = "button";
    minBtn.textContent = "_";
    minBtn.setAttribute("aria-label", "Minimize or restore " + title);
    minBtn.setAttribute("aria-expanded", "true");
    minBtn.addEventListener("click", function () { toggleMin(w, minBtn); });

    var resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.textContent = "\u25A1";
    resetBtn.setAttribute("aria-label", "Put " + title + " back in place");
    resetBtn.addEventListener("click", function () {
      setPos(w, 0, 0);
      w.classList.remove("min");
      minBtn.setAttribute("aria-expanded", "true");
    });

    ctl.appendChild(minBtn);
    ctl.appendChild(resetBtn);
    bar.addEventListener("dblclick", function (e) {
      if (!e.target.closest("button")) toggleMin(w, minBtn);
    });

    // Dragging
    bar.classList.add("can-drag");
    bar.tabIndex = 0;
    bar.setAttribute("aria-label", title + " window. Use arrow keys to move it.");

    w.addEventListener("pointerdown", function () { front(w); });

    bar.addEventListener("pointerdown", function (e) {
      if (e.button > 0 || narrow.matches || e.target.closest("button")) return;
      e.preventDefault();
      bar.setPointerCapture(e.pointerId);
      drag = {
        w: w, id: e.pointerId,
        px: e.clientX, py: e.clientY, cx: e.clientX, cy: e.clientY,
        x: w._x, y: w._y, sy: window.pageYOffset, b: bounds(w)
      };
      w.classList.add("dragging");
    });

    bar.addEventListener("pointermove", function (e) {
      if (!drag || drag.w !== w || e.pointerId !== drag.id) return;
      drag.cx = e.clientX;
      drag.cy = e.clientY;
      applyDrag();
      edgeScroll();
    });

    function end(e) {
      if (!drag || drag.w !== w || e.pointerId !== drag.id) return;
      w.classList.remove("dragging");
      drag = null;
    }
    bar.addEventListener("pointerup", end);
    bar.addEventListener("pointercancel", end);

    bar.addEventListener("keydown", function (e) {
      var dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (!dir || e.target !== bar || narrow.matches) return;
      e.preventDefault();
      var step = e.shiftKey ? 80 : 20;
      var b = bounds(w);
      setPos(w, clamp(w._x + dir[0] * step, b.minX, b.maxX), clamp(w._y + dir[1] * step, b.minY, b.maxY));
      front(w);
    });
  });

  function applyDrag() {
    if (!drag) return;
    var dx = drag.cx - drag.px;
    var dy = drag.cy - drag.py + (window.pageYOffset - drag.sy);
    setPos(drag.w, clamp(drag.x + dx, drag.b.minX, drag.b.maxX), clamp(drag.y + dy, drag.b.minY, drag.b.maxY));
  }

  // Scroll the page when a window is dragged near the top or bottom edge.
  function edgeScroll() {
    if (raf || !drag) return;
    raf = requestAnimationFrame(function step() {
      raf = 0;
      if (!drag) return;
      var edge = 48;
      var bottomEdge = window.innerHeight - edge - 40; // keep clear of the taskbar
      var v = drag.cy < edge ? -14 : drag.cy > bottomEdge ? 14 : 0;
      if (v) {
        window.scrollBy({ top: v, behavior: "instant" });
        applyDrag();
        raf = requestAnimationFrame(step);
      }
    });
  }

  /* ---------- Taskbar ---------- */
  var links = document.querySelectorAll(".taskbar a[data-win]");

  function setActive(key) {
    links.forEach(function (a) { a.classList.toggle("on", a.dataset.win === key); });
  }

  links.forEach(function (a) {
    a.addEventListener("click", function () {
      var w = document.getElementById(a.dataset.win);
      if (!w) return;
      w.classList.remove("min");
      var mb = w.querySelector(".ctl button");
      if (mb) mb.setAttribute("aria-expanded", "true");
      front(w);
    });
  });

  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) setActive(en.target.dataset.nav || en.target.id);
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    wins.forEach(function (w) { io.observe(w); });
  }

  var resetAll = document.getElementById("reset");
  resetAll.hidden = false;
  resetAll.addEventListener("click", function () {
    wins.forEach(function (w) {
      setPos(w, 0, 0);
      w.style.zIndex = "";
      w.classList.remove("min");
      var mb = w.querySelector(".ctl button");
      if (mb) mb.setAttribute("aria-expanded", "true");
    });
    zTop = 10;
  });

  var clock = document.getElementById("clock");
  function tick() {
    var d = new Date();
    clock.textContent = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    clock.dateTime = d.toISOString();
  }
  tick();
  setInterval(tick, 30000);

  /* ---------- Background music ---------- */
  // Template tracks: replace the files in /audio, or edit this list.
  var TRACKS = ["audio/track-01.wav", "audio/track-02.wav", "audio/track-03.wav"];
  var VOLUME = 0.35;

  var bgm = document.getElementById("bgm");
  var muteBtn = document.getElementById("mute");
  var muted = true; // music starts off; visitors turn it on
  var last = -1;
  var started = false;

  function paintMute() {
    muteBtn.setAttribute("aria-pressed", String(muted));
    muteBtn.querySelector(".lbl").textContent = muted ? "Music: Off" : "Music: On";
  }

  function playRandom() {
    if (!TRACKS.length) return;
    var i;
    do { i = Math.floor(Math.random() * TRACKS.length); } while (TRACKS.length > 1 && i === last);
    last = i;
    bgm.src = TRACKS[i];
    bgm.volume = VOLUME;
    var p = bgm.play();
    if (p && p.catch) p.catch(function () {});
  }

  function startMusic() {
    if (started) return;
    started = true;
    removeStarters();
    if (!muted) playRandom();
  }

  // Browsers block autoplay, so music starts on the first click, key press, or tap.
  var starters = ["pointerdown", "keydown", "touchstart"];
  function removeStarters() { starters.forEach(function (ev) { document.removeEventListener(ev, startMusic); }); }
  starters.forEach(function (ev) { document.addEventListener(ev, startMusic, { once: false }); });

  bgm.addEventListener("ended", playRandom);
  bgm.addEventListener("error", function () {
    // Skip a missing file by trying another track (once per error).
    if (started && !muted && bgm.getAttribute("src")) setTimeout(playRandom, 300);
  });

  muteBtn.addEventListener("pointerdown", function (e) { e.stopPropagation(); });
  muteBtn.addEventListener("click", function () {
    muted = !muted;
    paintMute();
    if (muted) {
      bgm.pause();
    } else if (!started) {
      startMusic();
    } else if (bgm.getAttribute("src")) {
      var p = bgm.play();
      if (p && p.catch) p.catch(function () {});
    } else {
      playRandom();
    }
  });
  paintMute();
})();
