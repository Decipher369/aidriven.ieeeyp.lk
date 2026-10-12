import Summit from "../components/summit/Summit";
const title = "AIDSL 2026 Summit — The AI Future Thinks Here";
const description =
  "A one-day gathering bringing together AI experts, innovators, startups, academia, industry and policymakers to shape Sri Lanka’s AI future.";
export const metadata = {
  title,
  description,
  openGraph: { title, description, type: "website" },
  twitter: { card: "summary", title, description },
};
export default function SummitPage() {
  return (
    <>
      <link
        rel="preload"
        href="/models/aidsl-logo.glb"
        as="fetch"
        crossOrigin="anonymous"
      />
      <link rel="preload" href="/graphics/aidsl-ecosystem.webp" as="image" />
      <Summit />
    </>
  );
}
