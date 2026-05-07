
// Polyfill BigInt.prototype.toJSON so JSON.stringify doesn't throw on int64s.

// for ts
// from: https://github.com/GoogleChromeLabs/jsbi/issues/30#issuecomment-1006088574
// eslint-disable-next-line @typescript-eslint/no-redeclare
interface BigInt {
  /** Convert to BigInt to string form in JSON.stringify */
  toJSON: () => string;
}

// for js
BigInt.prototype.toJSON = function() { return this.toString() }

