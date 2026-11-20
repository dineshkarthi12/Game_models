import type { Project } from '@/types/api';
import { Callout } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
// Replaced in Milestone 5 with the generation configuration UI.
export function ConfigureStep({ onBack }: { project: Project; initialMode: 'ai' | 'photogrammetry'; onBack: () => void }) {
  return <div className="space-y-4"><Callout tone="info" title="Generation is not connected yet">Provider and photogrammetry configuration arrive in the next milestone.</Callout><Button variant="secondary" onClick={onBack}>Back to upload</Button></div>;
}
