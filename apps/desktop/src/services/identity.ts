const databaseName = "ludra-identity";
const storeName = "keys";
const algorithm = { name: "ECDSA", namedCurve: "P-256" } as const;
const signature = { name: "ECDSA", hash: "SHA-256" } as const;

export type Identity = {
  privateKey: CryptoKey;
  publicKey: string;
};

type StoredIdentity = {
  privateKey: CryptoKey;
  publicKey: string;
};

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function read(database: IDBDatabase, key: string): Promise<StoredIdentity | undefined> {
  return new Promise((resolve, reject) => {
    const request = database.transaction(storeName, "readonly").objectStore(storeName).get(key);
    request.onsuccess = () => resolve(request.result as StoredIdentity | undefined);
    request.onerror = () => reject(request.error);
  });
}

function write(database: IDBDatabase, key: string, value: StoredIdentity): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put(value, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

function toBase64(bytes: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export async function loadIdentity(userId: string): Promise<Identity> {
  const database = await openDatabase();
  try {
    const stored = await read(database, userId);
    if (stored) {
      return stored;
    }
    const pair = await crypto.subtle.generateKey(algorithm, false, ["sign", "verify"]);
    const publicKey = toBase64(await crypto.subtle.exportKey("spki", pair.publicKey));
    const identity = { privateKey: pair.privateKey, publicKey };
    await write(database, userId, identity);
    return identity;
  } finally {
    database.close();
  }
}

export async function signText(privateKey: CryptoKey, text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  return toBase64(await crypto.subtle.sign(signature, privateKey, bytes));
}

export async function verifyText(publicKey: string, text: string, proof: string): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey("spki", fromBase64(publicKey), algorithm, false, ["verify"]);
    return await crypto.subtle.verify(signature, key, fromBase64(proof), new TextEncoder().encode(text));
  } catch {
    return false;
  }
}

export async function safetyNumber(first: [string, string], second: [string, string]): Promise<string> {
  const parts = [first, second].sort(([a], [b]) => (a < b ? -1 : 1)).map(([id, key]) => `${id}:${key}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-512", new TextEncoder().encode(parts.join("|"))));
  const groups: string[] = [];
  for (let index = 0; index < 12; index++) {
    const offset = index * 5;
    let value = 0;
    for (let byte = 0; byte < 5; byte++) {
      value = value * 256 + digest[offset + byte];
    }
    groups.push(String(value % 100000).padStart(5, "0"));
  }
  return groups.join(" ");
}
