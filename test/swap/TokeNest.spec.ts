import { ethers } from 'hardhat';
import { BigNumber, Contract, constants } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { routerFixture } from '../shared/fixtures';

// TokeNestUpdate : 주요 변경사항 반영 테스트 코드.
describe('DexFactory', () => {
  let wallet: SignerWithAddress;
  let other: SignerWithAddress;
  let WON: Contract;
  let WDO: Contract;
  let TKL: Contract;
  // let pair: Contract;
  let factory: Contract;
  let router: Contract;

  beforeEach(async () => {
    [wallet, other] = await ethers.getSigners();
    const fixture = await routerFixture(wallet);
    WON = fixture.tokenA;
    WDO = fixture.tokenB;
    TKL = fixture.tokenC;
    factory = fixture.factory;
    router = fixture.router;
  });

  it('deployFactory: fail, feeToSetter cannot be the zero address', async () => {
    // DexFactory 가져옴.
    const factoryContract = await ethers.getContractFactory('DexFactory');
    // 제로 어드레스로 컨트랙트를 배포하려 함. 제로니까 당연히 오류뜨지!
    await expect(factoryContract.deploy(constants.AddressZero))
      .to.be.revertedWithCustomError(factoryContract, 'InvalidAddressParameters')
      .withArgs('DEX: SETTER_ZERO_ADDRESS');
  });

  it('feeTo, feeToSetter, allPairsLength', async () => {
    // feeTo 기본값은 제로 어드레스임.
    expect(await factory.feeTo()).to.eq(constants.AddressZero);
    // feeToSetter은 배포한 지갑이 기본값임.
    expect(await factory.feeToSetter()).to.eq(await wallet.getAddress());
    // 이건 현재 컨트랙트에 등록된 페어의 개수를 나타냄. 기본값은 0개.
    expect(await factory.allPairsLength()).to.eq(0);
    // factory의 INIT 값을 호출. 생성된 해시값
    console.log('Init code hash:', await factory.INIT());
  });

  async function createPair(token0: string, token1: string) {
    await factory.createCriteriaCoin(token1);
    const criteriaCoin = await factory.getCriteriaCoins();
    expect(criteriaCoin[0]).equal(token1);

    // Create Pair with StableCoin
    await factory.createPair(token0, token1, 'TestLP', 'TLP');
    const pair1 = await ethers.getContractAt('DexPair', await factory.allPairs(0));

    expect(await pair1.token0()).equal(token0);
    expect(await pair1.token1()).equal(token1); // Always Token1 == StableCoin
  }
  it('create pair', async () => {
    await createPair(WON.address, WDO.address);
  });

  it('createPair:reverse', async () => {
    // 거꾸로 넣어도 만들어짐.
    await createPair(WDO.address, WON.address);
  });

  it('createPair:identical', async () => {
    // 같은 토큰 두개로는 페어를 만들지 못함.
    await expect(createPair(WON.address, WON.address)).to.be
      .revertedWithCustomError(factory, 'InvalidAddressParameters').withArgs('DEX: IDENTICAL_ADDRESSES');
  });

  it('setFeeTo:fail, Unauthorized', async () => {
    // other은 factory를 만들지 않음(wallet이 만듦). 그래서 미인증 오류뜸.
    await expect(factory.connect(other).setFeeTo(other.address)).to.be.revertedWithCustomError(factory, 'Unauthorized');
  });

  it('setFeeTo', async () => {
    // setFeeTo함. 팩토리 배포자여서 오류안뜸.
    await factory.setFeeTo(wallet.address);
    expect(await factory.feeTo()).to.eq(wallet.address);
  });

  it('setFeeToSetter:fail', async () => {
    // 제로 어드레스를 setFeeToSetter로 할 수 없음.
    await expect(factory.setFeeToSetter(constants.AddressZero))
      .to.be.revertedWithCustomError(factory, 'InvalidAddressParameters').withArgs('DEX: SETTER_ZERO_ADDRESS');
    // other은 미인증됨.
    await expect(factory.connect(other).setFeeToSetter(other.address)).to.be.revertedWithCustomError(factory, 'Unauthorized');
  });

  it('setFeeToSetter', async () => {
    // other한테 setFee할 권한줌.
    await factory.setFeeToSetter(other.address);
    // feeToSetter은 other임.
    expect(await factory.feeToSetter()).to.eq(other.address);
    // wallet에서 other한테 다시 권한 주려하니까 미인증됨. 양도의 개념인듯.
    await expect(factory.setFeeToSetter(other.address)).to.be.revertedWithCustomError(factory, 'Unauthorized');
  });

  it('math lib extra test', async () => {
    // MathMock 컨트랙트 배포함.
    const mathMock = await (await ethers.getContractFactory('MathMock')).deploy();
    // 걍 mathMock 컨트랙트 메서드들 테스트한듯 ㅋ.
    expect(await mathMock.sqrt(2)).to.eq(1);
    expect(await mathMock.sqrt(0)).to.eq(0);
  });

  it('swap and get token values', async () => {
    // Add StableCoin in TokeNest.
    await factory.createCriteriaCoin(WON.address);
    // Create Pair with StableCoin
    await factory.createPair(WDO.address, WON.address, 'TestLP', 'TLP');
    const pair1 = await ethers.getContractAt('DexPair', await factory.allPairs(0));

    // Again Add StableCoin in TokeNest.
    await factory.createCriteriaCoin(TKL.address);

    const criteriaCoin = await factory.getCriteriaCoins();
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

    // swap
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

    const swapAmount = ethers.utils.parseEther('1000');
    const expectedOutputAmount = BigNumber.from('9066108938801491315813403');
    const wdoInPairBeforeSwap = await WDO.balanceOf(pair1.address);
    const wonInPairBeforeSwap = await WON.balanceOf(pair1.address);
    const wonInMyWalletBeforeSwap = await WON.balanceOf(wallet.address);

    // Token0 put into Pair and Token1 put into MyWallet
    await router.swapExactTokensForTokens(
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
