import { PageHeader } from '@/components/ui/misc';
import { useMe } from '@/hooks/queries';
export default function DashboardPage() {
  const { data: me } = useMe();
  return <PageHeader title={`Welcome to Vistora 3D${me?.full_name ? `, ${me.full_name.split(' ')[0]}` : ''}`} description="From Every Angle to Every Detail." />;
}
