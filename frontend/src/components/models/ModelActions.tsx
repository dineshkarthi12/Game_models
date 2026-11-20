import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { MoreHorizontal, FolderOpen, Pencil, Copy, Download, FolderInput, Star, Trash2, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownTrigger, DropdownContent, DropdownItem, DropdownSeparator } from '@/components/ui/dropdown';
import { Dialog } from '@/components/ui/dialog';
import { Input, Label, Select } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useFolders, useInvalidate, useUpdateModel } from '@/hooks/queries';
import { http, errorMessage } from '@/services/api';
import type { Model } from '@/types/api';

export async function downloadModel(m: Model) {
  try {
    const r = await http.get<{ url: string; filename: string }>(`/models/${m.id}/download`);
    const a = document.createElement('a'); a.href = r.url; a.download = r.filename; document.body.appendChild(a); a.click(); a.remove();
  } catch (e) { toast.error(errorMessage(e)); }
}

export function ModelActions({ model, onPreview }: { model: Model; onPreview?: () => void }) {
  const nav = useNavigate();
  const inv = useInvalidate();
  const update = useUpdateModel();
  const { data: folders } = useFolders();
  const [renaming, setRenaming] = useState(false); const [name, setName] = useState(model.name);
  const [moving, setMoving] = useState(false); const [folder, setFolder] = useState(model.folder_id ?? '');
  const [deleting, setDeleting] = useState(false);
  const ready = model.status === 'ready';

  return (
    <>
      <DropdownMenu>
        <DropdownTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`Actions for ${model.name}`}><MoreHorizontal /></Button></DropdownTrigger>
        <DropdownContent>
          <DropdownItem icon={<FolderOpen />} onSelect={() => nav(`/app/models/${model.id}`)}>Open</DropdownItem>
          {onPreview && <DropdownItem icon={<Eye />} onSelect={onPreview}>Preview</DropdownItem>}
          <DropdownItem icon={<Pencil />} onSelect={() => { setName(model.name); setRenaming(true); }}>Rename</DropdownItem>
          <DropdownItem icon={<Copy />} disabled={!ready} onSelect={async () => {
            try { await http.post(`/models/${model.id}/duplicate`); toast.success('Model duplicated'); await inv('models', 'dashboard', 'me'); } catch (e) { toast.error(errorMessage(e)); }
          }}>Duplicate</DropdownItem>
          <DropdownItem icon={<Download />} disabled={!ready} onSelect={() => downloadModel(model)}>Download GLB</DropdownItem>
          <DropdownItem icon={<FolderInput />} onSelect={() => { setFolder(model.folder_id ?? ''); setMoving(true); }}>Move to folder</DropdownItem>
          <DropdownItem icon={<Star />} onSelect={() => update.mutate({ id: model.id, favorite: !model.favorite })}>{model.favorite ? 'Remove favorite' : 'Add to favorites'}</DropdownItem>
          <DropdownSeparator />
          <DropdownItem icon={<Trash2 />} danger onSelect={() => setDeleting(true)}>Delete</DropdownItem>
        </DropdownContent>
      </DropdownMenu>

      <Dialog open={renaming} onOpenChange={setRenaming} title="Rename model"
        footer={<><Button variant="secondary" onClick={() => setRenaming(false)}>Cancel</Button>
          <Button loading={update.isPending} disabled={!name.trim()} onClick={() => update.mutate({ id: model.id, name: name.trim() }, { onSuccess: () => { setRenaming(false); toast.success('Renamed'); }, onError: (e) => toast.error(errorMessage(e)) })}>Save</Button></>}>
        <Label htmlFor={`rn-${model.id}`}>Name</Label><Input id={`rn-${model.id}`} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
      </Dialog>
      <Dialog open={moving} onOpenChange={setMoving} title="Move to folder"
        footer={<><Button variant="secondary" onClick={() => setMoving(false)}>Cancel</Button>
          <Button loading={update.isPending} onClick={() => update.mutate({ id: model.id, folder_id: folder || null }, { onSuccess: () => { setMoving(false); toast.success('Moved'); } })}>Move</Button></>}>
        <Label htmlFor={`mv-${model.id}`}>Folder</Label>
        <Select id={`mv-${model.id}`} value={folder} onChange={(e) => setFolder(e.target.value)}>
          <option value="">No folder</option>{folders?.items.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </Select>
      </Dialog>
      <ConfirmDialog open={deleting} onOpenChange={setDeleting} danger title={`Delete “${model.name}”?`} confirmLabel="Delete model"
        description="All versions and exports of this model are permanently deleted."
        onConfirm={async () => { await http.del(`/models/${model.id}`); toast.success('Model deleted'); await inv('models', 'dashboard', 'folders', 'me'); }} />
    </>
  );
}
