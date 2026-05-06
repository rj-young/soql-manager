'use strict';

function unreachable() {
  throw new Error(
    "xlsx stub: this build replaced the xlsx package with a no-op shim. " +
    "Excel import/export call sites are scheduled for removal in PRD Task 1.3."
  );
}

const handler = {
  get(_target, prop) {
    if (prop === '__esModule') return true;
    if (prop === 'default') return stub;
    return stub;
  },
  apply: unreachable,
  construct: unreachable,
};

const stub = new Proxy(function () {}, handler);

module.exports = stub;
