# v0.3.0
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *

import json

# ---------------------------------------------------------------------------
# VERIFIER AUTHORIZATION POLICY (explicit, on-chain, readable via get_policy)
#
#   Verification is PERMISSIONLESS BY DESIGN: any wallet may call
#   verify_with_ai on any submission that has not yet been finalized.
#   This is safe because the caller does not author the verdict -- the verdict
#   is produced by validator consensus inside the non-deterministic block, so a
#   caller can only pay to trigger the reading of evidence, never influence it.
#
#   Finality rules that make permissionlessness safe:
#     1. One-shot: a submission can be finalized exactly once. A second
#        verify_with_ai on a finalized submission is rejected (UserError).
#     2. Immutable: once finalized, verdict / verified / verifier / claim sets
#        can never be rewritten by any caller, including the submitter.
#     3. Attributed: the triggering wallet is recorded as `verifier` so any
#        reader can see who paid for finalization.
#     4. Malformed verdicts do not finalize: if consensus output fails schema
#        validation the transaction reverts and the submission stays open.
# ---------------------------------------------------------------------------

POLICY = (
    "permissionless-verifier: any wallet may trigger verification; "
    "verdict authored by validator consensus, not by the caller; "
    "finalization is one-shot, immutable and attributed to the calling wallet"
)


class ResumeVerifier(gl.Contract):
    # Keep the persistent schema deliberately simple. GenLayer's schema loader
    # reliably supports scalar storage fields; the JSON document contains the
    # submissions, verdicts, and verification state.
    state_json: str

    def __init__(self) -> None:
        self.state_json = "[]"

    def _load(self) -> list:
        return json.loads(self.state_json)

    def _save(self, submissions: list) -> None:
        self.state_json = json.dumps(submissions)

    @gl.public.write
    def submit_resume(
        self,
        submitter_role: str,
        candidate_name: str,
        resume_text: str,
        links: str,
    ) -> str:
        submissions = self._load()
        submission_id = len(submissions)
        submissions.append(
            {
                "id": submission_id,
                "submitter_role": submitter_role,
                "candidate_name": candidate_name,
                "resume_text": resume_text,
                "links": links,
                "verdict": "",
                "verified": False,
                "finalized": False,
                "submitter": str(gl.message.sender_address),
                "verifier": "",
            }
        )
        self._save(submissions)
        return str(submission_id)

    @gl.public.view
    def get_policy(self) -> str:
        return POLICY

    @gl.public.view
    def get_submission(self, submission_id: str) -> str:
        try:
            index = int(submission_id)
        except ValueError:
            return ""
        submissions = self._load()
        if index < 0 or index >= len(submissions):
            return ""
        return json.dumps(submissions[index])

    @gl.public.view
    def get_verdict(self, submission_id: str) -> str:
        try:
            index = int(submission_id)
        except ValueError:
            return ""
        submissions = self._load()
        if index < 0 or index >= len(submissions):
            return ""
        return str(submissions[index].get("verdict", ""))

    @gl.public.view
    def is_verified(self, submission_id: str) -> bool:
        try:
            index = int(submission_id)
        except ValueError:
            return False
        submissions = self._load()
        if index < 0 or index >= len(submissions):
            return False
        return bool(submissions[index].get("verified", False))

    @gl.public.view
    def is_finalized(self, submission_id: str) -> bool:
        try:
            index = int(submission_id)
        except ValueError:
            return False
        submissions = self._load()
        if index < 0 or index >= len(submissions):
            return False
        return bool(submissions[index].get("finalized", False))

    @gl.public.view
    def get_verifier(self, submission_id: str) -> str:
        try:
            index = int(submission_id)
        except ValueError:
            return ""
        submissions = self._load()
        if index < 0 or index >= len(submissions):
            return ""
        return str(submissions[index].get("verifier", ""))

    @gl.public.view
    def get_total(self) -> int:
        return len(self._load())

    @gl.public.write
    def verify_with_ai(self, submission_id: str) -> str:
        """
        Runs decentralized AI consensus over the submitted resume + links.
        Permissionless: any wallet may call this on a submission that is not
        yet finalized (see POLICY). Finalization is one-shot and immutable.
        """
        try:
            index = int(submission_id)
        except ValueError:
            raise gl.vm.UserError("submission_id must be an integer string")
        submissions = self._load()
        if index < 0 or index >= len(submissions):
            raise gl.vm.UserError("Unknown submission")
        data = submissions[index]
        if bool(data.get("finalized", False)) or bool(data.get("verified", False)):
            raise gl.vm.UserError(
                "Submission already finalized; verdicts are immutable"
            )
        links = data.get("links", "{}")
        resume_text = data.get("resume_text", "")
        candidate_name = data.get("candidate_name", "")

        def run_consensus() -> str:
            evidence_parts = []
            try:
                link_map = json.loads(links)
            except Exception:
                link_map = {}
            if not isinstance(link_map, dict):
                link_map = {}

            for label, url in link_map.items():
                if not url:
                    continue
                try:
                    page = gl.nondet.web.render(url, mode="text")
                    evidence_parts.append(f"### {label} ({url})\n{page[:4000]}")
                except Exception as e:
                    evidence_parts.append(f"### {label} ({url})\n[unavailable: {e}]")

            evidence = (
                "\n\n".join(evidence_parts) if evidence_parts else "[no links provided]"
            )

            task = f"""
You are an impartial hiring validator. Verify whether the following resume
is supported by the public evidence gathered from the candidate's links.

Candidate: {candidate_name}

Resume:
{resume_text}

Public evidence:
{evidence}

Rules you MUST follow so that independent validators produce comparable output:
- Quote each claim you list using the wording of the resume, one claim per entry.
- Every claim in the resume must appear in exactly one of the two claim arrays.
- "verified" is true only if every materially important claim is supported.
- "confidence" must be reported in steps of 0.1 (0.0, 0.1, ... 1.0) and must be
  >= 0.6 when "verified" is true and <= 0.5 when it is false.
- "summary" must be one or two sentences that state the same conclusion as
  "verified" and name the decisive evidence.

Return STRICT JSON with keys:
  "verified": boolean,
  "confidence": number between 0 and 1,
  "matched_claims": array of strings,
  "unsupported_claims": array of strings,
  "summary": short string
"""
            raw = (
                gl.nondet.exec_prompt(task)
                .replace("```json", "")
                .replace("```", "")
                .strip()
            )
            return json.dumps(_normalize_verdict(raw))

        verdict = gl.eq_principle.prompt_comparative(
            run_consensus,
            """Compare the two JSON verdicts field by field. They are equivalent ONLY if ALL of the following hold:
1. `verified` is identical in both.
2. `confidence` values differ by no more than 0.2, and both sit on the same side of 0.5 as `verified`.
3. `matched_claims` describe the same set of resume claims: every claim in one has a semantic counterpart in the other (wording may differ, order is irrelevant), and neither contains a supported claim the other omits.
4. `unsupported_claims` likewise describe the same set of claims, and no claim is listed as matched in one output and unsupported in the other.
5. `summary` states the same overall conclusion and cites the same decisive evidence; a summary that contradicts the other's reasoning is NOT equivalent.
Any difference in field presence, type, or the direction of a claim's classification makes the outputs non-equivalent.""",
        )

        # Re-validate the consensus result before it becomes final state. A
        # malformed verdict reverts the transaction and leaves the submission
        # open for another attempt instead of finalizing garbage.
        checked = _normalize_verdict(verdict)

        data["verdict"] = json.dumps(checked)
        data["verified"] = bool(checked["verified"])
        data["finalized"] = True
        data["verifier"] = str(gl.message.sender_address)
        submissions[index] = data
        self._save(submissions)
        return data["verdict"]


