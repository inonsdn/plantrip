import 'server-only';
import { headers } from 'next/headers';

/**
 * Absolute origin to build shareable links from.
 *
 * Taken from the incoming request first, so a link always points at the domain
 * the user is actually on and cannot be left pointing somewhere stale.
 *
 * VERCEL_URL is deliberately last: it is the *per-deployment* hostname
 * (project-git-branch-org.vercel.app), which Vercel Deployment Protection
 * guards, so an invitation built from it lands on Vercel's login page instead
 * of the app. VERCEL_PROJECT_PRODUCTION_URL is the stable production domain and
 * is preferred over it.
 *
 * Kept out of supabase/env.ts because next/headers is unavailable in the proxy
 * (Edge) bundle, which imports that module.
 */
export async function requestOrigin(): Promise<string> {
  const headerList = await headers();
  const host = headerList.get('x-forwarded-host') ?? headerList.get('host');

  if (host) {
    const forwardedProto = headerList.get('x-forwarded-proto');
    const protocol =
      forwardedProto ?? (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https');
    return `${protocol}://${host}`;
  }

  const configured = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.SITE_URL;
  if (configured?.trim()) return configured.trim().replace(/\/$/, '');

  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}
