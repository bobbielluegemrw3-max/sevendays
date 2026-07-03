import { readFileSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { polygonAmoy } from 'viem/chains';

/** Deploys TestUSDT + SevenDaysMemorial to Amoy (Phase 12 verification). */

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const env = readFileSync(join(root, '.env.local'), 'utf8');
const get = (key) => {
  const match = new RegExp(`^${key}=(.+)$`, 'm').exec(env);
  if (!match) throw new Error(`${key} missing from .env.local`);
  return match[1].trim();
};

const rpcUrl = get('AMOY_RPC_URL');
const account = privateKeyToAccount(get('AMOY_HOT_WALLET_KEY'));
const artifacts = JSON.parse(readFileSync(join(root, 'infra', 'contracts', 'artifacts.json'), 'utf8'));

const publicClient = createPublicClient({ chain: polygonAmoy, transport: http(rpcUrl) });
const walletClient = createWalletClient({ account, chain: polygonAmoy, transport: http(rpcUrl) });

async function deploy(name) {
  const { abi, bytecode } = artifacts[name];
  const hash = await walletClient.deployContract({ abi, bytecode });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error(`${name} deployment reverted (${hash})`);
  console.log(`${name}: ${receipt.contractAddress} (tx ${hash}, gas ${receipt.gasUsed})`);
  return receipt.contractAddress;
}

const usdt = await deploy('TestUSDT');
const memorial = await deploy('SevenDaysMemorial');
appendFileSync(
  join(root, '.env.local'),
  `AMOY_USDT_CONTRACT=${usdt}\nAMOY_MEMORIAL_CONTRACT=${memorial}\n`,
);
console.log('addresses appended to .env.local');
