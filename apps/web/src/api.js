const configuredBase = String(import.meta.env.VITE_API_BASE_URL || '').trim();

const rawBase = configuredBase || '/api';

export function apiUrl(pathname) {
  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const base = rawBase.endsWith('/') ? rawBase.slice(0, -1) : rawBase;
  return `${base}${normalizedPath}`;
}
