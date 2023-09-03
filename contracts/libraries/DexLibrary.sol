// SPDX-License-Identifier: GPL-3.0
pragma solidity =0.8.12;

import "../interfaces/IDexPair.sol";
import "../interfaces/IDexFactory.sol";

library DexLibrary {

    // returns sorted token addresses, used to handle return values from pairs sorted in this order
    /**
     TokeNestUpdate : 페어 생성 규칙에 맞춰 sortToken메서드 로직 변경.
     */ 
    function sortTokens(address factory, address tokenA, address tokenB) internal view returns (address token0, address token1) {
        bool isStableTokenExist = false;
        for(uint i = 0; i < IDexFactory(factory).criteriaCoinLength(); i++) {
            address _stableToken = IDexFactory(factory).tokeNestStableCoins(i);
            if(tokenA == _stableToken) {
                token0 = tokenB;
                token1 = tokenA;
                isStableTokenExist = true;
                break;
            } else if(tokenB == _stableToken) {
                token0 = tokenA;
                token1 = tokenB;
                isStableTokenExist = true;
                break;
            }
        }
        // require(tokenA != tokenB, "DexLibrary: IDENTICAL_ADDRESSES");
        // (token0, token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        // require(token0 != address(0), "DexLibrary: ZERO_ADDRESS");
    }

    // calculates the CREATE2 address for a pair without making any external calls
    /**
    TokeNestUpdate : pairFor의 encodePacked부분에서 오류 발생하나 원인파악 불가함. 이에 TokeNest에서 pairFor는 사용하지 않음.
     */
    function pairFor(address factory, address tokenA, address tokenB) internal view returns (address pair) {
        (address token0, address token1) = sortTokens(factory, tokenA, tokenB);
        pair = address(uint160(uint(keccak256(abi.encodePacked(
                hex"ff",
                factory,
                keccak256(abi.encodePacked(token0, token1)),
                hex"f642c5ae86cfb4b6c9722ae01efc63d5e5b1c91b970fb76c62ebdaddc7aacd5e" // init code hash
            )))));
    }

    /**
    TokeNestUpdate : pairFor -> IDexPair(pair).getReserves() 변경.
     */
    function getReserves(address pair, address tokenA, address tokenB) internal view returns (uint reserveA, uint reserveB) {
        (address token0,) = sortTokens(IDexPair(pair).factory(), tokenA, tokenB);
        (uint reserve0, uint reserve1,) = IDexPair(pair).getReserves();
        (reserveA, reserveB) = tokenA == token0 ? (reserve0, reserve1) : (reserve1, reserve0);
    }

    // // fetches and sorts the reserves for a pair    원본
    // function getReserves(address factory, address tokenA, address tokenB) internal view returns (uint reserveA, uint reserveB) {
    //     (address token0,) = sortTokens(tokenA, tokenB);
    //     (uint reserve0, uint reserve1,) = IDexPair(pairFor(factory, tokenA, tokenB)).getReserves();
    //     (reserveA, reserveB) = tokenA == token0 ? (reserve0, reserve1) : (reserve1, reserve0);
    // }


    // given some amount of an asset and pair reserves, returns an equivalent amount of the other asset
    function quote(uint amountA, uint reserveA, uint reserveB) internal pure returns (uint amountB) {
        require(amountA > 0, "DexLibrary: INSUFFICIENT_AMOUNT");
        require(reserveA > 0 && reserveB > 0, "DexLibrary: INSUFFICIENT_LIQUIDITY");
        amountB = amountA * reserveB / reserveA;
    }

    // given an input amount of an asset and pair reserves, returns the maximum output amount of the other asset
    function getAmountOut(uint amountIn, uint reserveIn, uint reserveOut) internal pure returns (uint amountOut) {
        require(amountIn > 0, "DexLibrary: INSUFFICIENT_INPUT_AMOUNT");
        require(reserveIn > 0 && reserveOut > 0, "DexLibrary: INSUFFICIENT_LIQUIDITY");
        uint amountInWithFee = amountIn * 997;
        uint numerator = amountInWithFee * reserveOut;
        uint denominator = reserveIn * 1000 + amountInWithFee;
        amountOut = numerator / denominator;
    }

    // given an output amount of an asset and pair reserves, returns a required input amount of the other asset
    function getAmountIn(uint amountOut, uint reserveIn, uint reserveOut) internal pure returns (uint amountIn) {
        require(amountOut > 0, "DexLibrary: INSUFFICIENT_OUTPUT_AMOUNT");
        require(reserveIn > 0 && reserveOut > 0, "DexLibrary: INSUFFICIENT_LIQUIDITY");
        uint numerator = reserveIn * amountOut * 1000;
        uint denominator = (reserveOut - amountOut) * 997;
        amountIn = (numerator / denominator) + 1;
    }

    // performs chained getAmountOut calculations on any number of pairs
    /**
    TokeNestUpdate : getReserves의 스펙이 변경되며, factory -> pair로 매개변수 및 getReserves호출 값 변경.
     */
    function getAmountsOut(address pair, uint amountIn, address[] memory path) internal view returns (uint[] memory amounts) {
        uint length = path.length;
        require(length >= 2, "DexLibrary: INVALID_PATH");
        amounts = new uint[](length);
        amounts[0] = amountIn;
        for (uint i = 0; i < length - 1; i++) {
            (uint reserveIn, uint reserveOut) = getReserves(pair, path[i], path[i + 1]);
            amounts[i + 1] = getAmountOut(amounts[i], reserveIn, reserveOut);
        }
    }

    // performs chained getAmountIn calculations on any number of pairs
    /**
    TokeNestUpdate : getReserves의 스펙이 변경되며, factory -> pair로 매개변수 및 getReserves호출 값 변경.
     */
    function getAmountsIn(address pair, uint amountOut, address[] memory path) internal view returns (uint[] memory amounts) {
        uint length = path.length;
        require(length >= 2, "DexLibrary: INVALID_PATH");
        amounts = new uint[](length);
        amounts[amounts.length - 1] = amountOut;
        for (uint i = length - 1; i > 0; i--) {
            (uint reserveIn, uint reserveOut) = getReserves(pair, path[i - 1], path[i]);
            amounts[i - 1] = getAmountIn(amounts[i], reserveIn, reserveOut);
        }
    }
}