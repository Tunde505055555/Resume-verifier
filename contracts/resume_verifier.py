# v0.2.16
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *

import json


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
            }
        )
        self._save(submissions)
        return str(submission_id)

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
    def get_total(self) -> int:
        return len(self._load())

    @gl.public.write
    def verify_with_ai(self, submission_id: str) -> str:
        """
        Runs decentralized AI consensus over the submitted resume + links.
        Validators independently fetch the linked pages and reach consensus
        on whether the claims in the resume are supported by public evidence.
        Returns the verdict as a JSON string.
        """
        try:
            index = int(submission_id)
        except ValueError:
            raise gl.vm.UserError("submission_id must be an integer string")
        submissions = self._load()
        if index < 0 or index >= len(submissions):
            raise gl.vm.UserError("Unknown submission")
        data = submissions[index]
        if bool(data.get("verified", False)):
            raise gl.vm.UserError("Already verified")
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

            evidence = "\n\n".join(evidence_parts) if evidence_parts else "[no links provided]"

            task = f"""
You are an impartial hiring validator. Verify whether the following resume
is supported by the public evidence gathered from the candidate's links.

Candidate: {candidate_name}

Resume:
{resume_text}

Public evidence:
{evidence}

Return STRICT JSON with keys:
  "verified": boolean,
  "confidence": number between 0 and 1,
  "matched_claims": array of strings,
  "unsupported_claims": array of strings,
  "summary": short string
"""
            result = gl.nondet.exec_prompt(task).replace("```json", "").replace("```", "").strip()
            # Validate that the model returned parseable JSON, but return a string
            # so the equivalence principle compares a stable, serializable value.
            return json.dumps(json.loads(result))

        verdict = gl.eq_principle.prompt_comparative(
            run_consensus,
            "Both outputs must agree on the boolean `verified` field and roughly agree on which claims are supported.",
        )

        data["verdict"] = verdict
        data["verified"] = True
        submissions[index] = data
        self._save(submissions)
        return verdict
