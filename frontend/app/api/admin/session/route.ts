import { NextResponse } from 'next/server';
import { getAdminSessionFromServerCookies } from '@/lib/server/auth';

export async function GET() {
  const session = await getAdminSessionFromServerCookies();

  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json({
    authenticated: true,
    username: session.username,
    expiresAt: new Date(session.exp * 1000).toISOString(),
  });
}
