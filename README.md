# ResumeProof — On-chain AI Resume Verification (GenLayer)

ResumeProof lets anyone submit a resume with public evidence links and have GenLayer's
AI validators independently cross-check every claim, reach consensus, and write the
verdict permanently into an intelligent contract.

- **Network:** GenLayer Studio (Studionet, chain ID `61999` / `0x1c32f`)
- **RPC:** `https://studio.genlayer.com/api`
- **Deployed contract:** `0x631A140ACF4A0982376961E31fB3492479985756`
- **Wallet:** MetaMask (auto add/switch to the Studio network)

---

## 1. One-line description

ResumeProof is a GenLayer intelligent-contract app where AI validators independently
verify resume claims against public evidence links and record a consensus-backed,
tamper-proof verdict on-chain.

## 2. What it does, who it's for, why it's useful

### What it does

A user (candidate, recruiter, or employer) submits three things: a candidate name, the
resume text/claims, and public evidence links (LinkedIn, GitHub, portfolio). The
submission is written on-chain by a MetaMask-signed `submit_resume` transaction.

Anyone can then trigger `verify_with_ai` on that submission. Inside the intelligent
contract, GenLayer's non-deterministic block runs an LLM prompt that fetches and reads
the supplied public evidence, compares it claim-by-claim with the resume text, and
produces a structured JSON verdict:

```json
{
  "verified": true,
  "confidence": 0.86,
  "matched_claims": ["Maintainer of open-source project X"],
  "unsupported_claims": ["Led the payments rewrite at ACME"],
  "summary": "Engineering claims are corroborated by the GitHub profile; the ACME role could not be confirmed from the provided links."
}
```

Multiple validators run that reasoning independently. The verdict is only accepted and
written to storage when validators agree under GenLayer's equivalence-principle
consensus — a single hallucinating model cannot mint a verdict. Once stored, the verdict
and its evidence links are public, immutable and auditable by anyone reading the
contract, with no dependency on ResumeProof's own servers.

The frontend reads contract state directly (`get_total`, `get_submission`) so the list of
submissions and verdicts is rendered from the chain itself, not from a database.

### Who it's for

- **Job candidates** who have real, verifiable work — open-source contributions, shipped
  products, public writing — and want a portable proof of it that a recruiter can check in
  seconds instead of taking on faith.
- **Recruiters and hiring teams** drowning in AI-generated resumes. Screening now costs
  more than it used to because generated text is fluent, plausible and cheap. ResumeProof
  moves the question from "does this read well?" to "is it supported by evidence?"
- **Employers and background-check / talent-marketplace operators** who need a neutral,
  auditable verification trail they didn't produce themselves, and therefore can't be
  accused of fabricating or quietly editing.
- **Communities, DAOs, grant programs and bounty platforms** that award work or funding
  based on claimed experience and need a lightweight, public credibility signal.

### What makes it useful

**Verification is the bottleneck, not writing.** Anyone can produce a polished resume in
30 seconds. Confirming it still takes a human reading LinkedIn, opening GitHub, and
guessing. ResumeProof automates exactly that reading step.

**The judgment happens inside the contract.** This is what GenLayer makes possible and a
normal EVM chain does not: the contract itself performs a web-reading, natural-language
judgment call. There is no oracle to trust, no off-chain worker to bribe, no API server
that can silently change its answer. The reasoning is part of consensus.

**Non-determinism is handled, not ignored.** LLMs disagree with themselves. GenLayer's
optimistic democracy has a leader propose the verdict and validators independently
re-derive it; disagreement means no verdict is written. That turns a fuzzy model output
into a result multiple independent parties endorsed.

**The output is nuanced, not a stamp.** The verdict separates matched claims from
unsupported claims and attaches a confidence score. An unsupported claim is not an
accusation of lying — it's an honest "the provided evidence doesn't cover this," which is
the information a recruiter actually needs.

**It's portable and permissionless.** The verdict is a public on-chain record tied to the
submission, readable by any employer, marketplace or agent, without ResumeProof staying
alive as a company. No account, no login, no vendor lock-in — just a wallet.

**It's cheap and fast relative to the alternative.** Formal background checks cost tens to
hundreds of dollars and take days. This runs in one transaction and covers the specific
class of claims that public evidence can settle: repos, projects, publications, public
roles.

**Honest scope.** ResumeProof verifies claims *against the public evidence supplied*. It
does not confirm private employment records, salary, or NDA-covered work. That boundary is
visible in the UI — an unverified claim is reported as unsupported, not as false.

## 3. Expected verification outcome (proof the path works)

Submit a resume with real links and press "Verify with AI". Expected: MetaMask signs
`submit_resume` on chain 61999, the tx reaches ACCEPTED, and the submission appears with
"Awaiting verification". After `verify_with_ai` is accepted, the same card flips to
"Claims supported" / "Claims disputed" and renders a validator-consensus JSON verdict —
confidence score, matched claims, unsupported claims, summary — read back from
`get_submission` on contract `0x631A1...985756`, proving on-chain AI consensus end to end.

