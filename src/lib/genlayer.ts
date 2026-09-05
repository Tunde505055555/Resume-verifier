import { createClient, createAccount, chains } from "genlayer-js";
import type { Address } from "viem";

export const CONTRACT_ADDRESS =
  "0xEF2259AeDFCDe6bBE8183Cb588d235aE210899E3" as Address;

export const STUDIO_CHAIN = chains.studionet;
export const STUDIO_CHAIN_ID_HEX = `0x${STUDIO_CHAIN.id.toString(16)}`;
export const STUDIO_RPC = "https://studio.genlayer.com/api";
export const EXPLORER_TX = (hash: string) =>
  `https://genlayer-explorer.vercel.app/tx/${hash}`;

export type Submission = {
  id: number;
  submitter_role: string;
  candidate_name: string;
  resume_text: string;
  links: string;
  verdict: string;
  verified: boolean;
  finalized?: boolean;
  submitter?: string;
  verifier?: string;
};

export type Verdict = {
  verified?: boolean;
  confidence?: number;
  matched_claims?: string[];
  unsupported_claims?: string[];
  summary?: string;
};

/** Read-only client: uses a throwaway account, never asks the wallet to sign. */
let readClient: ReturnType<typeof createClient> | null = null;
function getReadClient() {
  if (!readClient) {
    readClient = createClient({
      chain: STUDIO_CHAIN as never,
      endpoint: STUDIO_RPC,
      account: createAccount(),
    });
  }
  return readClient;
}

/** Write client bound to the connected MetaMask address (address => wallet signs). */
export function getWriteClient(address: Address) {
  return createClient({
    chain: STUDIO_CHAIN as never,
    endpoint: STUDIO_RPC,
    account: address,
  });
}

type Client = ReturnType<typeof createClient>;

async function waitAccepted(client: Client, hash: unknown) {
  return client.waitForTransactionReceipt({
    hash,
    status: "ACCEPTED",
    interval: 4000,
    retries: 90,
  } as Parameters<Client["waitForTransactionReceipt"]>[0]);
}

async function read(functionName: string, args: unknown[] = []) {
  return getReadClient().readContract({
    address: CONTRACT_ADDRESS,
    functionName,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    args: args as any,
  });
}

export async function getTotal(): Promise<number> {
  const total = await read("get_total");
  return Number(total ?? 0);
}

export async function getSubmission(id: number): Promise<Submission | null> {
  const raw = await read("get_submission", [String(id)]);
  if (!raw || typeof raw !== "string") return null;
  try {
    return JSON.parse(raw) as Submission;
  } catch {
    return null;
  }
}

export async function getSubmissions(): Promise<Submission[]> {
  const total = await getTotal();
  const ids = Array.from({ length: total }, (_, i) => total - 1 - i);
  const rows = await Promise.all(ids.map((id) => getSubmission(id)));
  return rows.filter((row): row is Submission => row !== null);
}

export function parseVerdict(verdict: string): Verdict | null {
  if (!verdict) return null;
  try {
    return JSON.parse(verdict) as Verdict;
  } catch {
    return null;
  }
}

export async function submitResume(
  address: Address,
  input: {
    submitterRole: string;
    candidateName: string;
    resumeText: string;
    links: Record<string, string>;
  },
) {
  const client = getWriteClient(address);
  const hash = await client.writeContract({
    address: CONTRACT_ADDRESS,
    functionName: "submit_resume",
    args: [
      input.submitterRole,
      input.candidateName,
      input.resumeText,
      JSON.stringify(input.links),
    ],
    value: 0n,
  });
  await waitAccepted(client, hash);
  return hash as string;
}

export async function verifyWithAI(address: Address, id: number) {
  const client = getWriteClient(address);
  const hash = await client.writeContract({
    address: CONTRACT_ADDRESS,
    functionName: "verify_with_ai",
    args: [String(id)],
    value: 0n,
  });
  await waitAccepted(client, hash);
  return hash as string;
}
