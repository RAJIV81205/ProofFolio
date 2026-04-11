import { NextResponse } from 'next/server';
import { submitUniversityApplication } from '@/lib/server/adminStore';

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      institutionName?: string;
      officialEmail?: string;
      website?: string;
      accreditationId?: string;
      country?: string;
      city?: string;
      representativeName?: string;
      walletAddress?: string;
      issuerPublicKeyHex?: string;
      supportingNotes?: string;
    };

    const application = await submitUniversityApplication({
      institutionName: body.institutionName ?? '',
      officialEmail: body.officialEmail ?? '',
      website: body.website ?? '',
      accreditationId: body.accreditationId ?? '',
      country: body.country ?? '',
      city: body.city ?? '',
      representativeName: body.representativeName ?? '',
      walletAddress: body.walletAddress ?? '',
      issuerPublicKeyHex: body.issuerPublicKeyHex ?? '',
      supportingNotes: body.supportingNotes ?? '',
    });

    return NextResponse.json({ ok: true, application }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to submit application.' },
      { status: 400 },
    );
  }
}
