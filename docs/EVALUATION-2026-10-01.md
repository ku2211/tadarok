# Synthetic development evaluation history

Entries below record observations in order, including failures and earlier results. Later runs do not erase earlier measurements. The current Arabic status is in `docs/VALIDATION-STATUS-2026-10-01.md`.

## Additional synthetic evaluation — first run before context-v2

Ten synthetic Arabic documents, matched against the pre-existing SHA-256 answer key. All ten hashes matched. No human review had changed the exported verdicts.

- Model: gpt-4.1-mini-2025-04-14, pre-context-v2.
- Run: a0f063ff-4d71-4f24-9f18-3d92c4815384.
- Completed: 2026-09-30T22:44:15.004Z.
- TP 5, TN 2, FP 3, FN 0, uncertain 0.
- Correct classifications: 7/10. Alert precision: 5/8. Recall: 5/5.
- False positives: A01 (cancelled version), A05 (correction executed), A10 (warning against the error).
- Processing duration: 6.948 seconds, not human time saved.
- A07 verdict was correct, but its explanation incorrectly claimed the document contained no attribution; it actually contained corrected attribution.

These are synthetic development examples authored by the same assistant building the product. They are not an independent evaluation or a scholarly validation, and cannot establish general accuracy. The earlier 20-document development result must not be presented as general 100% accuracy.

## Context-v2 change

Classify the present editorial state first, derive the review verdict on the server, and require source evidence for already-corrected and historical/rejected states. Give the model the complete document in addition to indexed passages. Preserve exact source quotation and existing completeness/version checks. Unclear current status remains uncertain. Mixed documents with a remaining old claim remain affected.

Unit and mocked API tests check contracts and validation only. They do not prove semantic model accuracy. A live rerun of these now-seen cases is regression testing; fresh independent material is still needed. Do not overwrite the original export or its baseline metrics.

## Observed context-v2 rerun of A01–A10

Run `28bd153c-16e1-40cc-b8ea-183dcea33819` started 2026-09-30T22:56:39.594Z, elapsed 7.270 seconds. All ten document hashes matched the frozen key. TP 5, TN 5, FP 0, FN 0; no uncertain verdicts or human edits. A07's explanation also now acknowledges the corrected attribution. This is a regression result on previously seen examples, not independent validation. The audit event records context-v2; the old runs table recorded only the model. Claims-v3 fixes this metadata discrepancy for future runs.

## Fresh synthetic context test B01–B12 under context-v2

Run `f2e8e8ae-7bbf-4e77-8b18-efd62b6a4543` started 2026-09-30T23:06:41.495Z, elapsed 9.015 seconds. All 12 document hashes matched the pre-run key; no human changes. Classification correct 10/12: detected 3/5 affected, correctly cleared 4/4 unaffected, correctly abstained on 3/3 uncertain. Missed B04 (indirect weekday expression) and B09 (replacement rejected while old date remains asserted). No false positive alerts. This operational scheduling example tests context only, not religious source accuracy. It was authored by the builder and is not independent.

## Claims-v3-dual implementation

- Extract subject relation, stance toward the **old claim**, stance toward the **replacement**, and current-version certainty as separate fields.
- Server derives verdicts; a currently asserted old claim remains affected even if the replacement is rejected or a different section is corrected.
- Inconsistent fields produce uncertain; missing or fabricated evidence invalidates the run.
- Deterministic, explicit anchored weekday equivalents are supplementary hints only; original text remains unchanged. No date is inferred from the current date.
- Two readings of the source with distinct focus, using the same configured model and without sharing answers. Verdict disagreement produces uncertain. Both readings must finish with complete, grounded results; otherwise previous findings remain active.
- Two provider requests per run increase token usage; no quality or speed claim is made in advance. Usage totals include both calls. This is an agreement check, not an independent model evaluation; both readings can still make the same semantic error.
- The versioned engine, both structured readings, and disagreements are saved in the audit event; future run rows also carry the policy version.
- 28 local unit/mocked-provider tests passed, plus API + SQLite workflow tests including dual-analysis persistence and failed-verification preservation. These validate implementation, not live model accuracy.
- A live regression test of A and B is still required after deploying claims-v3-dual. No post-change semantic accuracy has been measured yet.


