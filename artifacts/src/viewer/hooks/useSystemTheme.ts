import { setLobeTheme } from '@lobehub/ui/es/styles/theme/scope';
import { useEffect } from 'react';

export function useSystemTheme() {
  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => setLobeTheme({ appearance: query.matches ? 'dark' : 'light' });
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, []);
}
