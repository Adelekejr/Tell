import { cleanup, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { FIX_TIPS, TRAPS } from "@tell/shared";
import { routes } from "../routes";

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return render(<RouterProvider router={router} />);
}

afterEach(cleanup);

describe("Trap gallery", () => {
  it("lists all seven traps, each linking to its own page", () => {
    renderAt("/traps");
    const links = TRAPS.map((t) =>
      screen.getByRole("link", { name: new RegExp(t.name) }),
    );
    expect(links).toHaveLength(7);
    links.forEach((l, i) =>
      expect(l.getAttribute("href")).toBe(`/traps/${TRAPS[i]!.id}`),
    );
  });

  it.each(TRAPS.map((t) => t.id))(
    "/traps/%s explains the trick, links the demo page and gives the fix",
    (id) => {
      const trap = TRAPS.find((t) => t.id === id)!;
      const { container } = renderAt(`/traps/${id}`);
      expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
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

  it("shows not found for an unknown trap", () => {
    renderAt("/traps/nope");
    expect(screen.getByText("That card isn\u2019t in the deck.")).toBeTruthy();
  });
});

describe("How it works", () => {
  it("draws both flows as real HTML and says the extension is for later", () => {
    const { container } = renderAt("/how");
    expect(container.querySelectorAll("figure.flow")).toHaveLength(2);
    expect(container.querySelector("figure.flow img")).toBeNull();
    expect(container.textContent).toContain("planned for later");
    expect(container.textContent).not.toMatch(/being built|coming soon/i);
  });
});

describe("Docs", () => {
  it("has every section, the verify code and the FAQ", () => {
    const { container } = renderAt("/docs");
    for (const id of ["live-test", "drill", "scorecard", "verify", "faq"]) {
      expect(container.querySelector(`#${id}`)).toBeTruthy();
    }
    expect(container.textContent).toContain("verifyTellCard");
    expect(
      container.querySelectorAll(".faq details").length,
    ).toBeGreaterThanOrEqual(6);
  });
});