## Observed claims-v3-dual result and labeling correction

Run `acefd945-61e7-4a6f-8283-bb730f2d8816` started 2026-09-30T23:20:20.220Z, elapsed 9.211 seconds. All 12 hashes matched. Both readings agreed on every verdict. Against the original frozen B key: 11/12 correct, 4/5 affected detected, 4/4 unaffected correctly cleared, 3/3 uncertain correctly identified. B09 was fixed; B04 was still cleared. Usage: 5,226 input tokens, 2,140 output tokens across two calls. No human edits.

**Label-quality issue discovered after inspection:** B04 names a definition/outreach team receiving visitors, with a matching day and time, but does not explicitly identify the same introductory meeting. Its original `affected` label presumed identity beyond the text. A defensible prospective label is `uncertain`, pending human adjudication. Keep the original 11/12 score and original key; do not retrospectively re-score this run or claim improved accuracy by changing its label. Claims-v4 will require evidence for subject exclusion and abstain when shared details lack sufficient identity. Revised key is versioned separately as `evaluation/context-test-v2-key.json`. Neither key is independent expert ground truth.

B12 retained the correct affected verdict, but both explanations treated a machine-directed instruction as editorial rejection. Claims-v4 explicitly separates these and still derives the verdict from the actual old claim in the first sentence.

Claims-v4-identity adds structured relation basis and shared-detail evidence. A missing exact name cannot justify a decisive exclusion when relevant details overlap. An explicit distinct event can still be cleared, with a source passage supporting that distinction. Unit/mocked-provider tests validate these guards only; live semantic behavior remains to be measured.

## Observed claims-v4 failure and claims-v5 schema repair

The user screenshot at 2026-10-01 02:27 Kuwait time showed a failed scan and the prior findings still visible. The production worker log at 2026-09-30T23:27:04.905Z confirms HTTP 502: the provider omitted a required context witness (`passage_index=-1`). The log does not identify the document, so this failure cannot be attributed specifically to B04. No new semantic score is available from this attempt.

The request's old JSON Schema allowed `-1` for every context while server validation correctly allowed it only for unrelated content. Prompt instructions did not enforce that conditional rule. Claims-v5-evidence-schema uses two nested `anyOf` branches: a nonnegative source-passage index, or exactly `different_claim` + `no_relevant_content` + no shared detail + old claim absent + replacement not mentioned + index `-1`. This prevents the invalid combination at generation time; the existing server checks still reject unknown or duplicate document IDs, missing results, fabricated indices, and absent required evidence. No witness is guessed, no invalid claim is downgraded into a successful result, and no extra provider requests are added.

This uses the supported nested `anyOf` subset documented at https://developers.openai.com/api/docs/guides/structured-outputs (checked 2026-09-30). Both source readings, grounding requirements and human review remain in place. The UI now explicitly says that findings retained after a failed scan belong to the last successful scan.

Validation: 33 local unit/mocked-provider tests passed, including schema validation by Ajv against missing-identity, historical, explicit-other-subject, and contradictory no-witness cases. The API + SQLite regression also reproduced an invalid missing-witness provider response and confirmed preservation of the previous successful run and findings. TypeScript checking passed. These checks validate the contract and persistence, not live provider acceptance or semantic accuracy. A live rerun is still required after deployment; original scores and keys remain unchanged.

## Observed claims-v5 failure and completed regression

Run `ac1f12b4-d1df-4a7b-b17f-5579ac658211` started 2026-09-30T23:39:44.065Z and failed after 12.087 seconds. The worker log reported that evidence could not be linked to its source document. That guard covers unknown document IDs or noninteger indices; raw output was not retained, so the exact offending field is not known. The immediate export still contained the previous client state and omitted this new failed run. The subsequent export included it.

