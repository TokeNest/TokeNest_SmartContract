import { ethers } from 'hardhat';
import { expect } from 'chai';
import { BigNumber, constants } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { MultiSigWallet__factory } from '../typechain/factories/contracts/multisig/Multisig.sol/MultiSigWallet__factory';
import { MultiSigWallet } from '../typechain/contracts/multisig/Multisig.sol/MultiSigWallet';

describe('Multisig', () => {
  let owner: SignerWithAddress;
  let owner2: SignerWithAddress;
  let owner3: SignerWithAddress;
  let owner4: SignerWithAddress;
  let owner5: SignerWithAddress;
  let owner6: SignerWithAddress;
  let blockTimestamp: BigNumber;
  let wallet: MultiSigWallet;
  let Wallet: MultiSigWallet__factory;

  // 6명의 멀티시그너를 지정하고, MultiSigWallet 컨트랙트 팩토리를 얻음.
  before(async () => {
    // 여기서 ethers.getSigners()로 받아온 첫번째 인자(owner)는 알아서 서명하게 됨.
    [owner, owner2, owner3, owner4, owner5, owner6] = await ethers.getSigners();
    Wallet = await ethers.getContractFactory('MultiSigWallet');
  });

  describe('Should remove owner', () => {
    // owner, owner2, owner4, owner5를 MultiSigWallet의 멀티시그너로 지정, 최소 합의 서명은 3개로 설정 후 배포.
    before(async () => {
      wallet = await Wallet.deploy([owner2.address, owner.address,
        owner4.address, owner5.address], 3);
      // 배포될 때까지 기다림.
      await wallet.deployed();
    });

    it('should submit transaction, proposal 0', async () => {
      // Proposal 0 - removing owner5
      // Multisig 컨트랙트의 removeOwner 메서드 불러옴. owner5를 멀티시그에서 지우자는 뜻.
      const transaction = wallet.interface.encodeFunctionData('removeOwner', [owner5.address]);
      // wallet.address (Multisig의 컨트랙트 주소), 0 (트랜잭션 ID), transaction (owner5를 지우자는 트랜잭션).
      // wallet.address에 트랜잭션 보냄.
      expect(await wallet.submitTransaction(wallet.address, 0, transaction))
      // Transaction이 제출되고 0번 트랜잭션에 대해 Submission이 발생하는지 확인.
        .to.emit(wallet, 'Submission')
        .withArgs(0)
      // Transaction이 제출되고 0번 트랜잭션에 대해 Confirmation 발생하는지 확인.
        .to.emit(wallet, 'Confirmation')
        .withArgs(0);
      // 현재 Block 번호 가져옴.
      const submitionBlock = await ethers.provider.getBlockNumber();
      // 해당 블록의 타임스탬프 가져옴.
      blockTimestamp = BigNumber.from((await ethers.provider.getBlock(submitionBlock)).timestamp);
      // 0번 트랜잭션의 정보를 가져옴.
      expect(await wallet.getTransactionInfo(0))
      // 가져온 정보와 예상한 정보가 일치하는지 확인.
      // 예상한 정보는 wallet.address, 0, 트랜잭션, 타임스탬프, 트랜잭션 상태, 확인 개수
        .to.be.deep.equal([wallet.address, BigNumber.from(0),
          transaction, blockTimestamp, false, BigNumber.from(1)]);
      // 확인된 트랜잭션 개수가 1개인지 확인.
      expect(await wallet.getTransactionCount(true, false))
        .to.be.equal(1);
    });
    it('should revoke confirmation', async () => {
      // owner4 votes on and revokes their confirmation
      // owner4가 0번 트랜잭션에 대해 합의한 후 맞는지 검증하는 코드
      await wallet.connect(owner4).confirmAndExecuteTransaction(0);
      expect(await wallet.getConfirmations(0)).to.be.deep.equal([owner.address, owner4.address]);
      // owner4가 0번 트랜잭션에 대해 철회한 후 맞는지 검증하는 코드
      await wallet.connect(owner4).revokeConfirmation(0);
      expect(await wallet.getConfirmations(0)).to.be.deep.equal([owner.address]);
    });
    it('should not revoke if owner has not confirmed', async () => {
      // owner5 tries to remove their confirmation
      // owner5가 0번 트랜잭션에 대해 철회하는 코드. 하지만 owner5는 합의한 적이 없으니 Not confirmed 예외가 나와야 정상.
      await expect(wallet.connect(owner5).revokeConfirmation(0)).to.be.revertedWith('Not confirmed');
      expect(await wallet.getConfirmations(0)).to.be.deep.equal([owner.address]);
    });
    it('should confirm transaction', async () => {
      // owner2 confirms proposal 0
      // owner2가 owner5를 지우자는 트랜잭션을 다시 제출함. 이미 있는 트랜잭션이므로 덮어씌워짐.
      const transaction = wallet.interface.encodeFunctionData('removeOwner', [owner5.address]);
      // 0번 트랜잭션에 대해 합의함을 체크함.
      expect(await wallet.connect(owner2).confirmAndExecuteTransaction(0))
        .to.emit(wallet, 'Confirmation')
        .withArgs(0);
      // 0번 트랜잭션 정보가 같은지 확인. BigNumber.from(2) 부분이 합의자 수로 owner, owner5 2명이어서 정상.
      expect(await wallet.getTransactionInfo(0))
        .to.be.deep.equal([wallet.address, BigNumber.from(0),
          transaction, blockTimestamp, false, BigNumber.from(2)]);
      expect(await wallet.getConfirmations(0)).to.be.deep.equal([owner.address, owner2.address]);
    });
    it('should reject if owner confirmed', async () => {
      // owner2 tries to confirm proposal 0 again
      // owner2가 이미 합의한 상황에서 또 합의하려 할 때 예외발생.
      await expect(wallet.connect(owner2).confirmAndExecuteTransaction(0)).to.be.revertedWith('Already confirmed');
      expect(await wallet.getConfirmations(0)).to.be.deep.equal([owner.address, owner2.address]);
    });
    it('should reject if not an owner', async () => {
      // owner3는 Multisig 컨트랙트의 멀티시그너로 지정되지 않아 합의하려 해도 오류뜨는게 정상.
      await expect(wallet.connect(owner3).confirmAndExecuteTransaction(0)).to.be.reverted;
      expect(await wallet.getConfirmations(0)).to.be.deep.equal([owner.address, owner2.address]);
    });
    it('should reject if owner was added after proposal 0 submission, adding proposal-1', async () => {
      // Proposal 1 - adding owner3
      // owner3에 대해 addOwner 트랜잭션 보냄.
      const transaction = wallet.interface.encodeFunctionData('addOwner', [owner3.address]);
      // 이미 제출한 0번 트랜잭션이지만, 0 트랜잭션과 1 트랜잭션은 동일한 transaction을 제출.
      // 이는 0 트랜잭션이 이미 제출되었더라도 다시 제출할 수 있다는 것을 의미. (걍 1로 내는게 편할듯)
      expect(await wallet.submitTransaction(wallet.address, 0, transaction))
      // 제출한 1번 트랜잭션에 대해 잘 됐는지 확인.
        .to.emit(wallet, 'Submission')
        .withArgs(1)
        .to.emit(wallet, 'Confirmation')
        .withArgs(1);
      // owner2와 owner4 합의 진행.
      await wallet.connect(owner2).confirmAndExecuteTransaction(1);
      await wallet.connect(owner4).confirmAndExecuteTransaction(1);
      // 1번 트랜잭션의 합의자 검증.
      expect(await wallet.getConfirmations(1)).to.be.deep
        .equal([owner.address, owner2.address, owner4.address]);
      // owner3가 멀티시그너가 되기 전에 제출된 트랜잭션에 대해 합의하려고 해 오류뜨는게 정상.
      await expect(wallet.connect(owner3).confirmAndExecuteTransaction(0))
        .to.be.revertedWith('The owner is registered after the transaction is submitted');
    });
    it('should reject if owner was replaced after proposal submission', async () => {
      // Proposal -2, replacing owner2 with owner6
      // owner2를 owner6랑 replace해라라는 트랜잭션 만듦.
      const transaction = wallet.interface.encodeFunctionData('replaceOwner', [owner2.address, owner6.address]);
      // 트랜잭션 배포하고 잘되는지 검증.
      expect(await wallet.submitTransaction(wallet.address, 0, transaction))
        .to.emit(wallet, 'Submission')
        .withArgs(2)
        .to.emit(wallet, 'Confirmation')
        .withArgs(2);
      // Priveously added owner3 can vote on the new proposal
      // owner3이랑 owner4가 합의함.
      await wallet.connect(owner3).confirmAndExecuteTransaction(2);
      await wallet.connect(owner4).confirmAndExecuteTransaction(2);
      // 2번 트랜잭션 합의자 체크.
      expect(await wallet.getConfirmations(2)).to.be.deep
        .equal([owner.address, owner3.address, owner4.address]);
      // owner6 이전에 제출된 트랜잭션 합의하려 해서 오류뜸.
      await expect(wallet.connect(owner6).confirmAndExecuteTransaction(0))
        .to.be.revertedWith('The owner is registered after the transaction is submitted');
      await expect(wallet.connect(owner6).confirmAndExecuteTransaction(1))
        .to.be.revertedWith('The owner is registered after the transaction is submitted');
    });
    it('should reject execution if owner has not confirmed', async () => {
      // owner5 tries to execute proposal 0
      // owner5는 0번 트랜잭션에 대해 합의하지 않았는데 실행하려고 해서 오류뜸.
      await expect(wallet.connect(owner5).executeTransaction(0)).to.be.revertedWith('Not confirmed');
      expect(await wallet.getConfirmations(0)).to.be.deep.equal([owner.address, owner2.address]);
    });
    it('should execute transaction', async () => {
      const transaction = wallet.interface.encodeFunctionData('removeOwner', [owner5.address]);
      // 미처리된 트랜잭션 확인. 현재 미처리된 트랜잭션은 0번 하나기 때문에 1이 맞음.
      expect(await wallet.getTransactionCount(true, false))
        .to.be.equal(1);
      // wallet의 멀티시그너들 가져옴.
      const ownersBefore: string[] = await wallet.getOwners();
      // owner4가 0번 트랜잭션 합의하고 제대로 실행되는지 확인. <= owner5가 지워지면 확인된거.
      expect(await wallet.connect(owner4).confirmAndExecuteTransaction(0))
        .to.emit(wallet, 'Confirmation')
        .withArgs(0)
        .to.emit(wallet, 'Execution')
        .withArgs(0)
        .to.emit(wallet, 'OwnerRemoval')
        .withArgs(owner5.address);
      // 다시 wallet의 멀티시그너들 가져옴.
      const ownersAfter: string[] = await wallet.getOwners();
      // 0번 트랜잭션 정보 검증. BigNumber.from(3)으로 합의자 3명인지 확인.
      expect(await wallet.getTransactionInfo(0))
        .to.be.deep.equal([wallet.address, BigNumber.from(0),
          transaction, blockTimestamp, true, BigNumber.from(3)]);
      // 0번 트랜잭션 합의자 확인.
      expect(await wallet.getConfirmations(0))
        .to.be.deep.equal([owner.address, owner2.address, owner4.address]);
      // wallet의 트랜잭션 중 성공한게 3개인지 확인.
      expect(await wallet.getTransactionCount(false, true))
        .to.be.equal(3);
      // 0번 트랜잭션이 실행된 후 멀티시그너들의 정보 검증. owner5가 없어야 정상.
      expect(ownersAfter)
        .to.be.deep.equal(ownersBefore.filter((a) => a !== owner5.address));
    });
    it('replaceOwner:fail, both owners exist', async () => {
      // 이미 나온거임. 대충 이해해 바꿔도 멀티시그너들은 같잖아 ㅋ
      const transaction = wallet.interface.encodeFunctionData('replaceOwner', [owner.address, owner6.address]);
      await wallet.submitTransaction(wallet.address, 0, transaction);
      const ownersBefore: string[] = await wallet.getOwners();
      await wallet.connect(owner4).confirmAndExecuteTransaction(3);
      await wallet.connect(owner6).confirmAndExecuteTransaction(3);
      const ownersAfter: string[] = await wallet.getOwners();
      expect(ownersAfter).to.be.deep.equal(ownersBefore);
    });
    // owner에서 wallet으로 0 이더 보내려함.
    it('send 0 ETH to the contract', async () => {
      const transaction = ({
        from: owner.address,
        to: wallet.address,
        value: ethers.utils.parseEther('0'),
      });
      // 0원을 보내려 하니까 Deposit이 되면 안됨. .to.not.emit 은 실패해야 정상.
      await expect(owner.sendTransaction(transaction)).to.not.emit(wallet, 'Deposit');
      // wallet의 잔고가 여전히 0인지 확인.
      expect(await ethers.provider.getBalance(wallet.address)).to.be.equal(ethers.utils.parseEther('0'));
    });
    it('send ETH to the contract', async () => {
      // 위랑 똑같은데 이번엔 1 이더 보내려함.
      const transaction = ({
        from: owner.address,
        to: wallet.address,
        value: ethers.utils.parseEther('1'),
      });
      // 1 이더 보내졌는지 검증
      await expect(owner.sendTransaction(transaction)).to.emit(wallet, 'Deposit')
        .withArgs(owner.address, ethers.utils.parseEther('1'));
      // wallet 잔고 1인지 검증
      expect(await ethers.provider.getBalance(wallet.address)).to.be.equal(ethers.utils.parseEther('1'));
    });
  });

  // 새 describe임.
  describe('Should remove owner with changing requirments', () => {
    // owner, owner2, owner3를 멀티시그너로 두고 요구조건 3으로 배포함.
    before(async () => {
      wallet = await Wallet.deploy([owner.address, owner2.address,
        owner3.address], 3);
      await wallet.deployed();
    });
    // 배포가 실패하는 상황 알려주는거
    it('deploy:fail', async () => {
      // 최소 합의자가 4인데 멀티시그너들은 3명이라 오류
      await expect(Wallet.deploy([owner.address, owner2.address,
        owner3.address], 4)).to.be.reverted;
      // 4개 합의해야 하는데 빈주소 있어서 오류 (합의개수 3으로 해도 빈주소 있으면 안되는듯)
      await expect(Wallet.deploy([owner.address, owner2.address,
        constants.AddressZero], 4)).to.be.reverted;
      // owner가 중복이라 오류.
      await expect(Wallet.deploy([owner.address, owner2.address,
        owner.address], 3)).to.be.reverted;
    });
    it('removeOwner:fail, owner5 does not exist', async () => {
      // owner2 confirms proposal 0
      // owner5는 없는데 얘를 지우자는 안건 냄(멍청이 ㅋ)
      const transaction = wallet.interface.encodeFunctionData('removeOwner', [owner5.address]);
      // 0번 트랜잭션으로 등록되고 owner의 합의 됨.
      expect(await wallet.submitTransaction(wallet.address, 0, transaction))
        .to.emit(wallet, 'Submission')
        .withArgs(0)
        .to.emit(wallet, 'Confirmation')
        .withArgs(0);
      // owner2도 합의함
      expect(await wallet.connect(owner2).confirmAndExecuteTransaction(0))
        .to.emit(wallet, 'Confirmation')
        .withArgs(0);
      // owner3가 합의했는데 오류 뜸. owner5는 존재하지 않기 떄문에 실행시킬 수가 없기 때문.
      expect(await wallet.connect(owner3).confirmAndExecuteTransaction(0))
        .to.be.reverted;
      // 합의자 확인함.
      expect(await wallet.getConfirmations(0))
        .to.be.deep.equal([owner.address, owner2.address, owner3.address]);
      // 하지만 0번 트랜잭션은 실패함. 매개변수 설명 =>
      // wallet.getTransactionIds(트랜잭션 시작 인덱스, 가져올 트랜잭션 ID 개수,
      // 미확인 트랜잭션 여부, 실행 완료된 트랜잭션 여부
      expect(await wallet.getTransactionIds(0, 1, true, false))
        .to.be.deep.equal([0]);
      // owner3이 트랜잭션 실행하려 해도 오류뜸. 왜냐면 owner5는 없거든.
      expect(await wallet.connect(owner3).executeTransaction(0))
        .to.emit(wallet, 'ExecutionFailure')
        .withArgs(0);
    });
    it('removeOwner:req changed', async () => {
      // owner2 confirmes proposal 0
      // 여긴 알아서 이해하고
      const transaction = wallet.interface.encodeFunctionData('removeOwner', [owner3.address]);
      expect(await wallet.submitTransaction(wallet.address, 0, transaction))
        .to.emit(wallet, 'Submission')
        .withArgs(1)
        .to.emit(wallet, 'Confirmation')
        .withArgs(1);
      expect(await wallet.connect(owner2).confirmAndExecuteTransaction(1))
        .to.emit(wallet, 'Confirmation')
        .withArgs(1);
      // owner3이 합의하면서 멀티시그너에서 제외되며, 합의 필요 개수가 3 -> 2로 변경됨. (이게 RequirementChange임)
      expect(await wallet.connect(owner3).confirmAndExecuteTransaction(1))
        .to.emit(wallet, 'Confirmation')
        .withArgs(1)
        .to.emit(wallet, 'RequirementChange')
        .withArgs(2);
      // 합의자 확인. 하지만 owner3은 지금은 없음.
      expect(await wallet.getConfirmations(1))
        .to.be.deep.equal([owner.address, owner2.address, owner3.address]);
      // 1번 트랜잭션 성공 확인.
      expect(await wallet.getTransactionIds(0, 1, false, true))
        .to.be.deep.equal([1]);
      // 이제 합의에 필요한 개수는 2개인 것 확인.
      expect(await wallet.required()).to.be.equal(2);
    });
    it('removeOwner:req changed', async () => {
      // owner2 지우려함
      const transaction = wallet.interface.encodeFunctionData('removeOwner', [owner2.address]);
      await wallet.submitTransaction(wallet.address, 0, transaction);
      // transaction does not exist
      // 지금 트랜잭션은 2번인데 3번 트랜잭션에 합의하려함 멍충이 ㅋㅋ
      await expect(wallet.connect(owner2).confirmAndExecuteTransaction(3)).to.be.reverted;
      // confirm correct transaction
      // 이번엔 제대로 2번 트랜잭션에 합의하려 함. 여기서 owner2의 멀티시그너 권한은 삭제됨.
      await wallet.connect(owner2).confirmAndExecuteTransaction(2);
      expect(await wallet.getConfirmations(2))
        .to.be.deep.equal([owner.address, owner2.address]);
      // 실행 완료된 트랜잭션 가져오기. 0번 트랜잭션은 실패했으니까 안뜸.
      expect(await wallet.getTransactionIds(0, 2, false, true))
        .to.be.deep.equal([1, 2]);
      // owner2 죽였으니까 필요한 서명자는 1개임.
      expect(await wallet.required()).to.be.equal(1);
    });
    it('replaceOwner:fail, same owners', async () => {
      // owner1과 owner1을 바꾸려함. 개멍똥이.
      const transaction = wallet.interface.encodeFunctionData('replaceOwner', [owner.address, owner.address]);
      // 멍똥이같은 트랜잭션이어도 Submit되긴 함.
      await wallet.submitTransaction(wallet.address, 0, transaction);
      // 밑의 eslint~~ 주석은 esline의 언터라인(_) 규칙을 무시하는 코드.
      // 자기 자신을 바꾸려 하는 멍똥한 짓이므로 false가 뜸.
      // eslint-disable-next-line no-underscore-dangle
      expect((await wallet.getTransactionInfo(3)).executed_).to.be.equal(false);
    });
    it('replaceOwner:fail, owner does not exist', async () => {
      // 알아서 해석해. owner5랑 owner6은 없음.
      const transaction = wallet.interface.encodeFunctionData('replaceOwner', [owner5.address, owner6.address]);
      await wallet.submitTransaction(wallet.address, 0, transaction);
      // eslint-disable-next-line no-underscore-dangle
      expect((await wallet.getTransactionInfo(4)).executed_).to.be.equal(false);
    });
    it('replaceOwner:fail, new owner is zero address', async () => {
      // zero Address랑 owner랑 바꾸려함.
      const transaction = wallet.interface.encodeFunctionData('replaceOwner', [owner.address, constants.AddressZero]);
      await wallet.submitTransaction(wallet.address, 0, transaction);
      // zero Address는 바꿀 수 없음.!
      // eslint-disable-next-line no-underscore-dangle
      expect((await wallet.getTransactionInfo(5)).executed_).to.be.equal(false);
      // 미확인에 실행 실패한 트랜잭션은 0, 3, 4, 5, 0임. (마지막 0은 왜 들감?) <= 그냥 범위 더크면 0으로 하는듯.
      expect(await wallet.getTransactionIds(0, 5, true, false))
        .to.be.deep.equal([0, 3, 4, 5, 0]);
    });
    it('replaceOwner:fail, destination is zero address', async () => {
      // Owner2랑은 바꾸기 ㄱㄴ임.
      const transaction = wallet.interface.encodeFunctionData('replaceOwner', [owner.address, owner2.address]);
      // 근데 트랜잭션 제출하는애가 zeroAddress라 오류뜸.
      await expect(wallet.submitTransaction(constants.AddressZero, 0, transaction))
        .to.be.reverted;
    });
    it('addOwner:fail, same owner', async () => {
      // 이미 멀티시그너인 owner를 또 추가하려 함. 빵꾸똥꾸 ㅋ
      const transaction = wallet.interface.encodeFunctionData('addOwner', [owner.address]);
      await wallet.submitTransaction(wallet.address, 0, transaction);
      // 당연히 실패지 빵꾸똥꾸야!
      // eslint-disable-next-line no-underscore-dangle
      expect((await wallet.getTransactionInfo(6)).executed_).to.be.equal(false);
    });
    it('revokeConfirmation:fail, tx is already executed', async () => {
      // 이미 owner2 죽이는거에 합의되서 실행까지된 트랜잭션을 되돌릴라 함. (_ 나 다시 돌아갈래!! _) 응 실패 ㅋ
      await expect(wallet.revokeConfirmation(2)).to.be.reverted;
    });
    it('addOwner:fail, caller is not an owner', async () => {
      // owner5는 멀티시그너가 아니어서 addOwner메서드 호출에 실패함.
      await expect(wallet.connect(owner5).addOwner(owner2.address)).to.be.reverted;
    });
  });
});
