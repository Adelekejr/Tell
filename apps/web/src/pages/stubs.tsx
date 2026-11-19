import { Stub } from '../components/Stub';

export function Traps() {
  return (
    <Stub
      title="Traps"
      kicker="The hand"
      heading="Seven ways a page lies."
      lede="Each trap, with a normal view and an X-ray view that reveals the hidden line."
    />
  );
}

export function How() {
  return (
    <Stub
      title="How it works"
      kicker="How it works"
      heading="Code decides. Not an AI."
      lede="How the traps, canary links and signed cards work, what stays private, and what Tell can’t do."
    />
  );
}

export function Docs() {
  return (
    <Stub
      title="Docs"
      kicker="For builders"
      heading="Trap specs and the card format."
      lede="Proof levels, the signed card format, a verify-in-code snippet and a fix guide."
    />
  );
}

export function NotFound() {
  return (
    <Stub
      title="Not found"
      building={false}
      kicker="404"
      heading="That card isn’t in the deck."
      lede="The page you asked for doesn’t exist. Check the link, or start again from the home page."
    />
  );
}
