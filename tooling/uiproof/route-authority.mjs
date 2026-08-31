import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROUTES_FILE = fileURLToPath(new URL('../../vendor/upstream-exchange/05_Web_Front/src/config/routes.js', import.meta.url));

const PROOF_PATHS = new Map([
  ['/login/returnUrl/:returnUrl', '/login/returnUrl/index'],
  ['/exchange/:pair', '/exchange/btc_usdt'],
  ['/lab/detail/:id', '/lab/detail/uiproof'],
  ['/announcement/:id', '/announcement/uiproof'],
  ['/otc/trade/*', '/otc/trade/usdt'],
  ['*', '/uiproof-not-found'],
]);

function matchingDelimiter(source, start, open, close) {
  let depth = 0;
  let quote = '';
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let i = start; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];
    if (lineComment) {
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false;
        i += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '/' && next === '/') {
      lineComment = true;
      i += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      blockComment = true;
      i += 1;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      continue;
    }
    if (char === open) depth += 1;
    if (char === close) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  throw new Error(`Unclosed ${open} in member route authority`);
}

function topLevelObjects(arraySource) {
  const objects = [];
  let quote = '';
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let i = 1; i < arraySource.length - 1; i += 1) {
    const char = arraySource[i];
    const next = arraySource[i + 1];
    if (lineComment) {
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false;
        i += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '/' && next === '/') {
      lineComment = true;
      i += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      blockComment = true;
      i += 1;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') {
      const end = matchingDelimiter(arraySource, i, '{', '}');
      objects.push(arraySource.slice(i, end + 1));
      i = end;
    }
  }
  return objects;
}

function stringProperty(objectSource, name) {
  const match = objectSource.match(new RegExp(`\\b${name}\\s*:\\s*(['"])(.*?)\\1`));
  return match ? match[2] : null;
}

function joinPath(parent, child) {
  if (!parent) return child || '/';
  if (!child) return parent;
  if (child.startsWith('/')) return child;
  return `${parent.replace(/\/$/, '')}/${child}`;
}

function resolveRedirect(routePath, redirect) {
  if (!redirect || redirect.startsWith('/')) return redirect;
  const parent = routePath.slice(0, routePath.lastIndexOf('/')) || '/';
  return joinPath(parent, redirect);
}

function childArray(objectSource) {
  const match = /\bchildren\s*:\s*\[/.exec(objectSource);
  if (!match) return null;
  const start = match.index + match[0].lastIndexOf('[');
  const end = matchingDelimiter(objectSource, start, '[', ']');
  return objectSource.slice(start, end + 1);
}

function parseArray(arraySource, parentPath = '', inheritedAuth = false) {
  const routes = [];
  for (const objectSource of topLevelObjects(arraySource)) {
    const childrenAt = objectSource.search(/\bchildren\s*:/);
    const ownSource = childrenAt < 0 ? objectSource : objectSource.slice(0, childrenAt);
    const ownPath = stringProperty(ownSource, 'path');
    if (ownPath === null) continue;
    const sourcePath = joinPath(parentPath, ownPath);
    const requiresAuth = inheritedAuth || /\brequiresAuth\s*:\s*true\b/.test(ownSource);
    const rawRedirect = stringProperty(ownSource, 'redirect');
    const redirect =
      ownPath === '' && rawRedirect && !rawRedirect.startsWith('/')
        ? joinPath(sourcePath, rawRedirect)
        : resolveRedirect(sourcePath, rawRedirect);
    routes.push({ sourcePath, requiresAuth, redirect });
    const children = childArray(objectSource);
    if (children) routes.push(...parseArray(children, sourcePath, requiresAuth));
  }
  return routes;
}

function routeId(sourcePath) {
  if (sourcePath === '/') return 'index';
  if (sourcePath === '/index') return 'index-alias';
  if (sourcePath === '*') return 'not-found';
  return sourcePath
    .replace(/^\//, '')
    .replace(/[:*]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

export function readMemberRouteAuthority(source = readFileSync(ROUTES_FILE, 'utf8')) {
  const exportStart = source.indexOf('export default');
  const arrayStart = source.indexOf('[', exportStart);
  if (exportStart < 0 || arrayStart < 0) throw new Error('Member routes export default array not found');
  const arrayEnd = matchingDelimiter(source, arrayStart, '[', ']');
  const parsed = parseArray(source.slice(arrayStart, arrayEnd + 1));
  const unique = new Map();
  for (const route of parsed) unique.set(route.sourcePath, route);
  return [...unique.values()].map((route) => ({
    ...route,
    id: routeId(route.sourcePath),
    path: PROOF_PATHS.get(route.sourcePath) || route.sourcePath,
    expectLoginRedirect: route.requiresAuth,
    note: route.redirect ? `router redirect to ${route.redirect}` : `generated from member router path ${route.sourcePath}`,
  }));
}

export const MEMBER_ROUTE_AUTHORITY = readMemberRouteAuthority();
