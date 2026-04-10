import { NextResponse } from 'next/server';
import { isIssuerAllowed } from '@/lib/server/adminStore';
import { getAdminSessionFromServerCookies } from '@/lib/server/auth';

export async function GET(req: Request) {
  const session = await getAdminSessionFromServerCookies();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const walletAddress = (searchParams.get('wallet') ?? '').trim();

  if (!walletAddress) {
    return NextResponse.json({ authorized: false, reason: 'Missing wallet query param.' }, { status: 400 });
  }

  const authorized = await isIssuerAllowed(walletAddress);
  return NextResponse.json({ authorized });
}
