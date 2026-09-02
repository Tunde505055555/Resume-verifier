import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  BadgeCheck,
  ExternalLink,
  Loader2,
  RefreshCw,
  
  Sparkles,
} from "lucide-react";

import logo from "@/assets/resumeproof-logo.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WalletButton } from "@/components/WalletButton";
import { useWallet } from "@/hooks/use-wallet";
import {
  CONTRACT_ADDRESS,
  getSubmissions,
  parseVerdict,
  submitResume,
  verifyWithAI,
  type Submission,
} from "@/lib/genlayer";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ResumeProof — On-chain AI Resume Verification" },
      {
        name: "description",
        content:
          "Submit a resume and let GenLayer validators cross-check every claim against public evidence. Verdicts stored on-chain, signed with MetaMask.",
      },
      { property: "og:title", content: "ResumeProof — On-chain AI Resume Verification" },
      {
        property: "og:description",
        content:
          "AI validators verify resume claims against public links and record the verdict on GenLayer Studio.",
      },
    ],
  }),
  component: Index,
});

const EMPTY_FORM = {
  submitterRole: "candidate",
  candidateName: "",
  resumeText: "",
  linkedin: "",
  github: "",
  portfolio: "",
};

function Index() {
  const wallet = useWallet();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY_FORM);

  const submissions = useQuery({
    queryKey: ["submissions"],
    queryFn: getSubmissions,
    refetchOnWindowFocus: false,
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!wallet.address) throw new Error("Connect MetaMask first");
      const links: Record<string, string> = {};
      if (form.linkedin) links["LinkedIn"] = form.linkedin;
      if (form.github) links["GitHub"] = form.github;
      if (form.portfolio) links["Portfolio"] = form.portfolio;
      return submitResume(wallet.address, {
        submitterRole: form.submitterRole,
        candidateName: form.candidateName.trim(),
        resumeText: form.resumeText.trim(),
        links,
      });
    },
    onSuccess: () => {
      toast.success("Resume recorded on-chain");
      setForm(EMPTY_FORM);
      void queryClient.invalidateQueries({ queryKey: ["submissions"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const verifyMutation = useMutation({
    mutationFn: async (id: number) => {
      if (!wallet.address) throw new Error("Connect MetaMask first");
      return verifyWithAI(wallet.address, id);
    },
    onSuccess: () => {
      toast.success("Validators reached consensus");
      void queryClient.invalidateQueries({ queryKey: ["submissions"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const canSubmit =
    wallet.isConnected &&
    form.candidateName.trim().length > 1 &&
    form.resumeText.trim().length > 20 &&
    !submitMutation.isPending;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15">
              <img
                src={logo}
                alt="ResumeProof logo"
                width={1024}
                height={1024}
                className="h-6 w-6"
              />
            </div>
            <div className="leading-tight">
              <p className="text-sm font-semibold tracking-tight">ResumeProof</p>
              <p className="font-mono text-[11px] text-muted-foreground">
                {CONTRACT_ADDRESS.slice(0, 10)}…{CONTRACT_ADDRESS.slice(-6)}
              </p>
            </div>
          </div>
          <WalletButton
            address={wallet.address}
            connecting={wallet.connecting}
            hasProvider={wallet.hasProvider}
            onStudioNetwork={wallet.onStudioNetwork}
            connect={wallet.connect}
            switchNetwork={wallet.switchNetwork}
          />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-10">
        <section className="mb-10">
          <Badge variant="outline" className="mb-4 gap-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            GenLayer Studio Network
          </Badge>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
            Resume claims, verified by AI validators — not by trust.
          </h1>
          <p className="mt-4 max-w-2xl text-base text-muted-foreground">
            Submit a resume with public links. GenLayer validators independently read that
            evidence, compare it to the claims, and only agree on a verdict when their
            findings match. Every verdict is written to the intelligent contract.
          </p>
        </section>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,420px)_1fr]">
          <Card className="h-fit">
            <CardHeader>
              <CardTitle className="text-lg">Submit a resume</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Submitting as</Label>
                <Select
                  value={form.submitterRole}
                  onValueChange={(value) => setForm({ ...form, submitterRole: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="candidate">Candidate</SelectItem>
                    <SelectItem value="recruiter">Recruiter</SelectItem>
                    <SelectItem value="employer">Employer</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="candidate">Candidate name</Label>
                <Input
                  id="candidate"
                  value={form.candidateName}
                  onChange={(e) => setForm({ ...form, candidateName: e.target.value })}
                  placeholder="Ada Lovelace"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="resume">Resume / claims</Label>
                <Textarea
                  id="resume"
                  rows={7}
                  value={form.resumeText}
                  onChange={(e) => setForm({ ...form, resumeText: e.target.value })}
                  placeholder="Senior engineer at ACME (2021-2024), led the payments rewrite, maintainer of open-source project X…"
                />
              </div>

              <Separator />

              <div className="grid gap-3">
                <div className="space-y-2">
                  <Label htmlFor="linkedin">LinkedIn URL</Label>
                  <Input
                    id="linkedin"
                    value={form.linkedin}
                    onChange={(e) => setForm({ ...form, linkedin: e.target.value })}
                    placeholder="https://linkedin.com/in/…"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="github">GitHub URL</Label>
                  <Input
                    id="github"
                    value={form.github}
                    onChange={(e) => setForm({ ...form, github: e.target.value })}
                    placeholder="https://github.com/…"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="portfolio">Portfolio / other</Label>
                  <Input
                    id="portfolio"
                    value={form.portfolio}
                    onChange={(e) => setForm({ ...form, portfolio: e.target.value })}
                    placeholder="https://…"
                  />
                </div>
              </div>

              <Button
                className="w-full gap-2"
                disabled={!canSubmit}
                onClick={() => submitMutation.mutate()}
              >
                {submitMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {submitMutation.isPending
                  ? "Awaiting consensus…"
                  : wallet.isConnected
                    ? "Submit on-chain"
                    : "Connect wallet to submit"}
              </Button>
              <p className="text-xs text-muted-foreground">
                Signing happens in MetaMask on the GenLayer Studio network (chain 61999).
              </p>
            </CardContent>
          </Card>

          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold tracking-tight">Submissions</h2>
              <Button
                variant="ghost"
                size="sm"
                className="gap-2"
                onClick={() => submissions.refetch()}
                disabled={submissions.isFetching}
              >
                <RefreshCw
                  className={`h-4 w-4 ${submissions.isFetching ? "animate-spin" : ""}`}
                />
                Refresh
              </Button>
            </div>

            {submissions.isLoading ? (
              <Card>
                <CardContent className="flex items-center gap-3 py-10 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Reading contract state…
                </CardContent>
              </Card>
            ) : submissions.isError ? (
              <Card>
                <CardContent className="py-10 text-sm text-destructive">
                  Could not read the contract: {(submissions.error as Error).message}
                </CardContent>
              </Card>
            ) : submissions.data?.length ? (
              <div className="space-y-4">
                {submissions.data.map((submission) => (
                  <SubmissionCard
                    key={submission.id}
                    submission={submission}
                    canVerify={wallet.isConnected}
                    pending={
                      verifyMutation.isPending &&
                      verifyMutation.variables === submission.id
                    }
                    onVerify={() => verifyMutation.mutate(submission.id)}
                  />
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  No submissions yet. Be the first to put a resume on-chain.
                </CardContent>
              </Card>
            )}
          </section>
        </div>

        <footer className="mt-16 flex flex-wrap items-center gap-2 border-t border-border/60 pt-6 text-xs text-muted-foreground">
          <span>Intelligent contract</span>
          <code className="font-mono">{CONTRACT_ADDRESS}</code>
          <a
            className="inline-flex items-center gap-1 underline underline-offset-4 hover:text-foreground"
            href="https://studio.genlayer.com"
            target="_blank"
            rel="noreferrer"
          >
            Open in Studio <ExternalLink className="h-3 w-3" />
          </a>
        </footer>
      </main>
    </div>
  );
}

function SubmissionCard({
  submission,
  canVerify,
  pending,
  onVerify,
}: {
  submission: Submission;
  canVerify: boolean;
  pending: boolean;
  onVerify: () => void;
}) {
  const verdict = parseVerdict(submission.verdict);
  let links: Record<string, string> = {};
  try {
    const parsed = JSON.parse(submission.links || "{}");
    if (parsed && typeof parsed === "object") links = parsed as Record<string, string>;
  } catch {
    links = {};
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{submission.candidate_name}</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              #{submission.id} · submitted as {submission.submitter_role}
            </p>
          </div>
          {submission.verified ? (
            <Badge
              variant={verdict?.verified ? "default" : "destructive"}
              className="gap-1.5"
            >
              <BadgeCheck className="h-3.5 w-3.5" />
              {verdict?.verified ? "Claims supported" : "Claims disputed"}
            </Badge>
          ) : (
            <Badge variant="outline">Awaiting verification</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="whitespace-pre-wrap text-sm text-muted-foreground">
          {submission.resume_text}
        </p>

        {Object.keys(links).length > 0 && (
          <div className="flex flex-wrap gap-2">
            {Object.entries(links).map(([label, url]) => (
              <a
                key={label}
                href={url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent"
              >
                {label} <ExternalLink className="h-3 w-3" />
              </a>
            ))}
          </div>
        )}

        {verdict ? (
          <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-4">
            {typeof verdict.confidence === "number" && (
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Validator confidence {Math.round(verdict.confidence * 100)}%
              </p>
            )}
            {verdict.summary && <p className="text-sm">{verdict.summary}</p>}
            {verdict.matched_claims?.length ? (
              <div>
                <p className="text-xs font-semibold">Supported claims</p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {verdict.matched_claims.map((claim) => (
                    <li key={claim}>{claim}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {verdict.unsupported_claims?.length ? (
              <div>
                <p className="text-xs font-semibold">Unsupported claims</p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {verdict.unsupported_claims.map((claim) => (
                    <li key={claim}>{claim}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : submission.verified && submission.verdict ? (
          <pre className="overflow-x-auto rounded-lg bg-muted/40 p-4 text-xs">
            {submission.verdict}
          </pre>
        ) : null}

        {!submission.verified && (
          <Button
            variant="secondary"
            className="gap-2"
            disabled={!canVerify || pending}
            onClick={onVerify}
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {pending ? "Validators working…" : "Verify with AI"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
