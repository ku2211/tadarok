# Live guest API checks — 2026-10-05

Completed at 18:54 Kuwait time (15:54 UTC) against deployed version 26.

Method: two fresh guest cookie sessions, synthetic seeded content, direct HTTP requests from the connected Mac. The hosting access header was supplied; this does not establish anonymous browser access. No secrets, cookies, personal data, or session identifiers are included in this report.

## Passed checks

1. First guest session created successfully.
2. Second guest session created successfully.
3. The sessions received different spaces.
4. Document identifiers did not overlap between sessions.
5. A synthetic document edit was saved successfully.
6. Fresh state retrieval returned the saved text and incremented version.
7. An edit using the old document version was rejected with HTTP 409.
8. Editing the first session's document from the second session was rejected with HTTP 403 or 404.
9. The second session's documents remained unchanged.
10. Export returned valid JSON with an attachment response header.
11. A request without a guest cookie was rejected with HTTP 401 or 403.

All 11 assertions passed in this run. This is a bounded API smoke check, not a security audit or a guarantee of error-free operation.

## Not covered

Registered account roles, physical mobile UI, AI analysis accuracy, scientific review, and the contents/completeness of exported review decisions were not tested in this run. No new AI analysis was invoked.
