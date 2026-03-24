import { createClient } from "@dynamic-labs/client";
import { ReactNativeExtension } from "@dynamic-labs/react-native-extension";
import { ViemExtension } from "@dynamic-labs/viem-extension";
import { SolanaExtension } from "@dynamic-labs/solana-extension";

export const dynamicClient = createClient({
  environmentId: "3e219b76-dcf1-40ab-aad6-652c4dfab4cc",
  appName: "RN Multichain Demo",
})
  .extend(
    ReactNativeExtension({
      appOrigin: "https://rn-multichain-demo.dynamic.xyz",
    })
  )
  .extend(ViemExtension())
  .extend(SolanaExtension());
