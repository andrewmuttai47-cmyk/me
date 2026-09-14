const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const port = Number(process.env.PORT) || 3000;
const root = __dirname;
const usersFile = path.join(root, 'data', 'users.json');
const sessions = new Map();
const mimeTypes = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8' };

function readUsers() {
  const contents = fs.readFileSync(usersFile, 'utf8').trim();
  if (!contents) return [];
  const users = JSON.parse(contents);
  if (!Array.isArray(users)) throw new Error('User store must contain a JSON array.');
  return users;
}

function writeUsers(users) {
  fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function passwordsMatch(password, stored) {
  const [salt, storedHash] = stored.split(':');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(storedHash, 'hex'));
}

function getCookies(request) {
  return Object.fromEntries((request.headers.cookie || '').split(';').filter(Boolean).map((cookie) => cookie.trim().split('=')));
}

function sendJson(response, status, payload, headers = {}) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  response.end(JSON.stringify(payload));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 100000) request.destroy();
    });
    request.on('end', () => {
      try { resolve(JSON.parse(body.trim() || '{}')); } catch { reject(new Error('Invalid JSON')); }
    });
    request.on('error', reject);
  });
}

function currentUser(request) {
  const sessionId = getCookies(request).session;
  const email = sessions.get(sessionId);
  return email ? readUsers().find((user) => user.email === email) : null;
}

async function handleApi(request, response, url) {
  if (request.method === 'POST' && url.pathname === '/api/signup') {
    const { name, email, password } = await readBody(request);
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!name || !cleanEmail || !password || password.length < 8) return sendJson(response, 400, { error: 'Please provide a name, a valid email, and a password of at least 8 characters.' });
    const users = readUsers();
    if (users.some((user) => user.email === cleanEmail)) return sendJson(response, 409, { error: 'An account with this email already exists.' });
    users.push({ id: crypto.randomUUID(), name: String(name).trim(), email: cleanEmail, password: hashPassword(password), createdAt: new Date().toISOString() });
    writeUsers(users);
    return createSession(response, cleanEmail);
  }

  if (request.method === 'POST' && url.pathname === '/api/login') {
    const { email, password } = await readBody(request);
    const user = readUsers().find((candidate) => candidate.email === String(email || '').trim().toLowerCase());
    if (!user || !passwordsMatch(String(password || ''), user.password)) return sendJson(response, 401, { error: 'Email or password is incorrect.' });
    return createSession(response, user.email);
  }

  if (request.method === 'POST' && url.pathname === '/api/logout') {
    const sessionId = getCookies(request).session;
    sessions.delete(sessionId);
    return sendJson(response, 200, { ok: true }, { 'Set-Cookie': 'session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax' });
  }

  if (request.method === 'GET' && url.pathname === '/api/me') {
    const user = currentUser(request);
    return sendJson(response, 200, { user: user ? { name: user.name, email: user.email } : null });
  }

  return sendJson(response, 404, { error: 'API route not found.' });
}

function createSession(response, email) {
  const sessionId = crypto.randomBytes(32).toString('hex');
  sessions.set(sessionId, email);
  sendJson(response, 200, { ok: true }, { 'Set-Cookie': `session=${sessionId}; HttpOnly; Path=/; Max-Age=86400; SameSite=Lax` });
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(request, response, url);
    const requestedPath = url.pathname === '/' ? '/index.html' : url.pathname;
    const filePath = path.normalize(path.join(root, requestedPath));
    if (!filePath.startsWith(root) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return response.end('Not found');
    }
    response.writeHead(200, { 'Content-Type': mimeTypes[path.extname(filePath)] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(response);
  } catch (error) {
    sendJson(response, 500, { error: 'Something went wrong on the server.' });
    console.error(error);
  }
});

server.listen(port, () => console.log(`Seoul Create is running at http://localhost:${port}`));
