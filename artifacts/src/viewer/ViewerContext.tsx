import { createContext, type ReactNode, useContext } from 'react';

const PageWindowContext = createContext<Window | null>(null);

export function ViewerProvider({
  pageWindow,
  children,
}: {
  pageWindow?: Window;
  children: ReactNode;
}) {
  return (
    <PageWindowContext.Provider value={pageWindow ?? null}>{children}</PageWindowContext.Provider>
  );
}

export const usePageWindow = () => useContext(PageWindowContext) ?? window;
