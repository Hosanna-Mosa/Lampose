import Hero, { Trust } from '../components/HomeHero';
import { Explore, Stats } from '../components/HomeSections';

export default function Home() {
  return (
    <>
      <Hero />
      {/* Claims lead into the figures that back them; places and operational
          facts sit underneath as the follow-through. */}
      <Trust row="claims" />
      <div className="divider" />
      <Stats />
      <Trust row="places" />
      <div className="divider" />
      <Explore />
    </>
  );
}
