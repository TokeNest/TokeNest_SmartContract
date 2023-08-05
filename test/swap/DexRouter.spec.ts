import { expect } from 'chai';
import { ethers } from 'hardhat';
import { Contract, BigNumber, constants } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { routerFixture } from '../shared/fixtures';
import { getPermitSignature, mineBlock } from '../shared/utilities';
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
  let WKLAY: Contract;
  let WKLAYPair: DexPair;
  let WKLAYPartner: Contract;

  beforeEach(async () => {
    // 기본값 세팅
    [wallet] = await ethers.getSigners();
    const fixture = await routerFixture(wallet);
    token0 = fixture.token0;
    token1 = fixture.token1;
    router = fixture.router;
    factory = fixture.factory;
    pair = fixture.pair;
    WKLAY = fixture.WKLAY;
    WKLAYPair = fixture.WKLAYPair;
    WKLAYPartner = fixture.WKLAYPartner;
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

  it('deploy:fail, wrong address parameters', async () => {
    console.log(constants.MaxUint256);
    // factory가 zero Address임.
    const dexRouter = await ethers.getContractFactory('DexRouter');
    await expect(dexRouter.deploy(constants.AddressZero, WKLAY.address))
      .to.be.revertedWithCustomError(dexRouter, 'InvalidAddressParameters')
      .withArgs('DexRouter: FACTORY_ZERO_ADDRESS');
    // 토큰 자리에 zero Address라 오류ㅡ
    await expect(dexRouter.deploy(factory.address, constants.AddressZero))
      .to.be.revertedWithCustomError(dexRouter, 'InvalidAddressParameters')
      .withArgs('DexRouter: WKLAY_ZERO_ADDRESS');
  });

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
     * 이건 또 강제올림 하나봄.. 1.01인데 2가되네.
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
    // console.log(await ethers.utils.parseEther('10000'));
    // getAmountsOut메서드의 경로가 잘못됨.
    await expect(router.getAmountsOut(BigNumber.from(2), [token0.address])).to.be.revertedWith(
      'DexLibrary: INVALID_PATH',
    );
    // 토큰 0 2개 넣었을 때 토큰 1 1개 받는다는 검증. (여기서 1.999 이겠지만, 강제내림해서 1로 하나봄. 아래부터 이얘기 생략.)
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

    await expect(router.getAmountsIn(BigNumber.from(1), [token0.address])).to.be.revertedWith(
      'DexLibrary: INVALID_PATH',
    );
    // 토큰1 1개 얻기 위해서 토큰0 2개 제출해야 한다 함.
    const path = [token0.address, token1.address];
    expect(await router.getAmountsIn(BigNumber.from(1), path))
      .to.deep.eq([BigNumber.from(2), BigNumber.from(1)]);
  });

  it('factory, WKLAY', async () => {
    // router의 factory랑 WKALY 체크.
    expect(await router.factory()).to.eq(factory.address);
    expect(await router.WKLAY()).to.eq(WKLAY.address);
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
    // 위랑 좀 다른거같은데 잘 모르겠네. 새로 token2만들어서 풀 만드는거라 좀 다른듯..?
    const token2 = await (await ethers.getContractFactory('KIP7Mock')).deploy(ethers.utils.parseEther('400'));
    const token0Amount = ethers.utils.parseEther('1');
    const token2Amount = ethers.utils.parseEther('4');

    await token0.approve(router.address, constants.MaxUint256);
    await token2.approve(router.address, constants.MaxUint256);
    await expect(
      router.addLiquidity(
        token0.address,
        token2.address,
        token0Amount,
        token2Amount,
        0,
        0,
        wallet.address,
        constants.MaxUint256,
      ),
    )
      .to.emit(token0, 'Transfer')
      .to.emit(token2, 'Transfer')
      .to.emit(factory, 'PairCreated');
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
    // A토큰 부족? 오류뜨는데 정확하겐 모르겠음.
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

  it('addLiquidityKLAY:fail', async () => {
    const WKLAYPartnerAmount = ethers.utils.parseEther('1');
    const KLAYAmount = ethers.utils.parseEther('4');
    await WKLAYPartner.approve(router.address, constants.MaxUint256);
    // 개똥같이 파라미터 집어넣네.. 수취주소가 제로라 그런듯.
    await expect(
      router.addLiquidityKLAY(
        WKLAYPartner.address,
        WKLAYPartnerAmount,
        WKLAYPartnerAmount,
        KLAYAmount,
        constants.AddressZero,
        constants.MaxUint256,
        { value: KLAYAmount },
      ),
    ).to.be.revertedWithCustomError(router, 'InvalidAddressParameters')
      .withArgs('DexRouter: RECIPIENT_ZERO_ADDRESS');
  });

  it('addLiquidityKLAY', async () => {
    const WKLAYPartnerAmount = ethers.utils.parseEther('1');
    const KLAYAmount = ethers.utils.parseEther('4');

    const expectedLiquidity = ethers.utils.parseEther('2');
    const WKLAYPairToken0 = await WKLAYPair.token0();
    await WKLAYPartner.approve(router.address, constants.MaxUint256);
    // addLiquidityKLAY메서드로 KLAY랑 KLATYPartner를 가지는 페어 만들려 함.
    await expect(
      router.addLiquidityKLAY(
        WKLAYPartner.address,
        WKLAYPartnerAmount,
        WKLAYPartnerAmount,
        KLAYAmount,
        wallet.address,
        constants.MaxUint256,
        { value: KLAYAmount },
      ),
    )
      .to.emit(WKLAYPair, 'Transfer')
      .withArgs(constants.AddressZero, constants.AddressZero, MINIMUM_LIQUIDITY)
      .to.emit(WKLAYPair, 'Transfer')
      .withArgs(constants.AddressZero, wallet.address, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
      .to.emit(WKLAYPair, 'Sync')
      .withArgs(
        WKLAYPairToken0 === WKLAYPartner.address ? WKLAYPartnerAmount : KLAYAmount,
        WKLAYPairToken0 === WKLAYPartner.address ? KLAYAmount : WKLAYPartnerAmount,
      )
      .to.emit(WKLAYPair, 'Mint')
      .withArgs(
        router.address,
        WKLAYPairToken0 === WKLAYPartner.address ? WKLAYPartnerAmount : KLAYAmount,
        WKLAYPairToken0 === WKLAYPartner.address ? KLAYAmount : WKLAYPartnerAmount,
      );

    expect(await WKLAYPair.balanceOf(wallet.address))
      .to.eq(expectedLiquidity.sub(MINIMUM_LIQUIDITY));

    const KlayBalance = await ethers.provider.getBalance(wallet.address);
    // wallet이 갖고 있는 KLAY의 절반만 사용해 추가함.
    console.log(KlayBalance);
    await router.addLiquidityKLAY(
      WKLAYPartner.address,
      WKLAYPartnerAmount,
      WKLAYPartnerAmount,
      KLAYAmount,
      wallet.address,
      constants.MaxUint256,
      { value: KlayBalance.div(2) },
    );
    // 아래 expect는 KLAYAmount 4개 잘 빠졌는지랑 0.002 사이로 오차 있는지 보는거 같음.
    // extra value gets refunded
    expect(await ethers.provider.getBalance(wallet.address))
    // approximately는 예상 값과 실제 값의 차이를 지정한 허용 오차 범이 내에서 확인. 0.002 만큼의 오차가 나는지 보는것.
      .to.be.approximately(KlayBalance.sub(KLAYAmount), ethers.utils.parseEther('0.002'));
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
  it('removeLiquidityKLAY', async () => {
    const WKLAYPartnerAmount = ethers.utils.parseEther('1');
    const KLAYAmount = ethers.utils.parseEther('4');
    await WKLAYPartner.transfer(WKLAYPair.address, WKLAYPartnerAmount);
    // klay를 WKLAY로 바꾸는 작업. 0 -> 4
    await WKLAY.deposit({ value: KLAYAmount });
    // 이후 WKLAYPair에 전송.
    await WKLAY.transfer(WKLAYPair.address, KLAYAmount);
    // pair 생성.
    await WKLAYPair.mint(wallet.address);

    // remove진행
    const expectedLiquidity = ethers.utils.parseEther('2');
    const WKLAYPairToken0 = await WKLAYPair.token0();
    await WKLAYPair.approve(router.address, constants.MaxUint256);
    await expect(
      router.removeLiquidityKLAY(
        WKLAYPartner.address,
        expectedLiquidity.sub(MINIMUM_LIQUIDITY),
        0,
        0,
        wallet.address,
        constants.MaxUint256,
      ),
    )
      .to.emit(WKLAYPair, 'Transfer')
      .withArgs(wallet.address, WKLAYPair.address, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
      .to.emit(WKLAYPair, 'Transfer')
      .withArgs(WKLAYPair.address, constants.AddressZero, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
      .to.emit(WKLAY, 'Transfer')
      .withArgs(WKLAYPair.address, router.address, KLAYAmount.sub(2000))
      .to.emit(WKLAYPartner, 'Transfer')
      .withArgs(WKLAYPair.address, router.address, WKLAYPartnerAmount.sub(500))
      .to.emit(WKLAYPartner, 'Transfer')
      .withArgs(router.address, wallet.address, WKLAYPartnerAmount.sub(500))
      .to.emit(WKLAYPair, 'Sync')
      .withArgs(
        WKLAYPairToken0 === WKLAYPartner.address ? 500 : 2000,
        WKLAYPairToken0 === WKLAYPartner.address ? 2000 : 500,
      )
      .to.emit(WKLAYPair, 'Burn')
      .withArgs(
        router.address,
        WKLAYPairToken0 === WKLAYPartner.address
          ? WKLAYPartnerAmount.sub(500) : KLAYAmount.sub(2000),
        WKLAYPairToken0 === WKLAYPartner.address
          ? KLAYAmount.sub(2000) : WKLAYPartnerAmount.sub(500),
        router.address,
      );

    // 값 예측
    expect(await WKLAYPair.balanceOf(wallet.address)).to.eq(0);
    const totalSupplyWKLAYPartner = await WKLAYPartner.totalSupply();
    const totalSupplyWKLAY = await WKLAY.totalSupply();
    expect(await WKLAYPartner.balanceOf(wallet.address)).to.eq(totalSupplyWKLAYPartner.sub(500));
    expect(await WKLAY.balanceOf(wallet.address)).to.eq(totalSupplyWKLAY.sub(2000));
  });

  it('removeLiquidityWithPermit', async () => {
    const token0Amount = ethers.utils.parseEther('1');
    const token1Amount = ethers.utils.parseEther('4');
    await addLiquidity(token0Amount, token1Amount);

    const expectedLiquidity = ethers.utils.parseEther('2');

    const nonce = await pair.nonces(wallet.address);
    const digest = await getPermitSignature(
      wallet,
      pair,
      31337,
      {
        owner: wallet.address,
        spender: router.address,
        value: expectedLiquidity.sub(MINIMUM_LIQUIDITY),
        nonce,
        deadline: constants.MaxUint256,
      },
    );
    const sig = ethers.utils.splitSignature(
      ethers.utils.arrayify(digest),
    );

    await router.removeLiquidityWithPermit(
      token0.address,
      token1.address,
      expectedLiquidity.sub(MINIMUM_LIQUIDITY),
      0,
      0,
      wallet.address,
      constants.MaxUint256,
      false,
      sig.v,
      sig.r,
      sig.s,
    );
  });

  it('removeLiquidityKLAYWithPermit', async () => {
    const WKLAYPartnerAmount = ethers.utils.parseEther('1');
    const KLAYAmount = ethers.utils.parseEther('4');
    await WKLAYPartner.transfer(WKLAYPair.address, WKLAYPartnerAmount);
    await WKLAY.deposit({ value: KLAYAmount });
    await WKLAY.transfer(WKLAYPair.address, KLAYAmount);
    await WKLAYPair.mint(wallet.address);

    const expectedLiquidity = ethers.utils.parseEther('2');

    console.log(await WKLAYPair.nonces(wallet.address));
    // 아래처럼 WKLAYPair에 wallet서명자를 추가해 페어의 보안을 강화.
    const nonce = await WKLAYPair.nonces(wallet.address);
    const digest = await getPermitSignature(
      wallet,
      WKLAYPair,
      31337,
      {
        owner: wallet.address,
        spender: router.address,
        value: expectedLiquidity.sub(MINIMUM_LIQUIDITY),
        nonce,
        deadline: constants.MaxUint256,
      },
    );
    const sig = ethers.utils.splitSignature(digest);
    console.log(await WKLAYPair.nonces(wallet.address));
    await router.removeLiquidityKLAYWithPermit(
      WKLAYPartner.address,
      expectedLiquidity.sub(MINIMUM_LIQUIDITY),
      0,
      0,
      wallet.address,
      constants.MaxUint256,
      false,
      sig.v,
      sig.r,
      sig.s,
    );
    // 이때 wallet의 nonces가 증가함.
    console.log(await WKLAYPair.nonces(wallet.address));
  });

  // 입력 토큰의 양을 정확히 지정하고 얻을 수 있는 KLAY를 최대화하기 위해 사용.
  describe('swapExactTokensForKLAY', () => {
    const WKLAYPartnerAmount = ethers.utils.parseEther('5');
    const KLAYAmount = ethers.utils.parseEther('10');
    const swapAmount = ethers.utils.parseEther('1');
    const expectedOutputAmount = BigNumber.from('1662497915624478906');

    beforeEach(async () => {
      await WKLAYPartner.transfer(WKLAYPair.address, WKLAYPartnerAmount);
      await WKLAY.deposit({ value: KLAYAmount });
      await WKLAY.transfer(WKLAYPair.address, KLAYAmount);
      await WKLAYPair.mint(wallet.address);
    });

    it('happy path', async () => {
      await WKLAYPartner.approve(router.address, constants.MaxUint256);
      const WKLAYPairToken0 = await WKLAYPair.token0();
      await expect(
        router.swapExactTokensForKLAY(
          swapAmount,
          0,
          // 삐--
          [WKLAYPartner.address, WKLAYPartner.address],
          wallet.address,
          constants.MaxUint256,
        ),
      ).to.be.revertedWithCustomError(router, 'InvalidPath');
      await expect(
        router.swapExactTokensForKLAY(
          swapAmount,
          // 삐--
          KLAYAmount,
          [WKLAYPartner.address, WKLAY.address],
          wallet.address,
          constants.MaxUint256,
        ),
      ).to.be.revertedWithCustomError(router, 'InsufficientAmount')
        .withArgs('DexRouter: INSUFFICIENT_OUTPUT_AMOUNT');
      await expect(
        // 스왑할 양, 최소 아웃풋 수, WKAYPartner로 WKALY를 스왑하고 시픔.
        router.swapExactTokensForKLAY(
          swapAmount,
          0,
          [WKLAYPartner.address, WKLAY.address],
          wallet.address,
          constants.MaxUint256,
        ),
      )
        // WKLAYPartner가 페어로 들어감.
        .to.emit(WKLAYPartner, 'Transfer')
        .withArgs(wallet.address, WKLAYPair.address, swapAmount)
        // WKLAY는 라우터로 나옴.
        .to.emit(WKLAY, 'Transfer')
        .withArgs(WKLAYPair.address, router.address, expectedOutputAmount)
        // 개수 Sync조정.
        .to.emit(WKLAYPair, 'Sync')
        .withArgs(
          WKLAYPairToken0 === WKLAYPartner.address
            ? WKLAYPartnerAmount.add(swapAmount)
            : KLAYAmount.sub(expectedOutputAmount),
          WKLAYPairToken0 === WKLAYPartner.address
            ? KLAYAmount.sub(expectedOutputAmount)
            : WKLAYPartnerAmount.add(swapAmount),
        )
        // Swap진행.
        .to.emit(WKLAYPair, 'Swap')
        .withArgs(
          router.address,
          WKLAYPairToken0 === WKLAYPartner.address ? swapAmount : 0,
          WKLAYPairToken0 === WKLAYPartner.address ? 0 : swapAmount,
          WKLAYPairToken0 === WKLAYPartner.address ? 0 : expectedOutputAmount,
          WKLAYPairToken0 === WKLAYPartner.address ? expectedOutputAmount : 0,
          router.address,
        );
    });
  });
  // 얻고자 하는 다른 토큰의 양을 정확히 지정하고 그에 맞는 최소한의 KLAY를 사용하려고 할 때 사용.
  describe('swapKLAYForExactTokens', () => {
    const WKLAYPartnerAmount = ethers.utils.parseEther('10');
    const KLAYAmount = ethers.utils.parseEther('5');
    const expectedSwapAmount = BigNumber.from('557227237267357629');
    const outputAmount = ethers.utils.parseEther('1');

    beforeEach(async () => {
      await WKLAYPartner.transfer(WKLAYPair.address, WKLAYPartnerAmount);
      await WKLAY.deposit({ value: KLAYAmount });
      await WKLAY.transfer(WKLAYPair.address, KLAYAmount);
      await WKLAYPair.mint(wallet.address);
    });

    it('happy path', async () => {
      const WKLAYPairToken0 = await WKLAYPair.token0();
      await expect(
        router.swapKLAYForExactTokens(
          outputAmount,
          // 삐--
          [WKLAYPartner.address, WKLAYPartner.address],
          wallet.address,
          constants.MaxUint256,
          {
            value: expectedSwapAmount,
          },
        ),
      ).to.be.revertedWithCustomError(router, 'InvalidPath');
      await expect(
        router.swapKLAYForExactTokens(
          outputAmount,
          [WKLAY.address, WKLAYPartner.address],
          wallet.address,
          constants.MaxUint256,
          {
            // 삐--
            value: 5,
          },
        ),
      ).to.be.revertedWithCustomError(router, 'ExcessiveInputAmount');
      await expect(
        router.swapKLAYForExactTokens(
          outputAmount,
          [WKLAY.address, WKLAYPartner.address],
          wallet.address,
          constants.MaxUint256,
          {
            value: expectedSwapAmount,
          },
        ),
      )
        // 예상치만큼 WKLAY 페어에 들감.
        .to.emit(WKLAY, 'Transfer')
        .withArgs(router.address, WKLAYPair.address, expectedSwapAmount)
        // 빼고싶은 값만큼 바로 wallet으로 들감.
        .to.emit(WKLAYPartner, 'Transfer')
        .withArgs(WKLAYPair.address, wallet.address, outputAmount)
        .to.emit(WKLAYPair, 'Sync')
        .withArgs(
          WKLAYPairToken0 === WKLAYPartner.address
            ? WKLAYPartnerAmount.sub(outputAmount)
            : KLAYAmount.add(expectedSwapAmount),
          WKLAYPairToken0 === WKLAYPartner.address
            ? KLAYAmount.add(expectedSwapAmount)
            : WKLAYPartnerAmount.sub(outputAmount),
        )
        .to.emit(WKLAYPair, 'Swap')
        .withArgs(
          router.address,
          WKLAYPairToken0 === WKLAYPartner.address ? 0 : expectedSwapAmount,
          WKLAYPairToken0 === WKLAYPartner.address ? expectedSwapAmount : 0,
          WKLAYPairToken0 === WKLAYPartner.address ? outputAmount : 0,
          WKLAYPairToken0 === WKLAYPartner.address ? 0 : outputAmount,
          wallet.address,
        );
    });

    it('happy path with extra KLAY', async () => {
      const WKLAYPairToken0 = await WKLAYPair.token0();
      await expect(
        router.swapKLAYForExactTokens(
          outputAmount,
          [WKLAY.address, WKLAYPartner.address],
          wallet.address,
          constants.MaxUint256,
          {
            // 스왑할 때 추가적인 KLAY 50배만큼 더 넣음. 이게 없으면 기본값 0.
            value: expectedSwapAmount.mul(50),
          },
        ),
      )
        .to.emit(WKLAY, 'Transfer')
        .withArgs(router.address, WKLAYPair.address, expectedSwapAmount)
        .to.emit(WKLAYPartner, 'Transfer')
        .withArgs(WKLAYPair.address, wallet.address, outputAmount)
        .to.emit(WKLAYPair, 'Sync')
        .withArgs(
          WKLAYPairToken0 === WKLAYPartner.address
            ? WKLAYPartnerAmount.sub(outputAmount)
            : KLAYAmount.add(expectedSwapAmount),
          WKLAYPairToken0 === WKLAYPartner.address
            ? KLAYAmount.add(expectedSwapAmount)
            : WKLAYPartnerAmount.sub(outputAmount),
        )
        .to.emit(WKLAYPair, 'Swap')
        .withArgs(
          router.address,
          WKLAYPairToken0 === WKLAYPartner.address ? 0 : expectedSwapAmount,
          WKLAYPairToken0 === WKLAYPartner.address ? expectedSwapAmount : 0,
          WKLAYPairToken0 === WKLAYPartner.address ? outputAmount : 0,
          WKLAYPairToken0 === WKLAYPartner.address ? 0 : outputAmount,
          wallet.address,
        );
    });
  });

  // KLAY의 양을 정확히 지정하고 얻을 수 있는 다른 토큰의 양을 최대화하기 위해 사용.
  describe('swapExactKLAYForTokens', () => {
    const WKLAYPartnerAmount = ethers.utils.parseEther('10');
    const KLAYAmount = ethers.utils.parseEther('5');
    const swapAmount = ethers.utils.parseEther('1');
    const expectedOutputAmount = BigNumber.from('1662497915624478906');

    beforeEach(async () => {
      await WKLAYPartner.transfer(WKLAYPair.address, WKLAYPartnerAmount);
      await WKLAY.deposit({ value: KLAYAmount });
      await WKLAY.transfer(WKLAYPair.address, KLAYAmount);
      await WKLAYPair.mint(wallet.address);

      await token0.approve(router.address, constants.MaxUint256);
    });

    it('happy path', async () => {
      const WKLAYPairToken0 = await WKLAYPair.token0();
      await expect(
        router.swapExactKLAYForTokens(
          0,
          [WKLAYPartner.address, WKLAYPartner.address],
          wallet.address,
          constants.MaxUint256,
          {
            value: swapAmount,
          },
        ),
      ).to.be.revertedWithCustomError(router, 'InvalidPath');
      await expect(
        router.swapExactKLAYForTokens(
          swapAmount,
          [WKLAY.address, WKLAYPartner.address],
          wallet.address,
          constants.MaxUint256,
          {
            value: 1,
          },
        ),
      ).to.be.revertedWithCustomError(router, 'InsufficientAmount')
        .withArgs('DexRouter: INSUFFICIENT_OUTPUT_AMOUNT');
      await expect(
        router.swapExactKLAYForTokens(
          0,
          [WKLAY.address, WKLAYPartner.address],
          wallet.address,
          constants.MaxUint256,
          {
            value: swapAmount,
          },
        ),
      )
        .to.emit(WKLAY, 'Transfer')
        .withArgs(router.address, WKLAYPair.address, swapAmount)
        .to.emit(WKLAYPartner, 'Transfer')
        .withArgs(WKLAYPair.address, wallet.address, expectedOutputAmount)
        .to.emit(WKLAYPair, 'Sync')
        .withArgs(
          WKLAYPairToken0 === WKLAYPartner.address
            ? WKLAYPartnerAmount.sub(expectedOutputAmount)
            : KLAYAmount.add(swapAmount),
          WKLAYPairToken0 === WKLAYPartner.address
            ? KLAYAmount.add(swapAmount)
            : WKLAYPartnerAmount.sub(expectedOutputAmount),
        )
        .to.emit(WKLAYPair, 'Swap')
        .withArgs(
          router.address,
          WKLAYPairToken0 === WKLAYPartner.address ? 0 : swapAmount,
          WKLAYPairToken0 === WKLAYPartner.address ? swapAmount : 0,
          WKLAYPairToken0 === WKLAYPartner.address ? expectedOutputAmount : 0,
          WKLAYPairToken0 === WKLAYPartner.address ? 0 : expectedOutputAmount,
          wallet.address,
        );
    });
    // gas비용 테스트하려는거
    it('gas [ @skip-on-coverage ]', async () => {
      const WKLAYPartnerAmount2 = ethers.utils.parseEther('10');
      const KLAYAmount2 = ethers.utils.parseEther('5');
      await WKLAYPartner.transfer(WKLAYPair.address, WKLAYPartnerAmount2);
      await WKLAY.deposit({ value: KLAYAmount2 });
      await WKLAY.transfer(WKLAYPair.address, KLAYAmount2);
      await WKLAYPair.mint(wallet.address);

      // ensure that setting price{0,1}
      // CumulativeLast for the first time doesn't affect our gas math
      await mineBlock((await ethers.provider.getBlock('latest')).timestamp + 1);
      await pair.sync();

      const swapAmount2 = ethers.utils.parseEther('1');
      await mineBlock((await ethers.provider.getBlock('latest')).timestamp + 1);
      const tx = await router.swapExactKLAYForTokens(
        0,
        [WKLAY.address, WKLAYPartner.address],
        wallet.address,
        constants.MaxUint256,
        {
          value: swapAmount2,
        },
      );
      // receipt에서 gas가져오고 100 오차내에 포함되는지 3번 반복.
      const receipt = await tx.wait();
      expect(receipt.gasUsed).to.be.approximately(104746, 100);
    }).retries(3);
  });

  // 얻고자 하는 KLAY의 양을 저오학히 지정하고 이에 맞는 최소한의 입력 토큰을 사용하려고 할 때 사용.
  describe('swapTokensForExactKLAY', () => {
    const WKLAYPartnerAmount = ethers.utils.parseEther('5');
    const KLAYAmount = ethers.utils.parseEther('10');
    const expectedSwapAmount = BigNumber.from('557227237267357629');
    const outputAmount = ethers.utils.parseEther('1');

    beforeEach(async () => {
      await WKLAYPartner.transfer(WKLAYPair.address, WKLAYPartnerAmount);
      await WKLAY.deposit({ value: KLAYAmount });
      await WKLAY.transfer(WKLAYPair.address, KLAYAmount);
      await WKLAYPair.mint(wallet.address);
    });

    it('happy path', async () => {
      await WKLAYPartner.approve(router.address, constants.MaxUint256);
      const WKLAYPairToken0 = await WKLAYPair.token0();
      await expect(
        router.swapTokensForExactKLAY(
          outputAmount,
          constants.Zero,
          [WKLAYPartner.address, WKLAY.address],
          wallet.address,
          constants.MaxUint256,
        ),
      ).to.be.revertedWithCustomError(router, 'ExcessiveInputAmount');
      await expect(
        router.swapTokensForExactKLAY(
          outputAmount,
          constants.MaxUint256,
          [WKLAYPartner.address, WKLAYPartner.address],
          wallet.address,
          constants.MaxUint256,
        ),
      ).to.be.revertedWithCustomError(router, 'InvalidPath');
      await expect(
        router.swapTokensForExactKLAY(
          outputAmount,
          constants.MaxUint256,
          [WKLAYPartner.address, WKLAY.address],
          wallet.address,
          constants.MaxUint256,
        ),
      )
        .to.emit(WKLAYPartner, 'Transfer')
        .withArgs(wallet.address, WKLAYPair.address, expectedSwapAmount)
        .to.emit(WKLAY, 'Transfer')
        .withArgs(WKLAYPair.address, router.address, outputAmount)
        .to.emit(WKLAYPair, 'Sync')
        .withArgs(
          WKLAYPairToken0 === WKLAYPartner.address
            ? WKLAYPartnerAmount.add(expectedSwapAmount)
            : KLAYAmount.sub(outputAmount),
          WKLAYPairToken0 === WKLAYPartner.address
            ? KLAYAmount.sub(outputAmount)
            : WKLAYPartnerAmount.add(expectedSwapAmount),
        )
        .to.emit(WKLAYPair, 'Swap')
        .withArgs(
          router.address,
          WKLAYPairToken0 === WKLAYPartner.address ? expectedSwapAmount : 0,
          WKLAYPairToken0 === WKLAYPartner.address ? 0 : expectedSwapAmount,
          WKLAYPairToken0 === WKLAYPartner.address ? 0 : outputAmount,
          WKLAYPairToken0 === WKLAYPartner.address ? outputAmount : 0,
          router.address,
        );
    });
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
      expect(receipt.gasUsed).to.eq(101682);
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

describe('DexRouter fee-on-transfer tokens', async () => {
  let wallet : SignerWithAddress;
  let DTT: Contract;
  let WKLAY: Contract;
  let router: Contract;
  let factory: Contract;
  let pair: Contract;
  // DTT<>WKLAY 페어 만듦.
  beforeEach(async () => {
    [wallet] = await ethers.getSigners();
    const fixture = await routerFixture(wallet);

    WKLAY = fixture.WKLAY;
    router = fixture.router;
    factory = fixture.factory;

    const DTTFactory = await ethers.getContractFactory('DeflKIP7');
    DTT = await DTTFactory.deploy(ethers.utils.parseEther('10000'));

    // make a DTT<>WKLAY pair
    await factory.createPair(DTT.address, WKLAY.address);
    const pairAddress = await factory.getPair(DTT.address, WKLAY.address);
    pair = await ethers.getContractAt('DexPair', pairAddress);
  });

  afterEach(async () => {
    expect(await ethers.provider.getBalance(router.address)).to.eq(0);
  });

  async function addLiquidity(DTTAmount: BigNumber, WKLAYAmount: BigNumber) {
    await DTT.approve(router.address, constants.MaxUint256);
    await router.addLiquidityKLAY(
      DTT.address,
      DTTAmount,
      DTTAmount,
      WKLAYAmount,
      wallet.address,
      constants.MaxUint256,
      {
        value: WKLAYAmount,
      },
    );
  }

  // 풀을 삭제하며, 수수료를 부과하는 토큰이 올바르게 작동하는지 확인.
  it('removeLiquidityKLAYSupportingFeeOnTransferTokens', async () => {
    const DTTAmount = ethers.utils.parseEther('1');
    const KLAYAmount = ethers.utils.parseEther('4');
    await addLiquidity(DTTAmount, KLAYAmount);

    // pair의 DTT지분
    const DTTInPair = await DTT.balanceOf(pair.address);
    // pair의 WKLAY지분
    const WKLAYInPair = await WKLAY.balanceOf(pair.address);
    // wallet의 pair LP토큰
    const liquidity = await pair.balanceOf(wallet.address);
    // 총 pair 토큰
    const totalSupply = await pair.totalSupply();
    // 각 토큰의 pair에 얼마나 예치하고 있는지 찾는 로직.
    const NaiveDTTExpected = DTTInPair.mul(liquidity).div(totalSupply);
    const WKLAYExpected = WKLAYInPair.mul(liquidity).div(totalSupply);

    await pair.approve(router.address, constants.MaxUint256);
    await router.removeLiquidityKLAYSupportingFeeOnTransferTokens(
      DTT.address,
      liquidity,
      NaiveDTTExpected,
      WKLAYExpected,
      wallet.address,
      constants.MaxUint256,
    );
  });

  // 서명을 통한 풀 삭제 및 수수료 부과 토큰 적용 확인하는 메서드. (서명하면 approve같은거 없이 삭제 ㄱㄴ)
  it('removeLiquidityKLAYWithPermitSupportingFeeOnTransferTokens', async () => {
    const DTTAmount = ethers.utils.parseEther('1')
      .mul(100)
      .div(99);
    const KLAYAmount = ethers.utils.parseEther('4');
    await addLiquidity(DTTAmount, KLAYAmount);

    const nonce = await pair.nonces(wallet.address);
    const digest = await getPermitSignature(
      wallet,
      pair,
      31337,
      {
        owner: wallet.address,
        spender: router.address,
        value: await pair.balanceOf(wallet.address),
        nonce,
        deadline: constants.MaxUint256,
      },
    );
    const sig = ethers.utils.splitSignature(digest);

    const DTTInPair = await DTT.balanceOf(pair.address);
    const WKLAYInPair = await WKLAY.balanceOf(pair.address);
    const liquidity = await pair.balanceOf(wallet.address);
    const totalSupply = await pair.totalSupply();
    const NaiveDTTExpected = DTTInPair.mul(liquidity).div(totalSupply);
    const WKLAYExpected = WKLAYInPair.mul(liquidity).div(totalSupply);

    await pair.approve(router.address, constants.MaxUint256);
    await router.removeLiquidityKLAYWithPermitSupportingFeeOnTransferTokens(
      DTT.address,
      liquidity,
      NaiveDTTExpected,
      WKLAYExpected,
      wallet.address,
      constants.MaxUint256,
      false,
      sig.v,
      sig.r,
      sig.s,
    );
  });

  describe('swapExactTokensForTokensSupportingFeeOnTransferTokens', () => {
    // 수수료와 정확도 고려해 5보다 약간 크게 많듦.
    const DTTAmount = ethers.utils.parseEther('5')
      .mul(100)
      .div(99);
    const KLAYAmount = ethers.utils.parseEther('10');
    const amountIn = ethers.utils.parseEther('1');

    beforeEach(async () => {
      await addLiquidity(DTTAmount, KLAYAmount);
    });

    it('DTT -> WKLAY', async () => {
      await DTT.approve(router.address, constants.MaxUint256);

      await router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
        amountIn,
        0,
        [DTT.address, WKLAY.address],
        wallet.address,
        constants.MaxUint256,
      );
    });

    // WKLAY -> DTT
    it('WKLAY -> DTT', async () => {
      await WKLAY.deposit({ value: amountIn }); // mint WKLAY
      await WKLAY.approve(router.address, constants.MaxUint256);

      await expect(router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
        amountIn,
        // 삐--
        constants.MaxUint256,
        [WKLAY.address, DTT.address],
        wallet.address,
        constants.MaxUint256,
      )).to.be.revertedWithCustomError(router, 'InsufficientAmount')
        .withArgs('DexRouter: INSUFFICIENT_OUTPUT_AMOUNT');

      await router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
        amountIn,
        0,
        [WKLAY.address, DTT.address],
        wallet.address,
        constants.MaxUint256,
      );
    });
  });

  // KLAY -> DTT
  it('swapExactKLAYForTokensSupportingFeeOnTransferTokens', async () => {
    const DTTAmount = ethers.utils.parseEther('10')
      .mul(100)
      .div(99);
    const KLAYAmount = ethers.utils.parseEther('5');
    const swapAmount = ethers.utils.parseEther('1');
    await addLiquidity(DTTAmount, KLAYAmount);

    await expect(router.swapExactKLAYForTokensSupportingFeeOnTransferTokens(
      0,
      // 삐--
      [DTT.address, constants.AddressZero],
      wallet.address,
      constants.MaxUint256,
      {
        value: swapAmount,
      },
    )).to.be.revertedWithCustomError(router, 'InvalidPath');

    await expect(router.swapExactKLAYForTokensSupportingFeeOnTransferTokens(
      // 삐--
      constants.MaxUint256,
      [WKLAY.address, DTT.address],
      wallet.address,
      constants.MaxUint256,
      {
        value: swapAmount,
      },
    )).to.be.revertedWithCustomError(router, 'InsufficientAmount')
      .withArgs('DexRouter: INSUFFICIENT_OUTPUT_AMOUNT');

    await router.swapExactKLAYForTokensSupportingFeeOnTransferTokens(
      0,
      [WKLAY.address, DTT.address],
      wallet.address,
      constants.MaxUint256,
      {
        value: swapAmount,
      },
    );
  });

  // DTT -> KLAY
  it('swapExactTokensForKLAYSupportingFeeOnTransferTokens', async () => {
    const DTTAmount = ethers.utils.parseEther('5')
      .mul(100)
      .div(99);
    const KLAYAmount = ethers.utils.parseEther('10');
    const swapAmount = ethers.utils.parseEther('1');

    await addLiquidity(DTTAmount, KLAYAmount);
    await DTT.approve(router.address, constants.MaxUint256);

    await expect(router.swapExactTokensForKLAYSupportingFeeOnTransferTokens(
      swapAmount,
      0,
      // 삐--
      [WKLAY.address, DTT.address],
      wallet.address,
      constants.MaxUint256,
    )).to.be.revertedWithCustomError(router, 'InvalidPath');

    await expect(router.swapExactTokensForKLAYSupportingFeeOnTransferTokens(
      swapAmount,
      // 삐--
      constants.MaxUint256,
      [DTT.address, WKLAY.address],
      wallet.address,
      constants.MaxUint256,
    )).to.be.revertedWithCustomError(router, 'InsufficientAmount')
      .withArgs('DexRouter: INSUFFICIENT_OUTPUT_AMOUNT');

    await router.swapExactTokensForKLAYSupportingFeeOnTransferTokens(
      swapAmount,
      0,
      [DTT.address, WKLAY.address],
      wallet.address,
      constants.MaxUint256,
    );
  });
});

describe('DexRouter fee-on-transfer tokens: reloaded', async () => {
  let wallet: SignerWithAddress;
  let DTT: Contract;
  let DTT2: Contract;
  let router: Contract;
  beforeEach(async () => {
    [wallet] = await ethers.getSigners();
    const fixture = await routerFixture(wallet);
    router = fixture.router;

    const DTTFactory = await ethers.getContractFactory('DeflKIP7');
    DTT = await DTTFactory.deploy(ethers.utils.parseEther('10000'));
    DTT2 = await DTTFactory.deploy(ethers.utils.parseEther('10000'));

    // make a DTT<>DTT2 pair
    await fixture.factory.createPair(DTT.address, DTT2.address);
  });

  afterEach(async () => {
    expect(await ethers.provider.getBalance(router.address)).to.eq(0);
  });

  async function addLiquidity(DTTAmount: BigNumber, DTT2Amount: BigNumber) {
    await DTT.approve(router.address, constants.MaxUint256);
    await DTT2.approve(router.address, constants.MaxUint256);
    await router.addLiquidity(
      DTT.address,
      DTT2.address,
      DTTAmount,
      DTT2Amount,
      DTTAmount,
      DTT2Amount,
      wallet.address,
      constants.MaxUint256,
    );
  }

  describe('swapExactTokensForTokensSupportingFeeOnTransferTokens', () => {
    const DTTAmount = ethers.utils.parseEther('5')
      .mul(100)
      .div(99);
    const DTT2Amount = ethers.utils.parseEther('5');
    const amountIn = ethers.utils.parseEther('1');

    beforeEach(async () => {
      await addLiquidity(DTTAmount, DTT2Amount);
    });

    it('DTT -> DTT2', async () => {
      await DTT.approve(router.address, constants.MaxUint256);

      await expect(router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
        amountIn,
        0,
        [DTT.address, DTT2.address],
        // 삐--
        constants.AddressZero,
        constants.MaxUint256,
      )).to.be.revertedWithCustomError(router, 'InvalidAddressParameters')
        .withArgs('DexRouter: SWAP_TO_ZERO_ADDRESS');

      await router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
        amountIn,
        0,
        [DTT.address, DTT2.address],
        wallet.address,
        constants.MaxUint256,
      );
    });
  });
});
