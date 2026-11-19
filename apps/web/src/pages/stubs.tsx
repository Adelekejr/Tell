import { useParams } from 'react-router';
import { Stub } from '../components/Stub';

export function Card() {
  const { id } = useParams();
  return (
    <Stub
      title="Scorecard"
      kicker={`Card ${id ?? ''}`.trim()}
      heading="The signed scorecard."
      lede="Seven results, a grade and a signature anyone can check in their own browser."
    />
  );
}

export function Check() {
  return (
    <Stub
      title="Check a page"
      kicker="For everyone"
      heading="What you see, and what your AI reads."
      lede="Paste a link or some text. Tell highlights the lines people can’t see but an AI can."
    />
  );
}

export function Board() {
  return (
    <Stub
      title="Board"
      kicker="Leaderboard"
      heading="No poker faces yet this week."
      lede="Only live-tested agents can be listed. Results come from the server’s own records, never from a browser."
    />
  );
}

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
      kicker="404"
      heading="That card isn’t in the deck."
      lede="The page you asked for doesn’t exist. Check the link, or start again from the home page."
    />
  );
}
