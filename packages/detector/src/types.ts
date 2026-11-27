import type { TrapId } from '@tell/shared';

export type Severity = 'info' | 'low' | 'medium' | 'high';

export type RuleId =
  | 'hidden-css'
  | 'html-comment'
  | 'unicode-tags'
  | 'variation-selectors'
  | 'zero-width'
  | 'split-words'
  | 'bidi-controls'
  | 'base64-payload'
  | 'url-fragment'
  | 'image-exfiltration'
  | 'fake-role'
  | 'ai-order'
  | 'attribute-text';

export interface Finding {
  rule: RuleId;
  /** Which of the seven traps this trick belongs to. */
  trap: TrapId;
  severity: Severity;
  /**
   * A strong finding is decided by the rule alone and can never be
   * overruled by a model's explanation.
   */
  strong: boolean;
  /** One plain-English sentence. */
  message: string;
  /** A short, safe-to-display excerpt. Invisible characters are made visible. */
  evidence: string;
  /** Text the rule uncovered (decoded base64, smuggled letters, URL fragment). */
  revealed?: string;
  /** Why the text is hidden, for hidden-css findings. */
  hiddenBy?: HiddenReason;
}

export type HiddenReason =
  | 'display-none'
  | 'visibility-hidden'
  | 'hidden-attribute'
  | 'transparent'
  | 'zero-size'
  | 'off-screen'
  | 'same-colour'
  | 'clipped'
  | 'screen-reader-only'
  /** Never drawn: <noscript>, <template>, SVG <title> and <desc>. */
  | 'not-rendered'
  /** Inside a closed <details> box (everything but its <summary>). */
  | 'collapsed';

export interface ScanInput {
  /** A full or partial HTML document. */
  html?: string;
  /** Plain text, such as something pasted into an AI chat. */
  text?: string;
  /** The page's own address; its #fragment is checked too. */
  url?: string;
}

export interface ScanResult {
  findings: Finding[];
  /** True when at least one finding is strong. */
  strong: boolean;
  /** Highest severity among the findings, or null when there are none. */
  highest: Severity | null;
}
