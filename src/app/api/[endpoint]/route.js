import { loadEndpoint } from '@/lib/market-data';

export const dynamic = 'force-dynamic';

export async function GET(_request, { params }) {
  const { endpoint } = await params;
  const data = await loadEndpoint(endpoint);
  if (!data) return Response.json({ error: 'Endpoint tidak dikenal' }, { status: 404 });
  return Response.json(data, { status: data.status === 'unavailable' ? 503 : 200, headers: { 'Cache-Control': 'no-store' } });
}
