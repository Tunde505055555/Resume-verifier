/**
 * End-to-end proof of the revised ResumeVerifier contract on GenLayer Studio.
 *
 * Steps:
 *   1. deploy the revised contract
 *   2. read the on-chain verifier policy
 *   3. submit a resume with public evidence links
 *   4. finalize it with verify_with_ai from a DIFFERENT wallet (permissionless)
 *   5. assert the stored verdict is structurally complete and attributed
 *   6. assert a second verify_with_ai on the same submission is rejected
 *      (one-shot finality, verdict immutable)
 *
 * Run:  bun scripts/e2e-finality.ts [existingContractAddress]
 */
import { createClient, createAccount, chains } from "genlayer-js";
import { readFileSync } from "node:fs";

const RPC = "https://studio.genlayer.com/api";
const CODE = readFileSync("contracts/resume_verifier.py");

const submitter = createAccount();
const verifier = createAccount();

const mk = (account: ReturnType<typeof createAccount>) =>
  createClient({ chain: chains.studionet as never, endpoint: RPC, account }) as any;

const submitterClient = mk(submitter);
const verifierClient = mk(verifier);

const wait = (client: any, hash: unknown) =>
  client.waitForTransactionReceipt({ hash, status: "ACCEPTED", interval: 4000, retries: 120 });

const ok = (label: string, pass: boolean, detail?: unknown) => {
  console.log(`${pass ? "PASS" : "FAIL"}  ${label}${detail !== undefined ? `  ${JSON.stringify(detail)}` : ""}`);
  if (!pass) process.exitCode = 1;
};

async function main() {
  let address = process.argv[2] as `0x${string}` | undefined;

  if (!address) {
    console.log("deploying revised contract…");
    const deployHash = await submitterClient.deployContract({ code: CODE, args: [] });
    const receipt = await wait(submitterClient, deployHash);
    address =
      receipt?.data?.contract_address ??
      receipt?.contract_address ??
      receipt?.data?.deployed_contract_address;
    console.log("deployed at", address, "tx", deployHash);
  }
  if (!address) throw new Error("no contract address");

  const read = (client: any, functionName: string, args: unknown[] = []) =>
    client.readContract({ address, functionName, args });

  const policy = await read(submitterClient, "get_policy");
  ok("policy is published on-chain", typeof policy === "string" && policy.includes("permissionless-verifier"), policy);

  const links = {
    github: "https://github.com/torvalds",
    website: "https://en.wikipedia.org/wiki/Linus_Torvalds",
  };
  const submitHash = await submitterClient.writeContract({
    address,
    functionName: "submit_resume",
    args: [
      "candidate",
      "Linus Torvalds",
      "Created the Linux kernel in 1991 and authored the Git version control system. Also served as CEO of ACME Payments.",
      JSON.stringify(links),
    ],
    value: 0n,
  });
  await wait(submitterClient, submitHash);
  const total = Number(await read(submitterClient, "get_total"));
  const id = String(total - 1);
  ok("submission stored", total > 0, { total, id });
  ok("submission starts unfinalized", (await read(submitterClient, "is_finalized", [id])) === false);

  console.log("finalizing from a different wallet (permissionless)…");
  const verifyHash = await verifierClient.writeContract({
    address,
    functionName: "verify_with_ai",
    args: [id],
    value: 0n,
  });
  await wait(verifierClient, verifyHash);

  const stored = JSON.parse((await read(submitterClient, "get_submission", [id])) as string);
  const verdict = JSON.parse(stored.verdict || "{}");
  console.log("verdict:", JSON.stringify(verdict, null, 2));

  ok("permissionless caller could finalize", stored.finalized === true);
  ok("verifier wallet attributed", String(stored.verifier).toLowerCase() === verifier.address.toLowerCase(), stored.verifier);
  ok("submitter recorded separately", String(stored.submitter).toLowerCase() === submitter.address.toLowerCase());
  ok("verified is boolean", typeof verdict.verified === "boolean");
  ok("confidence quantized to 0.1 steps in 0..1", typeof verdict.confidence === "number" && verdict.confidence >= 0 && verdict.confidence <= 1 && Math.abs(verdict.confidence * 10 - Math.round(verdict.confidence * 10)) < 1e-9, verdict.confidence);
  ok("confidence consistent with verdict", verdict.verified ? verdict.confidence >= 0.6 : verdict.confidence <= 0.5);
  ok("claim arrays present and sorted", Array.isArray(verdict.matched_claims) && Array.isArray(verdict.unsupported_claims) &&
    JSON.stringify(verdict.matched_claims) === JSON.stringify([...verdict.matched_claims].sort()) &&
    JSON.stringify(verdict.unsupported_claims) === JSON.stringify([...verdict.unsupported_claims].sort()));
  ok("at least one claim classified", (verdict.matched_claims.length + verdict.unsupported_claims.length) > 0);
  ok("no claim classified both ways", verdict.matched_claims.every((c: string) => !verdict.unsupported_claims.includes(c)));
  ok("summary non-empty", typeof verdict.summary === "string" && verdict.summary.trim().length > 0);

  console.log("attempting a second finalization (must be rejected)…");
  let rejected = false;
  let reason = "";
  try {
    const again = await verifierClient.writeContract({
      address,
      functionName: "verify_with_ai",
      args: [id],
      value: 0n,
    });
    const r: any = await wait(verifierClient, again);
    const leader = r?.consensus_data?.leader_receipt?.[0];
    reason = JSON.stringify({
      execution_result: leader?.execution_result,
      result: leader?.result,
    }).slice(0, 300);
    rejected =
      leader?.execution_result === "ERROR" &&
      leader?.result?.status === "rollback" &&
      String(leader?.result?.payload ?? "").includes("already finalized");
  } catch (e) {
    rejected = true;
    reason = String((e as Error).message).slice(0, 300);
  }
  ok("second finalization rejected (one-shot finality)", rejected, reason);

  const after = JSON.parse((await read(submitterClient, "get_submission", [id])) as string);
  ok("verdict unchanged after re-attempt (immutable)", after.verdict === stored.verdict && after.verifier === stored.verifier);

  console.log(`\ncontract: ${address}\nsubmission: ${id}\nexit: ${process.exitCode ?? 0}`);
}

main().catch((e) => {
  console.error("E2E FAILED:", e);
  process.exit(1);
});
