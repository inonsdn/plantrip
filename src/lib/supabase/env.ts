function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `ไม่พบค่า ${name} กรุณาตั้งค่า environment variable ตามไฟล์ .env.example`,
    );
  }
  return value;
}

export function supabaseUrl(): string {
  return requireEnv('NEXT_PUBLIC_SUPABASE_URL');
}

export function supabaseAnonKey(): string {
  return requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
}

export function siteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, '');
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}
