import { ethers } from 'hardhat';
import { expect } from 'chai';
import { BigNumber, constants } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { time } from '@nomicfoundation/hardhat-network-helpers';
import { PlatformToken } from '../../typechain/contracts/tokens/PlatformToken';

describe('TokeNestToken', async () => {
  let alice : SignerWithAddress;
  let bob : SignerWithAddress;
  let carol : SignerWithAddress;
  before(async () => {
    [alice, bob, carol] = await ethers.getSigners();
    console.log(alice.address);
  });
});

// 기초 코드 해석은 Multisig.spec.ts 코드에 자세히 설명되어 있음.

describe('PlatformToken', () => {
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let other: SignerWithAddress;
  let multisig: SignerWithAddress;
  let token: PlatformToken;
  const supply = BigNumber.from('10000000000000000000000000');

  before(async () => {
    // ether의 Signer만 받아와서 이것만으로 멀티시그너는 아님.
    // 이거도 alice가 getSigners로 받는 첫번째 인자라 보통 transfer같이 실행되는 메서드는 alice로 잡는듯.
    [alice, bob, carol, other, multisig] = await ethers.getSigners();
  });

  // PTN 토큰생성 및 권한부여해 배포.
  // 테스트 실행 전 토큰 정보 초기화시키는 용도.
  beforeEach(async () => {
    // Platform Token 팩토리 불러옴. <= remind : Factory는 배포되기 전 컨트랙트 코드 정보를 담아놓은 공간이라 보면됨.
    const TokenFactory = await ethers.getContractFactory('PlatformToken');
    // 토큰 발행.
    token = await TokenFactory.deploy('Platform Token', 'PTN', multisig.address);
    // alice한테 minter랑 burner권한 줌.
    await token.connect(multisig).grantRole((await token.MINTER_ROLE()), alice.address);
    await token.connect(multisig).grantRole((await token.BURNER_ROLE()), alice.address);
    // 블록체인 상에 바로 배포되는 것이 아니므로 배포될 때까지 기다림.
    await token.deployed();
  });

  it('deploy:fail, multisig cannot be the zero address', async () => {
    console.log(alice.address);
    // zero Address로 토큰 발행하려 하니 오류뜸.
    const ptn = await ethers.getContractFactory('PlatformToken');
    await expect(ptn.deploy('Platform Token', 'PTN', constants.AddressZero))
      .to.be.revertedWith('Multisig cannot be the zero address');
  });

  it('initial nonce is 0', async () => {
    // alice가 아무런 트랜잭션도 발행하지 않았기에 0을으로 뜸. nonces <= 트랜잭션 관리 메서드.
    expect(await token.nonces(alice.address)).to.be.equal(0);
  });

  it('supportInterface', async () => {
    // token이 아래 토큰 규격들을 지원하는지 확인.
    // KIP-13 Identifiers can be found https://kips.klaytn.foundation/KIPs/kip-7
    expect(await token.supportsInterface('0x65787371')).to.eq(true); // 0x65787371 is IKIP7 interfaceID
    expect(await token.supportsInterface('0xa219a025')).to.eq(true); // 0xa219a025 is IKIP7Metadata interfaceID
    expect(await token.supportsInterface('0xe90b74c5')).to.eq(true); // 0xe90b74c5 is IPlatformToken interfaceID
    expect(await token.supportsInterface('0x9d188c22')).to.eq(false); // 0x9d188c22 is IKIP7TokenReceiver interfaceID
  });

  it('chainID', async () => {
    // 현재 chainID 가져오는 메서드. hardhat 체인 ID는 31337임.
    expect(await token.getChainId()).to.eq(31337); // hardhat chainID
  });

  it('minting restriction', async () => {
    // 좐나 큰 토큰 발행하려 해서 오류뜸.
    const amount = BigNumber.from('2').pow(BigNumber.from('224'));
    await expect(token.mint(alice.address, amount)).to.be.revertedWith(
      'KIP7Votes: total supply risks overflowing votes',
    );
  });

  it('should have correct name and symbol and decimal', async () => {
    // 토큰 정보 확인하는거.
    expect(await token.name()).to.be.equal('Platform Token');
    expect(await token.symbol()).to.be.equal('PTN');
    expect(await token.decimals()).to.be.equal(18);
  });

  it('should only allow owner to mint token', async () => {
    // multisig가 alice랑 bob한테 100, 1000개씩 토큰 민트함.
    await token.mint(alice.address, '100');
    await token.mint(bob.address, '1000');
    // 허접 맹꽁이 bob이 carol한테 민트하려 하니까 오류뜸.
    await expect(token.connect(bob).mint(carol.address, '1000', { from: bob.address })).to.be.revertedWith(
      'AccessControl: account 0x70997970c51812dc3a010c7d01b50e0d17dc79c8 is missing role 0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6',
    );
    // 대충 토큰개수 확인하는 거.
    const totalSupply = await token.totalSupply();
    const aliceBal = await token.balanceOf(alice.address);
    const bobBal = await token.balanceOf(bob.address);
    const carolBal = await token.balanceOf(carol.address);
    expect(totalSupply).to.equal('1100');
    expect(aliceBal).to.equal('100');
    expect(bobBal).to.equal('1000');
    expect(carolBal).to.equal('0');
  });

  it('should supply token transfers properly', async () => {
    // beforeEach에서 계속 토큰을 새로 만드니까 테스트마다 초기화되는듯.
    await token.mint(alice.address, '100');
    await token.mint(bob.address, '1000');
    // alice로 알아서 지정된다네요. ether.getSigners() 메서드의 첫번째 인자였기 때문.
    await token.transfer(carol.address, '10');
    await token.connect(bob).transfer(carol.address, '100', {
      from: bob.address,
    });
    // 토큰 개수 확인하는거
    const totalSupply = await token.totalSupply();
    const aliceBal = await token.balanceOf(alice.address);
    const bobBal = await token.balanceOf(bob.address);
    const carolBal = await token.balanceOf(carol.address);
    expect(totalSupply, '1100');
    expect(aliceBal, '90');
    expect(bobBal, '900');
    expect(carolBal, '110');
  });

  it('should fail if you try to do bad transfers', async () => {
    // alice에 토큰 100개 추가 <= 이 역시 beforeEach 메서드로 토큰 초기화.
    await token.mint(alice.address, '100');
    // 아마 alice는 100개 갖고 있는데 carol한테 110개 보내서 오류뜨는듯.
    await expect(token.transfer(carol.address, '110')).to.be.revertedWith('KIP7: transfer amount exceeds balance');
    // bob은 토큰 0갠데 carol한테 보내려 하니까 오류 뜸.
    await expect(token.connect(bob).transfer(carol.address, '1', { from: bob.address })).to.be.revertedWith(
      'KIP7: transfer amount exceeds balance',
    );

    // 토큰 확인.
    const aliceBal = await token.balanceOf(alice.address);
    const bobBal = await token.balanceOf(bob.address);
    const carolBal = await token.balanceOf(carol.address);
    expect(aliceBal).to.equal('100');
    expect(bobBal).to.equal('0');
    expect(carolBal).to.equal('0');
  });
  describe('Compound test suite', () => {
    describe('balanceOf', () => {
      it('grants to initial account', async () => {
        // supply가 제대로 됐는지 확인.
        await token.mint(alice.address, supply);
        expect(await token.balanceOf(alice.address)).to.be.equal('10000000000000000000000000');
      });
    });

    describe('numCheckpoints', () => {
      it('returns the number of checkpoints for a delegate', async () => {
        // alice에 supply만큼 추가.
        await token.mint(alice.address, supply);
        // bob에 100개 통크게 줌.
        await token.transfer(bob.address, '100'); // give an account a few tokens for readability :D
        // carol의 체크포인트 개를 확인하는 코드. 지금은 암거도 안해서 0개
        expect(await token.numCheckpoints(carol.address)).to.be.equal(0);
        // bob이 carol에게 delegate 메서드를 통해 권한을 위임함.
        const t1 = await (await token.connect(bob).delegate(carol.address)).wait();
        // bob이 투표 권한을 주었기에 carol은 1개의 numCheckpoints를 갖고 있음.
        expect(await token.numCheckpoints(carol.address)).to.be.equal(1);
        // bob에서 other에 토큰 10개 줌.
        const t2 = await (await token.connect(bob).transfer(other.address, '10')).wait();
        // carol은 bob의 투표 권한을 받았음으로 2개로 늘어남. <= bob은 권한을 줬기 때문에 0개.
        expect(await token.numCheckpoints(carol.address)).to.be.equal(2);
        // bob이 또 other한테 10개 줌.
        const t3 = await (await token.connect(bob).transfer(other.address, '10')).wait();
        // 권한은 또 carol이 늘어나 3개가 됨.
        expect(await token.numCheckpoints(carol.address)).to.be.equal(3);
        // alice가 bob한테 20개를 줌
        const t4 = await (await token.transfer(bob.address, '20')).wait();
        // 여기서도 carol의 투표 수가 늘어남.
        expect(await token.numCheckpoints(carol.address)).to.be.equal(4);
        // carol의 투표가능 수를 보여주는거. bob이 carol한테 위임했기 때문에 bob의 토큰들도 나옴.
        expect(await token.checkpoints(carol.address, 0)).to.be.deep.equal([t1.blockNumber.toString(), '100']);
        expect(await token.checkpoints(carol.address, 1)).to.be.deep.equal([t2.blockNumber.toString(), '90']);
        expect(await token.checkpoints(carol.address, 2)).to.be.deep.equal([t3.blockNumber.toString(), '80']);
        expect(await token.checkpoints(carol.address, 3)).to.be.deep.equal([t4.blockNumber.toString(), '100']);
        // getPastVotes도 투표가능 수를 보여주는 메서드지만, 반환 값과 사용에서의 차이가 있음.
        /**
         * checkpoints : 주어진 주소에 대한 모든 투표 체크포인트를 조회함. return => 배열 형태로 블록 넘버와 투표 수를 담음.
         * getPastVotes : 특정 블록 넘버에서 주어진 주소의 투표 수를 조회함. return => 단일 정수 형태로 투표 수를 반환함.
         */
        await time.advanceBlock();
        expect(await token.getPastVotes(carol.address, t1.blockNumber)).to.be.equal('100');
        expect(await token.getPastVotes(carol.address, t2.blockNumber)).to.be.equal('90');
        expect(await token.getPastVotes(carol.address, t3.blockNumber)).to.be.equal('80');
        expect(await token.getPastVotes(carol.address, t4.blockNumber)).to.be.equal('100');
      });

      it('does not add more than one checkpoint in a block', async () => {
        // alice한테 토큰 공급.
        await token.mint(alice.address, supply);
        // bob한테 100개 보냄.
        await token.transfer(bob.address, '100');
        // carol의 투표가능 수는 0임.
        expect(await token.numCheckpoints(carol.address)).to.be.equal(0);
        // bob이 carol한테 권한 위임함.
        const t1 = await (await token.connect(bob).delegate(carol.address)).wait();
        // 위임해서 bob의 토큰 100개를 받았으니까 투표권 하나 생김. 올~ ㅋ
        expect(await token.numCheckpoints(carol.address)).to.be.equal(1);
        // PTN토큰 100개를 가지고 있는 bob이 carol한테 위임했으니까 t1트랜잭션에 대해 투표권 100개를 가짐.
        expect(await token.checkpoints(carol.address, 0)).to.be.deep.equal([t1.blockNumber, BigNumber.from('100')]);
        // bob한테 20개 토큰 보냄.
        const t4 = await (await token.transfer(bob.address, 20)).wait();
        // carol이 이거도 꿀꺽함.
        expect(await token.numCheckpoints(carol.address)).to.be.equal(2);
        // 결국 t4 트랜잭션을 통해 carol의 투표권은 120개가 됨.
        expect(await token.checkpoints(carol.address, 1)).to.be.deep.equal([t4.blockNumber, BigNumber.from('120')]);
      });
    });

    describe('getPastVotes', () => {
      // 이 it이 아래 it들 다 담고있음.. ㅡㅡ 그래서 alice의 토큰 유지되는듯.
      it('reverts if block number >= current block', async () => {
        await token.mint(alice.address, supply);
        // 500억번의 블록에 대해 carol의 투표수를 알려고 함. 500억번까지 채굴되지 않았어서 오류를 띄움.
        await expect(
          token.getPastVotes(carol.address, 5e10),
        ).to.be.revertedWith('KIP7Votes: block not yet mined');

        // 0번 블록에 대해 투표권 0이 잘 나오는지 테스트한거.
        it('returns 0 if there are no checkpoints', async () => {
          expect(await token.getPastVotes(carol.address, 0)).to.be.equal('0');
        });
      });

      it('returns the latest block if >= last checkpoint block', async () => {
        await token.mint(alice.address, supply);
        // alice의 권한 위임함.
        const t1 = await (await token.delegate(carol.address)).wait();
        // 블록 1 증가시키는 함수임.
        await time.advanceBlock();
        await time.advanceBlock();

        // t1에 대해 carol은 supply만큼의 투표권을 가지게 됨.
        expect(await token.getPastVotes(carol.address, t1.blockNumber)).to.be.equal('10000000000000000000000000');
        // time.advanceBlock으로 블록 증가시켰으니까 같은 값을 가짐.
        expect(await token.getPastVotes(carol.address, t1.blockNumber + 1)).to.be.equal('10000000000000000000000000');
      });

      it('returns zero if < first checkpoint block', async () => {
        // 주석 이 블록 넘버임. 보고 이해해.
        await token.mint(alice.address, supply); // blockNumber 100
        await time.advanceBlock(); // blockNumber 101
        const t1 = await (await token.delegate(carol.address)).wait();
        await time.advanceBlock(); // 102
        await time.advanceBlock(); // 103

        expect(await token.getPastVotes(carol.address, t1.blockNumber - 1)).to.be.equal('0'); // 99
        expect(await token.getPastVotes(carol.address, t1.blockNumber + 1)).to.be.equal('10000000000000000000000000'); // 101
      });
      // 꽝.
      it('generally returns the voting balance at the appropriate checkpoint', async () => {
        // 발행.
        await token.mint(alice.address, supply);
        // 여기서 token을 위임한거.
        const t1 = await (await token.delegate(carol.address)).wait();
        // 블록 증가
        await time.advanceBlock();
        await time.advanceBlock();
        // 10개 보냄. carol은 alice의 권한 갖고 있는데 10개를 보내면 어케되는거냐
        const t2 = await (await token.transfer(carol.address, 10)).wait();
        // 블록 증가
        await time.advanceBlock();
        await time.advanceBlock();
        // 10개 또보냄. 같은 문제.
        const t3 = await (await token.transfer(carol.address, 10)).wait();
        // 블록 증가
        await time.advanceBlock();
        await time.advanceBlock();
        // other에서 20개 받음. other은 토큰을 어케 갖고 있지..?
        console.log(await token.balanceOf(other.address));
        // const t4 = await (await token.transfer(
        //   alice.address,
        //   20,
        //   { from: other.address },
        // )).wait();
        // 블록 증가
        await time.advanceBlock();
        await time.advanceBlock();

        expect(await token.getPastVotes(carol.address, t1.blockNumber - 1)).to.be.equal('0');
        expect(await token.getPastVotes(carol.address, t1.blockNumber)).to.be.equal('10000000000000000000000000');
        expect(await token.getPastVotes(carol.address, t1.blockNumber + 1)).to.be.equal('10000000000000000000000000');
        expect(await token.getPastVotes(carol.address, t2.blockNumber)).to.be.equal('9999999999999999999999990');
        expect(await token.getPastVotes(carol.address, t2.blockNumber + 1)).to.be.equal('9999999999999999999999990');
        expect(await token.getPastVotes(carol.address, t3.blockNumber)).to.be.equal('9999999999999999999999980');
        expect(await token.getPastVotes(carol.address, t3.blockNumber + 1)).to.be.equal('9999999999999999999999980');
      });
    });

    describe('getPastTotalSupply', () => {
      // 테스트마다 먼저 alice한테 위임.
      beforeEach(async () => {
        await token.delegate(alice.address);
      });

      it('reverts if block number >= current block', async () => {
        // 너무큰 블록 보려함.
        await expect(
          token.getPastTotalSupply(5e10),
        ).to.be.rejectedWith('KIP7Votes: block not yet mined');
      });

      it('returns 0 if there are no checkpoints', async () => {
        // 0번블록은 0
        expect(await token.getPastTotalSupply(0)).to.be.equal('0');
      });

      it('returns the latest block if >= last checkpoint block', async () => {
        // mint
        const t1 = await (await token.mint(alice.address, supply)).wait();

        await time.advanceBlock();
        await time.advanceBlock();

        expect(await token.getPastTotalSupply(t1.blockNumber)).to.be.equal(supply);
        expect(await token.getPastTotalSupply(t1.blockNumber + 1)).to.be.equal(supply);
      });

      it('returns zero if < first checkpoint block', async () => {
        await time.advanceBlock();
        const t1 = await (await token.mint(alice.address, supply)).wait();
        await time.advanceBlock();
        await time.advanceBlock();

        expect(await token.getPastTotalSupply(t1.blockNumber - 1)).to.be.equal('0');
        expect(await token.getPastTotalSupply(t1.blockNumber + 1)).to.be.equal('10000000000000000000000000');
      });

      it('generally returns the voting balance at the appropriate checkpoint', async () => {
        const t1 = await (await token.mint(alice.address, supply)).wait();
        await time.advanceBlock();
        await time.advanceBlock();
        const t2 = await (await token.burn(alice.address, 10)).wait();
        await time.advanceBlock();
        await time.advanceBlock();
        const t3 = await (await token.burn(alice.address, 10)).wait();
        await time.advanceBlock();
        await time.advanceBlock();
        const t4 = await (await token.mint(alice.address, 20)).wait();
        await time.advanceBlock();
        await time.advanceBlock();

        expect(await token.getPastTotalSupply(t1.blockNumber - 1)).to.be.equal('0');
        expect(await token.getPastTotalSupply(t1.blockNumber)).to.be.equal('10000000000000000000000000');
        expect(await token.getPastTotalSupply(t1.blockNumber + 1)).to.be.equal('10000000000000000000000000');
        expect(await token.getPastTotalSupply(t2.blockNumber)).to.be.equal('9999999999999999999999990');
        expect(await token.getPastTotalSupply(t2.blockNumber + 1)).to.be.equal('9999999999999999999999990');
        expect(await token.getPastTotalSupply(t3.blockNumber)).to.be.equal('9999999999999999999999980');
        expect(await token.getPastTotalSupply(t3.blockNumber + 1)).to.be.equal('9999999999999999999999980');
        expect(await token.getPastTotalSupply(t4.blockNumber)).to.be.equal('10000000000000000000000000');
        expect(await token.getPastTotalSupply(t4.blockNumber + 1)).to.be.equal('10000000000000000000000000');
      });
    });
  });
});
