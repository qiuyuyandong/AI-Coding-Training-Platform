# Compliance Notes

The product uses this rule: use browser session, do not extract browser session.

Allowed in V1:

- store problem IDs, titles, tags, difficulty, source URLs, and user training records;
- open original OJ pages through deep links;
- detect user-visible page and submission events through a user-installed browser extension;
- keep captured training records local by default.

Not allowed in V1:

- bypass login, captcha, paywalls, anti-bot systems, or access controls;
- store platform passwords;
- upload platform session cookies;
- cache LeetCode, NowCoder, or Luogu full statements by default;
- run server-side crawlers against commercial OJ platforms.
