import { NextResponse } from "next/server";

// Kein Edge-Cache: der Client pollt im Minutentakt, ein ISR-Cache wuerde ihm
// minutenlang dieselben Bytes liefern und den Refresh wirkungslos machen.
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

export async function GET() {
  const base = process.env.N8N_BASE;
  const secret = process.env.N8N_BP_SECRET;

  if (!base || !secret) {
    return NextResponse.json(
      { fehler: "Server nicht konfiguriert (N8N_BASE / N8N_BP_SECRET fehlen)" },
      { status: 500 },
    );
  }

  try {
    const r = await fetch(`${base}/webhook/besucherpuls-status`, {
      headers: { "x-bp-secret": secret },
      cache: "no-store",
      signal: AbortSignal.timeout(25_000),
    });

    if (!r.ok) {
      return NextResponse.json(
        { fehler: `Datenquelle antwortet mit ${r.status}` },
        { status: 502 },
      );
    }

    const daten = await r.json();
    return new NextResponse(JSON.stringify(daten), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store, max-age=0",
      },
    });
  } catch (e) {
    const grund = e instanceof Error && e.name === "TimeoutError" ? "Zeitüberschreitung" : "nicht erreichbar";
    return NextResponse.json({ fehler: `Datenquelle ${grund}` }, { status: 504 });
  }
}
