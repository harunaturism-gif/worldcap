import type { DrawRandomnessProvider, RandomnessRequest, RandomnessResult } from './drawRandomness.js';
import { createPublicClient, defineChain, http, type Address, type PublicClient } from 'viem';

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
  if (!rpcUrl || !contract || !ADDRESS.test(contract) || /^0x0{40}$/i.test(contract)) return null;
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

export interface WitnetTransactionSubmitter {
  /** Must recover the same signed transaction by idempotency key after restart. */
  requestOrRecover(input: { config: WitnetConfig; drawId: string; idempotencyKey: string }): Promise<Omit<WitnetRequestReceipt, 'requestId'>>;
}

export interface WitnetReadTransport {
  chainId(): Promise<number>;
  bytecode(address: Address): Promise<`0x${string}` | undefined>;
  status(address: Address, requestBlock: bigint): Promise<number>;
  seed(address: Address, requestBlock: bigint): Promise<`0x${string}`>;
}

const worldChainSepolia = defineChain({
  id: 4801,
  name: 'World Chain Sepolia',
  nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://worldchain-sepolia.g.alchemy.com/public'] } },
});

export class ViemWitnetReadTransport implements WitnetReadTransport {
  private readonly client: PublicClient;
  constructor(config: WitnetConfig, client?: PublicClient) {
    this.client = client ?? createPublicClient({ chain: worldChainSepolia, transport: http(config.rpcUrl) });
  }
  chainId() { return this.client.getChainId(); }
  bytecode(address: Address) { return this.client.getBytecode({ address }); }
  status(address: Address, requestBlock: bigint) {
    return this.client.readContract({ address, abi: WITNET_RANDOMNESS_ABI, functionName: 'getRandomizeStatus', args: [requestBlock] });
  }
  seed(address: Address, requestBlock: bigint) {
    return this.client.readContract({ address, abi: WITNET_RANDOMNESS_ABI, functionName: 'fetchRandomnessAfter', args: [requestBlock] });
  }
}

const REQUEST_ID = /^witnet:4801:([0-9]+):(0x[0-9a-f]{64})$/;

export class PinnedWitnetChainAdapter implements WitnetChainAdapter {
  constructor(private readonly reader: WitnetReadTransport, private readonly submitter: WitnetTransactionSubmitter) {}

  async assertPinnedDeployment(config: WitnetConfig): Promise<void> {
    if (await this.reader.chainId() !== config.chainId) throw new Error('witnet_wrong_network');
    const code = await this.reader.bytecode(config.randomnessContract);
    if (!code || code === '0x') throw new Error('witnet_randomness_not_deployed');
  }

  async requestOrRecover(config: WitnetConfig, drawId: string, idempotencyKey: string): Promise<WitnetRequestReceipt> {
    const submitted = await this.submitter.requestOrRecover({ config, drawId, idempotencyKey });
    if (!/^0x[0-9a-fA-F]{64}$/.test(submitted.transactionHash) || submitted.requestBlock < 1n) throw new Error('witnet_request_receipt_invalid');
    const transactionHash = submitted.transactionHash.toLowerCase();
    return { ...submitted, transactionHash, requestId: `witnet:4801:${submitted.requestBlock}:${transactionHash}` };
  }

  async readFulfillment(config: WitnetConfig, requestId: string): Promise<WitnetFulfillment> {
    const match = REQUEST_ID.exec(requestId);
    if (!match) throw new Error('witnet_request_id_invalid');
    await this.assertPinnedDeployment(config);
    const requestBlock = BigInt(match[1]!);
    const status = await this.reader.status(config.randomnessContract, requestBlock);
    if (status === 1 || status === 4 || status === 0) return { requestId, status: 'pending' };
    if (status === 3) return { requestId, status: 'error' };
    if (status !== 2 && status !== 5) throw new Error('witnet_randomness_status_invalid');
    const seed = (await this.reader.seed(config.randomnessContract, requestBlock)).toLowerCase();
    if (!/^0x[0-9a-f]{64}$/.test(seed)) throw new Error('witnet_randomness_seed_invalid');
    return {
      requestId, status: 'ready', seed, fulfillmentBlock: requestBlock,
      proofReference: `eip155:4801:${config.randomnessContract.toLowerCase()}:randomize-block:${requestBlock}`,
      fulfilledAt: new Date().toISOString(),
    };
  }
}

export class WitnetDrawRandomnessProvider implements DrawRandomnessProvider {
  constructor(private readonly config: WitnetConfig, private readonly chain: WitnetChainAdapter) {}

  async requestRandomness(drawId: string): Promise<RandomnessRequest> {
    await this.chain.assertPinnedDeployment(this.config);
    const receipt = await this.chain.requestOrRecover(this.config, drawId, `draw:${drawId}`);
    return {
      drawId, requestId: receipt.requestId, provider: 'witnet-randomness-v1', requestedAt: receipt.requestedAt,
      transactionHash: receipt.transactionHash, requestBlock: receipt.requestBlock, network: this.config.network,
    };
  }

  async getRandomness(requestId: string): Promise<RandomnessResult> {
    const result = await this.chain.readFulfillment(this.config, requestId);
    if (result.requestId !== requestId) throw new Error('witnet_request_binding_mismatch');
    if (result.status === 'pending') throw new Error('witnet_randomness_pending');
    if (result.status === 'error' || !result.seed || !/^0x[0-9a-fA-F]{64}$/.test(result.seed)) throw new Error('witnet_randomness_failed');
    return {
      requestId, provider: 'witnet-randomness-v1', seed: result.seed.toLowerCase(), fulfilledAt: result.fulfilledAt ?? new Date().toISOString(),
      proofReference: result.proofReference, fulfillmentBlock: result.fulfillmentBlock,
    };
  }
}

export const WITNET_RANDOMNESS_ABI = [
  { type: 'function', name: 'estimateRandomizeFee', stateMutability: 'view', inputs: [{ name: 'gasPrice', type: 'uint256' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'randomize', stateMutability: 'payable', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'getRandomizeStatus', stateMutability: 'view', inputs: [{ name: 'blockNumber', type: 'uint256' }], outputs: [{ type: 'uint8' }] },
  { type: 'function', name: 'fetchRandomnessAfter', stateMutability: 'view', inputs: [{ name: 'blockNumber', type: 'uint256' }], outputs: [{ type: 'bytes32' }] },
] as const;
