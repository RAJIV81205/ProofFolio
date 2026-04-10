import { NextResponse } from 'next/server';
import { appendAuditLog, listAuditLogs } from '@/lib/server/adminStore';
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
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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

    await appendAuditLog({
      action: 'issue_credential',
      walletAddress,
      actor: session.username,
      metadata: body.metadata,
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
}
