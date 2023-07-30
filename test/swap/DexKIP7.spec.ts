import { expect } from 'chai';
import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import {
  keccak256, toUtf8Bytes,
} from 'ethers/lib/utils';
import { constants } from 'ethers';
import { getPermitSignature, getDomainSeparator } from '../shared/utilities';
import { factoryFixture } from '../shared/fixtures';
import { DexKIP7Test } from '../../typechain/contracts/mocks/DexKIP7Test';
import { DexKIP7Test__factory } from '../../typechain/factories/contracts/mocks/DexKIP7Test__factory';

const TOTAL_SUPPLY = ethers.utils.parseEther('10000');
const TEST_AMOUNT = ethers.utils.parseEther('10');

describe('DexKIP7', () => {
  let tokenFactory: DexKIP7Test__factory;
  let token: DexKIP7Test;
  let wallet: SignerWithAddress;
  let other: SignerWithAddress;
  beforeEach(async () => {
    // wallet, other에 Signer 넣음.
    [wallet, other] = await ethers.getSigners();
    // DexKIP7Test 팩토리 가져와서 스마트 컨트랙트 인스턴스 배포 및 생성 가능.
    tokenFactory = await ethers.getContractFactory('DexKIP7Test');
    // 10000이더 배포.
    token = await tokenFactory.deploy(TOTAL_SUPPLY);
  });

  // 토큰 정보 알려주는듯. name, symbol, decimals같은건 DexKIP7.sol에서 지정함. 이해안가는건 totalSupply..
  it('name, symbol, decimals, totalSupply, balanceOf, DOMAIN_SEPARATOR, PERMIT_TYPEHASH', async () => {
    const name = await token.name();
    const separator = getDomainSeparator(name, '1', 31337, token.address);
    expect(name).to.eq('DEXswap');
    expect(await token.symbol()).to.eq('KlayLP');
    expect(await token.decimals()).to.eq(18);
    expect(await token.totalSupply()).to.eq(TOTAL_SUPPLY);
    expect(await token.balanceOf(wallet.address)).to.eq(TOTAL_SUPPLY);
    expect(await token.DOMAIN_SEPARATOR()).to.eq(
      separator,
    );
    expect(await token.PERMIT_TYPEHASH()).to.eq(
      keccak256(toUtf8Bytes('Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)')),
    );
  });

  it('approve', async () => {
    // wallet이 other한테 TEST_AMOUNT 만큼의 토큰을 허용함.
    await expect(token.approve(other.address, TEST_AMOUNT))
    // 트랜잭션에서 Approval이 발생하는지 체크하고, 인자로 아래 3개가 넘어갔는지 검증
      .to.emit(token, 'Approval')
      .withArgs(wallet.address, other.address, TEST_AMOUNT);
    // wallet이 other한테 허용한 가격이 맞는지 검증.
    expect(await token.allowance(wallet.address, other.address)).to.eq(TEST_AMOUNT);
  });

  it('supportInterface', async () => {
    // 지원 규격 확인
    // KIP-13 Identifiers can be found https://kips.klaytn.foundation/KIPs/kip-7
    expect(await token.supportsInterface('0x65787371')).to.eq(true); // 0x65787371 is IKIP7 interfaceID
    expect(await token.supportsInterface('0xa219a025')).to.eq(true); // 0xa219a025 is IKIP7Metadata interfaceID
    expect(await token.supportsInterface('0x9d188c22')).to.eq(false); // 0x9d188c22 is IKIP7TokenReceiver interfaceID
  });

  it('transfer', async () => {
    // other로 10개 토큰 보냄.
    await expect(token.transfer(other.address, TEST_AMOUNT))
    // Transfer가 잘 일어났는지랑, 인자 확인.
      .to.emit(token, 'Transfer')
      .withArgs(wallet.address, other.address, TEST_AMOUNT);
    // wallet랑 other 토큰 개수 확인.
    expect(await token.balanceOf(wallet.address)).to.eq(TOTAL_SUPPLY.sub(TEST_AMOUNT));
    expect(await token.balanceOf(other.address)).to.eq(TEST_AMOUNT);
  });

  /**
   * safeTransfer 함수는 대상 주소가 스마트 컨트랙트인 경우, 대상 주소가 'KIP-7' 인터페이스를 구현하고
   * 있는지 체크하여 토큰 전송을 수행한다.
   *
   * 스마트 컨트랙트로 토큰을 보내는 경우는 아래와 같은 상황에서 보낸다.
   *
   * 1. Dapp에서 특정 조건을 충족하는 사용자에게 토큰 보상을 지급할 때
   * 2. 특정 이벤트가 발생했을 때 자동으로 토큰을 분배하거나 전송할 때
   * 3. 다른 스마트 컨트랙트와 상호작용하여 특정 기능을 수행할 때, 이때 토큰 전송이 필요한 경우.
   *
   * 스마트 컨트랙트로 토큰을 전송하는 것은 특정 로직에 따라 토큰을 관리하고 분배하는 데 유용하며, 블록체인
   * 에서 자동화된 토큰 전송과 기능 수행을 가능하게 한다.
   */
  it('safeTransfer:fail', async () => {
    // safeTransfer에서 null 어드레스로 토큰 보내려 함.
    await expect(token['safeTransfer(address,uint256)'](constants.AddressZero, TEST_AMOUNT))
    // 그랬을 때 오류뜨는거 검증.
      .to.be.revertedWith('KIP7: transfer to the zero address');
    // factory 스마트 컨트랙트의 인스턴스를 가져옴.
    const { factory } = await factoryFixture(wallet);
    // factpry.address로 safeTransfer 던짐
    await expect(token['safeTransfer(address,uint256)'](factory.address, TEST_AMOUNT))
    // factory에는 safeTransfer가 없어서 fallback된단 말인듯.
      .to.be.rejectedWith("Transaction reverted: function selector was not recognized and there's no fallback function");
  });

  it('safeTransfer:to the contract', async () => {
    // KIP7Holder도 배포한 후 safeTransfer로 토큰 보냄.
    const kip7Holder = await (await ethers.getContractFactory('KIP7Holder')).deploy();
    // 이번엔 잘됨.
    await token['safeTransfer(address,uint256)'](kip7Holder.address, TEST_AMOUNT);
    expect(await token.balanceOf(wallet.address)).to.eq(TOTAL_SUPPLY.sub(TEST_AMOUNT));
    expect(await token.balanceOf(kip7Holder.address)).to.eq(TEST_AMOUNT);
  });

  it('transfer:fail', async () => {
    // 총 공급량보다 더 많은거 보내려함. 바카야로!
    await expect(token.transfer(
      other.address,
      TOTAL_SUPPLY.add(1),
    )).to.be.reverted; // ds-math-sub-underflow
    // other은 토큰이 없는데 wallet한테 보내려함. 빠가야로!!
    await expect(token.connect(other)
      .transfer(wallet.address, 1)).to.be.reverted; // ds-math-sub-underflow
    // zero address로 토큰을 보낼 순 없음.
    await expect(token.transfer(
      constants.AddressZero,
      TEST_AMOUNT,
    )).to.be.revertedWith('KIP7: transfer to the zero address');
  });

  it('transferFrom', async () => {
    // other한테 test_amount만큼 approve함.
    await token.approve(other.address, TEST_AMOUNT);
    // other에서 wallet으로부터 자기주소에 Test_AMOUNT만큼 가져옴.
    await expect(token.connect(other).transferFrom(wallet.address, other.address, TEST_AMOUNT))
    // Transfer가 잘 나오는지 확인하고 인자 확인.
      .to.emit(token, 'Transfer')
      .withArgs(wallet.address, other.address, TEST_AMOUNT);
    // 허용한 거는 이제 0이 됨.
    expect(await token.allowance(wallet.address, other.address)).to.eq(0);
    // 토큰개수 확인.
    expect(await token.balanceOf(wallet.address)).to.eq(TOTAL_SUPPLY.sub(TEST_AMOUNT));
    expect(await token.balanceOf(other.address)).to.eq(TEST_AMOUNT);
  });

  it('transferFrom:max', async () => {
    // MaxUint256만큼 허용해서 그냥 무적임 ㅋㅋ
    await token.approve(other.address, constants.MaxUint256);
    await expect(token.connect(other).transferFrom(wallet.address, other.address, TEST_AMOUNT))
      .to.emit(token, 'Transfer')
      .withArgs(wallet.address, other.address, TEST_AMOUNT);
    // Test_AMOUNT만큼 보냈어도 허용량 그냥저냥 개무적 ㄷㄷ.
    expect(await token.allowance(wallet.address, other.address)).to.eq(constants.MaxUint256);
    // 토큰개수 확인.
    expect(await token.balanceOf(wallet.address)).to.eq(TOTAL_SUPPLY.sub(TEST_AMOUNT));
    expect(await token.balanceOf(other.address)).to.eq(TEST_AMOUNT);
  });

  it('transferFrom:fail', async () => {
    // other한테 10개만큼 인출할 수 있도록 허용함.
    await token.approve(other.address, TEST_AMOUNT);
    // 멍청이같이 제로 어드레스에서 인출하려함.
    await expect(token.connect(other).transferFrom(
      constants.AddressZero,
      other.address,
      TEST_AMOUNT,
    )).to.be.revertedWith('KIP7: insufficient allowance');
  });

  it('safeTransferFrom', async () => {
    // 알아서 보고
    await token.approve(other.address, TEST_AMOUNT);
    // safeTransferFrom으로 10개 가져옴.
    await expect(token.connect(other)['safeTransferFrom(address,address,uint256)'](wallet.address, other.address, TEST_AMOUNT))
      .to.emit(token, 'Transfer')
      .withArgs(wallet.address, other.address, TEST_AMOUNT);
    // 체크
    expect(await token.allowance(wallet.address, other.address)).to.eq(0);
    expect(await token.balanceOf(wallet.address)).to.eq(TOTAL_SUPPLY.sub(TEST_AMOUNT));
    expect(await token.balanceOf(other.address)).to.eq(TEST_AMOUNT);
  });

  it('safeTransferFrom:max', async () => {
    // 또다시 무적됨.
    await token.approve(other.address, constants.MaxUint256);
    await expect(token.connect(other)['safeTransferFrom(address,address,uint256)'](wallet.address, other.address, TEST_AMOUNT))
      .to.emit(token, 'Transfer')
      .withArgs(wallet.address, other.address, TEST_AMOUNT);
    // 빼도 무적.
    expect(await token.allowance(wallet.address, other.address)).to.eq(constants.MaxUint256);
    expect(await token.balanceOf(wallet.address)).to.eq(TOTAL_SUPPLY.sub(TEST_AMOUNT));
    expect(await token.balanceOf(other.address)).to.eq(TEST_AMOUNT);
  });

  it('safeTransferFrom:fail', async () => {
    // wallet에서 other로 토큰 보내려 하지만 허용량 없음.
    await expect(token['safeTransferFrom(address,address,uint256)'](wallet.address, other.address, TEST_AMOUNT))
      .to.be.revertedWith('KIP7: insufficient allowance');
    // zero address에서 other로 보내려 하지만 역시 허용량 없음.
    await expect(token['safeTransferFrom(address,address,uint256)'](constants.AddressZero, other.address, TEST_AMOUNT))
      .to.be.revertedWith('KIP7: insufficient allowance');
    // 허용량 무적만듦.
    await token.approve(other.address, constants.MaxUint256);
    // wallet에서 zero address로 보내려 하지만, zero address는 토큰을 받을 수 없음.
    await expect(token.connect(other)['safeTransferFrom(address,address,uint256)'](wallet.address, constants.AddressZero, TEST_AMOUNT))
      .to.be.revertedWith('KIP7: transfer to the zero address');
    // wallet에서 token 컨트랙트 주소로 보내려 하는데 토큰 컨트랙트는 safeTransferFrom 메서드를 인식하지 못해서 오류뜸.
    await expect(token.connect(other)['safeTransferFrom(address,address,uint256)'](wallet.address, token.address, TEST_AMOUNT))
      .to.be.rejectedWith("Transaction reverted: function selector was not recognized and there's no fallback function");
  });

  it('permit', async () => {
    // wallet의 현재 nonces값 가져옴.
    // nonce는 특정 주소에서 발행된 트랜잭션 개수 보는거. 즉 지금은 0임.
    const nonce = await token.nonces(wallet.address);
    // 허용 기간 무제한임을 표시
    const deadline = constants.MaxUint256;
    // wallet이 other에 대해 Test_AMOUNT만큼의 토큰을 대신 인출할 수 있는 서명을 생성함.
    const signature = await getPermitSignature(
      wallet,
      token,
      31337,
      {
        owner: wallet.address, spender: other.address, value: TEST_AMOUNT, nonce, deadline,
      },
    );
    // permit한테 서명 값 전달하려고 걍 서명 v, r, s로 짜르는거.
    const sigSplit = ethers.utils.splitSignature(
      ethers.utils.arrayify(signature),
    );
    // 서명갖고 wallet에서 other로 test_amount만큼 permit하려 함.
    await expect(token.permit(
      wallet.address,
      other.address,
      TEST_AMOUNT,
      deadline,
      sigSplit.v,
      sigSplit.r,
      sigSplit.s,
    ))
    // 그랬을 때 Approval이 발생하는지 보고 인자 확인.
      .to.emit(token, 'Approval')
      .withArgs(wallet.address, other.address, TEST_AMOUNT);
    // wallet이 other에 대해 허용한 값이 Test_AMOUNt라는거 체크.
    expect(await token.allowance(wallet.address, other.address)).to.eq(TEST_AMOUNT);
    // wallet의 nonces는 1이 됨.
    expect(await token.nonces(wallet.address)).to.eq(1);
  });

  it('permit:fail expired', async () => {
    // wallet의 nonce 가져옴.
    const nonce = await token.nonces(wallet.address);
    // 지금 blockNumber가져옴.
    const blockNumBefore = await ethers.provider.getBlockNumber();
    // console.log(await ethers.provider.getBlockNumber());
    // deadline을 blockNumber-1로 지정함.
    const deadline = ethers.BigNumber.from((
      await ethers.provider.getBlock(blockNumBefore)).timestamp - 1);
    // 서명 만듦.
    const signature = await getPermitSignature(
      wallet,
      token,
      31337,
      {
        owner: wallet.address, spender: other.address, value: TEST_AMOUNT, nonce, deadline,
      },
    );
    const sigSplit = ethers.utils.splitSignature(
      ethers.utils.arrayify(signature),
    );

    // permit하지만, deadline넘겨서 오류뜸.
    await expect(token.permit(
      wallet.address,
      other.address,
      TEST_AMOUNT,
      deadline,
      sigSplit.v,
      sigSplit.r,
      sigSplit.s,
    )).to.be.revertedWith('DEX: EXPIRED');
  });

  it('permit:fail invalid signature', async () => {
    // 알아서 보고
    const nonce = await token.nonces(wallet.address);
    const deadline = constants.MaxUint256;
    const signature = await getPermitSignature(
      wallet,
      token,
      // 여기 nonce값이 다름. 아마 hardhat이라 31337 chainId여야 할듯.
      31335,
      {
        owner: wallet.address, spender: other.address, value: TEST_AMOUNT, nonce, deadline,
      },
    );
    const sigSplit = ethers.utils.splitSignature(
      ethers.utils.arrayify(signature),
    );

    // 서명 자체가 이상하니까 오류뜨는거.
    await expect(token.permit(
      wallet.address,
      other.address,
      TEST_AMOUNT,
      deadline,
      sigSplit.v,
      sigSplit.r,
      sigSplit.s,
    )).to.be.revertedWith('DEX: INVALID_SIGNATURE');
  });
});
