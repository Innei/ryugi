import './artifact-list.css';
import './cloud-library.css';
import './cloud-overview.css';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { usePlanSummary, type PlanSummary } from '../components/CloudPlanUsage';
import { CloudTopBar, type CloudTab } from '../components/CloudTopBar';

interface CloudPlan {
  summary: PlanSummary | null;
  refreshPlan: () => void;
}

const PlanContext = createContext<CloudPlan>({ summary: null, refreshPlan: () => {} });

export const useCloudPlan = () => useContext(PlanContext);

export function CloudDashboard({ active, wide = false, children }: { active: CloudTab | null; wide?: boolean; children: ReactNode }) {
  const [login, setLogin] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const summary = usePlanSummary(revision);
  const refreshPlan = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    let live = true;
    fetch('/api/session', { cache: 'no-store', credentials: 'same-origin' })
      .then(async (res) => (res.ok ? ((await res.json()) as { login?: unknown }).login : null))
      .then((name) => live && setLogin(typeof name === 'string' ? name : null))
      .catch(() => {});
    return () => { live = false; };
  }, []);

  return (
    <div className={wide ? 'artifact-library cloud-library' : 'artifact-library cloud-library cloud-overview'}>
      <CloudTopBar active={active} login={login} summary={summary} />
      <PlanContext.Provider value={{ summary, refreshPlan }}>{children}</PlanContext.Provider>
    </div>
  );
}
