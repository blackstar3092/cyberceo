/* ============================================================
   CyberCEO — shared behaviour
   Everything here runs in the browser only. Nothing is sent
   anywhere: the password lab in particular never leaves the page.
   ============================================================ */

(function () {
  "use strict";

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Active nav link ----------
     The aria-current attribute in the HTML is a no-JS fallback. This recomputes
     it from the actual URL so the highlight can't drift out of sync when pages
     get copied or renamed, and so "/" correctly matches index.html. */
  function initCurrentNav() {
    var nav = document.getElementById("primary-nav");
    if (!nav) return;

    var here = window.location.pathname.split("/").pop().toLowerCase();
    if (!here) here = "index.html";              // served as "/" or "/subdir/"

    Array.prototype.forEach.call(nav.querySelectorAll("a"), function (a) {
      var href = (a.getAttribute("href") || "").split("/").pop().split(/[?#]/)[0].toLowerCase();
      if (href && href === here) {
        a.setAttribute("aria-current", "page");
      } else {
        a.removeAttribute("aria-current");
      }
    });
  }

  /* ---------- Mobile nav ---------- */
  function initNav() {
    var toggle = document.querySelector(".nav-toggle");
    var nav = document.getElementById("primary-nav");
    if (!toggle || !nav) return;

    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      toggle.textContent = open ? "Close" : "Menu";
    });

    nav.addEventListener("click", function (e) {
      if (e.target.tagName === "A") {
        nav.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
        toggle.textContent = "Menu";
      }
    });
  }

  /* ---------- Scroll progress + sticky header shadow ---------- */
  function initScroll() {
    var bar = document.querySelector(".progress");
    var header = document.querySelector(".site-header");
    if (!bar && !header) return;

    function update() {
      var max = document.documentElement.scrollHeight - window.innerHeight;
      var pct = max > 0 ? window.scrollY / max : 0;
      if (bar) bar.style.transform = "scaleX(" + pct + ")";
      if (header) header.classList.toggle("is-stuck", window.scrollY > 8);
    }

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
  }

  /* ---------- Scroll reveal ---------- */
  function initReveal() {
    var items = document.querySelectorAll(".reveal");
    if (!items.length) return;

    if (reduced || !("IntersectionObserver" in window)) {
      items.forEach(function (el) { el.classList.add("shown"); });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        var delay = parseInt(el.dataset.delay || "0", 10);
        setTimeout(function () { el.classList.add("shown"); }, delay);
        io.unobserve(el);
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });

    items.forEach(function (el) { io.observe(el); });
  }

  /* ---------- Count-up numbers ---------- */
  function initCounters() {
    var nums = document.querySelectorAll("[data-count]");
    if (!nums.length) return;

    function paint(el, value) {
      el.textContent = value.toLocaleString("en-US") + (el.dataset.suffix || "");
    }

    if (reduced || !("IntersectionObserver" in window)) {
      nums.forEach(function (el) { paint(el, parseInt(el.dataset.count, 10)); });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        var target = parseInt(el.dataset.count, 10);
        var start = performance.now();
        var dur = 1400;

        paint(el, 0); // only zero it the moment we're ready to animate up

        function tick(now) {
          var t = Math.min((now - start) / dur, 1);
          var eased = 1 - Math.pow(1 - t, 3);
          paint(el, Math.round(target * eased));
          if (t < 1) requestAnimationFrame(tick);
        }

        requestAnimationFrame(tick);
        io.unobserve(el);
      });
    }, { threshold: 0.4 });

    nums.forEach(function (el) { io.observe(el); });
  }

  /* ---------- Filter tabs ---------- */
  function initFilters() {
    document.querySelectorAll("[data-filter-group]").forEach(function (group) {
      var name = group.dataset.filterGroup;
      var targets = document.querySelectorAll('[data-filter-item="' + name + '"]');

      group.addEventListener("click", function (e) {
        var btn = e.target.closest(".filter");
        if (!btn) return;

        group.querySelectorAll(".filter").forEach(function (b) {
          b.setAttribute("aria-pressed", String(b === btn));
        });

        var want = btn.dataset.filter;
        targets.forEach(function (el) {
          var tags = (el.dataset.tags || "").split(/\s+/);
          var show = want === "all" || tags.indexOf(want) !== -1;
          el.hidden = !show;
        });
      });
    });
  }

  /* ---------- Flip cards: tap support on touch devices ---------- */
  function initFlips() {
    document.querySelectorAll(".flip").forEach(function (card) {
      card.addEventListener("click", function () {
        card.classList.toggle("flipped");
      });
    });
  }

  /* ============================================================
     Password lab
     Mirrors the CLOUDS lesson taught in the elementary assembly.
     Crack-time uses the same 4 billion guesses/second figure the
     workshop slides use for a brute-force attack.
     ============================================================ */

  var COMMON = [
    "password", "password1", "password123", "123456", "12345678", "123456789",
    "1234567890", "qwerty", "qwerty123", "abc123", "111111", "222222", "000000",
    "iloveyou", "admin", "welcome", "monkey", "dragon", "letmein", "football",
    "baseball", "sunshine", "princess", "superman", "trustno1", "1234", "12345",
    "passw0rd", "starwars", "michael", "shadow", "master", "hello", "freedom",
    "whatever", "ninja", "azerty", "solo", "loveme", "zaq12wsx", "asdfghjkl"
  ];

  /* Base words an attacker's dictionary already contains. A password built
     around one of these is only as strong as whatever you added to it. */
  var COMMON_WORDS = [
    "password", "passw0rd", "qwerty", "admin", "welcome", "letmein", "iloveyou",
    "monkey", "dragon", "sunshine", "princess", "superman", "football", "baseball",
    "starwars", "shadow", "master", "freedom", "whatever", "ninja", "trustno",
    "hello", "abc123", "123456", "654321", "111111", "000000"
  ];

  var GUESSES_PER_SEC = 4e9;

  /* Returns the common word found inside the password, or null. */
  function dictionaryHit(pw) {
    var lower = pw.toLowerCase();
    for (var i = 0; i < COMMON_WORDS.length; i++) {
      if (COMMON_WORDS[i].length >= 4 && lower.indexOf(COMMON_WORDS[i]) !== -1) {
        return COMMON_WORDS[i];
      }
    }
    return null;
  }

  function poolSize(pw) {
    var pool = 0;
    if (/[a-z]/.test(pw)) pool += 26;
    if (/[A-Z]/.test(pw)) pool += 26;
    if (/[0-9]/.test(pw)) pool += 10;
    if (/[^A-Za-z0-9]/.test(pw)) pool += 33;
    return pool;
  }

  function formatTime(seconds) {
    if (seconds < 1) return "Instantly";
    var units = [
      ["second", 60], ["minute", 60], ["hour", 24], ["day", 365.25],
      ["year", 100], ["century", Infinity]
    ];
    var value = seconds;
    for (var i = 0; i < units.length; i++) {
      var label = units[i][0];
      var next = units[i][1];
      if (value < next || next === Infinity) {
        if (value >= 1e15) return "Longer than the universe has existed";
        var rounded = value < 10 ? Math.round(value * 10) / 10 : Math.round(value);
        var word = label;
        if (rounded !== 1) word = (label === "century") ? "centuries" : label + "s";
        return rounded.toLocaleString("en-US") + " " + word;
      }
      value = value / next;
    }
    return "A very long time";
  }

  function initPasswordLab() {
    var input = document.getElementById("pw-input");
    if (!input) return;

    var fill = document.getElementById("pw-fill");
    var time = document.getElementById("pw-time");
    var verdict = document.getElementById("pw-verdict");
    var clouds = document.querySelectorAll("[data-cloud]");
    var reused = document.getElementById("pw-reused");

    var checks = {
      c: function (pw) { return /[a-z]/.test(pw) && /[A-Z]/.test(pw) && /[0-9]/.test(pw) && /[^A-Za-z0-9]/.test(pw); },
      l: function (pw) { return pw.length >= 10; },
      o: function (pw) { return pw.length > 0 && !/(1234|2345|3456|abcd|qwer|19\d\d|20[0-2]\d)/i.test(pw); },
      u: function (pw) {
        return pw.length > 0 &&
               COMMON.indexOf(pw.toLowerCase()) === -1 &&
               dictionaryHit(pw) === null;
      },
      d: function () { return reused ? !reused.checked : true; },
      s: function (pw) { return pw.length > 0; }
    };

    /* Rough entropy in bits. A dictionary word inside the password counts as a
       single cheap guess rather than one guess per character — which is why
       LeBron123! outlasts Password123! even though it's shorter. */
    function score(pw) {
      if (!pw) return 0;
      if (COMMON.indexOf(pw.toLowerCase()) !== -1) return 0;

      var pool = poolSize(pw);
      if (pool === 0) return 0;

      var effectiveLength = pw.length;
      var bonus = 0;
      var hit = dictionaryHit(pw);
      if (hit) {
        effectiveLength = Math.max(pw.length - hit.length, 0);
        bonus = 11; // ~2,000 candidate base words
      }

      return effectiveLength * (Math.log(pool) / Math.log(2)) + bonus;
    }

    function render() {
      var pw = input.value;
      var bits = score(pw);
      var seconds = pw ? Math.pow(2, bits) / 2 / GUESSES_PER_SEC : 0;
      var isCommon = COMMON.indexOf(pw.toLowerCase()) !== -1 && pw.length > 0;

      var passed = 0;
      clouds.forEach(function (row) {
        var key = row.dataset.cloud;
        var ok = pw.length > 0 && checks[key](pw);
        row.classList.toggle("pass", ok);
        row.querySelector(".mark").textContent = ok ? "✓" : "·";
        if (ok) passed++;
      });

      var pct = Math.min((bits / 80) * 100, 100);
      var colour, label;

      if (!pw) {
        pct = 0; colour = "var(--danger)"; label = "Waiting";
        time.textContent = "—";
      } else if (isCommon) {
        pct = 6; colour = "var(--danger)"; label = "On every list";
        time.textContent = "Instantly";
      } else if (bits < 40) {
        colour = "var(--danger)"; label = "Weak";
        time.textContent = formatTime(seconds);
      } else if (bits < 60) {
        colour = "var(--signal)"; label = "Getting there";
        time.textContent = formatTime(seconds);
      } else {
        colour = "var(--safe)"; label = "Strong";
        time.textContent = formatTime(seconds);
      }

      fill.style.width = pct + "%";
      fill.style.background = colour;
      verdict.textContent = label;
      verdict.style.color = colour;
    }

    input.addEventListener("input", render);
    if (reused) reused.addEventListener("change", render);

    var demo = document.getElementById("pw-demo");
    if (demo) {
      demo.addEventListener("click", function () {
        var steps = ["1234", "Pa123!", "Password123!", "LeBron123!", "LeBron123!BPOP", "L3Br0n123!BP0P"];
        var i = 0;
        demo.disabled = true;
        (function next() {
          if (i >= steps.length) { demo.disabled = false; return; }
          input.value = steps[i++];
          render();
          setTimeout(next, reduced ? 60 : 850);
        })();
      });
    }

    render();
  }

  /* ============================================================
     Phish hunt
     The message is the one used in the elementary assembly.
     Five red flags, same five the workshop teaches.
     ============================================================ */

  function initPhishHunt() {
    var hunt = document.getElementById("phish-hunt");
    if (!hunt) return;

    var flags = hunt.querySelectorAll(".flag");
    var total = flags.length;
    var log = document.getElementById("hunt-log");
    var count = document.getElementById("hunt-count");
    var win = document.getElementById("hunt-win");
    var reset = document.getElementById("hunt-reset");
    var found = 0;

    function update() {
      count.innerHTML = "<b>" + found + "</b> of " + total + " red flags found";
      if (found === total) {
        win.hidden = false;
      }
    }

    flags.forEach(function (flag) {
      flag.addEventListener("click", function () {
        if (flag.classList.contains("found")) return;
        flag.classList.add("found");
        flag.setAttribute("aria-pressed", "true");
        found++;

        var li = document.createElement("li");
        li.textContent = flag.dataset.explain;
        log.appendChild(li);
        update();
      });
    });

    if (reset) {
      reset.addEventListener("click", function () {
        found = 0;
        log.innerHTML = "";
        win.hidden = true;
        flags.forEach(function (f) {
          f.classList.remove("found");
          f.setAttribute("aria-pressed", "false");
        });
        update();
      });
    }

    update();
  }

  /* ---------- Lightbox ----------
     Any <img class="zoomable"> opens full size. Caption is taken from the
     enclosing <figcaption> if there is one, otherwise from the alt text. */
  function initLightbox() {
    var zoomables = document.querySelectorAll("img.zoomable");
    if (!zoomables.length) return;

    var box = document.createElement("div");
    box.className = "lightbox";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.hidden = true;
    box.innerHTML =
      '<button class="lightbox-close" type="button" aria-label="Close image">Close</button>' +
      '<img alt=""><figcaption></figcaption>';
    document.body.appendChild(box);

    var bigImg = box.querySelector("img");
    var cap = box.querySelector("figcaption");
    var closeBtn = box.querySelector(".lightbox-close");
    var lastFocus = null;

    function open(src, alt, caption) {
      lastFocus = document.activeElement;
      bigImg.src = src;
      bigImg.alt = alt || "";
      cap.textContent = caption || alt || "";
      box.hidden = false;
      box.classList.add("open");
      document.body.style.overflow = "hidden";
      closeBtn.focus();
    }

    function close() {
      box.classList.remove("open");
      box.hidden = true;
      bigImg.removeAttribute("src");
      document.body.style.overflow = "";
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }

    Array.prototype.forEach.call(zoomables, function (img) {
      img.setAttribute("tabindex", "0");
      img.setAttribute("role", "button");

      function trigger() {
        var fig = img.closest("figure");
        var fc = fig ? fig.querySelector("figcaption") : null;
        open(img.currentSrc || img.src, img.alt, fc ? fc.textContent.trim() : "");
      }

      img.addEventListener("click", trigger);
      img.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); trigger(); }
      });
    });

    closeBtn.addEventListener("click", close);
    box.addEventListener("click", function (e) { if (e.target === box) close(); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && box.classList.contains("open")) close();
    });
  }

  /* ---------- Boot ---------- */
  function boot() {
    initCurrentNav();
    initNav();
    initScroll();
    initReveal();
    initCounters();
    initFilters();
    initFlips();
    initPasswordLab();
    initPhishHunt();
    initLightbox();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();