import { notFound } from "next/navigation";
import type { Metadata } from "next";
import RegionAnsicht from "@/components/RegionAnsicht";
import { REGIONEN, regionFinden } from "@/lib/regionen";

/** Vier Regionen, endlich und bekannt — vorrendern, damit die Seite sofort steht. */
export function generateStaticParams() {
  return REGIONEN.map((r) => ({ slug: r.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const r = regionFinden(slug);
  if (!r) return { title: "Besucherpuls" };
  return {
    title: `${r.frage} — ${r.name} · Besucherpuls`,
    description: r.versprechen,
  };
}

export default async function Seite({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const region = regionFinden(slug);
  if (!region) notFound();
  return <RegionAnsicht region={region} />;
}