The user's next attempt, run `e29d5e87-869a-4d7f-a9c8-d95c8159be3b`, started 2026-09-30T23:41:21.356Z and completed in 11.034 seconds under `gpt-4.1-mini-2025-04-14 / claims-v5-evidence-schema`. All 12 document hashes match the frozen corpus and every document remains version 1, with no human edit/review events. Both readings agreed on all verdicts. Usage was 6,126 input tokens and 2,441 output tokens across both calls.

- Original key: 10/12 correct; 4/5 affected detected, 3/4 unaffected correctly cleared, 3/3 uncertain recognized. B02 is a false positive; B04 remains incorrectly cleared.
- Revised development key: also 10/12, but with 4/4 affected, 3/4 unaffected, and 3/4 uncertain correct. This separate comparison does not replace the original score.
- B02's explanation correctly describes cancellation of the old date, but both structured readings label that old date `asserted_now`, producing a contradictory affected verdict.
- B04 still invents a distinct event; both readings select `explicit_other_subject` despite the source not establishing a different event.
- B01, B07 and B12 retain correct final verdicts but include unsupported rejection fields or wording. A repeated same-model agreement is insufficient to establish semantic correctness.

## Claims-v6-bound-documents

Each provider response now fills a required named slot for every input document. Database IDs are retained only on the server and cannot be generated by the model. The schema limits the source-passage index to that particular document's range and preserves the restricted no-witness branch. Runtime checks still reject missing/extra slots, extra fields, invalid indices, and missing evidence. Reordered result keys and repeated document titles cannot change identity mapping. The UI refreshes server state after a failed attempt so an immediate export contains the failed run.

Evidence index and a concise user-facing interpretation precede the classification fields. Instructions explicitly require the interpretation and old-claim stance to agree, distinguish partial execution from rejection, and prohibit inferring a distinct event from a missing name. The default pinned model is now `gpt-4.1-2025-04-14`; this is a model-selection change requiring live evaluation, not evidence that accuracy improved. It costs more per token than mini; two bounded requests and aggregated usage remain unchanged. The existing key is reused, with no credential or access-policy changes. The configured OPENAI_MODEL still overrides the default.

35 unit/mocked-provider tests pass, along with TypeScript and API + SQLite regressions. The contract tests use Ajv, exercise required per-document slots and per-document evidence bounds, and reproduce malformed provider responses while preserving the previous successful findings. No live result is yet available for this revision. No answer-key text is sent to the model.

## Observed claims-v6 regression, version 11

Run `5baa4383-756d-4f30-a51b-ecc8105984da` started 2026-09-30T23:54:10.430Z, after version 11 was published at 23:53:31.846Z. It completed successfully in 7.553 seconds under `gpt-4.1-2025-04-14 / claims-v6-bound-documents`. Source: user export `tadarok-review-report (1)(1).json`, exported 23:54:22.791Z. All 12 document hashes match the corpus, all quotations are exact source substrings, and no human edits/reviews occurred. Both readings agreed on every final verdict. Usage: 11,842 input tokens and 1,960 output tokens across both requests.

- Original frozen key: 12/12 matched — 5 affected, 4 unaffected, 3 uncertain.
- Revised development key: 11/12 matched — 4/4 affected, 4/4 unaffected, 3/4 uncertain. B04 was marked affected, rather than uncertain. Do not omit this revised-key discrepancy or describe the result as general 100% accuracy.
- B02 is correctly cleared after the source cancels the old date and applies the new one. The missing-witness/source-link failures did not recur in this particular completed run.
- B04 remains a semantic limitation: the explanation identifies the same introductory meeting although the source only names a team receiving visitors at a matching time. It is a potential connection requiring human adjudication; neither the original label nor this output establishes event identity.
- B12's visible explanation now refers to the actual invitation without treating the machine-directed instruction as editorial rejection. However, the raw `replacement_stance` field remains `rejected` in B01, B04, B07 and B12, where absence/partial execution would be more defensible. Those fields do not change these affected verdicts, but must not be presented as fully validated annotations.

At this point, successful live execution of the new contract and model had been verified on B only; A01–A10 had not been rerun since context-v2. These are repeated builder-authored development examples, not a new independent evaluation. Keep every original export and score; do not repeat runs merely to select a favorable result.

