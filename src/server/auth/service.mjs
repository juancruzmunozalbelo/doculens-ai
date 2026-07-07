import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const DEFAULT_TOKEN_TTL_SECONDS = 60 * 60;
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_OPTIONS = Object.freeze({ N: 16_384, r: 8, p: 1 });

function base64urlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function signJwt({ payload, jwtSecret }) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64urlJson(header);
  const encodedPayload = base64urlJson(payload);
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = createHmac('sha256', jwtSecret).update(signingInput).digest('base64url');
  return `${signingInput}.${signature}`;
}

function verifyJwt({ token, jwtSecret, now }) {
  if (typeof token !== 'string' || token.split('.').length !== 3) {
    throw new Error('Invalid credentials');
  }
  const [encodedHeader, encodedPayload, signature] = token.split('.');
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const expected = createHmac('sha256', jwtSecret).update(signingInput).digest('base64url');
  const expectedBytes = Buffer.from(expected);
  const signatureBytes = Buffer.from(signature);
  if (expectedBytes.length !== signatureBytes.length || !timingSafeEqual(expectedBytes, signatureBytes)) {
    throw new Error('Invalid credentials');
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  } catch {
    throw new Error('Invalid credentials');
  }
  if (!payload || typeof payload.sub !== 'string' || !Number.isInteger(payload.exp)) {
    throw new Error('Invalid credentials');
  }
  if (payload.exp * 1000 <= now().getTime()) {
    throw new Error('Invalid credentials');
  }
  return payload;
}

function normalizeEmail(email) {
  if (typeof email !== 'string' || email.trim() === '') {
    throw new Error('Email is required');
  }
  return email.trim().toLowerCase();
}

function requirePassword(password) {
  if (typeof password !== 'string' || password.length < 8) {
    throw new Error('Password must be at least 8 characters');
  }
  return password;
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName ?? user.display_name,
  };
}

async function hashPassword(password) {
  const salt = randomBytes(16).toString('base64url');
  const derived = await scrypt(password, salt, SCRYPT_KEY_LENGTH, SCRYPT_OPTIONS);
  return `scrypt$${SCRYPT_OPTIONS.N}$${SCRYPT_OPTIONS.r}$${SCRYPT_OPTIONS.p}$${salt}$${Buffer.from(derived).toString('base64url')}`;
}

async function verifyPassword(password, storedHash) {
  if (typeof storedHash !== 'string') {
    return false;
  }
  const parts = storedHash.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    return false;
  }
  const [, nText, rText, pText, salt, expectedHash] = parts;
  const options = { N: Number(nText), r: Number(rText), p: Number(pText) };
  if (!Number.isInteger(options.N) || !Number.isInteger(options.r) || !Number.isInteger(options.p) || !salt || !expectedHash) {
    return false;
  }
  const expected = Buffer.from(expectedHash, 'base64url');
  const actual = await scrypt(password, salt, expected.length, options);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function createAuthService({
  users,
  jwtSecret,
  tokenTtlSeconds = DEFAULT_TOKEN_TTL_SECONDS,
  now = () => new Date(),
} = {}) {
  if (!users) {
    throw new Error('users repository is required');
  }
  if (typeof jwtSecret !== 'string' || jwtSecret.length === 0) {
    throw new Error('JWT secret is required');
  }

  async function findByEmail(email) {
    if (typeof users.findByEmail === 'function') {
      return users.findByEmail(email);
    }
    if (typeof users.findUserByEmail === 'function') {
      return users.findUserByEmail(email);
    }
    throw new Error('users repository must support findByEmail');
  }

  async function findById(id) {
    if (typeof users.findById === 'function') {
      return users.findById(id);
    }
    if (typeof users.findUserById === 'function') {
      return users.findUserById(id);
    }
    return null;
  }

  async function register({ email, password, displayName }) {
    const normalizedEmail = normalizeEmail(email);
    const passwordHash = await hashPassword(requirePassword(password));
    const created = await users.createUser({
      email: normalizedEmail,
      displayName: typeof displayName === 'string' && displayName.trim() !== '' ? displayName.trim() : normalizedEmail,
      passwordHash,
    });
    return { user: publicUser(created) };
  }

  async function login({ email, password }) {
    const normalizedEmail = normalizeEmail(email);
    const suppliedPassword = requirePassword(password);
    const user = await findByEmail(normalizedEmail);
    const credential = user?.passwordHash ?? user?.password_hash;
    if (!user || !(await verifyPassword(suppliedPassword, credential))) {
      throw new Error('Invalid credentials');
    }
    const issuedAt = Math.floor(now().getTime() / 1000);
    const exp = issuedAt + Number(tokenTtlSeconds);
    const safeUser = publicUser(user);
    const accessToken = signJwt({
      jwtSecret,
      payload: {
        sub: safeUser.id,
        email: safeUser.email,
        iat: issuedAt,
        exp,
      },
    });
    return { user: safeUser, accessToken, expiresAt: new Date(exp * 1000).toISOString() };
  }

  async function authenticateBearerToken(token) {
    try {
      const payload = verifyJwt({ token, jwtSecret, now });
      const user = await findById(payload.sub);
      return user ? publicUser(user) : { id: payload.sub, email: payload.email };
    } catch {
      return null;
    }
  }

  return { register, login, authenticateBearerToken };
}

export const createAuthenticationService = createAuthService;
export const passwordHashing = Object.freeze({ hashPassword, verifyPassword });
