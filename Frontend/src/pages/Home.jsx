import { Hero } from '../components/home/organisms/Hero/Hero';
import { Trust } from '../components/home/organisms/Trust/Trust';
import { Stats } from '../components/home/organisms/Stats/Stats';
import { Explore } from '../components/home/organisms/Explore/Explore';
import { Box } from '../components/common/atoms';

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
      <Explore />
    </>
  );
}
