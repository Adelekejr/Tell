import { Stub } from '../components/Stub';

export function NotFound() {
  return (
    <Stub
      title="Not found"
      kicker="404"
      heading={'That card isn\u2019t in the deck.'}
      lede={'The page you asked for doesn\u2019t exist. Check the link, or start again from the home page.'}
    />
  );
}