def _normalize_verdict(raw: str) -> dict:
    """Parse, validate and canonicalize a verdict so that comparison and
    stored state are both structural rather than free text."""
    try:
        parsed = json.loads(raw)
    except Exception:
        raise gl.vm.UserError("Verdict was not valid JSON")
    if not isinstance(parsed, dict):
        raise gl.vm.UserError("Verdict must be a JSON object")

    if not isinstance(parsed.get("verified"), bool):
        raise gl.vm.UserError("Verdict field `verified` must be a boolean")
    verified = bool(parsed["verified"])

    confidence = parsed.get("confidence")
    if not isinstance(confidence, (int, float)) or isinstance(confidence, bool):
        raise gl.vm.UserError("Verdict field `confidence` must be a number")
    confidence = float(confidence)
    if confidence < 0.0 or confidence > 1.0:
        raise gl.vm.UserError("Verdict field `confidence` must be within 0..1")
    # Quantize to 0.1 steps so validators do not disagree over noise.
    confidence = round(round(confidence * 10) / 10, 1)
    if verified and confidence < 0.6:
        confidence = 0.6
    if not verified and confidence > 0.5:
        confidence = 0.5

    def claims(key: str) -> list:
        value = parsed.get(key, [])
        if not isinstance(value, list):
            raise gl.vm.UserError(f"Verdict field `{key}` must be an array")
        cleaned = []
        for item in value:
            if not isinstance(item, str):
                raise gl.vm.UserError(f"Verdict field `{key}` must contain strings")
            text = " ".join(item.split()).strip()
            if text and text not in cleaned:
                cleaned.append(text)
        return sorted(cleaned)

    matched = claims("matched_claims")
    unsupported = claims("unsupported_claims")
    if not matched and not unsupported:
        raise gl.vm.UserError("Verdict must classify at least one claim")

    summary = parsed.get("summary", "")
    if not isinstance(summary, str) or not summary.strip():
        raise gl.vm.UserError("Verdict field `summary` must be a non-empty string")

    return {
        "verified": verified,
        "confidence": confidence,
        "matched_claims": matched,
        "unsupported_claims": unsupported,
        "summary": " ".join(summary.split()).strip(),
    }
