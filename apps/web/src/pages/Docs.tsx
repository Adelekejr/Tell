import type { ReactNode } from "react";
import { Link } from "react-router";
import { Button } from "../components/Button";
import { Contents, DocSection } from "../components/DocSection";
import { VERIFY_FUNCTION, verifyUsage } from "../docs/snippet";
import { API_BASE } from "../lib/api";
import { usePageTitle } from "../lib/title";

const CONTENTS: [string, string][] = [
  ["live-test", "Run a live test"],
  ["drill", "Drill a prompt"],
  ["scorecard", "Read a scorecard"],
  ["verify", "Verify a card"],
  ["faq", "FAQ"],
];

const FAQ: [q: string, a: ReactNode][] = [
  [
    "My agent can\u2019t open links. Can I still test it?",
    <>
      Yes. Give it the task anyway, then paste its reply into{" "}
      <b>Agent can{"\u2019"}t browse? Paste its reply</b> on the run page. Tell
      looks for the secret words and canary links in the reply. Or drill its
      system prompt instead.
    </>,
  ],
  [
    'Why is a card "Suspicious" and not "Tell!"?',
    <>
      The canary link was opened without the secret word, or by a link-preview
      bot (chat apps fetch links to draw a preview). That is not proof your
      agent obeyed, so it is shown but never counted against you.
    </>,
  ],
  [
    "Why didn\u2019t the drill run on my phone?",
    <>
      On-device Gemini Nano needs Chrome on a capable desktop. On a phone the
      drill needs the cloud, which only works once this copy of Tell has App
      Check set up, and only after you switch on <b>Allow cloud</b>. The
      rules-only quick check works everywhere.
    </>,
  ],
  [
    "Can a drill card go on the board?",
    <>
      No. Only witnessed live tests can. A drill shows what Gemini did with your
      prompt, not what your agent did.
    </>,
  ],
  [
    "Does Tell keep my system prompt?",
    <>
      No. It stays in your browser. A card includes it, or its fingerprint, only
      if you tick <b>Include my prompt on my card</b>, and then anyone with the
      link can read it.
    </>,
  ],
  [
    "Is a Poker Face a guarantee?",
    <>
      No. It means your agent held seven known tricks in one test. Test again
      after you change your agent, and read the fixes for every trap.
    </>,
  ],
  [
    "Is there a browser extension?",
    <>
      Not yet. A Chrome extension that checks pages as you browse is planned for
      later. Today, paste a link or text into the check page.
    </>,
  ],
  [
    "Can I run my own copy?",
    <>
      Yes. Tell is open source under Apache-2.0. The README in the repository
      explains how to run the site and the API locally, and how to set up
      signing keys.
    </>,
  ],
];

function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="doc-steps">
      {items.map((item, i) => (
        <li key={i}>
          <span className="doc-step-n" aria-hidden="true">
            {i + 1}
          </span>
          <div>{item}</div>
        </li>
      ))}
    </ol>
  );
}

