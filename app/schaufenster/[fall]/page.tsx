import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Ansicht from "@/components/Ansicht";
import { SCHAUFENSTER } from "@/lib/types";

/** Die drei Fälle sind bekannt und endlich — vorrendern, damit die Seite sofort steht. */
export function generateStaticParams() {
  return SCHAUFENSTER.map((s) => ({ fall: s.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ fall: string }>;
}): Promise<Metadata> {
  const { fall } = await params;
  const s = SCHAUFENSTER.find((x) => x.slug === fall);
  if (!s) return { title: "Besucherpuls" };
  return { title: `${s.titel} — Besucherpuls`, description: s.frage };
}

export default async function Seite({ params }: { params: Promise<{ fall: string }> }) {
  const { fall } = await params;
  const fenster = SCHAUFENSTER.find((s) => s.slug === fall);
  if (!fenster) notFound();
  return <Ansicht fenster={fenster} />;
}
