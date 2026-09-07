declare module "*/scripts/cdp-native-relay.mjs" {
  export function createNativeCdpRelay(input: Readonly<{
    upstreamEndpoint: string;
    maxFrameBytes?: number;
    handshakeTimeoutMs?: number;
    onLog?: (code: string) => void;
  }>): Promise<Readonly<{
    endpoint: string;
    close: () => Promise<void>;
  }>>;
}
