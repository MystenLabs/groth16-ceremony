import test from 'node:test';
import assert from 'node:assert/strict';
import { displayName, nameBytes, MAX_NAME_BYTES } from '../src/display-name.js';

test('the organization goes in brackets after the name', () => {
  assert.equal(displayName('Ada Lovelace', 'Analytical Engines'), 'Ada Lovelace (Analytical Engines)');
  assert.equal(displayName('  Jean-Luc ', ' Mysten Labs  '), 'Jean-Luc (Mysten Labs)');
});

test('an empty organization gives the name alone', () => {
  assert.equal(displayName('Ada Lovelace'), 'Ada Lovelace');
  assert.equal(displayName('Ada Lovelace', '   '), 'Ada Lovelace');
});

test('the byte count includes the brackets and multi-byte characters', () => {
  assert.equal(nameBytes(displayName('Zoë', 'Å')), 9);
  assert.equal(MAX_NAME_BYTES, 64);
});
