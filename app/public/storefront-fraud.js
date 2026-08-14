// Meridian Supply Co. — payment fraud screening (SYNTHETIC DEMO CODE).
// Shipped in deploy d6: "Enable enhanced fraud screening for high-value transactions".
// THE INTENTIONAL BUG lives here, isolated so the fix agent can patch it:
// orders at or above $1,000 are routed to an extended-verification endpoint
// that no longer exists, so the check throws and checkout fails.
(function () {
  "use strict";

  var HIGH_VALUE_THRESHOLD = 1000;

  function fraudCheck(order) {
    var total = Number(order && order.total) || 0;
    if (total >= HIGH_VALUE_THRESHOLD) {
      // deploy d6 routed high-value orders to extended verification; the
      // endpoint was decommissioned, so this path can never succeed.
      throw new Error(
        "RISK_CHECK_TIMEOUT: extended verification endpoint unavailable " +
        "(introduced in deploy d6)"
      );
    }
    return { approved: true, screening: "standard" };
  }

  window.fraudCheck = fraudCheck;
})();
