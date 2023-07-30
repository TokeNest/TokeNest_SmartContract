import { expect } from 'chai';
import { ethers } from 'hardhat';
import { Contract, constants } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { getCreate2Address } from '../shared/utilities';
import { factoryFixture } from '../shared/fixtures';

const TEST_ADDRESSES: [string, string] = [
  '0x1000000000000000000000000000000000000000',
  '0x2000000000000000000000000000000000000000',
];

describe('DexFactory', () => {
  let wallet: SignerWithAddress;
  let other: SignerWithAddress;
  let factory: Contract;
  beforeEach(async () => {
    [wallet, other] = await ethers.getSigners();
    // 배포자로 wallet해서 DexFactory 가져옴. factoryFixture메서드 내부 보면 알듯.
    factory = (await factoryFixture(wallet)).factory;
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
    // factory의 INIT 값을 호출. 생성된 해시 값인듯?
    console.log('Init code hash:', await factory.INIT());
  });

  // 토큰 주소 두개 받아서 Dex에 페어시키는듯.
  async function createPair(tokens: [string, string]) {
    // DexPair의 바이트코드 가져옴.
    const bytecode = await (await ethers.getContractFactory('DexPair')).bytecode;
    // getCreate2Address로 Pair생성 주소 가져옴.
    const create2Address = getCreate2Address(factory.address, tokens, bytecode);
    // tokens로 페어 생성함.
    await expect(factory.createPair(...tokens))
    // PairCreated가 잘 실행되는지 확인.
      .to.emit(factory, 'PairCreated')
    // 인자 확인. [토큰 주소0, 토큰 주소1, 페어주소, 생성개수 로 보면] 될듯.
      .withArgs(TEST_ADDRESSES[0], TEST_ADDRESSES[1], create2Address, 1);

    // 다시 생성하려 하니까 오류뜸.
    await expect(factory.createPair(...tokens)).to.be
      .revertedWithCustomError(factory, 'InvalidAddressParameters')
      .withArgs('DEX: PAIR_EXISTS'); // DEX: PAIR_EXISTS
    // 요렇게 뒤집어봐도 오류뜸.
    await expect(factory.createPair(...tokens.slice()
      .reverse())).to.be.revertedWithCustomError(factory, 'InvalidAddressParameters')
      .withArgs('DEX: PAIR_EXISTS'); // DEX: PAIR_EXISTS
    // 페어 주소 가져오면 create2Address뜸.
    expect(await factory.getPair(...tokens)).to.eq(create2Address);
    // 저렇게 뒤집어봐도 같은 주소뜸.
    expect(await factory.getPair(...tokens.slice().reverse())).to.eq(create2Address);
    // factory에 등록된 페어의 0번째는 create2Address임.
    expect(await factory.allPairs(0)).to.eq(create2Address);
    // 총 개수 1개임.
    expect(await factory.allPairsLength()).to.eq(1);

    // 생성된 페어 컨트랙트 가져옴.
    const pair = await ethers.getContractAt('DexPair', create2Address);
    // 페어의 팩토리는 factory임.
    expect(await pair.factory()).to.eq(factory.address);
    // 페어의 토큰0은 0번째 토큰
    expect(await pair.token0()).to.eq(TEST_ADDRESSES[0]);
    // 페어의 토큰1은 1번째 토큰
    expect(await pair.token1()).to.eq(TEST_ADDRESSES[1]);
  }

  it('createPair', async () => {
    // createPair로 페어 만드는거.
    await createPair(TEST_ADDRESSES);
  });

  it('createPair:reverse', async () => {
    // 거꾸로 넣어도 만들어짐.
    await createPair(TEST_ADDRESSES.slice().reverse() as [string, string]);
  });

  it('createPair:identical', async () => {
    // 같은 토큰 두개로는 페어를 만들지 못함.
    await expect(createPair([TEST_ADDRESSES[0], TEST_ADDRESSES[0]] as [string, string])).to.be
      .revertedWithCustomError(factory, 'InvalidAddressParameters').withArgs('DEX: IDENTICAL_ADDRESSES');
  });

  it('createPair:zero address', async () => {
    // 페어에는 제로 어드레스가 들어갈 수 없음.
    await expect(createPair([constants.AddressZero, TEST_ADDRESSES[0]] as [string, string])).to.be
      .revertedWithCustomError(factory, 'InvalidAddressParameters')
      .withArgs('DEX: ZERO_ADDRESS');
    // 위랑 같음.
    await expect(createPair([TEST_ADDRESSES[0], constants.AddressZero] as [string, string])).to.be
      .revertedWithCustomError(factory, 'InvalidAddressParameters')
      .withArgs('DEX: ZERO_ADDRESS');
    // 선넘노
    await expect(createPair([constants.AddressZero, constants.AddressZero] as [string, string]))
      .to.be.revertedWithCustomError(factory, 'InvalidAddressParameters')
      .withArgs('DEX: IDENTICAL_ADDRESSES');
  });

  it('createPair:gas [ @skip-on-coverage ]', async () => {
    // 페어하나 만듦.
    const tx = await factory.createPair(...TEST_ADDRESSES);
    // tx.wait 메서드로 트랜잭션이 포함된 블록의 정보를 얻고 트랜잭션의 실행 결과를 가져옴.
    const receipt = await tx.wait();
    // 트랜잭션의 실행에 사용된 가스량 체크.
    expect(receipt.gasUsed).to.eq(2198483);
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
});
