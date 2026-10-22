// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";



/// @title KasihCengkring
/// @notice Non-custodial USDC creator donation platform on Arc.
///         Funds flow directly from donor to creator payout address — the contract never holds funds at rest.
///         Donations use the two-step ERC-20 approve + donate() flow; an EIP-3009 variant was
///         evaluated and removed (see the note above the owner section).
/// @dev    OpenZeppelin 5.1.0; Paris EVM; solc 0.8.28 exact.
///         No proxy, no upgradeability, no delegatecall, no selfdestruct, no tx.origin, no platform fee.
contract KasihCengkring is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─────────────────────────────────────────────────────────────────────────
    //  Constants
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Minimum donation floor: 0.10 USDC (6-decimal ERC-20 view).
    uint256 public constant MIN_DONATION_FLOOR = 100_000;
    uint40 public constant MAX_USERNAME_LENGTH = 20;
    uint40 public constant MIN_USERNAME_LENGTH = 3;
    uint40 public constant MAX_DONOR_NAME_LENGTH = 40;
    uint40 public constant MAX_MESSAGE_LENGTH = 200;

    // ─────────────────────────────────────────────────────────────────────────
    //  State
    // ─────────────────────────────────────────────────────────────────────────

    IERC20 public immutable usdc;
    uint256 public maxDonation;

    struct Creator {
        address payoutAddress;
        uint256 minDonation; // >= MIN_DONATION_FLOOR
        bool registered;
    }

    mapping(bytes32 => Creator) private creators;       // usernameHash => Creator
    mapping(bytes32 => string) private usernameByHash;  // usernameHash => raw username
    mapping(address => bytes32) public walletToUsernameHash; // wallet => usernameHash
    mapping(bytes32 => bool) private reservedUsernames;

    // ─────────────────────────────────────────────────────────────────────────
    //  Errors
    // ─────────────────────────────────────────────────────────────────────────

    error UsernameInvalid();
    error UsernameTaken();
    error UsernameReserved();
    error AlreadyRegistered();
    error NotRegistered();
    error DonorNameTooLong();
    error MessageTooLong();
    error AmountBelowMin(uint256 amount, uint256 minimum);
    error AmountAboveMax(uint256 amount, uint256 maxDonation);
    error ZeroAddress();
    error MinBelowFloor(uint256 min, uint256 floor);
    error MaxBelowFloor(uint256 max, uint256 floor);
    error InvalidPayoutAddress();

    // ─────────────────────────────────────────────────────────────────────────
    //  Events
    // ─────────────────────────────────────────────────────────────────────────

    event CreatorRegistered(
        bytes32 indexed usernameHash,
        string username,
        address indexed wallet,
        address payoutAddress
    );
    event PayoutAddressUpdated(
        bytes32 indexed usernameHash,
        address indexed oldAddress,
        address indexed newAddress
    );
    event MinDonationUpdated(bytes32 indexed usernameHash, uint256 oldMin, uint256 newMin);
    event MaxDonationUpdated(uint256 oldMax, uint256 newMax);
    event DonationReceived(
        bytes32 indexed usernameHash,
        string username,
        address indexed donor,
        address indexed creator,
        string donorName,
        string message,
        uint256 amount,
        uint256 timestamp
    );

    // ─────────────────────────────────────────────────────────────────────────
    //  Constructor
    // ─────────────────────────────────────────────────────────────────────────

    constructor(address usdc_, uint256 maxDonation_, address initialOwner) Ownable(initialOwner) {
        if (usdc_ == address(0)) revert ZeroAddress();
        if (maxDonation_ < MIN_DONATION_FLOOR) revert MaxBelowFloor(maxDonation_, MIN_DONATION_FLOOR);

        usdc = IERC20(usdc_);
        maxDonation = maxDonation_;

        _reserveUsername("admin");
        _reserveUsername("support");
        _reserveUsername("help");
        _reserveUsername("root");
        _reserveUsername("system");
        _reserveUsername("moderator");
        _reserveUsername("mod");
        _reserveUsername("owner");
        _reserveUsername("kasih");
        _reserveUsername("cengkring");
        _reserveUsername("kasihcengkring");
        _reserveUsername("donate");
        _reserveUsername("tip");
        _reserveUsername("about");
        _reserveUsername("faq");
        _reserveUsername("app");
        _reserveUsername("api");
        _reserveUsername("www");
        _reserveUsername("mail");
        _reserveUsername("static");
        _reserveUsername("assets");
        _reserveUsername("images");
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  External: Registration
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Register a creator username and payout address.
    /// @param username     a-z 0-9 _ only, 3–20 chars. Uppercase rejected.
    /// @param payoutAddress Destination for incoming donations.
    /// @param minDonation  Per-creator minimum, must be >= MIN_DONATION_FLOOR.
    function register(string calldata username, address payoutAddress, uint256 minDonation)
        external
        nonReentrant
        whenNotPaused
    {
        bytes32 usernameHash = _validateUsername(username);

        if (payoutAddress == address(0)) revert ZeroAddress();
        if (payoutAddress == address(usdc)) revert InvalidPayoutAddress();
        if (payoutAddress == address(this)) revert InvalidPayoutAddress();
        if (minDonation < MIN_DONATION_FLOOR) revert MinBelowFloor(minDonation, MIN_DONATION_FLOOR);
        if (walletToUsernameHash[msg.sender] != bytes32(0)) revert AlreadyRegistered();
        if (creators[usernameHash].registered) revert UsernameTaken();
        if (reservedUsernames[usernameHash]) revert UsernameReserved();

        creators[usernameHash] = Creator({
            payoutAddress: payoutAddress,
            minDonation: minDonation,
            registered: true
        });
        walletToUsernameHash[msg.sender] = usernameHash;
        usernameByHash[usernameHash] = username;

        emit CreatorRegistered(usernameHash, username, msg.sender, payoutAddress);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  External: Creator management (not paused — creators always control payout)
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Update the payout address. NOT gated by pause — creators always control where funds go.
    function updatePayoutAddress(address newPayoutAddress) external nonReentrant {
        bytes32 usernameHash = walletToUsernameHash[msg.sender];
        if (usernameHash == bytes32(0)) revert NotRegistered();

        Creator storage creator = creators[usernameHash];
        if (!creator.registered) revert NotRegistered();

        if (newPayoutAddress == address(0)) revert ZeroAddress();
        if (newPayoutAddress == address(usdc)) revert InvalidPayoutAddress();
        if (newPayoutAddress == address(this)) revert InvalidPayoutAddress();

        address oldPayout = creator.payoutAddress;
        creator.payoutAddress = newPayoutAddress;

        emit PayoutAddressUpdated(usernameHash, oldPayout, newPayoutAddress);
    }

    /// @notice Update the per-creator minimum donation.
    function updateMinDonation(uint256 newMin) external nonReentrant whenNotPaused {
        bytes32 usernameHash = walletToUsernameHash[msg.sender];
        if (usernameHash == bytes32(0)) revert NotRegistered();

        Creator storage creator = creators[usernameHash];
        if (!creator.registered) revert NotRegistered();

        if (newMin < MIN_DONATION_FLOOR) revert MinBelowFloor(newMin, MIN_DONATION_FLOOR);

        uint256 oldMin = creator.minDonation;
        creator.minDonation = newMin;

        emit MinDonationUpdated(usernameHash, oldMin, newMin);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  External: Donations
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Donate USDC to a creator via standard ERC-20 approve + transferFrom (two-tx flow).
    ///         Checks → effects → interactions order.
    function donate(
        string calldata username,
        string calldata donorName,
        string calldata message,
        uint256 amount
    ) external nonReentrant whenNotPaused {
        // --- Checks ---
        bytes32 usernameHash = _validateUsername(username);
        Creator storage creator = creators[usernameHash];
        if (!creator.registered) revert NotRegistered();
        _checkDonation(donorName, message, amount, creator.minDonation);

        // Cache storage reads before external call
        address payoutAddress = creator.payoutAddress;
        string memory resolvedUsername = usernameByHash[usernameHash];

        // --- Effects ---
        emit DonationReceived(
            usernameHash,
            resolvedUsername,
            msg.sender,
            payoutAddress,
            donorName,
            message,
            amount,
            block.timestamp
        );

        // --- Interactions ---
        IERC20(address(usdc)).safeTransferFrom(msg.sender, payoutAddress, amount);
    }

    // NOTE: donateWithAuthorization (EIP-3009) was removed.
    // EIP-3009 receiveWithAuthorization requires address(this) as `to`, which means the authorization
    // is submittable out-of-band, allowing a front-runner to consume the nonce and strand USDC in the
    // contract. With no rescue function (per spec), this is an unrecoverable fund-lock. The two-tx
    // approve + donate() path is safe and fully covers all use cases.

    // ─────────────────────────────────────────────────────────────────────────
    //  External: Owner
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Set the global maximum donation. Owner only.
    ///         Emits MaxDonationUpdated. Owner CANNOT move, freeze, or redirect funds.
    function setMaxDonation(uint256 newMax) external nonReentrant onlyOwner {
        if (newMax < MIN_DONATION_FLOOR) revert MaxBelowFloor(newMax, MIN_DONATION_FLOOR);

        uint256 oldMax = maxDonation;
        maxDonation = newMax;

        emit MaxDonationUpdated(oldMax, newMax);
    }

    /// @notice Pause the contract. Blocks register, donate, and updateMinDonation.
    ///         Does NOT block updatePayoutAddress.
    function pause() external nonReentrant onlyOwner {
        _pause();
    }

    /// @notice Unpause the contract.
    function unpause() external nonReentrant onlyOwner {
        _unpause();
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  External: Views
    // ─────────────────────────────────────────────────────────────────────────

    function getCreator(string calldata username)
        external
        view
        returns (address payoutAddress, uint256 minDonation, bool registered)
    {
        bytes32 usernameHash = _validateUsername(username);
        Creator storage creator = creators[usernameHash];
        return (creator.payoutAddress, creator.minDonation, creator.registered);
    }

    function getCreatorByHash(bytes32 usernameHash)
        external
        view
        returns (address payoutAddress, uint256 minDonation, bool registered)
    {
        Creator storage creator = creators[usernameHash];
        return (creator.payoutAddress, creator.minDonation, creator.registered);
    }

    function getUsernameHash(address wallet) external view returns (bytes32) {
        return walletToUsernameHash[wallet];
    }

    function isReserved(string calldata username) external view returns (bool) {
        return reservedUsernames[keccak256(bytes(username))];
    }

    /// @notice Returns true iff the username is valid, not reserved, and not already taken.
    function isUsernameAvailable(string calldata username) external view returns (bool) {
        bytes calldata b = bytes(username);
        uint256 length = b.length;
        if (length < MIN_USERNAME_LENGTH || length > MAX_USERNAME_LENGTH) return false;

        for (uint256 i = 0; i < length; ++i) {
            bytes1 char = b[i];
            bool valid = (char >= 0x61 && char <= 0x7A) // a-z
                || (char >= 0x30 && char <= 0x39)        // 0-9
                || char == 0x5F;                         // _
            if (!valid) return false;
        }

        bytes32 usernameHash = keccak256(b);
        if (reservedUsernames[usernameHash]) return false;
        if (creators[usernameHash].registered) return false;

        return true;
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  Internal helpers
    // ─────────────────────────────────────────────────────────────────────────

    /// @dev Validate that a username is well-formed and return its keccak256 hash.
    ///      Reverts UsernameInvalid if length or character set fails.
    function _validateUsername(string calldata username) internal pure returns (bytes32) {
        bytes calldata b = bytes(username);
        uint256 length = b.length;

        if (length < MIN_USERNAME_LENGTH || length > MAX_USERNAME_LENGTH) revert UsernameInvalid();

        for (uint256 i = 0; i < length; ++i) {
            bytes1 char = b[i];
            bool valid = (char >= 0x61 && char <= 0x7A) // a-z
                || (char >= 0x30 && char <= 0x39)        // 0-9
                || char == 0x5F;                         // _
            if (!valid) revert UsernameInvalid();
        }

        return keccak256(b);
    }

    /// @dev Shared donation validation for the donation path.
    function _checkDonation(
        string calldata donorName,
        string calldata message,
        uint256 amount,
        uint256 creatorMinDonation
    ) internal view {
        if (bytes(donorName).length > MAX_DONOR_NAME_LENGTH) revert DonorNameTooLong();
        if (bytes(message).length > MAX_MESSAGE_LENGTH) revert MessageTooLong();
        if (amount > maxDonation) revert AmountAboveMax(amount, maxDonation);

        uint256 effectiveMin = creatorMinDonation < maxDonation ? creatorMinDonation : maxDonation;
        if (amount < effectiveMin) revert AmountBelowMin(amount, effectiveMin);
    }

    /// @dev Mark a username as reserved at construction.
    function _reserveUsername(string memory username) internal {
        reservedUsernames[keccak256(bytes(username))] = true;
    }
}
