import { ethers } from 'hardhat';
import { BigNumber, Contract, constants } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { routerFixture } from '../shared/fixtures';
import { token } from '../../typechain/@klaytn/contracts/KIP';

// TokeNestUpdate : 주요 변경사항 반영 테스트 코드.
describe('DexPair', () => {
  let wallet: SignerWithAddress;
  let WON: Contract;
  let WDO: Contract;
  let TKL: Contract;
  // let pair: Contract;
  let factory: Contract;
  let router: Contract;
  beforeEach(async () => {
    [wallet] = await ethers.getSigners();
    const fixture = await routerFixture(wallet);
    WON = fixture.tokenA;
    WDO = fixture.tokenB;
    TKL = fixture.tokenC;
    factory = fixture.factory;
    router = fixture.router;
  });

  it('Factory : tokeNestStableCoins and getTokenValues and swap', async () => {
    // Add StableCoin in TokeNest.
    await factory.createCriteriaCoin(WON.address);
    let criteriaCoin = await factory.getCriteriaCoins();
    expect(criteriaCoin[0]).equal(WON.address);

    // Create Pair with StableCoin
    await factory.createPair(WDO.address, WON.address, 'TestLP', 'TLP');
    const pair1 = await ethers.getContractAt('DexPair', await factory.allPairs(0));

    expect(await pair1.token0()).equal(WDO.address);
    expect(await pair1.token1()).equal(WON.address); // Always Token1 == StableCoin

    // Again Add StableCoin in TokeNest.
    await factory.createCriteriaCoin(TKL.address);
    criteriaCoin = await factory.getCriteriaCoins();
    expect(criteriaCoin[1]).equal(TKL.address);

    // Validate createPair
    await factory.createPair(TKL.address, WDO.address, 'Test1LP', 'T2LP');
    const pair2 = await ethers.getContractAt('DexPair', await factory.allPairs(1));

    expect(await pair2.token0()).equal(WDO.address);
    expect(await pair2.token1()).equal(TKL.address); // Always Token1 == StableCoin

    await WON.approve(router.address, constants.MaxUint256);
    await WDO.approve(router.address, constants.MaxUint256);

    const WDOAmount = ethers.utils.parseEther('10000');
    const WONAmount = ethers.utils.parseEther('100000000');

    await router.addLiquidity(
      WDO.address,
      WON.address,
      WDOAmount,
      WONAmount,
      0,
      0,
      wallet.address,
      constants.MaxUint256,
    );

    // Validate balance of pair
    expect(await WDO.balanceOf(pair1.address)).equal('10000000000000000000000');
    expect(await WON.balanceOf(pair1.address)).equal('100000000000000000000000000');

    // check token address
    expect(await pair1.token0()).equal('0x92D5B05741938d4BFe068E91616F442E10edE5f0');
    expect(await pair1.token1()).equal('0x6517968E4FCc3a5D3E3369f51c62991d0143cd2F');

    const swapAmount = ethers.utils.parseEther('1000');
    const expectedOutputAmount = BigNumber.from('9066108938801491315813403');
    const wdoInPairBeforeSwap = await WDO.balanceOf(pair1.address);
    const wonInPairBeforeSwap = await WON.balanceOf(pair1.address);
    const wonInMyWalletBeforeSwap = await WON.balanceOf(wallet.address);

    // Token0 put into Pair and Token1 put into MyWallet
    const routerTransaction = await router.swapExactTokensForTokens(
      swapAmount,
      0,
      [WDO.address, WON.address],
      wallet.address,
      constants.MaxInt256,
    );
    // validate token balance After swap
    expect(await WDO.balanceOf(pair1.address))
      .equal(wdoInPairBeforeSwap.add(swapAmount));

    expect(await WON.balanceOf(pair1.address))
      .equal(wonInPairBeforeSwap.sub(expectedOutputAmount));

    expect(await WON.balanceOf(wallet.address))
      .equal(wonInMyWalletBeforeSwap.add(expectedOutputAmount));

    // check event log, just check for -> args: []
    const receipt = await routerTransaction.wait();
    console.log(receipt.events?.filter((x: { event: string; }) => x.event === 'GetPathAndTokenAddress'));

    const expectedInputAmount = BigNumber.from('121332327270539805');
    // Token0 put into Pair and Token1 put into MyWallet
    await router.swapTokensForExactTokens(
      swapAmount,
      constants.MaxInt256,
      [WDO.address, WON.address],
      wallet.address,
      constants.MaxInt256,
    );

    // Validate Balance After Swap
    expect(await WDO.balanceOf(pair1.address))
      .equal(wdoInPairBeforeSwap.add(swapAmount).add(expectedInputAmount));

    expect(await WON.balanceOf(pair1.address))
      .equal(wonInPairBeforeSwap.sub(expectedOutputAmount).sub(swapAmount));

    expect(await WON.balanceOf(wallet.address))
      .equal(wonInMyWalletBeforeSwap.add(expectedOutputAmount).add(swapAmount));
  });
});
