import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import solc from 'solc';

/** Compiles the verification contracts to artifacts.json (abi + bytecode). */

const here = dirname(fileURLToPath(import.meta.url));
const sources = {};
for (const file of ['TestUSDT.sol', 'SevenDaysMemorial.sol']) {
  sources[file] = { content: readFileSync(join(here, file), 'utf8') };
}

const input = {
  language: 'Solidity',
  sources,
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = (output.errors ?? []).filter((e) => e.severity === 'error');
if (errors.length > 0) {
  for (const e of errors) console.error(e.formattedMessage);
  process.exit(1);
}

const artifacts = {};
for (const [file, contracts] of Object.entries(output.contracts)) {
  for (const [name, contract] of Object.entries(contracts)) {
    artifacts[name] = {
      source: file,
      abi: contract.abi,
      bytecode: `0x${contract.evm.bytecode.object}`,
    };
  }
}
writeFileSync(join(here, 'artifacts.json'), JSON.stringify(artifacts, null, 2));
console.log('compiled:', Object.keys(artifacts).join(', '));
