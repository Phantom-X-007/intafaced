/**
 * Exact decimal values for economic state.
 *
 * Wire values enter as decimal strings and are retained as scaled bigint.  This
 * module deliberately has no implicit number coercion.  A number is produced
 * only by `toRenderNumber`, the named adapter used immediately before data is
 * handed to lightweight-charts.
 */
/* global BigInt */
'use strict';

var DECIMAL = /^([+-]?)(\d+)(?:\.(\d+))?$/;
var BigIntFactory = typeof BigInt === 'function' ? BigInt : null;
var POW10 = BigIntFactory ? [BigIntFactory('1')] : [];

function pow10(scale) {
  if (!BigIntFactory || !isSafeScale(scale)) throw new TypeError('exact decimals unavailable');
  while (POW10.length <= scale) {
    POW10.push(POW10[POW10.length - 1] * BigIntFactory('10'));
  }
  return POW10[scale];
}

function isSafeScale(scale) {
  return typeof scale === 'number' && isFinite(scale) && Math.floor(scale) === scale && scale >= 0 && scale <= 100;
}

function make(units, scale) {
  if (typeof units !== 'bigint' || !isSafeScale(scale)) return null;
  if (units === BigIntFactory('0')) return Object.freeze({ units: units, scale: 0 });
  while (scale > 0 && units % BigIntFactory('10') === BigIntFactory('0')) {
    units /= BigIntFactory('10');
    scale -= 1;
  }
  return Object.freeze({ units: units, scale: scale });
}

function parse(value) {
  if (!BigIntFactory || typeof value !== 'string') return null;
  var match = DECIMAL.exec(value.trim());
  if (!match) return null;
  var fraction = match[3] || '';
  var digits = (match[2] + fraction).replace(/^0+(?=\d)/, '');
  var units;
  try {
    units = BigIntFactory((match[1] === '-' ? '-' : '') + digits);
  } catch (error) {
    return null;
  }
  return make(units, fraction.length);
}

function isFixed(value) {
  return !!value && typeof value.units === 'bigint' && isSafeScale(value.scale);
}

function align(a, b) {
  if (!isFixed(a) || !isFixed(b)) return null;
  var scale = Math.max(a.scale, b.scale);
  return {
    a: a.units * pow10(scale - a.scale),
    b: b.units * pow10(scale - b.scale),
    scale: scale
  };
}

function compare(a, b) {
  var pair = align(a, b);
  if (!pair) return null;
  return pair.a < pair.b ? -1 : pair.a > pair.b ? 1 : 0;
}

function compareStrings(a, b) {
  var left = parse(a);
  var right = parse(b);
  if (!left || !right) return null;
  return compare(left, right);
}

function add(a, b) {
  var pair = align(a, b);
  return pair ? make(pair.a + pair.b, pair.scale) : null;
}

function subtract(a, b) {
  var pair = align(a, b);
  return pair ? make(pair.a - pair.b, pair.scale) : null;
}

function multiplyInteger(value, factor) {
  if (!isFixed(value) || typeof factor !== 'number' || !isFinite(factor) || Math.floor(factor) !== factor) return null;
  return make(value.units * BigIntFactory(String(factor)), value.scale);
}

/** Snap to the nearest positive increment, half away from zero. */
function snapToIncrement(value, increment) {
  var pair = align(value, increment);
  if (!pair || pair.b <= BigIntFactory('0')) return null;
  var quotient = pair.a / pair.b;
  var remainder = pair.a % pair.b;
  var magnitude = remainder < BigIntFactory('0') ? -remainder : remainder;
  if (magnitude * BigIntFactory('2') >= pair.b) {
    quotient += pair.a < BigIntFactory('0') ? -BigIntFactory('1') : BigIntFactory('1');
  }
  return make(quotient * pair.b, pair.scale);
}

/** Divide with deterministic half-away-from-zero rounding at targetScale. */
function divideInteger(value, divisor, targetScale) {
  if (!isFixed(value) || typeof divisor !== 'number' || !isFinite(divisor) || Math.floor(divisor) !== divisor || divisor <= 0) return null;
  if (!isSafeScale(targetScale)) return null;
  var numerator = value.units;
  var den = BigIntFactory(String(divisor));
  if (targetScale >= value.scale) numerator *= pow10(targetScale - value.scale);
  else den *= pow10(value.scale - targetScale);
  var quotient = numerator / den;
  var remainder = numerator % den;
  var magnitude = remainder < BigIntFactory('0') ? -remainder : remainder;
  if (magnitude * BigIntFactory('2') >= den) quotient += numerator < BigIntFactory('0') ? -BigIntFactory('1') : BigIntFactory('1');
  return make(quotient, targetScale);
}

function ratioPercent(numerator, denominator, targetScale) {
  if (!isFixed(numerator) || !isFixed(denominator) || !isSafeScale(targetScale)) return null;
  var pair = align(numerator, denominator);
  if (!pair || pair.b === BigIntFactory('0')) return null;
  var scaled = pair.a * BigIntFactory('100') * pow10(targetScale);
  var quotient = scaled / pair.b;
  var remainder = scaled % pair.b;
  var absDen = pair.b < BigIntFactory('0') ? -pair.b : pair.b;
  var absRem = remainder < BigIntFactory('0') ? -remainder : remainder;
  if (absRem * BigIntFactory('2') >= absDen) quotient += scaled * pair.b < BigIntFactory('0') ? -BigIntFactory('1') : BigIntFactory('1');
  return make(quotient, targetScale);
}

function negate(value) {
  return isFixed(value) ? make(-value.units, value.scale) : null;
}

function toString(value) {
  if (!isFixed(value)) return null;
  var negative = value.units < BigIntFactory('0');
  var digits = String(negative ? -value.units : value.units);
  if (value.scale) {
    while (digits.length <= value.scale) digits = '0' + digits;
    digits = digits.slice(0, -value.scale) + '.' + digits.slice(-value.scale);
  }
  return (negative ? '-' : '') + digits;
}

/**
 * Lossy renderer boundary. Never feed this result back into canonical state,
 * comparisons, indicators, sorting, or wire payloads.
 */
function toRenderNumber(value) {
  if (!isFixed(value)) return null;
  var rendered = Number(toString(value));
  return isFinite(rendered) ? rendered : null;
}

module.exports = {
  parse: parse,
  isFixed: isFixed,
  compare: compare,
  compareStrings: compareStrings,
  add: add,
  subtract: subtract,
  multiplyInteger: multiplyInteger,
  snapToIncrement: snapToIncrement,
  divideInteger: divideInteger,
  ratioPercent: ratioPercent,
  negate: negate,
  toString: toString,
  toRenderNumber: toRenderNumber
};
