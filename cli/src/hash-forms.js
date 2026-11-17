// The two text forms of a contribution hash.
// The ceremony record uses hexadecimal. A Sui explorer shows the on-chain bytes in base64.

export const hexToBase64 = (hex) => Buffer.from(hex, 'hex').toString('base64');
