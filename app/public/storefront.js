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
      el("sf-success-msg").textContent = "Order placed — " + money(total);
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

  function openModal() { el("sf-modal").hidden = false; }
  function closeModal() { el("sf-modal").hidden = true; }

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
  el("sf-modal").addEventListener("click", function (e) {
    if (e.target === el("sf-modal")) closeModal();
  });

  if (params.get("fixed") === "1") el("sf-build-tag").hidden = false;
  if (params.get("selftest") === "1") runSelfTest();
})();
