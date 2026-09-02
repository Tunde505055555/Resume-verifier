import { useCallback, useEffect, useState } from "react";
import type { Address } from "viem";
import { STUDIO_CHAIN, STUDIO_CHAIN_ID_HEX, STUDIO_RPC } from "@/lib/genlayer";

type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
};

function getProvider(): Eip1193Provider | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { ethereum?: Eip1193Provider }).ethereum;
}

async function ensureStudioNetwork(provider: Eip1193Provider) {
  const current = (await provider.request({ method: "eth_chainId" })) as string;
  if (current?.toLowerCase() === STUDIO_CHAIN_ID_HEX) return;
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: STUDIO_CHAIN_ID_HEX }],
    });
  } catch {
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: STUDIO_CHAIN_ID_HEX,
          chainName: STUDIO_CHAIN.name,
          rpcUrls: [STUDIO_RPC],
          nativeCurrency: STUDIO_CHAIN.nativeCurrency,
        },
      ],
    });
  }
}

export function useWallet() {
  const [address, setAddress] = useState<Address | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [hasProvider, setHasProvider] = useState(true);

  useEffect(() => {
    const provider = getProvider();
    setHasProvider(Boolean(provider));
    if (!provider) return;

    let cancelled = false;
    void (async () => {
      const accounts = (await provider.request({ method: "eth_accounts" }).catch(() => [])) as string[];
      const id = (await provider.request({ method: "eth_chainId" }).catch(() => null)) as string | null;
      if (cancelled) return;
      if (accounts?.length) setAddress(accounts[0] as Address);
      setChainId(id);
    })();

    const onAccounts = (...args: unknown[]) => {
      const accounts = args[0] as string[];
      setAddress(accounts?.length ? (accounts[0] as Address) : null);
    };
    const onChain = (...args: unknown[]) => setChainId(args[0] as string);
    provider.on?.("accountsChanged", onAccounts);
    provider.on?.("chainChanged", onChain);
    return () => {
      cancelled = true;
      provider.removeListener?.("accountsChanged", onAccounts);
      provider.removeListener?.("chainChanged", onChain);
    };
  }, []);

  const connect = useCallback(async () => {
    const provider = getProvider();
    if (!provider) {
      window.open("https://metamask.io/download/", "_blank", "noopener");
      throw new Error("MetaMask not detected");
    }
    setConnecting(true);
    try {
      const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
      await ensureStudioNetwork(provider);
      const id = (await provider.request({ method: "eth_chainId" })) as string;
      setChainId(id);
      setAddress((accounts?.[0] ?? null) as Address | null);
    } finally {
      setConnecting(false);
    }
  }, []);

  const switchNetwork = useCallback(async () => {
    const provider = getProvider();
    if (!provider) return;
    await ensureStudioNetwork(provider);
    setChainId((await provider.request({ method: "eth_chainId" })) as string);
  }, []);

  return {
    address,
    chainId,
    connect,
    switchNetwork,
    connecting,
    hasProvider,
    isConnected: Boolean(address),
    onStudioNetwork: chainId?.toLowerCase() === STUDIO_CHAIN_ID_HEX,
    disconnect: () => setAddress(null),
  };
}
