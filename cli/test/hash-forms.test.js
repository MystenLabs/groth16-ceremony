import test from 'node:test';
import assert from 'node:assert/strict';
import { hexToBase64 } from '../src/hash-forms.js';

test('the base64 form is the form that an explorer shows', () => {
  // Contribution 4 of the zkLogin v2 ceremony on Sui mainnet.
  const hex = '69d8a4e79fdbf31a4fe57a5c2fa187ba4faf5c191e2ff8274df855d66843ab52bdb0e5e9f2372284a3f0f31af80ef945c22f6967e08946ad7a76e0daca3bf0eb';
  assert.equal(hexToBase64(hex), 'adik55/b8xpP5XpcL6GHuk+vXBkeL/gnTfhV1mhDq1K9sOXp8jcihKPw8xr4DvlFwi9pZ+CJRq16duDayjvw6w==');
});
