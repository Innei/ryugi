import { useEffect, useMemo, useState } from 'react';

export const PHONE_QUERY = '(max-width: 640px)';

export function useMedia(query: string) {
  const list = useMemo(() => window.matchMedia(query), [query]);
  const [matches, setMatches] = useState(list.matches);
  useEffect(() => {
    const onChange = () => setMatches(list.matches);
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [list]);
  return matches;
}
