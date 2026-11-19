import { useState } from "react";
import { copyText } from "../lib/copy";
import { CheckIcon, CopyIcon } from "./icons";

/** A quiet 44 px "Copy link" button that says when it worked. */
export function CopyLinkButton({ url, label }: { url: string; label: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <button
      type="button"
      className="btn btn-quiet btn-sm"
      aria-label={label}
      onClick={async () =>
        setState((await copyText(url)) ? "copied" : "failed")
      }
    >
      {state === "copied" ? <CheckIcon /> : <CopyIcon />}
      {state === "copied"
        ? "Copied"
        : state === "failed"
          ? "Couldn\u2019t copy"
          : "Copy link"}
    </button>
  );
}
