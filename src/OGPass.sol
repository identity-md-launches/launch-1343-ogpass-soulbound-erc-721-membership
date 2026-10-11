// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/// @title OG Pass
/// @notice Soulbound ERC-721 membership pass paid for in the OG ERC-20.
///
/// Two kinds of pass exist and both are non-transferable:
///
/// * Founder passes. Addresses in a Merkle allowlist may claim one pass each for free until the
///   immutable claim deadline (30 days after deployment). A founder pass sits off the bonding curve.
///   Its holder may at any time burn it for a fixed buyback of {FOUNDER_BUYBACK} OG, paid out of a
///   separate founder reserve that anyone can fund. After the deadline anyone may send the part of
///   that reserve not needed for still-held founder buybacks to the burn address.
/// * Public passes. Minted on a linear bonding curve: the n-th outstanding public pass costs
///   P(n) = BASE_PRICE + PRICE_STEP * (n - 1) OG. Selling a public pass burns it and pays
///   {SELL_BPS} / 10_000 of P(publicSupply) to the seller; the remainder goes to the burn address.
///   The curve reserve therefore always equals the sum of P(i) over outstanding public passes, so
///   selling every pass in any order drains it to exactly zero.
///
/// The owner may only set the metadata base URI and pause or unpause new public buys. It can never
/// pause sells, claims or founder buybacks, withdraw any OG, or change prices, the root or the
/// deadline. There is no proxy and no upgrade path.
contract OGPass is ERC721, Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------------------------------------
    // Constants
    // ---------------------------------------------------------------------------------------------

    /// @notice Where seller fees and unclaimed founder reserve are sent.
    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    /// @notice Maximum number of passes (founder + public) outstanding at any time.
    uint256 public constant MAX_SUPPLY = 1000;

    /// @notice Price of the first public pass, in OG wei.
    uint256 public constant BASE_PRICE = 1_000_000e18;

    /// @notice Price increase per additional outstanding public pass, in OG wei.
    uint256 public constant PRICE_STEP = 10_000e18;

    /// @notice Fixed buyback paid to a founder who burns their pass, in OG wei.
    uint256 public constant FOUNDER_BUYBACK = 100_000e18;

    /// @notice Share of the curve price paid to a seller, in basis points (92.5%).
    uint256 public constant SELL_BPS = 9250;

    /// @notice Basis-point denominator.
    uint256 public constant BPS = 10_000;

    /// @notice Length of the founder claim window after deployment.
    uint256 public constant CLAIM_WINDOW = 30 days;

    // ---------------------------------------------------------------------------------------------
    // Immutables
    // ---------------------------------------------------------------------------------------------

    /// @notice Payment token.
    IERC20 public immutable OG;

    /// @notice Merkle root of the founder allowlist. Leaves are keccak256(bytes.concat(keccak256(abi.encode(addr)))).
    bytes32 public immutable founderRoot;

    /// @notice Number of founder slots reserved inside {MAX_SUPPLY}.
    uint256 public immutable founderCount;

    /// @notice Timestamp from which founder claims are closed and the unclaimed reserve may be burned.
    uint256 public immutable claimDeadline;

    // ---------------------------------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------------------------------

    /// @notice Number of public passes currently outstanding.
    uint256 public publicSupply;

    /// @notice Number of founder passes ever claimed.
    uint256 public founderClaimed;

    /// @notice Number of founder passes currently outstanding (claimed and not yet bought back).
    uint256 public founderOutstanding;

    /// @notice OG held for public-pass sells. Always equals the sum of P(i) for i in 1..publicSupply.
    uint256 public curveReserve;

    /// @notice OG held for founder buybacks.
    uint256 public founderReserve;

    /// @notice Whether new public buys are paused.
    bool public buysPaused;

    /// @notice Whether an allowlisted address has already claimed its founder pass.
    mapping(address account => bool claimed) public hasClaimedFounder;

    mapping(uint256 tokenId => bool founder) private _isFounder;
    uint256 private _nextTokenId = 1;
    string private _baseTokenURI;

    // ---------------------------------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------------------------------

    event Claim(address indexed account, uint256 indexed tokenId);
    event Buy(address indexed buyer, uint256 indexed tokenId, uint256 price, uint256 publicSupplyAfter);
    event Sell(address indexed seller, uint256 indexed tokenId, uint256 price, uint256 payout, uint256 burned);
    event FounderSell(address indexed seller, uint256 indexed tokenId, uint256 payout);
    event ReserveFunded(address indexed funder, uint256 amount, uint256 founderReserveAfter);
    event ReserveBurned(address indexed caller, uint256 amount, uint256 founderReserveAfter);
    event BuyPause(bool paused);
    event BaseURIUpdated(string baseURI);

    // ---------------------------------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------------------------------

    error Soulbound();
    error ZeroAddress();
    error ZeroAmount();
    error InvalidFounderCount();
    error InvalidProof();
    error AlreadyClaimed();
    error ClaimClosed();
    error ClaimStillOpen();
    error AlreadyMember();
    error FounderCapReached();
    error SupplyCapReached();
    error BuysPaused();
    error Expired();
    error PriceAboveMax(uint256 price, uint256 maxPrice);
    error PayoutBelowMin(uint256 payout, uint256 minOut);
    error NotTokenOwner();
    error NotPublicPass();
    error NotFounderPass();
    error InsufficientFounderReserve(uint256 reserve, uint256 needed);
    error NothingToBurn();
    error AmountMismatch(uint256 expected, uint256 received);

    // ---------------------------------------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------------------------------------

    /// @param og Address of the OG ERC-20 used for payment. Not called here; checked on first use.
    /// @param founderRoot_ Merkle root of the founder allowlist.
    /// @param founderCount_ Number of founder slots reserved inside the supply cap.
    /// @param owner_ Address that may set the base URI and pause new buys.
    constructor(address og, bytes32 founderRoot_, uint256 founderCount_, address owner_)
        ERC721("OG Pass", "OGPASS")
        Ownable(owner_)
    {
        if (og == address(0)) revert ZeroAddress();
        if (founderCount_ > MAX_SUPPLY) revert InvalidFounderCount();
        OG = IERC20(og);
        founderRoot = founderRoot_;
        founderCount = founderCount_;
        claimDeadline = block.timestamp + CLAIM_WINDOW;
    }

    // ---------------------------------------------------------------------------------------------
    // Founder passes
    // ---------------------------------------------------------------------------------------------

    /// @notice Claim the caller's founder pass. One per allowlisted address, before the deadline.
    /// @param proof Merkle proof for the leaf keccak256(bytes.concat(keccak256(abi.encode(msg.sender)))).
    function claimFounder(bytes32[] calldata proof) external nonReentrant returns (uint256 tokenId) {
        if (block.timestamp >= claimDeadline) revert ClaimClosed();
        if (hasClaimedFounder[msg.sender]) revert AlreadyClaimed();
        if (founderClaimed >= founderCount) revert FounderCapReached();
        if (balanceOf(msg.sender) != 0) revert AlreadyMember();
        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(msg.sender))));
        if (!MerkleProof.verifyCalldata(proof, founderRoot, leaf)) revert InvalidProof();

        hasClaimedFounder[msg.sender] = true;
        founderClaimed += 1;
        founderOutstanding += 1;
        tokenId = _nextTokenId++;
        _isFounder[tokenId] = true;
        _mint(msg.sender, tokenId);

        emit Claim(msg.sender, tokenId);
    }

    /// @notice Burn a founder pass for the fixed buyback, paid from the founder reserve.
    /// @param tokenId The founder pass owned by the caller.
    function sellFounder(uint256 tokenId) external nonReentrant {
        if (_ownerOf(tokenId) != msg.sender) revert NotTokenOwner();
        if (!_isFounder[tokenId]) revert NotFounderPass();
        uint256 reserve = founderReserve;
        if (reserve < FOUNDER_BUYBACK) revert InsufficientFounderReserve(reserve, FOUNDER_BUYBACK);

        founderReserve = reserve - FOUNDER_BUYBACK;
        founderOutstanding -= 1;
        delete _isFounder[tokenId];
        _burn(tokenId);

        emit FounderSell(msg.sender, tokenId, FOUNDER_BUYBACK);
        OG.safeTransfer(msg.sender, FOUNDER_BUYBACK);
    }

    /// @notice Deposit OG into the founder reserve. Anyone may call. The received amount is verified.
    /// @param amount OG wei to pull from the caller via transferFrom.
    function fundFounderReserve(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        founderReserve += amount;
        emit ReserveFunded(msg.sender, amount, founderReserve);
        _pullExact(msg.sender, amount);
    }

    /// @notice After the claim deadline, send the founder reserve not needed for still-held founder
    ///         buybacks to the burn address. Anyone may call, repeatedly.
    function burnUnclaimedFounderReserve() external nonReentrant returns (uint256 burned) {
        if (block.timestamp < claimDeadline) revert ClaimStillOpen();
        uint256 needed = founderOutstanding * FOUNDER_BUYBACK;
        uint256 reserve = founderReserve;
        if (reserve <= needed) revert NothingToBurn();
        burned = reserve - needed;

        founderReserve = needed;
        emit ReserveBurned(msg.sender, burned, needed);
        OG.safeTransfer(BURN_ADDRESS, burned);
    }

    // ---------------------------------------------------------------------------------------------
    // Public bonding curve
    // ---------------------------------------------------------------------------------------------

    /// @notice Mint one public pass for exactly P(publicSupply + 1) OG.
    /// @param maxPrice Highest price the caller accepts, in OG wei.
    /// @param deadline Last timestamp at which the call is valid.
    function buy(uint256 maxPrice, uint256 deadline) external nonReentrant returns (uint256 tokenId) {
        if (block.timestamp > deadline) revert Expired();
        if (buysPaused) revert BuysPaused();
        if (balanceOf(msg.sender) != 0) revert AlreadyMember();
        if (publicSupply + founderOutstanding + _reservedFounderSlots() >= MAX_SUPPLY) revert SupplyCapReached();
        uint256 supplyAfter = publicSupply + 1;
        uint256 price = priceOf(supplyAfter);
        if (price > maxPrice) revert PriceAboveMax(price, maxPrice);

        publicSupply = supplyAfter;
        curveReserve += price;
        tokenId = _nextTokenId++;
        _mint(msg.sender, tokenId);

        emit Buy(msg.sender, tokenId, price, supplyAfter);
        _pullExact(msg.sender, price);
    }

    /// @notice Burn a public pass and receive SELL_BPS / BPS of P(publicSupply). The rest is burned.
    /// @param tokenId The public pass owned by the caller.
    /// @param minOut Lowest payout the caller accepts, in OG wei.
    /// @param deadline Last timestamp at which the call is valid.
    function sell(uint256 tokenId, uint256 minOut, uint256 deadline) external nonReentrant returns (uint256 payout) {
        if (block.timestamp > deadline) revert Expired();
        if (_ownerOf(tokenId) != msg.sender) revert NotTokenOwner();
        if (_isFounder[tokenId]) revert NotPublicPass();
        uint256 supply = publicSupply;
        uint256 price = priceOf(supply);
        payout = (price * SELL_BPS) / BPS;
        uint256 burned = price - payout;
        if (payout < minOut) revert PayoutBelowMin(payout, minOut);

        publicSupply = supply - 1;
        curveReserve -= price;
        _burn(tokenId);

        emit Sell(msg.sender, tokenId, price, payout, burned);
        OG.safeTransfer(msg.sender, payout);
        OG.safeTransfer(BURN_ADDRESS, burned);
    }

    // ---------------------------------------------------------------------------------------------
    // Owner
    // ---------------------------------------------------------------------------------------------

    /// @notice Set the metadata base URI.
    function setBaseURI(string calldata baseURI_) external onlyOwner {
        _baseTokenURI = baseURI_;
        emit BaseURIUpdated(baseURI_);
    }

    /// @notice Pause or unpause new public buys. Sells, claims and founder buybacks are never pausable.
    function setBuysPaused(bool paused) external onlyOwner {
        buysPaused = paused;
        emit BuyPause(paused);
    }

    // ---------------------------------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------------------------------

    /// @notice Price of the n-th outstanding public pass. Reverts for n == 0.
    function priceOf(uint256 n) public pure returns (uint256) {
        if (n == 0) revert ZeroAmount();
        return BASE_PRICE + PRICE_STEP * (n - 1);
    }

    /// @notice OG required for the next public buy.
    function currentBuyPrice() external view returns (uint256) {
        return priceOf(publicSupply + 1);
    }

    /// @notice OG paid to the seller of a public pass right now. Zero when no public pass is outstanding.
    function currentSellPrice() external view returns (uint256) {
        uint256 supply = publicSupply;
        if (supply == 0) return 0;
        return (priceOf(supply) * SELL_BPS) / BPS;
    }

    /// @notice Total passes outstanding (founder + public).
    function totalSupply() external view returns (uint256) {
        return publicSupply + founderOutstanding;
    }

    /// @notice Founder slots still reserved inside the supply cap for unclaimed founders.
    function reservedFounderSlots() external view returns (uint256) {
        return _reservedFounderSlots();
    }

    /// @notice Whether `account` currently holds a pass.
    function isMember(address account) external view returns (bool) {
        return balanceOf(account) != 0;
    }

    /// @notice Whether `tokenId` is an outstanding founder pass.
    function isFounder(uint256 tokenId) external view returns (bool) {
        return _isFounder[tokenId];
    }

    // ---------------------------------------------------------------------------------------------
    // Soulbound overrides
    // ---------------------------------------------------------------------------------------------

    /// @dev Every ERC-721 transfer path (transferFrom and both safeTransferFrom overloads) ends in
    ///      _update with a non-zero `from`; only mints (from == 0) and burns (to == 0) pass.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address from) {
        from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) revert Soulbound();
        return super._update(to, tokenId, auth);
    }

    function approve(address, uint256) public pure override {
        revert Soulbound();
    }

    function setApprovalForAll(address, bool) public pure override {
        revert Soulbound();
    }

    // ---------------------------------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------------------------------

    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }

    function _reservedFounderSlots() internal view returns (uint256) {
        if (block.timestamp >= claimDeadline) return 0;
        return founderCount - founderClaimed;
    }

    /// @dev Pull `amount` OG from `from` and verify the balance of this contract grew by exactly that much.
    function _pullExact(address from, uint256 amount) internal {
        uint256 before = OG.balanceOf(address(this));
        OG.safeTransferFrom(from, address(this), amount);
        uint256 received = OG.balanceOf(address(this)) - before;
        if (received != amount) revert AmountMismatch(amount, received);
    }
}
