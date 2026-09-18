import { Hero } from '../components/home/organisms/Hero/Hero';
import { Trust } from '../components/home/organisms/Trust/Trust';
import { Stats } from '../components/home/organisms/Stats/Stats';
import { Explore } from '../components/home/organisms/Explore/Explore';
import { Services } from '../components/home/organisms/Services';
import { How } from '../components/home/organisms/How';
import { Box } from '../components/common/atoms';

/*
 * One page, in the order somebody reads it.
 *
 * Services and How It Works were their own routes. They are sections here
 * now, and the files moved with them — a component under `pages/` that is
 * never routed to is a page in name only, and the next person to look for
 * what Home renders would not have found them there.
 *
 * Nothing inside either was rewritten: both were already a run of `<Region>`
 * blocks with their own ids, which is what a section is. What changed is that
 * the visitor no longer has to know the site has a Services tab to be told
 * what Lampose does — the answer is under the hero, where the question is
 * asked.
 *
 * The order is the argument: what we run, then the numbers behind it, then
 * how it works for you, then the deck that jumps back to any of it.
 */

export function Home() {
  return (
    <>
      <Hero />
      {/* Claims lead into the figures that back them; places and operational
          facts sit underneath as the follow-through. */}
      <Trust row="claims" />
      <Box className="divider" />
      <Stats />
      <Trust row="places" />
      <Box className="divider" />
      <Services />
      <Box className="divider" />
      <How />
      <Explore />
    </>
  );
}
