import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/misc';
import { ProjectsBrowser } from '@/components/projects/ProjectsBrowser';
import { ProjectFormDialog } from '@/components/projects/ProjectFormDialog';

export default function ProjectsPage() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader title="My Projects" description="Each project holds the reference photos, generations and model versions of one object."
        actions={<Button onClick={() => setOpen(true)}><Plus /> New project</Button>} />
      <ProjectsBrowser />
      <ProjectFormDialog open={open} onOpenChange={setOpen} navigateTo={(p) => `/app/projects/${p.id}/studio`} />
    </div>
  );
}
