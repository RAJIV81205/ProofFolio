import { redirect } from 'next/navigation';
import { getAdminSessionFromServerCookies } from '@/lib/server/auth';
import AdminPanelClient from './panel-client';

export default async function AdminPage() {
  const session = await getAdminSessionFromServerCookies();
  if (!session) {
    redirect('/admin/login?next=/admin');
  }

  return <AdminPanelClient username={session.username} />;
}
