// Meridian Supply Co. — storefront (SYNTHETIC DEMO CODE).
// Standalone sample app "under test" for the TickTickGo triage demo.
// The fraud module (window.fraudCheck) is injected by storefront.html
// before this file runs: /storefront-fraud.js (broken, deploy d6) or
// /storefront-fraud-fixed.js when ?fixed=1.
(function () {
  "use strict";

  var PRODUCTS = [
    { id: "p1", name: "Pro Workstation Bench", sku: "MSC-4410", price: 1249 },
    { id: "p2", name: "Torque Wrench Set", sku: "MSC-1180", price: 249 },
    { id: "p3", name: "Cordless Impact Driver", sku: "MSC-2205", price: 129 },
    { id: "p4", name: "Safety Glasses (12-pack)", sku: "MSC-0031", price: 39 },
    { id: "p5", name: "Steel Shelving Unit", sku: "MSC-3302", price: 549 },
    { id: "p6", name: "LED Shop Light Bar", sku: "MSC-0977", price: 89 }
  ];

  var cart = []; // array of product ids (one entry per line item)
  var params = new URLSearchParams(location.search);

  var el = function (id) { return document.getElementById(id); };

  function money(n) {
    return "$" + n.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function cartTotal() {
    return cart.reduce(function (sum, id) {
      var p = PRODUCTS.find(function (x) { return x.id === id; });
      return sum + (p ? p.price : 0);
    }, 0);
  }

  function renderProducts() {
    var grid = el("sf-products");
    grid.innerHTML = "";
    PRODUCTS.forEach(function (p) {
      var card = document.createElement("div");
      card.className = "sf-card";
      card.innerHTML =
        "<h3>" + p.name + "</h3>" +
        '<span class="sf-sku">' + p.sku + "</span>" +
        '<span class="sf-price">' + money(p.price) + "</span>";
      var btn = document.createElement("button");
      btn.className = "sf-btn";
      btn.textContent = "Add to cart";
      btn.addEventListener("click", function () {
        cart.push(p.id);
        renderCart();
      });
      card.appendChild(btn);
      grid.appendChild(card);
    });
  }

  function renderCart() {
    var list = el("sf-cart-items");
    list.innerHTML = "";
    cart.forEach(function (id, idx) {
      var p = PRODUCTS.find(function (x) { return x.id === id; });
      var li = document.createElement("li");
      var label = document.createElement("span");
      label.textContent = p.name + " — " + money(p.price);
      var rm = document.createElement("button");
      rm.className = "sf-remove";
      rm.textContent = "Remove";
      rm.addEventListener("click", function () {
        cart.splice(idx, 1);
        renderCart();
      });
      li.appendChild(label);
      li.appendChild(rm);
      list.appendChild(li);
    });
    el("sf-cart-empty").hidden = cart.length > 0;
    el("sf-cart-total").textContent = money(cartTotal());
    el("sf-checkout").disabled = cart.length === 0;
    hideResults();
  }

  function hideResults() {
    el("sf-result-success").hidden = true;
    el("sf-result-failure").hidden = true;
  }

  function checkout() {
    var total = cartTotal();
    hideResults();
    try {
      var result = window.fraudCheck({ total: total });
      el("sf-success-msg").textContent = money(total);
      el("sf-success-review").hidden = !(result && result.requiresManualReview);
      el("sf-result-success").hidden = false;
    } catch (err) {
      el("sf-failure-msg").textContent = err && err.message ? err.message : String(err);
      el("sf-result-failure").hidden = false;
      prefillTicket(total);
    }
  }

  // ---- Report-a-problem modal (narrative only, nothing persists) ----

  function prefillTicket(total) {
    el("sf-ticket-subject").value = "Checkout fails on our order";
    el("sf-ticket-body").value =
      "We tried to place a " + money(total) + " order this morning and the " +
      "Place Order button just comes back with an error. Cheaper items go " +
      "through fine — it seems to be anything over about a thousand dollars. " +
      "Nothing changed on our side.";
  }

  function openModal() { resetTicketStage(); el("sf-modal").hidden = false; }
  function closeModal() { clearAnim(); el("sf-modal").hidden = true; }

  // ---- Ticket generation animation ---------------------------------
  // Stage classes on #sf-ticket-stage: st1 (card assembles, id scrambles,
  // lines wipe in) -> st2 (checkmark draws, status types) -> st3 (glow
  // pulse, actions slide up). Reduced motion: jump straight to final.

  var TICKET_ID = "t251";
  var STATUS_TEXT = "Routed to TickTickGo triage · matched to a known issue";
  var animTimers = [];

  function clearAnim() {
    animTimers.forEach(function (t) { clearTimeout(t); clearInterval(t); });
    animTimers = [];
  }

  function resetTicketStage() {
    clearAnim();
    var stage = el("sf-ticket-stage");
    stage.hidden = true;
    stage.className = "sf-ticket-stage";
    el("sf-ticket-id").textContent = TICKET_ID;
    el("sf-ticket-status-text").textContent = "";
    el("sf-modal-form").hidden = false;
    el("sf-modal-form").classList.remove("sf-form-out");
  }

  function fillTicketCard() {
    el("sf-ticket-subj-line").textContent = el("sf-ticket-subject").value;
    var lines = el("sf-ticket-lines");
    lines.innerHTML = "";
    (el("sf-ticket-body").value.match(/[^.]+\.?/g) || []).forEach(function (s) {
      var div = document.createElement("div");
      div.className = "sf-ticket-line";
      div.textContent = s.trim();
      lines.appendChild(div);
    });
  }

  function scrambleId() {
    var chars = "abcdefx0123456789", idEl = el("sf-ticket-id"), tick = 0;
    var iv = setInterval(function () {
      tick++;
      var s = "";
      for (var i = 0; i < TICKET_ID.length; i++) {
        s += tick > 12 + i * 3 ? TICKET_ID[i]
          : chars[Math.floor(Math.random() * chars.length)];
      }
      idEl.textContent = s;
      if (tick > 12 + TICKET_ID.length * 3) { idEl.textContent = TICKET_ID; clearInterval(iv); }
    }, 38);
    animTimers.push(iv);
  }

  function typeStatus() {
    var out = el("sf-ticket-status-text"), i = 0;
    var iv = setInterval(function () {
      i++;
      out.textContent = STATUS_TEXT.slice(0, i);
      if (i >= STATUS_TEXT.length) clearInterval(iv);
    }, 16);
    animTimers.push(iv);
  }

  function fileTicket() {
    var stage = el("sf-ticket-stage");
    var form = el("sf-modal-form");
    var reduced = window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    fillTicketCard();
    if (reduced) {
      form.hidden = true;
      stage.hidden = false;
      stage.className = "sf-ticket-stage st1 st2 st3 sf-instant";
      el("sf-ticket-status-text").textContent = STATUS_TEXT;
      return;
    }
    form.classList.add("sf-form-out");
    animTimers.push(setTimeout(function () {
      form.hidden = true;
      stage.hidden = false;
      void stage.offsetWidth; // reflow so entrance animations run
      stage.classList.add("st1");
      scrambleId();
    }, 240));
    animTimers.push(setTimeout(function () { stage.classList.add("st2"); typeStatus(); }, 1600));
    animTimers.push(setTimeout(function () { stage.classList.add("st3"); }, 2450));
  }

  // ---- Self-test (?selftest=1) --------------------------------------
  // FROZEN CONTRACT: {ttg:"selftest", device, results:[{name, pass}]}

  function runSelfTest() {
    var cases = [
      { name: "$40 order", total: 40 },
      { name: "$1,300 order", total: 1300 }
    ];
    var results = cases.map(function (c) {
      var pass;
      try {
        var r = window.fraudCheck({ total: c.total });
        pass = !!(r && r.approved);
      } catch (e) {
        pass = false;
      }
      return { name: c.name, pass: pass };
    });

    parent.postMessage({
      ttg: "selftest",
      device: new URLSearchParams(location.search).get("device") || "unknown",
      results: results
    }, "*");

    var banner = document.createElement("div");
    banner.id = "sf-selftest";
    banner.textContent = "self-test: " + results.map(function (r) {
      return (r.pass ? "✓" : "✗") + " " + r.name;
    }).join("  ");
    document.body.appendChild(banner);
  }

  // ---- Init ---------------------------------------------------------

  renderProducts();
  renderCart();
  el("sf-checkout").addEventListener("click", checkout);
  el("sf-report-open").addEventListener("click", openModal);
  el("sf-modal-close").addEventListener("click", closeModal);
  el("sf-ticket-file").addEventListener("click", fileTicket);
  el("sf-ticket-done").addEventListener("click", closeModal);
  el("sf-modal").addEventListener("click", function (e) {
    if (e.target === el("sf-modal")) closeModal();
  });

  if (params.get("fixed") === "1") el("sf-build-tag").hidden = false;
  // Session mode wins when both params are present: the scripted session
  // drives a real checkout, so the selftest must not double-fire.
  if (params.get("selftest") === "1" && params.get("session") !== "1") runSelfTest();
})();

// ---- Scripted live session (?session=1) -----------------------------
// Drives a visible checkout like a screen recording for the parent's
// device/OS matrix: a simulated cursor adds the Pro Workstation Bench
// ($1,249) and the LED Shop Light Bar ($89), places the $1,338 order,
// and reports the outcome. Contract (parent matrix depends on it):
//   step: {ttg:"session", profile, event:"step", step:{t, label}}
//   done: {ttg:"session", profile, event:"done", verdict, checks, durationMs}
(function () {
  "use strict";

  var params = new URLSearchParams(location.search);
  if (params.get("session") !== "1") return;

  var profile = params.get("profile") || params.get("device") || "unknown";
  var clock = (window.performance && performance.now)
    ? function () { return performance.now(); }
    : function () { return Date.now(); };
  var t0 = clock();
  var now = function () { return Math.round(clock() - t0); };
  var $ = function (id) { return document.getElementById(id); };

  document.body.classList.add("sf-session");

  var cx = window.innerWidth / 2, cy = 48;
  var cursor = document.createElement("div");
  cursor.className = "sf-cursor";
  cursor.style.transform = "translate(" + cx + "px," + cy + "px)";
  document.body.appendChild(cursor);

  function post(msg) { parent.postMessage(msg, "*"); }

  function step(label) {
    post({
      ttg: "session", profile: profile, event: "step",
      step: { t: now(), label: label }
    });
  }

  function moveTo(target) {
    if (!target) return;
    if (target.scrollIntoView) target.scrollIntoView({ block: "center" });
    var r = target.getBoundingClientRect();
    cx = r.left + r.width / 2;
    cy = r.top + r.height / 2;
    cursor.style.transform = "translate(" + cx + "px," + cy + "px)";
  }

  function clickAt(target) {
    if (!target) return;
    moveTo(target);
    var ring = document.createElement("div");
    ring.className = "sf-cursor-pulse";
    ring.style.left = cx + "px";
    ring.style.top = cy + "px";
    document.body.appendChild(ring);
    setTimeout(function () {
      if (ring.parentNode) ring.parentNode.removeChild(ring);
    }, 600);
    target.click();
  }

  function addToCartButton(name) {
    var cards = document.querySelectorAll("#sf-products .sf-card");
    for (var i = 0; i < cards.length; i++) {
      var h = cards[i].querySelector("h3");
      if (h && h.textContent === name) return cards[i].querySelector("button.sf-btn");
    }
    return null;
  }

  function finish(pass) {
    // The $40 check is computed silently — not part of the visible session.
    var fortyPass = false;
    try {
      var r = window.fraudCheck({ total: 40 });
      fortyPass = !!(r && r.approved);
    } catch (e) { fortyPass = false; }
    post({
      ttg: "session", profile: profile, event: "done",
      verdict: { pass: pass, label: "$1,300+ checkout" },
      checks: [
        { name: "$40 order", pass: fortyPass },
        { name: "$1,300+ checkout", pass: pass }
      ],
      durationMs: now()
    });
  }

  // Timeline (~3.9s). With prefers-reduced-motion the CSS transition is
  // disabled so the cursor jumps instantly; steps keep the same t values.
  step("Session start · " + profile);
  setTimeout(function () { moveTo(addToCartButton("Pro Workstation Bench")); }, 250);
  setTimeout(function () {
    clickAt(addToCartButton("Pro Workstation Bench"));
    step("Add to cart — Pro Workstation Bench $1,249.00");
  }, 900);
  setTimeout(function () { moveTo(addToCartButton("LED Shop Light Bar")); }, 1200);
  setTimeout(function () {
    clickAt(addToCartButton("LED Shop Light Bar"));
    step("Add to cart — LED Shop Light Bar $89.00");
  }, 1850);
  setTimeout(function () { moveTo($("sf-cart-total")); }, 2150);
  setTimeout(function () { moveTo($("sf-checkout")); }, 2750);
  setTimeout(function () {
    clickAt($("sf-checkout"));
    step("Place order — $1,338.00 total");
    // fraudCheck is synchronous: read which panel the real checkout showed.
    var pass = !$("sf-result-success").hidden;
    step(pass ? "✓ Order placed — $1,338.00"
              : "✗ RISK_CHECK_TIMEOUT — checkout blocked");
    moveTo(pass ? $("sf-result-success") : $("sf-result-failure"));
    setTimeout(function () { finish(pass); }, 500);
  }, 3400);
})();
