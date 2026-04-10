import { NextResponse } from 'next/server';
import { getLatestApplicationByWallet, isIssuerAllowed } from '@/lib/server/adminStore';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const walletAddress = (searchParams.get('wallet') ?? '').trim();

  if (!walletAddress) {
    return NextResponse.json({ error: 'Missing wallet query param.' }, { status: 400 });
  }

  try {
    const [authorized, latestApplication] = await Promise.all([
      isIssuerAllowed(walletAddress),
      getLatestApplicationByWallet(walletAddress),
    ]);

    return NextResponse.json({
      authorized,
      application: latestApplication,
    });
  } catch {
    return NextResponse.json({ authorized: false, application: null });
  }
}
