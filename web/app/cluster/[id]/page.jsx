import Detail from "./detail";

// Static export needs the routes ahead of time; cluster ids are c1..cN.
export function generateStaticParams() {
  return Array.from({ length: 8 }, (_, i) => ({ id: `c${i + 1}` }));
}

export default async function ClusterPage({ params }) {
  const { id } = await params;
  return <Detail id={id} />;
}
