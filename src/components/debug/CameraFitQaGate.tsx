/**
 * CameraFitQaGate — Mount the camera-fit QA panel only when:
 *   1. URL contains `?qa=1`, AND
 *   2. The current user holds `view_audit_log` capability.
 *
 * PR-BACKOFFICE-GOVERNANCE F5: prevents the diagnostic panel from leaking to
 * non-authorized users in production.
 */

import { useEffect, useState } from 'react';
import { CameraFitQaPanel } from '@/components/debug/CameraFitQaPanel';
import { useCapability } from '@/domains/identity';

function hasQaFlag(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.get('qa') === '1';
}

export function CameraFitQaGate() {
  const [qa, setQa] = useState<boolean>(() => hasQaFlag());
  const { allowed, loading } = useCapability('view_audit_log');

  useEffect(() => {
    const onChange = () => setQa(hasQaFlag());
    window.addEventListener('popstate', onChange);
    return () => window.removeEventListener('popstate', onChange);
  }, []);

  if (!qa) return null;
  if (loading || !allowed) return null;
  return <CameraFitQaPanel />;
}
