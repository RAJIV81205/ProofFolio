import { NextResponse } from 'next/server';
import { isIssuerAllowed } from '@/lib/server/adminStore';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const walletAddress = (searchParams.get('wallet') ?? '').trim();

  if (!walletAddress) {
    return NextResponse.json({ authorized: false, reason: 'Missing wallet query param.' }, { status: 400 });
  }

  const authorized = await isIssuerAllowed(walletAddress);
  return NextResponse.json({ authorized });
}
