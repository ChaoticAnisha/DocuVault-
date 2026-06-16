import CryptoJS from 'crypto-js';

const key = () => process.env.ENCRYPTION_KEY!;

export const encrypt = (plaintext: string): string =>
  CryptoJS.AES.encrypt(plaintext, key()).toString();

export const decrypt = (ciphertext: string): string =>
  CryptoJS.AES.decrypt(ciphertext, key()).toString(CryptoJS.enc.Utf8);
