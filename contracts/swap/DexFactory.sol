// SPDX-License-Identifier: GPL-3.0
pragma solidity =0.8.12;

import "../interfaces/IDexFactory.sol";
import "./DexPair.sol";
import "./Errors.sol";
import "../interfaces/IDexPair.sol";

contract DexFactory is IDexFactory {
    /// @notice the recipient of the protocol-wide charge.
    address public feeTo;
    /// @notice The address allowed to change `feeTo`.
    address public feeToSetter;

    /**
     * @notice Returns the a₩ddress of the pair for tokenA and tokenB, if it has been created, else address(0).
     * @dev tokenA and tokenB are interchangeable. Pair addresses can also be calculated deterministically.
    */
    mapping(address => mapping(address => address)) public getPair;
    /**
     * @notice Returns the address of the nth pair (0-indexed) created through the factory, or address(0)
      if not enough pairs have been created yet.
     * @dev Pass 0 for the address of the first pair created, 1 for the second, etc.
    */
    address[] public allPairs;
    /// @notice Init codehash used in Dex Library to calculate pair address without any external calls.
    bytes32 public constant INIT =
        keccak256(abi.encodePacked(type(DexPair).creationCode));

    /**
     TokeNestUpdate : TokeNest에서 Stable코인으로 취급하는 토큰 List
     */ 
    address[] public tokeNestStableCoins;

    /**
     * @dev Emitted each time a pair is created via `createPair`.
     *
     * token0 is guaranteed to be strictly less than token1 by sort order.
     * The final uint log value will be 1 for the first pair created, 2 for the second, etc.
     *
     */
    event PairCreated(
        address indexed token0,
        address indexed token1,
        address pair,
        uint256
    );

    /**
     * @dev Emitted each time when the recipient of the protocol-wide charge changes via `setFeeTo`.
     */
    event FeeToChanged (address newFeeTo);

    /**
     * @dev Emitted once in the constructor during the deploy 
     * and each time when the address allowed to change `feeTo` changes via `setFeeToSetter`.
     */
    event FeeToSetterChanged (address newFeeToSetter);

    constructor(address _feeToSetter) {
        if (_feeToSetter == address(0)) revert InvalidAddressParameters("DEX: SETTER_ZERO_ADDRESS");
        feeToSetter = _feeToSetter;
        emit FeeToSetterChanged(feeToSetter);
    }

    /// @notice Returns the total number of pairs created through the factory so far.
    function allPairsLength() external view returns (uint256) {
        return allPairs.length;
    }


    /**
     TokeNestUpdate : TokeNest의 Stable용 코인추가 가능 메서드.
     */
    function createCriteriaCoin(address criteriaCoin)
        external 
    {
        tokeNestStableCoins.push(criteriaCoin);
    }
    
    function getCriteriaCoins()
    external
    view
    returns(address[] memory coins)
    {
        coins = new address[](tokeNestStableCoins.length);
        for (uint256 i = 0; i < tokeNestStableCoins.length; i++) {
            coins[i] = tokeNestStableCoins[i];
        }
    }
    function criteriaCoinLength() 
        external
        view
        returns (uint256)
    {
        return tokeNestStableCoins.length;
    }
    
    
    /**
     * @notice Creates a pair for tokenA and tokenB if one doesn't exist already.
     * @dev tokenA and tokenB are interchangeable. Emits `PairCreated` event.
     * @param tokenA Address of the first token.
     * @param tokenB Address of the second token.
     * @return pair Address of the created pair.
     */
     /**
     TokeNestUpdate : pair생성 시 name과 symbol을 지정할 수 있도록 수정.
      */
    function createPair(address tokenA, address tokenB, string calldata _pairName, string calldata _pairSymbol)
        external
        returns (address pair)
    {
        address token0;
        address token1;
        bool isStableTokenExist = false;

        if (tokenA == tokenB)
            revert InvalidAddressParameters("DEX: IDENTICAL_ADDRESSES");
        
        /**
         TokeNestUpdate : 토큰추가 로직 변경
         myToken = token0, StableCoin = token1
        */ 
        
        for(uint32 i = 0; i < tokeNestStableCoins.length; i++) {
            if(tokenA == tokeNestStableCoins[i]) {
                token0 = tokenB;
                token1 = tokenA;
                isStableTokenExist = true;
            } else if(tokenB == tokeNestStableCoins[i]) {
                token0 = tokenA;
                token1 = tokenB;
                isStableTokenExist = true;
            }
        }
        if(!isStableTokenExist) {
             revert InvalidAddressParameters("Invalid Value : This Tokens is not authorized.");
        }

        // (address token0, address token1) = tokenA < tokenB
        //     ? (tokenA, tokenB)
        //     : (tokenB, tokenA);
        
        if (token0 == address(0))
            revert InvalidAddressParameters("DEX: ZERO_ADDRESS");
        if (getPair[token0][token1] != address(0))
            revert InvalidAddressParameters("DEX: PAIR_EXISTS"); // single check is sufficient
        pair = address(
            new DexPair{salt: keccak256(abi.encodePacked(token0, token1))}(_pairName, _pairSymbol)
        );
        IDexPair(pair).initialize(token0, token1);
        getPair[token0][token1] = pair;
        getPair[token1][token0] = pair; // populate mapping in the reverse direction
        allPairs.push(pair);
        emit PairCreated(token0, token1, pair, allPairs.length);
    }

    /**
     * @notice Sets the new address of the protocol-wide charge recipient.
     * @dev Can only be called by the `feeToSetter`.
     * @param _feeTo The new address of the charge recipient.
    */
    function setFeeTo(address _feeTo) external {
        if (msg.sender != feeToSetter) revert Unauthorized();
        feeTo = _feeTo;
        emit FeeToChanged(feeTo);
    }

    /**
     * @notice Sets the address which is allowed to control protocol-wide charge recipients.
     * @dev Can only be called by the previous `feeToSetter`.
     * @param _feeToSetter The new address which would be allowed to set the protocol-wide charge.
    */
    function setFeeToSetter(address _feeToSetter) external {
        if (_feeToSetter == address(0)) revert InvalidAddressParameters("DEX: SETTER_ZERO_ADDRESS");
        if (msg.sender != feeToSetter) revert Unauthorized();
        feeToSetter = _feeToSetter;
        emit FeeToSetterChanged(feeToSetter);
    }

    /**
     TokeNestUpdate : getTokenValue() call메서드 추가.
     token0, token1의 가격 조회
    */ 
    
    function getTokenValues(address[] calldata pairs)
        public 
        view
        returns (
            uint256[] memory token0Values,
            uint256[] memory token1Values 
        )
    {
        token0Values = new uint256[](pairs.length+1); // Initialize the array with the correct length
        token1Values = new uint256[](pairs.length); // Initialize the array with the correct length

        for(uint32 i = 0; i < pairs.length; i++) {
            (uint256 _reserve0, uint256 _reserve1,) = IDexPair(pairs[i]).getReserves();
            address token0 = IDexPair(pairs[i]).token0();
            address token1 = IDexPair(pairs[i]).token1();
            token0Values[i] = _reserve1 * (10 ** getTokenDecimals(token0)) / _reserve0;
            token1Values[i] = _reserve0 * (10 ** getTokenDecimals(token1)) / _reserve1;
        }
    }

    function getTokenDecimals(address token) public view returns(uint24 returnToken){
        returnToken = IKIP7Metadata(token).decimals();
    }
}
