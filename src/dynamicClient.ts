import { createClient } from "@dynamic-labs/client";
import { ReactNativeExtension } from "@dynamic-labs/react-native-extension";
import { ViemExtension } from "@dynamic-labs/viem-extension";
import { SolanaExtension } from "@dynamic-labs/solana-extension";

export const dynamicClient = createClient({
  environmentId: "a97642d3-3eab-457e-ad75-a95664c12102",
  appName: "RN Multichain Demo",
})
  .extend(ReactNativeExtension())
  .extend(ViemExtension())
  .extend(SolanaExtension());