## Observed claims-v6 regression of A01–A10, version 11

Run `2c3ac51a-9b4f-4faf-8380-f177a97d89c5` started 2026-10-01T00:00:14.055Z (03:00:14 Kuwait) and completed in 9.716 seconds under `gpt-4.1-2025-04-14 / claims-v6-bound-documents`. Source: user export `tadarok-review-report (2)(1).json`, exported 2026-10-01T00:00:39.578Z; file SHA-256 `df7b819151f8780192a4e5e00a6658a929f37fc52dea13c9572dca39cc46f655`.

- All 10 document hashes match the unchanged, pre-existing A key. Every document remains version 1, and all findings belong to this run and match the current document version.
- No human edit/review events, reviewer decisions, or review notes appear. All findings remain pending human review.
- Final classifications match 10/10: TP 5, TN 5, FP 0, FN 0, uncertain 0. A02, A04, A06, A08 and A09 are affected; A01, A03, A05, A07 and A10 are unaffected.
- All 10 selected quotations are exact substrings of their source document. This establishes source fidelity, not that each isolated sentence is sufficient evidence. A02 and A05 select short references to preceding content; assessing them requires the surrounding document.
- Both readings agree on the final verdicts. The absence of verdict disagreements does not imply agreement on every extracted field: A02 and A09 have `not_mentioned` in the first reading and unsupported `rejected` in the second. Neither text explicitly rejects the correction. A03 also differs on version certainty, which does not affect the unrelated-content verdict. The raw readings remain in the original export.
- The visible explanations correctly distinguish cancellation (A01), executed correction (A05), an unrelated person's name (A07), a rejected proposal (A08), partial correction (A09), and warning about an error (A10). The unsupported internal rejection fields in A02/A09 are a remaining annotation limitation despite correct final classification.
- Usage: 10,738 input tokens and 1,730 output tokens across both requests. Processing duration is not measured reviewer time saved.

This confirms that the latest deployed revision preserves the final A classifications on a known regression corpus. It does not establish religious-source correctness, independent accuracy, or absence of future errors. B04 remains unresolved against the revised B key. No algorithm or corpus was changed in response to this export; preserve the deployment and evaluation history while preparing the human-review workflow and submission evidence.


## Claims-v7-review-guards: reproduced defects and bounded repair

A source review found persistence defects beyond the model annotations. Local regressions exercised the actual API handlers against SQLite with a controlled concurrent write at the relevant await boundary. Before repair, five cases incorrectly returned HTTP 200: an old review dialog overwrote a newer decision; a review was saved after its run was superseded; a library expanded during analysis was marked fully completed; concurrent additions allowed the demo to overflow capacity; and an edit tied to a superseded finding changed the document. The same five regressions pass after repair. A sixth test verifies the atomic 40-correction limit and absence of phantom audit events; that limit was repaired before its regression was run.

Changes:

- Review/edit requests carry the document version, finding status and last review timestamp seen by the user. The guarded write checks those values and the active run again inside the atomic batch. A unique event ID binds a review decision to its audit entry. Review timestamps advance even when two requests occur in the same millisecond.
- Analysis completion checks both all snapshot document versions and the current library size. A changed library retains the prior successful run and records `analysis_invalidated`, not `analysis_finished`. The UI also reports new/changed materials missing from the last scan.
- Correction creation and demo insertion enforce limits inside the write transaction; unsuccessful insertions do not create orphan findings, runs or audit events. Demo creation is idempotent under competing requests.
- The findings view exposes the complete current material for checking short source witnesses in context.

The observed unsupported `replacement_stance=rejected` on currently asserted old claims is removed from the response contract. In that branch only `not_assessed` is permitted: replacement status is unnecessary for this decision and is not inferred. For other old-claim states the replacement field retains its defined meaning. Both JSON Schema and server validation reject forbidden combinations; no response is silently rewritten into a successful result, and historical exports remain intact.

