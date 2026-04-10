import { redirect } from 'next/navigation';
import { getAdminSessionFromServerCookies } from '@/lib/server/auth';
import UniversityClient from './university-client';

export default async function UniversityPage() {
  const session = await getAdminSessionFromServerCookies();
  if (!session) {
    redirect('/admin/login?next=/university');
  }

  return <UniversityClient adminUsername={session.username} />;
}
