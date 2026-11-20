import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input, Label, Select, Textarea, FieldError } from '@/components/ui/input';
import { http, errorMessage } from '@/services/api';
import { useInvalidate } from '@/hooks/queries';
import { ASSET_CATEGORIES, CATEGORY_LABELS, type AssetCategory, type Project } from '@/types/api';

export function ProjectFormDialog({ open, onOpenChange, project, onSaved, navigateTo }: {
  open: boolean; onOpenChange: (o: boolean) => void; project?: Project | null; onSaved?: (p: Project) => void; navigateTo?: (p: Project) => string;
}) {
  const inv = useInvalidate();
  const nav = useNavigate();
  const [name, setName] = useState(''); const [description, setDescription] = useState(''); const [category, setCategory] = useState<AssetCategory>('custom');
  const [error, setError] = useState<string | null>(null); const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (open) { setName(project?.name ?? ''); setDescription(project?.description ?? ''); setCategory(project?.category ?? 'custom'); setError(null); }
  }, [open, project]);

  async function submit(e: FormEvent) {
    e.preventDefault(); setLoading(true); setError(null);
    try {
      const body = { name: name.trim(), description: description.trim() || null, category };
      const p = project ? await http.put<Project>(`/projects/${project.id}`, body) : await http.post<Project>('/projects', body);
      await inv('projects', 'project', 'dashboard');
      toast.success(project ? 'Project updated' : 'Project created');
      onOpenChange(false); onSaved?.(p);
      if (navigateTo) nav(navigateTo(p));
    } catch (err) { setError(errorMessage(err)); } finally { setLoading(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={project ? 'Edit project' : 'New project'} description="A project groups the reference photos, generations and models of one physical object.">
      <form onSubmit={submit} className="space-y-4">
        <div><Label htmlFor="pf-name">Name</Label><Input id="pf-name" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Lion Statue" autoFocus /></div>
        <div><Label htmlFor="pf-cat">Asset type</Label>
          <Select id="pf-cat" value={category} onChange={(e) => setCategory(e.target.value as AssetCategory)}>
            {ASSET_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
          </Select></div>
        <div><Label htmlFor="pf-desc">Description <span className="font-normal text-ink-muted">(optional)</span></Label><Textarea id="pf-desc" maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Material, size, capture notes…" /></div>
        <FieldError>{error}</FieldError>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" loading={loading} disabled={!name.trim()}>{project ? 'Save changes' : 'Create project'}</Button>
        </div>
      </form>
    </Dialog>
  );
}
