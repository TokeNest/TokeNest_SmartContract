import { expect } from 'chai';
import { ethers } from 'hardhat';
import { Contract, BigNumber, constants } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { encodePrice, mineBlock } from '../shared/utilities';
import { pairFixture } from '../shared/fixtures';

const MINIMUM_LIQUIDITY = BigNumber.from(10).pow(3);

describe('DexPair', () => {
  let wallet: SignerWithAddress;
  let other: SignerWithAddress;

  let factory: Contract;
  let token0: Contract;
  let token1: Contract;
  let pair: Contract;
  beforeEach(async () => {
    // pair하나 생성해서 기본값 세팅하는 코든듯.
    [wallet, other] = await ethers.getSigners();
    const fixture = await pairFixture(wallet);
    factory = fixture.factory;
    // 각각 10000 ether씩 갖고있음.
    token0 = fixture.token0;
    token1 = fixture.token1;
    pair = fixture.pair;
  });

  it('mint', async () => {
    // token0에서 1개, token1에서 4개 이더 페어 주소에 보냄.
    const token0Amount = ethers.utils.parseEther('1');
    const token1Amount = ethers.utils.parseEther('4');
    await token0.transfer(pair.address, token0Amount);
    await token1.transfer(pair.address, token1Amount);

    // 예상되는 초기 유동성을 나타냄. 2이더로 예상한듯.
    const expectedLiquidity = ethers.utils.parseEther('2');
    // pair을 mint함.
    await expect(pair.mint(wallet.address))
      // 먼저 zero address에서 zero address로 최소 유동성 풀의 개수만큼 보냄.
      .to.emit(pair, 'Transfer')
      .withArgs(constants.AddressZero, constants.AddressZero, MINIMUM_LIQUIDITY)
      // 이후 zero address에서 wallet으로 예상 유동성 값 - 최소 유동성 값을 보냄.
      .to.emit(pair, 'Transfer')
      .withArgs(constants.AddressZero, wallet.address, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
      // 이후 pair로 보낸 1이더와 4이더를 Sync함.
      .to.emit(pair, 'Sync')
      .withArgs(token0Amount, token1Amount)
      // 이후 Mint함.
      .to.emit(pair, 'Mint')
      .withArgs(wallet.address, token0Amount, token1Amount);

    expect(await pair.totalSupply()).to.eq(expectedLiquidity);
    expect(await pair.balanceOf(wallet.address)).to.eq(expectedLiquidity.sub(MINIMUM_LIQUIDITY));
    expect(await token0.balanceOf(pair.address)).to.eq(token0Amount);
    expect(await token1.balanceOf(pair.address)).to.eq(token1Amount);
    const reserves = await pair.getReserves();
    expect(reserves[0]).to.eq(token0Amount);
    expect(reserves[1]).to.eq(token1Amount);
  });

  async function addLiquidity(token0Amount: BigNumber, token1Amount: BigNumber) {
    await token0.transfer(pair.address, token0Amount);
    await token1.transfer(pair.address, token1Amount);
    await pair.mint(wallet.address);
  }
  const swapTestCases: any[][] = [
    // 테스트할 값들
    // [스왑할 값, token0Amount, token1Amount, 스왑 시 예상 값] 으로 반복시키면서 정상 작동하는지 검증하는 코드.
    [1, 5, 10, '1662497915624478906'],
    [1, 10, 5, '453305446940074565'],

    [2, 5, 10, '2851015155847869602'],
    [2, 10, 5, '831248957812239453'],

    [1, 10, 10, '906610893880149131'],
    [1, 100, 100, '987158034397061298'],
    [1, 1000, 1000, '996006981039903216'],
  ].map((a) => a.map((n) => (typeof n === 'string' ? BigNumber.from(n) : ethers.utils.parseEther(`${n}`))));
  swapTestCases.forEach((swapTestCase, i) => {
    it(`getInputPrice:${i}`, async () => {
      // 1번 케이스로 주석 적음.
      // 값 세팅
      const [swapAmount, token0Amount, token1Amount, expectedOutputAmount] = swapTestCase;
      // 5, 10 개로 유동성 풀 생성함.
      await addLiquidity(token0Amount, token1Amount);
      // token0을 pair에 1개 추가 예치함.
      await token0.transfer(pair.address, swapAmount);
      // pair.swap (스왑으로 얻고자 하는 token0의 값, 스왑으로 얻고자 하는 token1의 값, 교환된 토큰을 받을 주소, 사용자 정의 데이터 <= 선택.)
      // 토큰0 한개로 받을 수 있는 예상 값 적음 1662497915624478906. 근데 여기서 예상값보다 더 넘어가니까 오류뜸.
      await expect(pair.swap(0, expectedOutputAmount.add(1), wallet.address, '0x')).to.be.revertedWithCustomError(
        pair,
        'InsufficientAmount',
      )
        .withArgs('DEX: K');
      // 이건 예상치와 맞아서 잘 됨.
      await pair.swap(0, expectedOutputAmount, wallet.address, '0x');
      console.log(await token0.balanceOf(wallet.address));
      // log 찍어보면 예상한 값만큼 token2로 들어왔음. 즉 토큰1과 토큰2를 스왑한 것.
      console.log(await token1.balanceOf(wallet.address));
    });
  });

  // 스왑 최적화 찾는 코드(라네요..?)
  const optimisticTestCases: any[][] = [
    // 테스트 값
    [0.997, 5, 10, 1], // given amountIn, amountOut = floor(amountIn * .997)
    [0.997, 10, 5, 1],
    [0.997, 5, 5, 1],
    [1, 5, 5, '1003009027081243732'], // given amountOut, amountIn = ceiling(amountOut / .997)
  ].map((a) => a.map((n) => (typeof n === 'string' ? n : ethers.utils.parseEther(`${n}`))));
  optimisticTestCases.forEach((optimisticTestCase, i) => {
    it(`optimistic:${i}`, async () => {
      // 값 세팅.
      const [outputAmount, token0Amount, token1Amount, inputAmount] = optimisticTestCase;
      // 유동성 풀 생성
      await addLiquidity(token0Amount, token1Amount);
      // pair에 token0 1개 예치.
      await token0.transfer(pair.address, inputAmount);
      // token0개를 0.997개로 예상해서 빼고싶은데 1 추가됐으니까 오류뜸.
      await expect(pair.swap(outputAmount.add(1), 0, wallet.address, '0x')).to.be.revertedWithCustomError(
        pair,
        'InsufficientAmount',
      )
        .withArgs('DEX: K');
      // 예상치와 맞아서 잘됨. 토큰 1과 토큰1을 교환...? 창조손해 하는듯.
      await pair.swap(outputAmount, 0, wallet.address, '0x');
    });
  });

  it('swap:token0', async () => {
    // 다시 풀 만듦.
    const token0Amount = ethers.utils.parseEther('5');
    const token1Amount = ethers.utils.parseEther('10');
    await addLiquidity(token0Amount, token1Amount);

    const swapAmount = ethers.utils.parseEther('1');
    // 이번엔 예상을 저렇게 함. 1개의 token0을 교환했을 때 얻을 수 있는 token1의 예상 양 지정.
    const expectedOutputAmount = BigNumber.from('1662497915624478906');
    // pair에 1개 전송함. 이건 swap메서드 실행될 때 쓰이는듯.
    await token0.transfer(pair.address, swapAmount);
    // swap잘 되는지 검증. 즉 pair로 보낸 token0과 예상하는 token1의 스왑을 진행.
    await expect(pair.swap(0, expectedOutputAmount, wallet.address, '0x'))
      // pair에서 wallet으로 예상치만큼 보냄.
      .to.emit(token1, 'Transfer')
      .withArgs(pair.address, wallet.address, expectedOutputAmount)
      // 이후 Sync함.
      .to.emit(pair, 'Sync')
      .withArgs(token0Amount.add(swapAmount), token1Amount.sub(expectedOutputAmount))
      // Swap함.
      .to.emit(pair, 'Swap')
      .withArgs(wallet.address, swapAmount, 0, 0, expectedOutputAmount, wallet.address);

    // 가져옴.
    const reserves = await pair.getReserves();
    // 개수 검증
    expect(reserves[0]).to.eq(token0Amount.add(swapAmount));
    expect(reserves[1]).to.eq(token1Amount.sub(expectedOutputAmount));
    expect(await token0.balanceOf(pair.address)).to.eq(token0Amount.add(swapAmount));
    expect(await token1.balanceOf(pair.address)).to.eq(token1Amount.sub(expectedOutputAmount));
    const totalSupplyToken0 = await token0.totalSupply();
    const totalSupplyToken1 = await token1.totalSupply();
    console.log(await token0.balanceOf(wallet.address));
    console.log(await token1.balanceOf(wallet.address));
    expect(await token0.balanceOf(wallet.address))
      .to.eq(totalSupplyToken0.sub(token0Amount).sub(swapAmount));
    expect(await token1.balanceOf(wallet.address))
      .to.eq(totalSupplyToken1.sub(token1Amount).add(expectedOutputAmount));
  });

  it('swap:token1', async () => {
    // 또 페어 만듦.
    const token0Amount = ethers.utils.parseEther('5');
    const token1Amount = ethers.utils.parseEther('10');
    await addLiquidity(token0Amount, token1Amount);

    // 보낼거랑 예상값
    const swapAmount = ethers.utils.parseEther('1');
    const expectedOutputAmount = BigNumber.from('453305446940074565');
    // 이번엔 token1이 pair에 전송
    await token1.transfer(pair.address, swapAmount);
    // 스왑 진행 토큰0이 내 주소로 들어가야 정상.
    await expect(pair.swap(expectedOutputAmount, 0, wallet.address, '0x'))
      .to.emit(token0, 'Transfer')
      .withArgs(pair.address, wallet.address, expectedOutputAmount)
      .to.emit(pair, 'Sync')
      .withArgs(token0Amount.sub(expectedOutputAmount), token1Amount.add(swapAmount))
      .to.emit(pair, 'Swap')
      .withArgs(wallet.address, 0, swapAmount, expectedOutputAmount, 0, wallet.address);

    // 가져옴.
    const reserves = await pair.getReserves();
    expect(reserves[0]).to.eq(token0Amount.sub(expectedOutputAmount));
    expect(reserves[1]).to.eq(token1Amount.add(swapAmount));
    expect(await token0.balanceOf(pair.address)).to.eq(token0Amount.sub(expectedOutputAmount));
    expect(await token1.balanceOf(pair.address)).to.eq(token1Amount.add(swapAmount));
    const totalSupplyToken0 = await token0.totalSupply();
    const totalSupplyToken1 = await token1.totalSupply();
    expect(await token0.balanceOf(wallet.address))
      .to.eq(totalSupplyToken0.sub(token0Amount).add(expectedOutputAmount));
    expect(await token1.balanceOf(wallet.address))
      .to.eq(totalSupplyToken1.sub(token1Amount).sub(swapAmount));
  });

  it('swap:gas [ @skip-on-coverage ]', async () => {
    // 또어 생성.
    const token0Amount = ethers.utils.parseEther('5');
    const token1Amount = ethers.utils.parseEther('10');
    await addLiquidity(token0Amount, token1Amount);

    // 새로운 블록하나 마이닝하고, pair를 sync함. 이럼 pair은 추가된 mineBlock기준으로 비용 책정함.
    // ensure that setting price{0,1}CumulativeLast for the first time doesn't affect our gas math
    await mineBlock((await ethers.provider.getBlock('latest')).timestamp + 1);
    await pair.sync();

    // 스왑 절차진행.
    const swapAmount = ethers.utils.parseEther('1');
    const expectedOutputAmount = BigNumber.from('453305446940074565');
    await token1.transfer(pair.address, swapAmount);
    // 여기서 다시 새로운 블록을 만들었지만, pair는 sync하지 않고 swap함.
    await mineBlock((await ethers.provider.getBlock('latest')).timestamp + 1);
    const tx = await pair.swap(expectedOutputAmount, 0, wallet.address, '0x');
    // 그래서 가스비용 같은거는 처음 mineBlock했을 때의 기준으로 책정됨.
    const receipt = await tx.wait();
    expect(receipt.gasUsed).to.eq(74056);
  });

  it('burn', async () => {
    // 또어 생성
    const token0Amount = ethers.utils.parseEther('3');
    const token1Amount = ethers.utils.parseEther('3');
    await addLiquidity(token0Amount, token1Amount);

    // 유동 풀 3으로 예상
    const expectedLiquidity = ethers.utils.parseEther('3');
    // pair에서 pair로 예상치-최소치 토큰 전송.
    await pair.transfer(pair.address, expectedLiquidity.sub(MINIMUM_LIQUIDITY));
    // pair에서 wallet주소 burn함. burn한다는게 다시 wallet한테 예치한거 돌려준다는 뜻인듯.
    await expect(pair.burn(wallet.address))
      // pair에서 zero address로 예상치-최소치 만큼 보냄. <= 즉 pair의 LP토큰은 전부 없엔단 뜻.
      .to.emit(pair, 'Transfer')
      .withArgs(pair.address, constants.AddressZero, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
      // token0과 token1을 주인한테 돌려줌. 최소치는 냄겨놓고.
      .to.emit(token0, 'Transfer')
      .withArgs(pair.address, wallet.address, '2999999999999999000')
      .to.emit(token1, 'Transfer')
      .withArgs(pair.address, wallet.address, '2999999999999999000')
      // Sync
      .to.emit(pair, 'Sync')
      .withArgs(1000, 1000)
      // Burn함.
      .to.emit(pair, 'Burn')
      .withArgs(wallet.address, '2999999999999999000', '2999999999999999000', wallet.address);

    // 개수확인
    expect(await pair.balanceOf(wallet.address)).to.eq(0);
    expect(await pair.totalSupply()).to.eq(MINIMUM_LIQUIDITY);
    expect(await token0.balanceOf(pair.address)).to.eq(1000);
    expect(await token1.balanceOf(pair.address)).to.eq(1000);
    const totalSupplyToken0 = await token0.totalSupply();
    const totalSupplyToken1 = await token1.totalSupply();
    expect(await token0.balanceOf(wallet.address)).to.eq(totalSupplyToken0.sub(1000));
    expect(await token1.balanceOf(wallet.address)).to.eq(totalSupplyToken1.sub(1000));
  });

  it('price{0,1}CumulativeLast', async () => {
    // 또 페어 생성.
    const token0Amount = ethers.utils.parseEther('3');
    const token1Amount = ethers.utils.parseEther('3');
    await addLiquidity(token0Amount, token1Amount);

    // pair의 blockTimestamp 가져옴. 아마 pair.getReserves의 2번째인듯.
    const blockTimestamp = (await pair.getReserves())[2];
    // 새로 하나 마이닝하고
    await mineBlock(blockTimestamp + 1);
    // 싱크함.
    await pair.sync();

    // 두 가격 값을 인코딩함.
    const initialPrice = encodePrice(token0Amount, token1Amount);
    // 시간이 흐르며 price0CumulativeLast가 잘 변경되는지 확인하는 코드.
    expect(await pair.price0CumulativeLast()).to.eq(initialPrice[0]
      .mul((await pair.getReserves())[2] - blockTimestamp));
    expect(await pair.price1CumulativeLast()).to.eq(initialPrice[1]
      .mul((await pair.getReserves())[2] - blockTimestamp));
    expect((await pair.getReserves())[2]).to.eq(blockTimestamp + 2);

    // swapAmount정함.
    const swapAmount = ethers.utils.parseEther('3');
    // pair에 토큰보냄.
    await token0.transfer(pair.address, swapAmount);
    // blockTimestamp에 블럭 10개 더만듦. 즉 총 10개 더 생긴거.
    await mineBlock(blockTimestamp + 10);
    // swap to a new price eagerly instead of syncing

    // token0 하나로 token1 하나 스왑함. 여기서 새로운 블록하나 생김.
    await pair.swap(0, ethers.utils.parseEther('1'), wallet.address, '0x'); // make the price nice
    // price0CumulativeLast 값 잘 바뀌는지 확인.
    expect(await pair.price0CumulativeLast()).to.eq(initialPrice[0]
      .mul((await pair.getReserves())[2] - blockTimestamp));
    expect(await pair.price1CumulativeLast()).to.eq(initialPrice[1]
      .mul((await pair.getReserves())[2] - blockTimestamp));
    expect((await pair.getReserves())[2]).to.eq(blockTimestamp + 11);

    // 20개 생기고 sync하니까 총 블록생성된건 21개일듯.
    await mineBlock(blockTimestamp + 20);
    await pair.sync();

    // 왜 저 값들을 곱해야 하는지는 잘 이해가지 않음.
    const newPrice = encodePrice(ethers.utils.parseEther('6'), ethers.utils.parseEther('2'));
    console.log(await pair.price0CumulativeLast(), initialPrice[0], newPrice[0]);
    expect(await pair.price0CumulativeLast())
      .to.eq(initialPrice[0].mul(11)
        .add(newPrice[0].mul(10)));
    expect(await pair.price1CumulativeLast())
      .to.eq(initialPrice[1].mul(11)
        .add(newPrice[1]
          .mul(10)));
    // 총 증가된 블록 21개 맞음.
    expect((await pair.getReserves())[2]).to.eq(blockTimestamp + 21);
  });

  // 이건 feeTo안쓰고 burn(꺼내는)거.
  it('feeTo:off', async () => {
    // 1000개씩으로 페어 만듦.
    const token0Amount = ethers.utils.parseEther('1000');
    const token1Amount = ethers.utils.parseEther('1000');
    await addLiquidity(token0Amount, token1Amount);
    // swapAmount랑 expectedOutputAmount 지정.
    const swapAmount = ethers.utils.parseEther('1');
    const expectedOutputAmount = BigNumber.from('996006981039903216');
    // pair에 토큰 보냄.
    await token1.transfer(pair.address, swapAmount);
    // 스왑함.
    await pair.swap(expectedOutputAmount, 0, wallet.address, '0x');

    // 유동풀 예상치 1000으로 정함.
    const expectedLiquidity = ethers.utils.parseEther('1000');
    // pair에서 pair로 예상치-최소치 보냄.
    await pair.transfer(pair.address, expectedLiquidity.sub(MINIMUM_LIQUIDITY));
    // burn시킴.
    await pair.burn(wallet.address);
    expect(await pair.totalSupply()).to.eq(MINIMUM_LIQUIDITY);
  });

  // 이건 feeTo쓰는거
  it('feeTo:on', async () => {
    // other이 Fee받을 대상임.
    await factory.setFeeTo(other.address);

    // 1000개 페어 생성
    const token0Amount = ethers.utils.parseEther('1000');
    const token1Amount = ethers.utils.parseEther('1000');
    await addLiquidity(token0Amount, token1Amount);

    // 똑같이 스왑.
    const swapAmount = ethers.utils.parseEther('1');
    const expectedOutputAmount = BigNumber.from('996006981039903216');
    await token1.transfer(pair.address, swapAmount);
    await pair.swap(expectedOutputAmount, 0, wallet.address, '0x');

    // 위랑 같음.
    const expectedLiquidity = ethers.utils.parseEther('1000');
    await pair.transfer(pair.address, expectedLiquidity.sub(MINIMUM_LIQUIDITY));
    await pair.burn(wallet.address);
    // other에 fee가 전송되서 pair에서 저정도 값 갖고 있음.
    expect(await pair.totalSupply()).to.eq('249750499252388');
    expect(await pair.balanceOf(other.address)).to.eq('249750499251388');

    // using 1000 here instead of the symbolic MINIMUM_LIQUIDITY
    // because the amounts only happen to be equal...
    // ...because the initial liquidity amounts were equal
    // 각 토큰이 pair에 저정도 들어 있음.
    expect(await token0.balanceOf(pair.address)).to.eq('249501683698445');
    expect(await token1.balanceOf(pair.address)).to.eq('250000187313969');
  });

  it('skim', async () => {
    const token0Amount = ethers.utils.parseEther('5');
    const token1Amount = ethers.utils.parseEther('10');
    await addLiquidity(token0Amount, token1Amount);

    const swapAmount = ethers.utils.parseEther('1');
    const expectedOutputAmount = BigNumber.from('1662497915624478906');
    await token0.transfer(pair.address, swapAmount);
    await pair.swap(0, expectedOutputAmount, wallet.address, '0x');
    const reserves = await pair.getReserves();
    // 유동성 풀 최신화시키는거. 나머진 일반 예시와 동일.
    await pair.skim(wallet.address);
    expect(reserves[0]).to.eq(token0Amount.add(swapAmount));
    expect(reserves[1]).to.eq(token1Amount.sub(expectedOutputAmount));
    expect(await token0.balanceOf(pair.address)).to.eq(token0Amount.add(swapAmount));
    expect(await token1.balanceOf(pair.address)).to.eq(token1Amount.sub(expectedOutputAmount));
    const totalSupplyToken0 = await token0.totalSupply();
    const totalSupplyToken1 = await token1.totalSupply();
    expect(await token0.balanceOf(wallet.address))
      .to.eq(totalSupplyToken0.sub(token0Amount).sub(swapAmount));
    expect(await token1.balanceOf(wallet.address))
      .to.eq(totalSupplyToken1.sub(token1Amount).add(expectedOutputAmount));
  });

  it('swap fail', async () => {
    const token0Amount = ethers.utils.parseEther('1000');
    const token1Amount = ethers.utils.parseEther('1000');
    await addLiquidity(token0Amount, token1Amount);
    const expectedOutputAmount = BigNumber.from('996006981039903216');

    // 아래 보면 token을 안보내고 스왑을 진행하려 해도 오류는 안뜨는데 swap되진 않음
    console.log(await token0.balanceOf(wallet.address));
    pair.swap(0, expectedOutputAmount, wallet.address, '0x');
    console.log(await token0.balanceOf(wallet.address));

    // swap해서 받을 주소가 잘못됨.
    await expect(pair.swap(0, expectedOutputAmount, token0.address, '0x'))
      .to.be.revertedWithCustomError(pair, 'InvalidAddressParameters')
      .withArgs('DEX: INVALID_TO');

    // 그냥 pair에 안보내고 받으려 해서 오류 뜨는듯
    await expect(pair.swap(token0Amount.sub(100), token1Amount.sub(200), wallet.address, '0x'))
      .to.be.revertedWithCustomError(pair, 'InsufficientAmount')
      .withArgs('DEX: INSUFFICIENT_INPUT_AMOUNT');
    // 토큰 swap할 때 받을 토큰이 0개라 오류.
    await expect(pair.swap(0, 0, wallet.address, '0x'))
      .to.be.revertedWithCustomError(pair, 'InsufficientAmount')
      .withArgs('DEX: INSUFFICIENT_OUTPUT_AMOUNT');
    // 토큰 swap할 때 유동 풀에 있는거보다 더 많은 양을 받으려함.
    await expect(pair.swap(ethers.utils.parseEther('2000'), 0, wallet.address, '0x'))
      .to.be.revertedWithCustomError(pair, 'InsufficientLiquidity')
      .withArgs('DEX: INSUFFICIENT_LIQUIDITY');
    // 사용자 정의 부분에 잘못된 데이터를 포함해서 호출함.
    await expect(pair.swap(0, expectedOutputAmount, wallet.address, '0xabcdef'))
      .to.be.rejectedWith('Transaction reverted: function call to a non-contract account');
    // 컨트랙트에 정의되지 않은 함수를 호출해 오류뜸.
    await expect(pair.swap(0, expectedOutputAmount, pair.address, '0xabcdef'))
      .to.be.rejectedWith("Transaction reverted: function selector was not recognized and there's no fallback function");
  });

  it('mint fail', async () => {
    // 이미 민트를 했어서 오류 뜸.
    const token0Amount = ethers.utils.parseEther('1000');
    const token1Amount = ethers.utils.parseEther('1000');
    await addLiquidity(token0Amount, token1Amount);
    await expect(pair.mint(wallet.address))
      .to.be.revertedWithCustomError(pair, 'InsufficientLiquidity')
      .withArgs('DEX: INSUFFICIENT_LIQUIDITY_MINTED');
  });

  it('burn fail', async () => {
    // burn할 때 최소 유동풀 토큰은 남겨놔야 하는데 다빼서 오류뜸. MINIMUM_LIQUIDITY 이게 있어야됨.
    const token0Amount = ethers.utils.parseEther('1000');
    const token1Amount = ethers.utils.parseEther('1000');
    await addLiquidity(token0Amount, token1Amount);
    await expect(pair.burn(wallet.address))
      .to.be.revertedWithCustomError(pair, 'InsufficientLiquidity')
      .withArgs('DEX: INSUFFICIENT_LIQUIDITY_BURNED');
  });

  it('init fail', async () => {
    // 이미 한 번 배포돼서 또 초기화하려니까 오류뜨는듯.
    await expect(pair.initialize(token0.address, token1.address)).to.be.revertedWithCustomError(pair, 'Unauthorized');
  });
});
