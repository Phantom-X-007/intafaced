/**
 * Exact staged chart reprice math.
 *
 * Pointer pixels may choose an integer tick count, but canonical prices never
 * round-trip through a renderer Number. A release only updates the existing
 * amend draft; submission remains behind its ordinary review confirmation.
 */
'use strict';

var fixed = require('../fixed-decimal.js');

function exactPrice(value) {
  var parsed = fixed.parse(value);
  return parsed && fixed.compare(parsed, fixed.parse('0')) > 0 ? parsed : null;
}

function exactTick(value) {
  return exactPrice(value);
}

function snap(price, tick) {
  var value = exactPrice(price);
  var increment = exactTick(tick);
  if (!value || !increment) return null;
  var snapped = fixed.snapToIncrement(value, increment);
  return snapped && fixed.compare(snapped, fixed.parse('0')) > 0 ? fixed.toString(snapped) : null;
}

function step(price, tick, count) {
  var value = exactPrice(price);
  var increment = exactTick(tick);
  if (!value || !increment || typeof count !== 'number' || !isFinite(count) || Math.floor(count) !== count) return null;
  var delta = fixed.multiplyInteger(increment, count);
  var next = delta && fixed.add(value, delta);
  return next && fixed.compare(next, fixed.parse('0')) > 0 ? fixed.toString(next) : null;
}

function delta(originalPrice, proposedPrice) {
  var original = exactPrice(originalPrice);
  var proposed = exactPrice(proposedPrice);
  var difference = original && proposed ? fixed.subtract(proposed, original) : null;
  return difference ? fixed.toString(difference) : null;
}

/** The only economic Number boundary: the disposable LWC coordinate adapter. */
function toRendererPrice(price) {
  return fixed.toRenderNumber(exactPrice(price));
}

module.exports = {
  snap: snap,
  step: step,
  delta: delta,
  toRendererPrice: toRendererPrice
};