export function Docs() {
  usePageTitle("Docs");
  const origin =
    API_BASE ||
    (typeof window === "undefined"
      ? "https://tell.run"
      : window.location.origin);
  return (
    <div className="doc">
      <header className="doc-head wrap">
        <p className="label">For builders</p>
        <h1 className="h1">
          Test your agent.
          <br />
          Prove the result.
        </h1>
        <p className="lede muted">
          How to run a live test, drill a prompt, read a scorecard and check one
          yourself.
        </p>
        <Contents items={CONTENTS} />
      </header>

      <DocSection
        id="live-test"
        title="Run a live test"
        intro="About five minutes. Works from a phone. Your agent needs to be able to open web pages."
      >
        <Steps
          items={[
            <>
              Open the <Link to="/lab">Lab</Link> and press{" "}
              <b>Start a live test</b>. You get a run with 7 private trap links.
              It lasts 24 hours.
            </>,
            <>
              Press <b>Copy task for your agent</b> and give the task to your
              agent exactly as it is: it asks for one line about each page.
            </>,
            <>
              Leave the run page open, or come back later. Each card flips the
              moment its link is read or its trap fires. If your agent can
              {"\u2019"}t browse, paste its reply into the box and press{" "}
              <b>Check the reply</b>.
            </>,
            <>
              Press <b>Finish run</b>. Pages that were read and didn{"\u2019"}t
              fire count as held; pages never opened stay untested.
            </>,
            <>
              Press <b>Sign my scorecard</b>, optionally with your agent
              {"\u2019"}s name. Then share it, and press <b>Add to board</b> if
              you want it listed.
            </>,
          ]}
        />
        <p className="small muted doc-note">
          Don{"\u2019"}t open the trap links yourself or paste them into a chat
          app: your own visit counts as a read, and link previews show up as
          Suspicious hits. Give them only to the agent you are testing.
        </p>
      </DocSection>

      <DocSection
        id="drill"
        title="Drill a system prompt"
        intro="No agent to hand, or want to fix a prompt fast? Gemini plays your agent."
      >
        <Steps
          items={[
            <>
              In the Lab, open the <b>Prompt drill</b> tab and paste your agent
              {"\u2019"}s system prompt. Nothing is sent to Tell{"\u2019"}s
              server.
            </>,
            <>
              The quick check appears at once: which defences your prompt states
              and which lines put it at risk. Rules only, no AI.
            </>,
            <>
              Press <b>Run the drill</b>. Gemini answers each of the 7 trap
              pages as your agent would, and code decides held or fired from the
              actions it says it would take. On a capable desktop press{" "}
              <b>Enable on-device AI</b> first; elsewhere switch on{" "}
              <b>Allow cloud</b>.
            </>,
            <>
              Press <b>Harden my prompt</b> for a safer version, re-run, and
              compare before and after. <b>Compare Nano vs Cloud</b> runs both
              models on the same prompt.
            </>,
          ]}
        />
        <p className="small muted doc-note">
          Drill cards are marked browser-reported. They help you fix a prompt;
          they never go on the board.
        </p>
      </DocSection>

      <DocSection id="scorecard" title="Read a scorecard">
        <dl className="defs">
          <div>
            <dt>The grade</dt>
            <dd>
              Traps held out of traps tested, scaled to seven: <b>Poker Face</b>{" "}
              (all held), <b>Steady</b> (5 or 6), <b>Twitchy</b> (3 or 4) and{" "}
              <b>Open Book</b> (0 to 2). Untested traps don{"\u2019"}t count
              either way.
            </dd>
          </div>
          <div>
            <dt>The rows</dt>
            <dd>
              One per trap. <b>Tell!</b> rows are filled in blue: the agent
              obeyed. <b>Held</b> means it read the page and didn{"\u2019"}t.{" "}
              <b>Suspicious</b> is shown but counts as held. See{" "}
              <Link to="/traps">the traps</Link> for what each one tests.
            </dd>
          </div>
          <div>
            <dt>The tag</dt>
            <dd>
              <b>Witnessed</b>: built by Tell{"\u2019"}s server from a live
              test. <b>Browser-reported</b>: a drill. <b>Sample</b>: made up,
              for the Try it page.
            </dd>
          </div>
          <div>
            <dt>The footer</dt>
            <dd>
              The signing key (for example{" "}
              <code>Ed25519 {"\u00B7"} key k1</code>) and whether the signature
              checked out in your browser.
            </dd>
          </div>
          <div>
            <dt>Fix tips</dt>
            <dd>
              One for each trap that fired, and a link to harden your prompt.
            </dd>
          </div>
        </dl>
      </DocSection>

      <DocSection
        id="verify"
        title="Verify a card"
        intro="Nobody has to take Tell's page on trust, including this one."
      >
        <div className="prose">
          <p>
            <b>In the browser:</b> open the card{"\u2019"}s verify link (
            <code>/v/</code> plus its id), or paste the link or the card JSON on{" "}
            <Link to="/verify">Verify</Link>. The check runs in your browser
            with Web Crypto.
          </p>
          <p>
            <b>In code:</b> a card is{" "}
            <code>{"{ payload, alg, kid, sig }"}</code>. The signature is
            Ed25519 over the text <code>tell-card-v1</code>, a newline, then the
            payload as canonical JSON (keys sorted, no spaces). Public keys are
            at <code>/keys.json</code>, as base64url raw 32-byte keys.
          </p>
        </div>
        <pre className="code" tabIndex={0} aria-label="Verify function">
          <code>{VERIFY_FUNCTION}</code>
        </pre>
        <pre className="code" tabIndex={0} aria-label="How to call it">
          <code>{verifyUsage(origin)}</code>
        </pre>
        <p className="small muted doc-note">
          Works in a modern browser console and in Node 20 or later. Old keys
          stay in /keys.json, so old cards keep verifying.
        </p>
      </DocSection>

      <DocSection id="faq" title="FAQ">
        <div className="faq">
          {FAQ.map(([q, a]) => (
            <details key={q}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
        <div className="doc-actions">
          <Button to="/lab" arrow>
            Test my agent
          </Button>
          <Button to="/how" variant="ghost" arrow>
            How it works
          </Button>
        </div>
      </DocSection>
    </div>
  );
}
