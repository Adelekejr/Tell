import { cleanup, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { FIX_TIPS, TRAPS } from "@tell/shared";
import { routes } from "../routes";
import { RESULT_WORD } from "../card/text";

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return render(<RouterProvider router={router} />);
}

afterEach(cleanup);

describe("Trap gallery", () => {
  it("lists all seven traps, each linking to its own page", async () => {
    renderAt("/traps");
    const links = [];
    for (const t of TRAPS) {
      links.push(await screen.findByRole("link", { name: new RegExp(t.name) }));
    }
    expect(links).toHaveLength(7);
    links.forEach((l, i) =>
      expect(l.getAttribute("href")).toBe(`/traps/${TRAPS[i]!.id}`),
    );
  });

  it.each(TRAPS.map((t) => t.id))(
    "/traps/%s explains the trick, links the demo page and gives the fix",
    async (id) => {
      const trap = TRAPS.find((t) => t.id === id)!;
      const { container } = renderAt(`/traps/${id}`);
      expect((await screen.findByRole("heading", { level: 1 })).textContent).toBe(
        trap.name,
      );
      expect(container.textContent).toContain(FIX_TIPS[id]);
      const demo = screen.getByRole("link", { name: /Open the demo page/ });
      expect(demo.getAttribute("href")).toMatch(
        new RegExp(`/t/demo/${trap.no}$`),
      );
      expect(container.querySelector(".check-split")).toBeTruthy();
    },
  );

  it("shows not found for an unknown trap", async () => {
    renderAt("/traps/nope");
    expect(await screen.findByText("That card isn\u2019t in the deck.")).toBeTruthy();
  });
});

describe("How it works", () => {
  it("draws both flows as real HTML and says the extension is for later", async () => {
    const { container } = renderAt("/how");
    await screen.findByRole("heading", { level: 1 });
    expect(container.querySelectorAll("figure.flow")).toHaveLength(2);
    expect(container.querySelector("figure.flow img")).toBeNull();
    expect(container.textContent).toContain("planned for later");
    expect(container.textContent).not.toMatch(/being built|coming soon/i);
  });
});

describe("Docs", () => {
  it("has every section, the verify code and the FAQ", async () => {
    const { container } = renderAt("/docs");
    await screen.findByRole("heading", { level: 1 });
    for (const id of ["live-test", "drill", "scorecard", "verify", "faq"]) {
      expect(container.querySelector(`#${id}`)).toBeTruthy();
    }
    expect(container.textContent).toContain("verifyTellCard");
    expect(
      container.querySelectorAll(".faq details").length,
    ).toBeGreaterThanOrEqual(6);
  });
});

describe("Evidence wording never overclaims", () => {
  it.each(["/how", "/docs"])("%s says what a hit shows, and not which agent sent it", async (path) => {
    const { container } = renderAt(path);
    await screen.findByRole("heading", { level: 1 });
    const text = container.textContent ?? "";
    expect(text).toMatch(/something holding (the|that) page\u2019s contents sent/);
    expect(text).toMatch(/can\u2019t show which\s+agent/);
    expect(text).not.toMatch(/can\u2019t fake|has read that line and acted on it/);
  });

  it("/how says board names are self-reported", async () => {
    const { container } = renderAt("/how");
    await screen.findByRole("heading", { level: 1 });
    expect(container.textContent).toContain("board names are self-reported");
  });
});

describe("State names match the card", () => {
  it.each(["/how", "/docs", "/verify"])("%s calls an inconclusive hit Suspicious, never Odd", async (path) => {
    const { container } = renderAt(path);
    await screen.findByRole("heading", { level: 1 });
    const text = container.textContent ?? "";
    expect(text).toContain("Suspicious");
    expect(text).not.toMatch(/\bOdd\b/);
  });

  it("the signed card and the live run use the same word", () => {
    expect(RESULT_WORD.suspicious).toBe("Suspicious");
  });
});
