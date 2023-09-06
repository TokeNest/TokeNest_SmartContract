# TokeИest
TokeИest 프로젝트의 자세한 내용은 [TokeИest Organization](https://github.com/TokeNest)를 참고해주세요.

#  TokeИest-dApps
**TokeИest DEX Contracts**는 Klaytn 블록체인에서 상품의 실시간 시장 가격을 반영하여 금액을 산정할 수 있는 dApps입니다.

이 리포지토리는 **Klaytn-Dex-Contract** 리포지토리를 복제(clone)하여 추가 작업한 결과물로, TokeИest의 스펙에 맞춰 스마트 컨트랙트와 설정을 수정하였습니다.

2023/09/01 기준으로는 [TokeИest-DEX](#TokeИest-DEX)가 구현되어 있으며, 추후 [TokeИest-NFT](#TokeИest-NFT) 컨트랙트 기능 추가할 예정입니다.

# TokeИest-DEX
#### ```본 문서는 Klaytn-dex-contract의 문서를 기반으로 작성되었으며, TokeИest의 스펙에 맞춰 재 정리된 문서입니다.```
[Klaytn-Dex-Contract Repository](https://github.com/klaytn/klaytn-dex-contracts)

## Deploy
TokeИest를 배포하기 전, 필수로 .env.example 파일의 설명을 참고해 .env파일의 파라미터들을 입력해야 합니다.

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

사용하기 전에 [Hardhat Networks Configuration](https://hardhat.org/hardhat-runner/docs/config#networks-configuration)의 가이드를 참조해 주세요.

현재, TokeИest Contract에는 아래의 네트워크에 대한 설정은 구성되어 있습니다.

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

사용할 때, [Hardhat Forking](https://hardhat.org/hardhat-network/docs/guides/forking-other-networks) 가이드를 참조해 더 많은 정보를 얻을 수 있습니다. 이 기능을 사용하기 위해선 반드시 .env파일의 `FORKING` 파라미터를 `true`로 설정해야 하며, `FORKING_URL`을 제공해야 합니다.

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


## TokeИest-NFT
현재 개발 중입니다.

## Documentation

이 리포지토리는 TokeИest-DEX의 세부 실행 매커니즘을 `원두` 상품을 예시로 설명하는 문서를 제공하고 있습니다. ([TokeИest-dApps-Process](./docs/dApps-process.md))

오픈 SW개발자 대회의 취지에 따라, 모든 토크네스트 코드베이스와 문서는 전부 오픈 소스로 제공됩니다. 누구나 자유롭게 TokeИest의 코드를 보고, 편집하고, 수정할 수 있습니다.

- [License](./LICENSE)
- [Code of Conducts](https://github.com/TokeNest/TokeNest_SmartContract/blob/master/CODE_OF_CONDUCT.md)
