import hre from 'hardhat';
import { BigNumber, Contract } from 'ethers';
import fs from 'fs';

export interface DeployDetails {
  [key: string]: {
    address: string;
    startBlock: number;
  }
}
export interface Networks {
  [key: string]: DeployDetails
}

export const writeDeployment = async (
  type: string,
  contractInstance: Contract,
): Promise<void> => {
  const { provider, name } = hre.network;
  const txReceipt = await provider.send('eth_getTransactionReceipt', [contractInstance.deployTransaction.hash]);
  let config: Networks = {
    [name]:
      {
        [type]: {
          address: contractInstance.address.toLowerCase(),
          startBlock: BigNumber.from(txReceipt.blockNumber).toNumber(),
        },
      },
  };
  if (!fs.existsSync('./deployments')) {
    fs.mkdirSync('./deployments');
  }
  if (fs.existsSync(`./deployments/networks-${type}.json`)) {
    const oldConfig = JSON.parse(fs.readFileSync(`./deployments/networks-${type}.json`, 'utf8'));
    // eslint-disable-next-line node/no-unsupported-features/es-syntax
    config = { ...oldConfig, ...config };
    fs.writeFileSync(`./deployments/networks-${type}.json`, JSON.stringify(config, null, 2));
  } else {
    fs.writeFileSync(`./deployments/networks-${type}.json`, JSON.stringify(config, null, 2));
  }
};
