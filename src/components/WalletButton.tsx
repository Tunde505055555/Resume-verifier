import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Wallet, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

type Props = {
  address: string | null;
  connecting: boolean;
  hasProvider: boolean;
  onStudioNetwork: boolean;
  connect: () => Promise<void>;
  switchNetwork: () => Promise<void>;
};

export function WalletButton({
  address,
  connecting,
  hasProvider,
  onStudioNetwork,
  connect,
  switchNetwork,
}: Props) {
  const short = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "";

  if (!address) {
    return (
      <Button
        onClick={() =>
          connect().catch((error: Error) =>
            toast.error(hasProvider ? error.message : "MetaMask not detected"),
          )
        }
        disabled={connecting}
        className="gap-2"
      >
        <Wallet className="h-4 w-4" />
        {connecting ? "Connecting…" : "Connect MetaMask"}
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {!onStudioNetwork && (
        <Button
          variant="outline"
          className="gap-2"
          onClick={() =>
            switchNetwork().catch((error: Error) => toast.error(error.message))
          }
        >
          <AlertTriangle className="h-4 w-4" />
          Switch to Studio
        </Button>
      )}
      <Badge variant="secondary" className="gap-2 px-3 py-1.5 font-mono text-xs">
        <span className="h-2 w-2 rounded-full bg-primary" />
        {short}
      </Badge>
    </div>
  );
}
