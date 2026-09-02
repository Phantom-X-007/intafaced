/** Route navigation truth — pure helpers for the shell-level boundary. */
'use strict';

var CHUNK_FAILURE = /Loading (?:CSS )?chunk|ChunkLoadError|failed to fetch dynamically imported module/i;

function requestedPath(route) {
  if (route && typeof route.fullPath === 'string' && route.fullPath.charAt(0) === '/') return route.fullPath;
  return '/';
}

function failure(error, route) {
  var raw = error && error.message ? String(error.message) : '';
  return {
    status: 'failed',
    path: requestedPath(route),
    code: CHUNK_FAILURE.test(raw) ? 'route.chunk_unavailable' : 'route.navigation_failed',
    message: CHUNK_FAILURE.test(raw)
      ? 'The page files could not be loaded. Your current page has not been replaced.'
      : 'The requested page could not be opened. Your current page has not been replaced.'
  };
}

module.exports = { requestedPath: requestedPath, failure: failure };
