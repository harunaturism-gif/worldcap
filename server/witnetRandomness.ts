import type { DrawRandomnessProvider, RandomnessRequest, RandomnessResult } from './drawRandomness.js';

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const RPC_PROTOCOLS = new Set(['https:']);

export interface WitnetConfig {
  network: 'world-chain-sepolia';
  chainId: 4801;
  rpcUrl: string;
  randomnessContract: `0x${string}`;
}

export function createWitnetConfig(environment: NodeJS.ProcessEnv): WitnetConfig | null {
  if (environment.WITNET_NETWORK !== 'world-chain-sepolia' || environment.WORLD_CHAIN_CHAIN_ID !== '4801') return null;
  const rpcUrl = environment.WORLD_CHAIN_RPC_URL;
  const contract = environment.WITNET_RANDOMNESS_CONTRACT;
  if (!rpcUrl || !contract || !ADDRESS.test(contract)) return null;
  try {
    const url = new URL(rpcUrl);
    if (!RPC_PROTOCOLS.has(url.protocol) || url.username || url.password) return null;
  } catch { return null; }
  return { network: 'world-chain-sepolia', chainId: 4801, rpcUrl, randomnessContract: contract as `0x${string}` };
}

export interface WitnetRequestReceipt {
  requestId: string;
  requestBlock: bigint;
  transactionHash: string;
  requestedAt: string;
}

export interface WitnetFulfillment {
  requestId: string;
  status: 'pending' | 'ready' | 'error';
  seed?: string;
  fulfillmentBlock?: bigint;
  proofReference?: string;
  fulfilledAt?: string;
}

/** Live implementations must journal a signed request before broadcast. */
export interface WitnetChainAdapter {
  assertPinnedDeployment(config: WitnetConfig): Promise<void>;
  requestOrRecover(config: WitnetConfig, drawId: string, idempotencyKey: string): Promise<WitnetRequestReceipt>;
  readFulfillment(config: WitnetConfig, requestId: string): Promise<WitnetFulfillment>;
}

export class WitnetDrawRandomnessProvider implements DrawRandomnessProvider {
  constructor(private readonly config: WitnetConfig, private readonly chain: WitnetChainAdapter) {}

  async requestRandomness(drawId: string): Promise<RandomnessRequest> {
    await this.chain.assertPinnedDeployment(this.config);
    const receipt = await this.chain.requestOrRecover(this.config, drawId, `draw:${drawId}`);
    return { drawId, requestId: receipt.requestId, provider: 'witnet-randomness-v1', requestedAt: receipt.requestedAt };
  }

  async getRandomness(requestId: string): Promise<RandomnessResult> {
    const result = await this.chain.readFulfillment(this.config, requestId);
    if (result.requestId !== requestId) throw new Error('witnet_request_binding_mismatch');
    if (result.status === 'pending') throw new Error('witnet_randomness_pending');
    if (result.status === 'error' || !result.seed || !/^0x[0-9a-fA-F]{64}$/.test(result.seed)) throw new Error('witnet_randomness_failed');
    return { requestId, provider: 'witnet-randomness-v1', seed: result.seed.toLowerCase(), fulfilledAt: result.fulfilledAt ?? new Date().toISOString() };
  }
}

export const WITNET_RANDOMNESS_ABI = [
  { type: 'function', name: 'estimateRandomizeFee', stateMutability: 'view', inputs: [{ name: 'gasPrice', type: 'uint256' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'randomize', stateMutability: 'payable', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'getRandomizeStatus', stateMutability: 'view', inputs: [{ name: 'blockNumber', type: 'uint256' }], outputs: [{ type: 'uint8' }] },
  { type: 'function', name: 'fetchRandomnessAfter', stateMutability: 'view', inputs: [{ name: 'blockNumber', type: 'uint256' }], outputs: [{ type: 'bytes32' }] },
] as const;
