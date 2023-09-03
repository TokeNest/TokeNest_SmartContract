[Korean](https://github.com/TokeNest/TokeNest_SmartContract/#토크네스트)[English](https://github.com/TokeNest/TokeNest_SmartContract/#TokeNest)


# 토크네스트

**TokeNest**은 물가 변동을 실시간으로 추적하고 가격을 조정하는 블록체인 DEX 플랫폼입니다. 

기존 시장에서는 물가 변동이 발생해도 가격 조정이 어렵고, 소비자와 기업 간의 불만이 생기는 경우가 많았습니다. **TokeNest**는 블록체인 기술과 스마트 컨트랙트를 활용하여 이 문제를 해결하고자 이 프로젝트를 만들었습니다.

TokeNest_SmartContract 리포지토리에선 Klaytn생태계에서 실물 상품과 대치되는 토큰발행 및 관리가 가능하며,
TokeNest_NextJs 리포지토리에서는 블록체인에서 발행된 토큰에 맞춰 실시간 상품의 가격이 변하는 키오스크 시스템을 구현하였습니다.

두 리포지토리를 활용하면 어떤 상품이든 토큰화하여 실시간 물가에 대응해 가격이 변동되는 시스템을 구현할 수 있습니다.

**TokeNest-SmartContract Repository**: [TokeNest-SmartContract](https://github.com/TokeNest/TokeNest_SmartContract)

**TokeNest-NextJs Repository**: [TokeNest-NextJs](https://github.com/TokeNest/TokeNest_NextJs)

## TokeNest-DEX Project

**TokeNest DEX Contracts**는 Klaytn 블록체인에서 상품의 실시간 시장 가격을 반영하여 금액을 산정할 수 있는 스마트 컨트랙트입니다. 

이 리포지토리는 **Klaytn-Dex-Contract** 리포지토리를 복제(clone)하여 추가 작업한 결과물로, TokeNest의 스펙에 맞춰 스마트 컨트랙트와 설정을 수정하였습니다.

**Klaytn-Dex-Contract Repository**: [Klaytn-Dex-Contract](https://github.com/klaytn/klaytn-dex-contracts)

## Main Mechanism

- **실시간 가격 조정**: 물가 변동을 실시간으로 추적하고 가격을 조정하여 공정한 거래를 제공합니다.
- **토큰화된 실물 자산**: 물가 변동에 실시간으로 거래되는 토큰화된 실물 자산을 거래할 수 있습니다.
- **신뢰성과 투명성**: 블록체인의 탈중앙화된 분산 장부로 모든 거래 내용을 투명하게 기록하고 공개합니다.
- **유통과정 간소화**: 스마트 컨트랙트를 활용하여 거래를 자동화하고 유통 과정을 간소화합니다.

## Scenario

TokeNest DEX Contracts는 다음과 같은 시나리오를 통해 동작합니다:

1. **토큰화**: 판매자는 실물 자산에 대응하는 토큰을 생성하고 블록체인에 상장합니다.
2. **스왑**: 구매자는 DEX에서 토큰을 구매하기 위해 스테이블 코인을 사용하여 스왑합니다.
3. **NFT 발급**: 구매자는 토큰을 실물 자산으로 교환하기 위해 NFT를 발급받습니다. (기능 구현중)
4. **NFT 소각**: 거래가 완료되면 NFT를 소각하여 실물 자산을 수령합니다.  (기능 구현중)
5. **완제품 생산**: 구매자는 실물 자산을 가공하여 완제품으로 생산하고 판매합니다.
6. **키오스크 시스템**: 소비자는 실시간 물가를 추적하고 합리적인 가격으로 제품을 구매하기 위한 키오스크 시스템을 이용합니다. ([TokeNest-NextJs](https://github.com/TokeNest/TokeNest_NextJs))

SmartContract의 자세한 동작과정에 대해선 아래 문서를 참조하세요.

[문서링크](./)

## Deploy
TokeNest를 배포하기 전, 필수로 .env.example 파일의 설명을 참고해 .env파일의 파라미터들을 입력해야 합니다.

### Using command line
모든 DEX의 스마트 컨트랙트 코드를 배포하려면, 아래 명령어를 입력하세요.

```bash 
npx hardhat run scripts/deployDEX.ts --network `network`
```
or
```bash
yarn hardhay run scripts/deployDEX.ts --network `network`
```

명령어에 사용할 `network`를 입력해야 합니다. 본 예제에선 hardhat 네트워크를 배포했으며, 이를 사용할 시 추가로 입력해야 하는 정보는 없습니다.

사용할 `network`는 반드시 hardhat.config.ts 파일의 HardhatUserConfig.networs에 정의되어 있어야 합니다.

사용하기 전에 [Hardhat Networks Configuration](`https://hardhat.org/hardhat-runner/docs/config#networks-configuration`)의 가이드를 참조해 주세요.

현재, TokeNest Contract에는 아래의 네트워크에 대한 설정은 구성되어 있습니다.

- hardhat (default)
- baobab (Klaytn Baobab Testnet)

사용 예시
```bash 
npx hardhat run scripts/deployDEX.ts --network baobab
```
Example (default hardhat network):
```bash 
npx hardhat run scripts/deployDEX.ts
```
or Example using yarn:
```bash 
yarn hardhat run scripts/deployDEX.ts --network baobab
```
Example (default hardhat network):
```bash 
yarn hardhat run scripts/deployDEX.ts
```

### Using Docker
Docker에서도 네트워크 환경을 구축할 수 있습니다. 사용할 `DEX_NETWORK_NAME`을 지정한 후 프로젝트 내의 `docker-compose.yaml`파일을 실행해 주세요.

```yaml
version: "3.7"

services:
  app:
    build: .
    volumes:
      - ./.env:/app/.env
      - ./deployments:/app/deployments
    environment:
      DEX_NETWORK_NAME: baobab
```

```bash
docker-compose up --build
```

## Tests
작성한 컨트랙트를 테스트하기 전, .env파일의 `MNEMONIC`, `FORKING`(true/false)와 `FORKING_URL` (이 경우에선 `FORKING`은 true입니다)을 입력해 주세요.

아래 명령어를 통해 모든 컨트랙트 코드의 유닛 테스트가 가능합니다.

```bash 
npx hardhat test
```
or
```bash
yarn hardhat test
```

## Forking
작성한 컨트랙트 코드들은 Hardhat 네트워크를 사용해 특정 네트워크를 포크할 수 있습니다. 이 때, 해당 네트워크의 Archive Node RPC 엔드포인트를 사용합니다. 이를 통해 포크된 네트워크와 동일한 상태를 시뮬레이션 하며 로컬 개발 환경에서 작업할 수 있습니다.

사용할 때, [Hardhat Forking](`https://hardhat.org/hardhat-network/docs/guides/forking-other-networks`) 가이드를 참조해 더 많은 정보를 얻을 수 있습니다. 이 기능을 사용하기 위해선 반드시 .env파일의 `FORKING` 파라미터를 `true`로 설정해야 하며, `FORKING_URL`을 제공해야 합니다.

포크 관련 파라미터를 설정한 후에는 포크된 네트워크에서 모든 테스트를 실행할 수 있습니다.

```bash 
npx hardhat test
```
or launch the deployment script
```bash 
npx hardhat run scripts/deployDEX.ts
```
or you can use yarn
```bash 
yarn hardhat run scripts/deployDEX.ts
```
hardhat test로 포크된 네트워크에서 배포하는 과정을 시뮬레이션 합니다.

## Documentation

이 리포지토리는 TokeNest-DEX의 세부 실행 매커니즘을 `원두` 상품을 예시로 설명하는 문서를 제공하고 있습니다.
//The repository contains Klaytn-DEX specification and audit reports ([learn more](./docs/README.md)).

## Want to Contribute to TokeNest DEX Contracts? <a id="want-to-contribute"></a>

오픈 SW개발자 대회의 취지에 따라, 모든 토크네스트 코드베이스와 문서는 전부 오픈 소스입니다. 토크네스트는 항상 당신의 Contribute를 환영하며, 누구나 우리의 코드를 보고, 편집하고, 수정해 제안할 수 있습니다. 또한, 깃허브에서 pull request를 만들고 더 나은 프로젝트를 만드는 것에 동참할 수 있습니다. 

TokeNest에게 기여하기 전  [Contributor License Agreement(CLA)](https://gist.github.com/e78f99e1c527225637e269cff1bc7e49) 를 확인하세요. 또한, 기여하기 전에 확인할 수 있는 몇 가지 지침이 있습니다:

- [Contribution Guide](./CONTRIBUTING.md)
- [License](./LICENSE)
- [Code of Conducts](./code-of-conduct.md)





# TokeNest

**TokeNest**은 물가 변동을 실시간으로 추적하고 가격을 조정하는 블록체인 DEX 플랫폼입니다. 

기존 시장에서는 물가 변동이 발생해도 가격 조정이 어렵고, 소비자와 기업 간의 불만이 생기는 경우가 많았습니다. **TokeNest**는 블록체인 기술과 스마트 컨트랙트를 활용하여 이 문제를 해결하고자 이 프로젝트를 만들었습니다.

TokeNest_SmartContract 리포지토리에선 Klaytn생태계에서 실물 상품과 대치되는 토큰발행 및 관리가 가능하며,
TokeNest_NextJs 리포지토리에서는 블록체인에서 발행된 토큰에 맞춰 실시간 상품의 가격이 변하는 키오스크 시스템을 구현하였습니다.

두 리포지토리를 활용하면 어떤 상품이든 토큰화하여 실시간 물가에 대응해 가격이 변동되는 시스템을 구현할 수 있습니다.

**TokeNest-SmartContract Repository**: [TokeNest-SmartContract](https://github.com/TokeNest/TokeNest_SmartContract)

**TokeNest-NextJs Repository**: [TokeNest-NextJs](https://github.com/TokeNest/TokeNest_NextJs)

## TokeNest-DEX Project

**TokeNest DEX Contracts**는 Klaytn 블록체인에서 상품의 실시간 시장 가격을 반영하여 금액을 산정할 수 있는 스마트 컨트랙트입니다. 

이 리포지토리는 **Klaytn-Dex-Contract** 리포지토리를 복제(clone)하여 추가 작업한 결과물로, TokeNest의 스펙에 맞춰 스마트 컨트랙트와 설정을 수정하였습니다.

**Klaytn-Dex-Contract Repository**: [Klaytn-Dex-Contract](https://github.com/klaytn/klaytn-dex-contracts)

## Main Mechanism

- **실시간 가격 조정**: 물가 변동을 실시간으로 추적하고 가격을 조정하여 공정한 거래를 제공합니다.
- **토큰화된 실물 자산**: 물가 변동에 실시간으로 거래되는 토큰화된 실물 자산을 거래할 수 있습니다.
- **신뢰성과 투명성**: 블록체인의 탈중앙화된 분산 장부로 모든 거래 내용을 투명하게 기록하고 공개합니다.
- **유통과정 간소화**: 스마트 컨트랙트를 활용하여 거래를 자동화하고 유통 과정을 간소화합니다.

## Scenario

TokeNest DEX Contracts는 다음과 같은 시나리오를 통해 동작합니다:

1. **토큰화**: 판매자는 실물 자산에 대응하는 토큰을 생성하고 블록체인에 상장합니다.
2. **스왑**: 구매자는 DEX에서 토큰을 구매하기 위해 스테이블 코인을 사용하여 스왑합니다.
3. **NFT 발급**: 구매자는 토큰을 실물 자산으로 교환하기 위해 NFT를 발급받습니다. (기능 구현중)
4. **NFT 소각**: 거래가 완료되면 NFT를 소각하여 실물 자산을 수령합니다.  (기능 구현중)
5. **완제품 생산**: 구매자는 실물 자산을 가공하여 완제품으로 생산하고 판매합니다.
6. **키오스크 시스템**: 소비자는 실시간 물가를 추적하고 합리적인 가격으로 제품을 구매하기 위한 키오스크 시스템을 이용합니다. ([TokeNest-NextJs](https://github.com/TokeNest/TokeNest_NextJs))

SmartContract의 자세한 동작과정에 대해선 아래 문서를 참조하세요.

[문서링크](./)

## Deploy
Before deployment, please, set up all required parameters in your .env file described in the .env.example.

### Using command line
To deploy all DEX Smart Contracts, please run

```bash 
npx hardhat run scripts/deployDEX.ts --network `network`
```
or
```bash
yarn hardhay run scripts/deployDEX.ts --network `network`
```
command with the specified `network` argument. In case of hardhat network deployment, there is no need to provide any additional parameters. 

The `network` should be configured in your hardhat.config.ts file in HardhatUserConfig.networks section. Please, refer to the [Hardhat Networks Configuration](`https://hardhat.org/hardhat-runner/docs/config#networks-configuration`) guide for more information. 

Currently, the following networks are already configured:

- hardhat (default)
- baobab (Klaytn Baobab Testnet)

Example using npx:

```bash 
npx hardhat run scripts/deployDEX.ts --network baobab
```
Example (default hardhat network):
```bash 
npx hardhat run scripts/deployDEX.ts
```
or Example using yarn:
```bash 
yarn hardhat run scripts/deployDEX.ts --network baobab
```
Example (default hardhat network):
```bash 
yarn hardhat run scripts/deployDEX.ts
```

### Using Docker
Docker and docker-compose are required for this step. You can see the following in `docker-compose.yaml`. Please update `DEX_NETWORK_NAME` you want to deploy.

```yaml
version: "3.7"

services:
  app:
    build: .
    volumes:
      - ./.env:/app/.env
      - ./deployments:/app/deployments
    environment:
      DEX_NETWORK_NAME: baobab
```

```bash
docker-compose up --build
```

## Tests
Before running tests, please, provide the following parameters in a .env file: `MNEMONIC`, `FORKING`(true/false) and `FORKING_URL` (in case of `FORKING` is true).

To run all unit tests, please run 

```bash 
npx hardhat test
```
or
```bash
yarn hardhat test
```

## Forking
You can start an instance of Hardhat Network that forks the specified network via its Archive Node RPC endpoint. It will simulate having the same state as the network, but it will work as a local development network. 

Please, refer to the [Hardhat Forking](`https://hardhat.org/hardhat-network/docs/guides/forking-other-networks`) guide for more information. To use this feature you need to set up `FORKING` parameter as `true` and provide `FORKING_URL` in your .env file.

After setting up forking parameters you can run all the tests on the forked network
```bash 
npx hardhat test
```
or launch the deployment script
```bash 
npx hardhat run scripts/deployDEX.ts
```
or you can use yarn
```bash 
yarn hardhat run scripts/deployDEX.ts
```
to simulate the deployment process to the forked network.

## Documentation

The repository provides a document describing the detailed execution mechanism of TokeNest-DEX as an example of a 'raw beans' product.

## Want to Contribute to TokeNest DEX Contracts? <a id="want-to-contribute"></a>

In accordance with the purpose of the Open SW Developer Conference, all TalkNest codebases and documents are completely open source. TokeNest always welcomes your Contribute, Anyone can view, edit, fix its contents and make suggestions.

You can either create a pull request on GitHub or create a enhancement request. Make sure to check our [Contributor License Agreement (CLA)](https://gist.github.com/e78f99e1c527225637e269cff1bc7e49) first and there are also a few guidelines our contributors would check out before contributing:

- [Contribution Guide](./CONTRIBUTING.md)
- [License](./LICENSE)
- [Code of Conducts](./code-of-conduct.md)
