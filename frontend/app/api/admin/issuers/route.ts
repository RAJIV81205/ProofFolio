import { NextResponse } from 'next/server';
import {
  addAllowedIssuer,
  listAllowedIssuers,
  removeAllowedIssuer,
  listAuditLogs,
} from '@/lib/server/adminStore';
import { getAdminSessionFromServerCookies } from '@/lib/server/auth';

async function requireAdmin() {
  const session = await getAdminSessionFromServerCookies();
  if (!session) {
    return null;
  }
  return session;
}

export async function GET() {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [issuers, logs] = await Promise.all([listAllowedIssuers(), listAuditLogs()]);
  return NextResponse.json({ issuers, logs: logs.slice(0, 20) });
}

export async function POST(req: Request) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = (await req.json()) as { walletAddress?: string };
    const walletAddress = (body.walletAddress ?? '').trim();
    if (!walletAddress) {
      return NextResponse.json({ error: 'walletAddress is required.' }, { status: 400 });
    }

    const issuers = await addAllowedIssuer(walletAddress, session.username);
    return NextResponse.json({ ok: true, issuers });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to add issuer.' },
      { status: 400 },
    );
  }
}

export async function DELETE(req: Request) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = (await req.json()) as { walletAddress?: string };
    const walletAddress = (body.walletAddress ?? '').trim();
    if (!walletAddress) {
      return NextResponse.json({ error: 'walletAddress is required.' }, { status: 400 });
    }

    const issuers = await removeAllowedIssuer(walletAddress, session.username);
    return NextResponse.json({ ok: true, issuers });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to remove issuer.' },
      { status: 400 },
    );
  }
}