---

## 4. Architecture

```text
Browser (React + TanStack Start)
  ├─ src/routes/index.tsx        UI: submit form, submissions list, verdict cards
  ├─ src/hooks/use-wallet.ts     MetaMask detect / connect / add+switch Studionet
  ├─ src/components/WalletButton MetaMask connect + network switch control
  └─ src/lib/genlayer.ts         genlayer-js client, reads + MetaMask-signed writes
                                   │
                                   ▼  JSON-RPC https://studio.genlayer.com/api
                        GenLayer Studio (chain 61999)
                                   │
                    contracts/resume_verifier.py  ← intelligent contract
                      • submit_resume(role, name, text, links_json)
                      • verify_with_ai(id)   ← non-deterministic LLM block + consensus
                      • get_total / get_submission / is_verified  (views)
```

### Contract interface

| Method | Kind | Args | Returns |
| --- | --- | --- | --- |
| `submit_resume` | write | `submitter_role: str, candidate_name: str, resume_text: str, links: str (JSON)` | — |
| `verify_with_ai` | write | `submission_id: str` | — |
| `get_total` | view | — | `int` |
| `get_submission` | view | `submission_id: str` | `str` (JSON) |
| `is_verified` | view | `submission_id: str` | `bool` |

State is kept as a single JSON string (`state_json`) inside contract storage, loaded and
saved via `_load()` / `_save()` — this keeps the contract schema simple enough for the
Studio schema loader while supporting arbitrary nested submission records.

## 5. Running locally

Requirements: Node.js 20+, MetaMask in the browser.

```sh
npm install
npm run dev      # http://localhost:8080
```

Other scripts: `npm run build`, `npm run preview`, `npm run lint`, `npm run format`.

No environment variables and no backend are required — the app talks straight to the
GenLayer Studio RPC. To point at a different deployment, change `CONTRACT_ADDRESS` in
`src/lib/genlayer.ts`.

## 6. Using the app

1. Click **Connect MetaMask**. If you're not on GenLayer Studio, the app offers **Switch to
   Studio** and will add chain `61999` for you.
2. Choose whether you're submitting as candidate, recruiter or employer.
3. Enter the candidate name and the resume claims (minimum 20 characters), plus at least
   one public link — the verdict quality depends entirely on the evidence you provide.
4. Press **Submit on-chain** and approve in MetaMask. The app polls until the transaction
   is `ACCEPTED` (every 4s, up to ~6 minutes).
5. On the new card, press **Verify with AI** and approve. Validators run, reach consensus,
   and the verdict renders on the card.
6. **Refresh** re-reads contract state at any time.

## 7. Deploying the contract

Open `contracts/resume_verifier.py` in [GenLayer Studio](https://studio.genlayer.com),
deploy it, and copy the resulting address into `CONTRACT_ADDRESS` in
`src/lib/genlayer.ts`. The contract requires its version/`Depends` header to be the very
first lines, immediately followed by `from genlayer import *` — inserting comments between
them makes the Studio schema loader fail with `absent_runner_comment`.

## 8. Project layout

```text
contracts/resume_verifier.py   GenLayer intelligent contract (Python)
src/lib/genlayer.ts            chain config, typed reads/writes, verdict parsing
src/hooks/use-wallet.ts        MetaMask lifecycle
src/components/WalletButton.tsx
src/components/ui/*            shadcn/ui primitives
src/routes/__root.tsx          shell, metadata, toaster, dark theme
src/routes/index.tsx           the application page
src/styles.css                 Tailwind v4 theme tokens (dark slate / signal green)
src/assets/resumeproof-logo.png
```

## 9. Stack

TanStack Start v1 · React 19 · TypeScript · Vite 7 · Tailwind CSS v4 · shadcn/ui ·
TanStack Query · sonner · genlayer-js 1.1.8 · GenLayer Studio (Python intelligent
contract).

## 10. Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| "Connect MetaMask first" | Wallet not connected, or the site was reloaded without an authorized account. |
| Transaction never confirms | Studio consensus can take minutes; the client polls 90× every 4s. Check the tx in GenLayer Studio. |
| Wrong network | Use **Switch to Studio**; MetaMask must be on chain `61999`. |
| Empty submissions list | `get_total` is 0 on that contract — submit the first resume. |
| Contract schema won't load in Studio | A comment between the header and `from genlayer import *`, or unsupported type hints (`typing.Any`) in public methods. |

## 11. Limitations

- Verifies only against the public links provided; private employment history is out of
  scope.
- LLM reading of a page can be shallow; confidence is a signal, not a guarantee.
- Studio is a test network — submissions are public and may be reset by the network.
- No identity binding yet: the contract records who submitted (wallet), not that the
  wallet *is* the candidate.
