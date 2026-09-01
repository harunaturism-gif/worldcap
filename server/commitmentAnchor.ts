import { createPublicClient, defineChain, http, keccak256, stringToHex, type Address, type PublicClient } from 'viem';

export interface DrawAnchor {
  drawIdHash: string;
  manifestRoot: string;
  eligibleCount: bigint;
  algorithmVersionHash: string;
  anchoredAtBlock: bigint;
}

export interface CommitmentAnchorReader {
  get(drawId: string): Promise<DrawAnchor | null>;
}

export interface CommitmentAnchorConfig {
  chainId: 4801;
  rpcUrl: string;
  registryAddress: Address;
}

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const ZERO_ADDRESS = /^0x0{40}$/i;

export function createCommitmentAnchorConfig(environment: NodeJS.ProcessEnv): CommitmentAnchorConfig | null {
  const rpcUrl = environment.WORLD_CHAIN_SEPOLIA_RPC_URL ?? environment.WORLD_CHAIN_RPC_URL;
  const registryAddress = environment.DRAW_COMMITMENT_REGISTRY_ADDRESS;
  if (environment.WORLD_CHAIN_CHAIN_ID !== '4801' || !rpcUrl || !registryAddress || !ADDRESS.test(registryAddress) || ZERO_ADDRESS.test(registryAddress)) return null;
  try {
    const parsed = new URL(rpcUrl);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null;
  } catch { return null; }
  return { chainId: 4801, rpcUrl, registryAddress: registryAddress as Address };
}

export function drawIdHash(drawId: string): string { return keccak256(stringToHex(drawId)); }
export function algorithmVersionHash(version: string): string { return keccak256(stringToHex(version)); }

export const DRAW_COMMITMENT_REGISTRY_ABI = [
  { type: 'function', name: 'isAnchored', stateMutability: 'view', inputs: [{ name: 'drawIdHash', type: 'bytes32' }], outputs: [{ type: 'bool' }] },
  {
    type: 'function', name: 'getCommitment', stateMutability: 'view', inputs: [{ name: 'drawIdHash', type: 'bytes32' }],
    outputs: [{ name: 'commitment', type: 'tuple', components: [
      { name: 'manifestRoot', type: 'bytes32' }, { name: 'eligibleCount', type: 'uint256' },
      { name: 'algorithmVersionHash', type: 'bytes32' }, { name: 'anchoredAtBlock', type: 'uint64' },
      { name: 'anchorer', type: 'address' },
    ] }],
  },
] as const;

const worldChainSepolia = defineChain({
  id: 4801,
  name: 'World Chain Sepolia',
  nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://worldchain-sepolia.g.alchemy.com/public'] } },
});

export class ViemCommitmentAnchorReader implements CommitmentAnchorReader {
  private readonly client: PublicClient;
  constructor(private readonly config: CommitmentAnchorConfig, client?: PublicClient) {
    this.client = client ?? createPublicClient({ chain: worldChainSepolia, transport: http(config.rpcUrl) });
  }

  async get(drawId: string): Promise<DrawAnchor | null> {
    const chainId = await this.client.getChainId();
    if (chainId !== this.config.chainId) throw new Error('commitment_anchor_wrong_network');
    const code = await this.client.getBytecode({ address: this.config.registryAddress });
    if (!code || code === '0x') throw new Error('commitment_anchor_not_deployed');
    const idHash = drawIdHash(drawId) as `0x${string}`;
    const exists = await this.client.readContract({ address: this.config.registryAddress, abi: DRAW_COMMITMENT_REGISTRY_ABI, functionName: 'isAnchored', args: [idHash] });
    if (!exists) return null;
    const stored = await this.client.readContract({ address: this.config.registryAddress, abi: DRAW_COMMITMENT_REGISTRY_ABI, functionName: 'getCommitment', args: [idHash] });
    return {
      drawIdHash: idHash,
      manifestRoot: `sha256:${stored.manifestRoot.slice(2).toLowerCase()}`,
      eligibleCount: stored.eligibleCount,
      algorithmVersionHash: stored.algorithmVersionHash.toLowerCase(),
      anchoredAtBlock: stored.anchoredAtBlock,
    };
  }
}

export class MemoryCommitmentAnchor implements CommitmentAnchorReader {
  private readonly anchors = new Map<string, DrawAnchor>();
  anchor(drawId: string, manifestRoot: string, eligibleCount: bigint, algorithmVersion: string): DrawAnchor {
    if (this.anchors.has(drawId)) throw new Error('draw_anchor_immutable');
    if (!/^sha256:[0-9a-f]{64}$/.test(manifestRoot) || eligibleCount <= 0n) throw new Error('draw_anchor_invalid');
    const anchor = Object.freeze({ drawIdHash: drawIdHash(drawId), manifestRoot, eligibleCount, algorithmVersionHash: algorithmVersionHash(algorithmVersion), anchoredAtBlock: 1n });
    this.anchors.set(drawId, anchor);
    return anchor;
  }
  async get(drawId: string) { return this.anchors.get(drawId) ?? null; }
}
