import { describe, expect, it } from "vitest";
import { DEMO_KEY, SAMPLE_CARD } from "@tell/shared";
import { VERIFY_FUNCTION, verifyUsage } from "./snippet";

type Verify = (card: unknown, keys: unknown[]) => Promise<boolean>;
const verifyTellCard = new Function(
  `${VERIFY_FUNCTION}\nreturn verifyTellCard;`,
)() as Verify;

describe("the verify snippet on /docs", () => {
  it("verifies a real signed card with its public key", async () => {
    expect(await verifyTellCard(SAMPLE_CARD, [DEMO_KEY])).toBe(true);
  });

  it("fails a card with one changed value, and a card whose key is unknown", async () => {
    const edited = {
      ...SAMPLE_CARD,
      payload: {
        ...SAMPLE_CARD.payload,
        score: { ...SAMPLE_CARD.payload.score, held: 7 },
      },
    };
    expect(await verifyTellCard(edited, [DEMO_KEY])).toBe(false);
    expect(await verifyTellCard(SAMPLE_CARD, [])).toBe(false);
  });

  it("shows how to fetch the keys and a card from the site it is on", () => {
    expect(verifyUsage("https://example.test", "abc")).toContain(
      "fetch(TELL + '/api/card/abc')",
    );
  });
});
