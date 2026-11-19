# Security

Tell is a safety tool, so we take reports seriously.

- **Report a problem privately** through GitHub's "Report a vulnerability" button on this repository (Security tab). Please don't open a public issue for security bugs.
- **No secrets live in this repository.** Firebase web settings are read from environment variables, and server keys (the Firebase service account and the scorecard signing key) exist only in Vercel's environment settings. CI runs a secret scan on every push.
- **Trap pages are harmless.** They contain hidden instructions on purpose, but those instructions only ask an agent to visit a Tell canary link with a made-up word. They never ask for personal data.
