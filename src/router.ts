export type Route =
  | { name: 'home' }
  | { name: 'wordbook' }
  | { name: 'exam'; examId: string }
  | { name: 'question'; examId: string; n: number; from?: number; to?: number };

export function parseRoute(hash: string): Route {
  const m = hash.replace(/^#?\/?/, '');
  if (!m) return { name: 'home' };
  const [path, search] = m.split('?');
  const params = new URLSearchParams(search ?? '');
  const parts = path.split('/');
  if (parts[0] === 'wordbook') return { name: 'wordbook' };
  if (parts[0] === 'exam' && parts[1]) {
    if (parts[2] === 'q' && parts[3]) {
      const n = Number(parts[3]);
      if (!Number.isFinite(n)) return { name: 'home' };
      const fromRaw = params.get('from');
      const toRaw = params.get('to');
      const from = fromRaw !== null ? Number(fromRaw) : undefined;
      const to = toRaw !== null ? Number(toRaw) : undefined;
      return {
        name: 'question',
        examId: parts[1],
        n,
        ...(from !== undefined && Number.isFinite(from) ? { from } : {}),
        ...(to !== undefined && Number.isFinite(to) ? { to } : {}),
      };
    }
    return { name: 'exam', examId: parts[1] };
  }
  return { name: 'home' };
}

export function navigate(route: Route) {
  let hash = '#/';
  if (route.name === 'wordbook') hash = '#/wordbook';
  else if (route.name === 'exam') hash = `#/exam/${route.examId}`;
  else if (route.name === 'question') {
    hash = `#/exam/${route.examId}/q/${route.n}`;
    const params: string[] = [];
    if (route.from != null) params.push(`from=${route.from}`);
    if (route.to != null) params.push(`to=${route.to}`);
    if (params.length) hash += `?${params.join('&')}`;
  }
  location.hash = hash;
}

export function onRouteChange(cb: (r: Route) => void) {
  const handler = () => cb(parseRoute(location.hash));
  window.addEventListener('hashchange', handler);
  handler();
}
