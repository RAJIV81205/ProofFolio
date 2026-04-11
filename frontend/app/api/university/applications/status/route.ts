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
  } catch (error) {
    return NextResponse.json(
      {
        authorized: false,
        application: null,
        error: error instanceof Error ? error.message : 'Unable to resolve application status.',
      },
      { status: 500 },
    );
  }
}