The server treats `paraphrased_same_subject` as uncertain and compares the structured subject/stance indicators across the two readings, even if their final verdicts agree. Different age labels for genuinely unrelated content do not create a false disagreement. These are conservative review rules, not proof that a model will always extract the correct subject or stance. They can increase abstentions. In particular, B04 is still awaiting a live run on this revision; the local rule must not be described as a confirmed live semantic fix.

Validation: 44 unit/schema/mocked-provider/guard tests passed, plus the existing real-handler API + SQLite workflow and TypeScript checks. Three new claim-safety regressions first failed against the old contract/policy, then passed after the change. No production semantic result has yet been measured for claims-v7. Previous A/B scores belong to version 11 only. This remains pre-challenge work and must be disclosed accordingly.


## Observed claims-v7 regression, version 12

Two authenticated browser runs were performed with no human edits or review decisions. The exported documents still match every frozen SHA-256, all source witnesses are exact substrings, and all documents/findings remain at version 1.

- B: run `bbc75280-bcbe-4f18-b75e-f1c0707b6b54`, started 2026-10-01T00:50:20.614Z, 8.305 seconds. Original key: 11/12; revised key: 12/12. B04 now abstains. Four affected, four unaffected, four uncertain. Despite correct final labels against the revised key, B08's generated reason says Tuesday while its source says Thursday. This is an observed factual error, not a clean pass.
- A: run `0c659452-2836-4c4e-a185-badd7ded3386`, started 2026-10-01T00:52:13.552Z, 8.557 seconds. 6/10 matches, with all five affected retained, one unaffected (A03), and four unnecessary abstentions (A01, A05, A07, A10). In one or both readings these already-corrected materials were mislabeled `different_claim` alongside historical/applied stances. The conservative guards exposed the contradictory annotations. They were not silently accepted.
- Export hashes: A `f5ca9daa8610265ec2ce46f1fba811cab2f396726535dffcde17e4d490c733a2`; B `31483bd36a051f7c680477eae1a1e71986caf155bc18dc19622a831aeb3fd4a4`.

## Claims-v8-bounded-evidence

The provider contract no longer accepts free-form `reason`. The server builds both visible and audit explanations from bounded state labels, alongside the verbatim source witness. Thus a generated narrative cannot introduce a weekday, name or quotation absent from that source. This does not prove that the model selected the correct state or witness. Historical exports remain unchanged, including their observed errors.

`relation` now explicitly means subject identity regardless of whether the text asserts, retracts, warns about or corrects the claim. The schema forbids `different_claim` alongside a historical old claim or an applied replacement. It also separates the unclear-subject and related-subject branches and disallows irrelevant-content claims with shared details. The conservative runtime uncertainty/disagreement gates remain in place; no result is silently repaired into a decisive label. No evaluation keys, case identifiers or expected labels are passed to the model or embedded in the decision rules.

47 local unit/schema/guard tests, API + SQLite, and TypeScript pass. The bounded-explanation regressions were run before and after the code change. Live semantic results for this revision are still pending; previous results must not be attributed to it.


## Observed claims-v8 regression, version 13

After deployment at 2026-10-01T01:07:31.142688Z, two more authenticated live runs were recorded without human edits or decisions. All frozen document hashes and literal evidence checks pass.

- A: `6c29d713-f043-459a-bd69-e4db93ade1a8`, 01:08:16.101Z, 4.663 seconds, 10/10 final classifications. Usage: 20,690 input / 1,002 output tokens. A07 is correctly unaffected, but both readings annotate the old claim as historical even though it is absent. The resulting bounded explanation repeats that unsupported fine distinction. This remains a known annotation defect despite matching the final answer key.
- B: `d17c718f-6680-48ba-94ec-e3ff4c98c312`, 01:09:05.517Z, 4.756 seconds, original key 11/12 / revised key 12/12. Usage: 23,746 input / 1,188 output tokens. B08 now uses an explanation of distinct subject identity without inventing a weekday. B04 remains uncertain. Both runs preserve their raw annotations and prior run history.

## Claims-v9-minimal-stance

