// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IDexFactory {

    function feeTo() external view returns (address);
    function feeToSetter() external view returns (address);

    function getPair(address tokenA, address tokenB) external view returns (address pair);
    function allPairs(uint) external view returns (address pair);
    function allPairsLength() external view returns (uint);

    /**
     TokeNestUpdate : pair생성 시 name과 symbol을 지정할 수 있도록 수정.
    */
    function createPair(address tokenA, address tokenB, string calldata _pairName, string calldata _pairSymbol) external returns (address pair);


    function setFeeTo(address) external;
    function setFeeToSetter(address) external;

    /**
     TokeNestUpdate : DexFactory 스펙에 맞춰 Interface 추가
     */
    function getTokenValues(address[] calldata pairs) external view returns (uint256[] memory token0Values, uint256[] memory token1Values);
    function createCriteriaCoin(address criteriaCoin) external;
    function getTokenDecimals(address token) external view returns(uint24 returnToken);
    function tokeNestStableCoins(uint) external view returns(address);
    function criteriaCoinLength() external view returns (uint);

}
