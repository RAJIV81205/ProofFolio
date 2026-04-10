import { NextResponse } from 'next/server';
import { getAdminSessionFromServerCookies } from '@/lib/server/auth';
import { listUniversityApplications, reviewUniversityApplication } from '@/lib/server/adminStore';

async function requireAdmin() {
  const session = await getAdminSessionFromServerCookies();
  return session ?? null;
}

export async function GET() {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [pending, reviewed] = await Promise.all([
    listUniversityApplications('pending'),
    listUniversityApplications(),
  ]);

  return NextResponse.json({
    pending,
    reviewed: reviewed.filter((item) => item.status !== 'pending').slice(0, 40),
  });
}

export async function PATCH(req: Request) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = (await req.json()) as {
      applicationId?: string;
      decision?: 'approved' | 'rejected';
      reviewNote?: string;
    };

    if (!body.applicationId || !body.decision) {
      return NextResponse.json(
        { error: 'applicationId and decision are required.' },
        { status: 400 },
      );
    }

    const application = await reviewUniversityApplication({
      applicationId: body.applicationId,
      actor: session.username,
      decision: body.decision,
      reviewNote: body.reviewNote,
    });

    return NextResponse.json({ ok: true, application });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to review application.' },
      { status: 400 },
    );
  }
}
