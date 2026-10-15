import {Suspense} from 'react';
import {LiveWorkspace} from '@/components/live-workspace';

// One route serves every workspace URL (/workspace, /workspace/tasks, /workspace/websites/<id>, ...).
// The workspace switches pages client-side, so it keeps its loaded data between them.
export default function WorkspacePage() {
  return (
    <Suspense>
      <LiveWorkspace />
    </Suspense>
  );
}