The old-claim annotation now asks only whether the material currently asserts it: `asserted_now`, `not_asserted_now`, or `unclear`. It no longer distinguishes absence from historical/denied mention; that distinction was unnecessary for the product's task and was incorrectly extracted in A07. A material explicitly not asserting the old claim can be unaffected; an unknown version, unresolved subject, conflicting readings, rejected replacement, or unclear/proposed implementation still abstains. Full text and literal evidence remain available for the human decision. Historical logs are not rewritten.

This is an extraction-contract change, not post-hoc repair of a case's label. No case title or expected answer is used by the algorithm. The explanation describes only current assertion and correction status; it does not claim the old text was present historically or entirely absent. 48 local tests, API + SQLite, and TypeScript pass. A live rerun of this contract is pending.


## Observed claims-v9 regression, version 14

B run `9fa921ac-680f-4a63-b417-9d3c973a9fa4`, started 2026-10-01T01:15:36.512Z, completed in 4.687 seconds. Final classifications match 10/12 original / 11/12 revised. B08 was unnecessarily uncertain: both readings correctly identify a distinct subject, but one marks `shared_detail=false` and the other `true`. The equal-status comparison treated this irrelevant annotation as a reason to abstain. This is retained as an observed regression. No A run was performed for version 14; it must not borrow version 13's score.

## Claims-v10-scoped-fields

For a subject explicitly identified as different, `shared_detail` must now be `null` (not assessed) in both the provider schema and server validator. Once that identity difference is established, extracting similarity details adds no decision value and caused the observed unnecessary abstention. Other branches still require a boolean, and identity/stance disagreements still abstain. The raw previous run is retained; its result was not rewritten. A targeted regression failed on version 14 and passed after this change. 49 local tests plus API + SQLite and TypeScript pass. Live validation is pending.


## Observed claims-v10 regression, version 15

Version 15 (commit `cb78aa326a161bdf719b1d3affba46ca439317d9`, deployment `appgdep_6abdb53cc61c819195262fca86e0b32a`) was published at 2026-10-01T01:20:24.578903Z. Both runs below were executed through the authenticated browser UI. All document hashes match the frozen corpus, all documents/findings remain at version 1, every quotation is a literal source substring, and all findings remain pending with no human decisions before scoring.

- A: `0a377e2e-12fd-4a10-9bd8-8034cd2ac144`, 01:21:10.301Z, 4.572 seconds. 10/10 final classifications: 5 affected, 5 unaffected. Usage 20,770 input / 998 output tokens. A07 now correctly annotates only non-assertion of the old claim and application of the correction, without the unsupported historical-mention claim. Export SHA-256: `f62147e0a829862b8abc83ed58f6be0d728f37da31865d7ea6685151d97d5435`.
- B: `fc9ee972-0911-404d-abc3-fbc06e3437d1`, 01:21:46.674Z, 5.460 seconds. 11/12 original, 12/12 revised: 4 affected, 4 unaffected, 4 uncertain. Usage 23,818 input / 1,183 output tokens. B08 is unaffected in both readings and its irrelevant shared-detail field is null; no extra weekday appears in the bounded explanation. B04 still requires human adjudication of subject identity. Export SHA-256: `a5b5ba03575dd1db6b1d6e4653f0895c3a0c5474eb78ea56fb09a317f70d0b8c`.

The results and original/revised per-case expectations are in `evaluation/live-v15-summary.json`. These were repeated development cases, not held-out or independently adjudicated examples. A same-model agreement is not independent validation. Four B cases deliberately remain uncertain; a correct abstention is not a completed human review. The browser screenshot shows full source context and pending human controls, not a human approval fabricated by the assistant. No attempt was made to improve scores through manual decisions or select a favorable rerun of unchanged code. Previous failed and regressed runs remain in the record.

Known reproduced defects were addressed and checked, with 49 local tests, the real-handler API + SQLite workflow, TypeScript, a successful build/deployment, and these two live runs. This does not establish zero undiscovered defects, general accuracy, independently verified source correctness, repeatability across unseen cases, or final submission readiness. Human validation, reviewer-time measurement, judge access, and the required submission materials remain separate work.
