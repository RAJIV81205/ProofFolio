import { NextResponse } from 'next/server';
import path from 'node:path';
import { readFile } from 'node:fs/promises';

export const runtime = 'nodejs';

const CONTRACT_ARTIFACTS_DIR = path.resolve(
  process.cwd(),
  '..',
  'contracts',
  'managed',
  'credential_verifier',
);

function isValidKind(kind: string): kind is 'keys' | 'zkir' {
  return kind === 'keys' || kind === 'zkir';
}

function isValidArtifactName(kind: 'keys' | 'zkir', artifact: string): boolean {
  if (artifact !== path.basename(artifact)) return false;

  if (kind === 'keys') {
    return /^[A-Za-z0-9_-]+\.(prover|verifier)$/.test(artifact);
  }

  return /^[A-Za-z0-9_-]+\.bzkir$/.test(artifact);
}

type RouteParams = {
  kind: string;
  artifact: string;
};

type RouteContext = {
  params: Promise<RouteParams>;
};

export async function GET(_req: Request, context: RouteContext) {
  const { kind, artifact } = await context.params;

  if (!isValidKind(kind)) {
    return NextResponse.json({ error: 'Invalid artifact category.' }, { status: 400 });
  }

  if (!isValidArtifactName(kind, artifact)) {
    return NextResponse.json({ error: 'Invalid artifact filename.' }, { status: 400 });
  }

  const filePath = path.join(CONTRACT_ARTIFACTS_DIR, kind, artifact);

  try {
    const fileData = await readFile(filePath);
    return new NextResponse(fileData, {
      status: 200,
      headers: {
        'content-type': 'application/octet-stream',
        'cache-control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Artifact not found.' }, { status: 404 });
  }
}
