/**
 * hCaptcha verification utility.
 * Uses the official hCaptcha siteverify endpoint.
 * GDPR-compliant alternative to reCAPTCHA — no Google data sharing.
 *
 * Test keys (always pass in development):
 *   Site key:   10000000-ffff-ffff-ffff-000000000001
 *   Secret key: 0x0000000000000000000000000000000000000000
 */

export async function verifyCaptcha(token: string | undefined): Promise<boolean> {
  // Allow a named bypass token in development so automated tests and local
  // development don't require solving a CAPTCHA on every request.
  if (process.env.NODE_ENV === 'development' && token === 'dev-bypass') {
    return true;
  }

  if (!token) return false;

  const secret = process.env.HCAPTCHA_SECRET;
  if (!secret) {
    // Missing secret in production is a misconfiguration — fail closed.
    return false;
  }

  try {
    const body = new URLSearchParams({ secret, response: token });

    const res = await fetch('https://hcaptcha.com/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!res.ok) return false;

    const data = (await res.json()) as { success: boolean };
    return data.success === true;
  } catch {
    // Network failure or bad JSON — fail closed rather than allowing bypass.
    return false;
  }
}
