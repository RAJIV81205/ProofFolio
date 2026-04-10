import { NextResponse } from 'next/server';
import {
  ADMIN_SESSION_COOKIE,
  createAdminSessionToken,
  getAdminSessionTtlSeconds,
  getAdminUsername,
  verifyAdminCredentials,
} from '@/lib/server/auth';

async function parseLoginBody(req: Request): Promise<{ username: string; password: string }> {
  const contentType = req.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    const body = (await req.json()) as { username?: string; password?: string };
    return {
      username: (body.username ?? '').trim(),
      password: body.password ?? '',
    };
  }

  if (
    contentType.includes('application/x-www-form-urlencoded') ||
    contentType.includes('multipart/form-data')
  ) {
    const form = await req.formData();
    return {
      username: String(form.get('username') ?? '').trim(),
      password: String(form.get('password') ?? ''),
    };
  }

  throw new Error('Unsupported Content-Type. Expected JSON or form data.');
}

export async function POST(req: Request) {
  try {
    const { username, password } = await parseLoginBody(req);

    if (!username || !password) { 
      return NextResponse.json({ error: 'Username and password are required.' }, { status: 400 });
    }

    if (!verifyAdminCredentials(username, password)) {
      return NextResponse.json(
        {
          error:
            'Invalid credentials, or ADMIN_PASSWORD_SHA256 is not configured in frontend/.env.local.',
        },
        { status: 401 },
      );
    }

    const token = createAdminSessionToken(getAdminUsername());
    const response = NextResponse.json({ ok: true, username: getAdminUsername() });

    response.cookies.set({
      name: ADMIN_SESSION_COOKIE,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: getAdminSessionTtlSeconds(),
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Login failed.' },
      { status: 400 },
    );
  }
}
