import { expect } from 'chai';
import { ethers } from 'hardhat';
import { BigNumber, constants } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { routerFixture } from '../shared/fixtures';
import { mineBlock } from '../shared/utilities';
import { DexFactory } from '../../typechain/contracts/swap/DexFactory';
import { DexPair } from '../../typechain/contracts/swap/DexPair';
import { KIP7Mock } from '../../typechain/contracts/mocks/KIP7TestMock.sol/KIP7Mock';
import { DexRouter } from '../../typechain/contracts/swap/DexRouter';

const MINIMUM_LIQUIDITY = BigNumber.from(10).pow(3);

describe('DexRouter', () => {
  let wallet: SignerWithAddress;
  let token0: KIP7Mock;
  let token1: KIP7Mock;
  let router: DexRouter;
  let factory: DexFactory;
  let pair: DexPair;

  beforeEach(async () => {
    // 기본값 세팅
    [wallet] = await ethers.getSigners();
    const fixture = await routerFixture(wallet);
    token0 = fixture.tokenA;
    token1 = fixture.tokenB;
    router = fixture.router;
    factory = fixture.factory;

    await factory.createCriteriaCoin(token1.address);
    await factory.createPair(token0.address, token1.address, 'TestLP', 'TLP');
    pair = await ethers.getContractAt('DexPair', await factory.allPairs(0));
  });

  afterEach(async () => {
    // 라우터 0갠지 테스트 끝나고 계속 체크.
    expect(await ethers.provider.getBalance(router.address)).to.eq(0);
  });

  async function addLiquidity(token0Amount: BigNumber, token1Amount: BigNumber) {
    await token0.transfer(pair.address, token0Amount);
    await token1.transfer(pair.address, token1Amount);
    await pair.mint(wallet.address);
  }

  it('quote', async () => {
    // quote메서드는 두 토큰 간의 교환비를 구함.
    // 100과 200의 교환비는 1:2이며, 첫번째 인자는 두번째 인자를 가르킴. 즉 2가 반환
    expect(await router.quote(BigNumber.from(1), BigNumber.from(100), BigNumber.from(200)))
      .to.eq(BigNumber.from(2));
    // 위 과정과 동일하게 동작. 2:1 이기에 1 반환.
    expect(await router.quote(BigNumber.from(2), BigNumber.from(200), BigNumber.from(100)))
      .to.eq(BigNumber.from(1));
    // 아래 3 케이스는 교환비 측정이 불가능한 값(0)을 넣어서 오류뜸.
    await expect(router.quote(BigNumber.from(0), BigNumber.from(100), BigNumber.from(200)))
      .to.be.revertedWith(
        'DexLibrary: INSUFFICIENT_AMOUNT',
      );
    await expect(router.quote(BigNumber.from(1), BigNumber.from(0), BigNumber.from(200)))
      .to.be.revertedWith(
        'DexLibrary: INSUFFICIENT_LIQUIDITY',
      );
    await expect(router.quote(BigNumber.from(1), BigNumber.from(100), BigNumber.from(0)))
      .to.be.revertedWith(
        'DexLibrary: INSUFFICIENT_LIQUIDITY',
      );
  });

  it('getAmountOut', async () => {
    // getAmountOut은 출력값으로 얻고자 하는 토큰의 수량을 계산하는 메서드.
    /**
     * 1. A토큰 2개로 B토큰을 스왑하고 싶음 (amountIN)
     * 2. 해당 풀에는 A토큰 100개, B토큰 100개가 저장되어 있음 (reserveIn, reserveOut)
     * 3. A토큰 2개를 B토큰으로 스왑했을 때 얻을 수 있는 B토큰은 1개임.
     *
     * x*y=k 공식을 따라야 함.
     * 위 공식으로 구한다 함.
     * 1.97이 나오는데 내림처리하나봄. 1로 되네.
     */
    expect(await router.getAmountOut(BigNumber.from(2), BigNumber.from(100), BigNumber.from(100)))
      .to.eq(BigNumber.from(1));

    // 아래는 계산안되게 0 넣어서 오류뜬것.
    await expect(router.getAmountOut(BigNumber.from(0), BigNumber.from(100), BigNumber.from(100)))
      .to.be.revertedWith(
        'DexLibrary: INSUFFICIENT_INPUT_AMOUNT',
      );
    await expect(router.getAmountOut(BigNumber.from(2), BigNumber.from(0), BigNumber.from(100)))
      .to.be.revertedWith(
        'DexLibrary: INSUFFICIENT_LIQUIDITY',
      );
    await expect(router.getAmountOut(BigNumber.from(2), BigNumber.from(100), BigNumber.from(0)))
      .to.be.revertedWith(
        'DexLibrary: INSUFFICIENT_LIQUIDITY',
      );
  });

  it('getAmountIn', async () => {
    // getAmountIn은 출력값으로 내고자 하는 토큰의 수량을 계산하는 메서드.
    /**
     * 1. 교환하고자 하는 B토큰의 수량을 입력 (amountOut)
     * 2. 해당 풀에는 A토큰 100개, B토큰 100개가 저장되어 있음 (reserveIn, reserveOut)
     * 3. B토큰 1개를 얻기 위해선 A토큰 2개를 내야 함.
     *
     * amountIn = amountOut * reserveIn / (reserveOut - amountOut)
     * 위 공식으로 구한다 함.
     */
    expect(await router.getAmountIn(BigNumber.from(1), BigNumber.from(100), BigNumber.from(100)))
      .to.eq(BigNumber.from(2));
    await expect(router.getAmountIn(BigNumber.from(0), BigNumber.from(100), BigNumber.from(100)))
      .to.be.revertedWith(
        'DexLibrary: INSUFFICIENT_OUTPUT_AMOUNT',
      );
    await expect(router.getAmountIn(BigNumber.from(1), BigNumber.from(0), BigNumber.from(100)))
      .to.be.revertedWith(
        'DexLibrary: INSUFFICIENT_LIQUIDITY',
      );
    await expect(router.getAmountIn(BigNumber.from(1), BigNumber.from(100), BigNumber.from(0)))
      .to.be.revertedWith(
        'DexLibrary: INSUFFICIENT_LIQUIDITY',
      );
  });

  it('getAmountsOut', async () => {
    // router한테 토큰 권한 준다음에 유동성 풀 만듦.
    await token0.approve(router.address, constants.MaxUint256);

    await token1.approve(router.address, constants.MaxUint256);

    await router.addLiquidity(
      // 사용 토큰 2개랑 가격
      token0.address,
      token1.address,
      10000,
      10000,
      // 최소환 받을 토큰 값
      0,
      0,
      // 유동성 풀 토큰을 받을 주소.
      wallet.address,
      // 유동성 추가 거래의 기한. 무제한으로 함.
      constants.MaxUint256,
    );

    // 토큰 0 2개 넣었을 때 토큰 1 1개 받는다는 검증.
    const path = [token0.address, token1.address];
    expect(await router.getAmountsOut(BigNumber.from(2), path))
      .to.deep.eq([BigNumber.from(2), BigNumber.from(1)]);
  });

  it('getAmountsIn', async () => {
    // 위랑 같음.
    await token0.approve(router.address, constants.MaxUint256);
    await token1.approve(router.address, constants.MaxUint256);
    await router.addLiquidity(
      token0.address,
      token1.address,
      BigNumber.from(10000),
      BigNumber.from(10000),
      0,
      0,
      wallet.address,
      constants.MaxUint256,
    );

    // 토큰1 1개 얻기 위해서 토큰0 2개 제출해야 한다 함.
    const path = [token0.address, token1.address];
    expect(await router.getAmountsIn(BigNumber.from(1), path))
      .to.deep.eq([BigNumber.from(2), BigNumber.from(1)]);
  });

  it('addLiquidity', async () => {
    const token0Amount = ethers.utils.parseEther('1');
    const token1Amount = ethers.utils.parseEther('4');

    const expectedLiquidity = ethers.utils.parseEther('2');
    await token0.approve(router.address, constants.MaxUint256);
    await token1.approve(router.address, constants.MaxUint256);
    // router통해서 풀 생성되는 과정 보여주는듯.
    await expect(
      router.addLiquidity(
        token0.address,
        token1.address,
        token0Amount,
        token1Amount,
        0,
        0,
        wallet.address,
        constants.MaxUint256,
      ),
    )
      .to.emit(token0, 'Transfer')
      .withArgs(wallet.address, pair.address, token0Amount)
      .to.emit(token1, 'Transfer')
      .withArgs(wallet.address, pair.address, token1Amount)
      .to.emit(pair, 'Transfer')
      .withArgs(constants.AddressZero, constants.AddressZero, MINIMUM_LIQUIDITY)
      .to.emit(pair, 'Transfer')
      .withArgs(constants.AddressZero, wallet.address, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
      .to.emit(pair, 'Sync')
      .withArgs(token0Amount, token1Amount)
      .to.emit(pair, 'Mint')
      .withArgs(router.address, token0Amount, token1Amount);

    // wallet에 pair토큰 잘 갖고 있는지 확인.
    expect(await pair.balanceOf(wallet.address)).to.eq(expectedLiquidity.sub(MINIMUM_LIQUIDITY));
  });

  it('addLiquidityNonExistedPool', async () => {
    const token2 = await (await ethers.getContractFactory('KIP7Mock')).deploy(ethers.utils.parseEther('400'));
    const token1Amount = ethers.utils.parseEther('1');
    const token2Amount = ethers.utils.parseEther('4');

    await factory.createCriteriaCoin(token1.address);
    await factory.createPair(token2.address, token1.address, 'TestLP', 'TLP');
    pair = await ethers.getContractAt('DexPair', await factory.allPairs(0));

    await token1.approve(router.address, constants.MaxUint256);
    await token2.approve(router.address, constants.MaxUint256);
    await expect(
      router.addLiquidity(
        token2.address,
        token1.address,
        token1Amount,
        token2Amount,
        0,
        0,
        wallet.address,
        constants.MaxUint256,
      ),
    )
      .to.emit(token2, 'Transfer')
      .to.emit(token1, 'Transfer');
  });

  it('addLiquidity:fail', async () => {
    const token0Amount = ethers.utils.parseEther('1');
    const token1Amount = ethers.utils.parseEther('4');

    await token0.approve(router.address, constants.MaxUint256);
    await token1.approve(router.address, constants.MaxUint256);
    await router.addLiquidity(
      token0.address,
      token1.address,
      token0Amount,
      token1Amount,
      0,
      0,
      wallet.address,
      constants.MaxUint256,
    );
    await expect(
      router.addLiquidity(
        token0.address,
        token1.address,
        10,
        10,
        token0Amount,
        token1Amount,
        wallet.address,
        constants.MaxUint256,
      ),
    ).to.be.revertedWithCustomError(router, 'InsufficientAmount')
      .withArgs('DexRouter: INSUFFICIENT_A_AMOUNT');
    // 최소 충족 B토큰이 전체니까 오류뜸.
    await expect(
      router.addLiquidity(
        token0.address,
        token1.address,
        10,
        token1Amount,
        token0Amount,
        token1Amount,
        wallet.address,
        constants.MaxUint256,
      ),
    ).to.be.revertedWithCustomError(router, 'InsufficientAmount')
      .withArgs('DexRouter: INSUFFICIENT_B_AMOUNT');
    // deadline이 없으니까 오류뜸.
    await expect(
      router.addLiquidity(
        token0.address,
        token1.address,
        token0Amount,
        token1Amount,
        token0Amount,
        token1Amount,
        wallet.address,
        0,
      ),
    ).to.be.revertedWithCustomError(router, 'Expired');
    // 페어토큰 수령 주소가 없어서 오류뜸.
    await expect(
      router.addLiquidity(
        token0.address,
        token1.address,
        token0Amount,
        token1Amount,
        0,
        0,
        constants.AddressZero,
        constants.MaxUint256,
      ),
    ).to.be.revertedWithCustomError(router, 'InvalidAddressParameters')
      .withArgs('DexRouter: RECIPIENT_ZERO_ADDRESS');
  });

  it('removeLiquidity', async () => {
    // 풀 생성
    const token0Amount = ethers.utils.parseEther('1');
    const token1Amount = ethers.utils.parseEther('4');
    await addLiquidity(token0Amount, token1Amount);
    const expectedLiquidity = ethers.utils.parseEther('2');
    // router한테 페어 토큰권한 다줌.
    await pair.approve(router.address, constants.MaxUint256);
    // 대충 비율 맞추면서 풀 삭제함.
    await expect(
      router.removeLiquidity(
        token0.address,
        token1.address,
        expectedLiquidity.sub(MINIMUM_LIQUIDITY),
        0,
        0,
        wallet.address,
        constants.MaxUint256,
      ),
    )
      .to.emit(pair, 'Transfer')
      .withArgs(wallet.address, pair.address, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
      .to.emit(pair, 'Transfer')
      .withArgs(pair.address, constants.AddressZero, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
      .to.emit(token0, 'Transfer')
      // 이부분은 최소 1:4비율 유지하기 위해 조금 뺀듯. 슬리피지 방지.
      .withArgs(pair.address, wallet.address, token0Amount.sub(500))
      .to.emit(token1, 'Transfer')
      .withArgs(pair.address, wallet.address, token1Amount.sub(2000))
      .to.emit(pair, 'Sync')
      .withArgs(500, 2000)
      .to.emit(pair, 'Burn')
      .withArgs(router.address, token0Amount.sub(500), token1Amount.sub(2000), wallet.address);

    // 예상치 검증.
    expect(await pair.balanceOf(wallet.address)).to.eq(0);
    const totalSupplyToken0 = await token0.totalSupply();
    const totalSupplyToken1 = await token1.totalSupply();
    expect(await token0.balanceOf(wallet.address)).to.eq(totalSupplyToken0.sub(500));
    expect(await token1.balanceOf(wallet.address)).to.eq(totalSupplyToken1.sub(2000));
  });
  it('removeLiquidity:fail', async () => {
    const token0Amount = ethers.utils.parseEther('1');
    const token1Amount = ethers.utils.parseEther('4');
    await addLiquidity(token0Amount, token1Amount);

    const expectedLiquidity = ethers.utils.parseEther('2');
    await pair.approve(router.address, constants.MaxUint256);
    await expect(
      router.removeLiquidity(
        token0.address,
        token1.address,
        expectedLiquidity.sub(MINIMUM_LIQUIDITY),
        expectedLiquidity,
        0,
        wallet.address,
        constants.MaxUint256,
      ),
    ).to.be.revertedWithCustomError(router, 'InsufficientAmount')
      .withArgs('DexRouter: INSUFFICIENT_A_AMOUNT');
    await expect(
      router.removeLiquidity(
        token0.address,
        token1.address,
        expectedLiquidity.sub(MINIMUM_LIQUIDITY),
        0,
        ethers.utils.parseEther('4'),
        wallet.address,
        constants.MaxUint256,
      ),
    ).to.be.revertedWithCustomError(router, 'InsufficientAmount')
      .withArgs('DexRouter: INSUFFICIENT_B_AMOUNT');
    await expect(
      router.removeLiquidity(
        token0.address,
        token1.address,
        expectedLiquidity.sub(MINIMUM_LIQUIDITY),
        0,
        0,
        constants.AddressZero,
        constants.MaxUint256,
      ),
    ).to.be.revertedWithCustomError(router, 'InvalidAddressParameters')
      .withArgs('DexRouter: RECIPIENT_ZERO_ADDRESS');
  });

  // 정확한 입력 토큰의 양을 사용하여 최소한으로 지정된 다른 토큰의 양을 얻을 때 사용
  describe('swapExactTokensForTokens', () => {
    const token0Amount = ethers.utils.parseEther('5');
    const token1Amount = ethers.utils.parseEther('10');
    const swapAmount = ethers.utils.parseEther('1');
    const expectedOutputAmount = BigNumber.from('1662497915624478906');

    beforeEach(async () => {
      await addLiquidity(token0Amount, token1Amount);
      await token0.approve(router.address, constants.MaxUint256);
    });

    it('happy path', async () => {
      await expect(
        router.swapExactTokensForTokens(
          swapAmount,
          // 삐--
          constants.MaxUint256,
          [token0.address, token1.address],
          wallet.address,
          constants.MaxUint256,
        ),
      ).to.be.revertedWithCustomError(router, 'InsufficientAmount')
        .withArgs('DexRouter: INSUFFICIENT_OUTPUT_AMOUNT');

      await expect(
        router.swapExactTokensForTokens(
          swapAmount,
          0,
          [token0.address, token1.address],
          // 삐--
          constants.AddressZero,
          constants.MaxUint256,
        ),
      ).to.be.revertedWithCustomError(router, 'InvalidAddressParameters')
        .withArgs('DexRouter: SWAP_TO_ZERO_ADDRESS');

      await expect(
        router.swapExactTokensForTokens(
          swapAmount,
          0,
          [token0.address, token1.address],
          wallet.address,
          constants.MaxUint256,
        ),
      )
        .to.emit(token0, 'Transfer')
        .withArgs(wallet.address, pair.address, swapAmount)
        .to.emit(token1, 'Transfer')
        .withArgs(pair.address, wallet.address, expectedOutputAmount)
        .to.emit(pair, 'Sync')
        .withArgs(token0Amount.add(swapAmount), token1Amount.sub(expectedOutputAmount))
        .to.emit(pair, 'Swap')
        .withArgs(router.address, swapAmount, 0, 0, expectedOutputAmount, wallet.address);
    });

    it('gas [ @skip-on-coverage ]', async () => {
      await mineBlock((await ethers.provider.getBlock('latest')).timestamp + 1);
      await pair.sync();

      await token0.approve(router.address, constants.MaxUint256);
      await mineBlock((await ethers.provider.getBlock('latest')).timestamp + 1);
      const tx = await router.swapExactTokensForTokens(
        swapAmount,
        0,
        [token0.address, token1.address],
        wallet.address,
        constants.MaxUint256,
      );
      const receipt = await tx.wait();
      expect(receipt.gasUsed).to.eq(116332);
    }).retries(3);
  });

  // 최대한으로 지정된 다른 토큰의 양을 얻기 위해 가능한 한 많은 양의 입력 토큰을 사용해 교환을 처리할 때 사용.
  describe('swapTokensForExactTokens', () => {
    const token0Amount = ethers.utils.parseEther('5');
    const token1Amount = ethers.utils.parseEther('10');
    const expectedSwapAmount = BigNumber.from('557227237267357629');
    const outputAmount = ethers.utils.parseEther('1');

    beforeEach(async () => {
      await addLiquidity(token0Amount, token1Amount);
    });

    it('happy path', async () => {
      await token0.approve(router.address, constants.MaxUint256);
      await expect(
        router.swapTokensForExactTokens(
          outputAmount,
          // 삐--
          constants.Zero,
          [token0.address, token1.address],
          wallet.address,
          constants.MaxUint256,
        ),
      )
        .to.be.revertedWithCustomError(router, 'ExcessiveInputAmount');
      await expect(
        router.swapTokensForExactTokens(
          outputAmount,
          constants.MaxUint256,
          [token0.address, token1.address],
          wallet.address,
          constants.MaxUint256,
        ),
      )
        .to.emit(token0, 'Transfer')
        .withArgs(wallet.address, pair.address, expectedSwapAmount)
        .to.emit(token1, 'Transfer')
        .withArgs(pair.address, wallet.address, outputAmount)
        .to.emit(pair, 'Sync')
        .withArgs(token0Amount.add(expectedSwapAmount), token1Amount.sub(outputAmount))
        .to.emit(pair, 'Swap')
        .withArgs(router.address, expectedSwapAmount, 0, 0, outputAmount, wallet.address);
    });
  });
});
