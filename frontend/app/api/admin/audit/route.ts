import { NextResponse } from 'next/server';
import { appendAuditLog, isIssuerAllowed, listAuditLogs } from '@/lib/server/adminStore';
import { getAdminSessionFromServerCookies } from '@/lib/server/auth';

async function requireAdmin() {
  const session = await getAdminSessionFromServerCookies();
  if (!session) return null;
  return session;
}

export async function GET() {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const logs = await listAuditLogs();
  return NextResponse.json({ logs: logs.slice(0, 40) });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      action?: 'issue_credential';
      walletAddress?: string;
      metadata?: {
        degreeType?: number;
        graduationYear?: number;
        institutionId?: number;
        txHash?: string;
        commitmentHex?: string;
      };
    };

    if (body.action !== 'issue_credential') {
      return NextResponse.json({ error: 'Invalid action.' }, { status: 400 });
    }

    const walletAddress = (body.walletAddress ?? '').trim().toLowerCase();
    if (!walletAddress) {
      return NextResponse.json({ error: 'walletAddress is required.' }, { status: 400 });
    }

    const session = await requireAdmin();
    if (!session) {
      const approvedIssuer = await isIssuerAllowed(walletAddress);
      if (!approvedIssuer) {
        return NextResponse.json(
          { error: 'Unauthorized. Wallet is not an approved university issuer.' },
          { status: 401 },
        );
      }
    }

    await appendAuditLog({
      action: 'issue_credential',
      walletAddress,
      actor: session?.username ?? `issuer:${walletAddress.slice(0, 10)}`,
      metadata: body.metadata,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Invalid request body.' },
      { status: 400 },
    );
  }
}
