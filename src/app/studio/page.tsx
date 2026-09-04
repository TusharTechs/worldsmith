import StudioDashboard from "./StudioClient";

/**
 * Server Actions inherit their execution limit from the page that invokes them, and every
 * long-running action in this product is invoked from the Studio: the planning pipeline, image
 * generation, video generation. Unset, they get the platform default — ten to fifteen seconds on
 * Vercel — which cuts a run off long before an agent chain or a Veo render can finish.
 *
 * 60 is the ceiling on Vercel's Hobby plan and is safe on every plan. On Pro this can go to 300
 * (and higher with fluid compute); raise it there, because a full production still needs longer
 * than a minute and relies on `runDetached` plus the stuck-run reset to survive the gap.
 *
 * Route segment config has to live in a Server Component, which is why the Studio's client
 * component sits in its own file rather than being the page itself.
 */
export const maxDuration = 60;

export default function StudioPage() {
  return <StudioDashboard />;
}
