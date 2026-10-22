// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {KasihCengkring} from "../KasihCengkring.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";

// ─────────────────────────────────────────────────────────────────────────────
//  Constants used throughout tests
// ─────────────────────────────────────────────────────────────────────────────

uint256 constant MIN_FLOOR      = 100_000;   // KasihCengkring.MIN_DONATION_FLOOR
uint256 constant DEFAULT_MAX    = 10_000e6;  // 10 000 USDC — global max for most tests
uint256 constant CREATOR_MIN    = 500_000;   // 0.50 USDC — per-creator min for most tests
uint256 constant DONOR_BALANCE  = 100_000e6; // 100 000 USDC for donors

// ─────────────────────────────────────────────────────────────────────────────
//  KasihCengkringTest — main unit-test contract
// ─────────────────────────────────────────────────────────────────────────────

contract KasihCengkringTest is Test {

    // ── contract-under-test state ────────────────────────────────────────────
    KasihCengkring internal board;
    MockERC20      internal usdc;

    // ── named actors ────────────────────────────────────────────────────────
    address internal owner    = makeAddr("owner");
    address internal creator1 = makeAddr("creator1");
    address internal payout1  = makeAddr("payout1");
    address internal creator2 = makeAddr("creator2");
    address internal payout2  = makeAddr("payout2");
    address internal donor    = makeAddr("donor");
    address internal stranger = makeAddr("stranger");

    // ── helpers ──────────────────────────────────────────────────────────────

    /// @dev Register creator1 with username "alice" and payout1.
    function _registerAlice() internal {
        vm.prank(creator1);
        board.register("alice", payout1, CREATOR_MIN);
    }

    /// @dev Approve board to spend `amount` from donor.
    function _approveDonor(uint256 amount) internal {
        vm.prank(donor);
        usdc.approve(address(board), amount);
    }

    /// @dev Mint tokens to donor and approve board.
    function _fundAndApprove(uint256 amount) internal {
        usdc.mint(donor, amount);
        _approveDonor(amount);
    }

    // ── setUp ────────────────────────────────────────────────────────────────

    function setUp() public {
        // Deploy mock USDC
        usdc = new MockERC20("Mock USDC", "mUSDC", 6);

        // Deploy contract-under-test
        vm.prank(owner);
        board = new KasihCengkring(address(usdc), DEFAULT_MAX, owner);
    }

    // =========================================================================
    //  1 · Constructor
    // =========================================================================

    function test_Constructor_SetsState() public view {
        assertEq(address(board.usdc()),    address(usdc));
        assertEq(board.maxDonation(),      DEFAULT_MAX);
        assertEq(board.owner(),            owner);
        assertEq(board.MIN_DONATION_FLOOR(), MIN_FLOOR);
    }

    function test_Constructor_RejectsZeroUSDC() public {
        vm.expectRevert(KasihCengkring.ZeroAddress.selector);
        new KasihCengkring(address(0), DEFAULT_MAX, owner);
    }

    function test_Constructor_RejectsMaxBelowFloor() public {
        vm.expectRevert(
            abi.encodeWithSelector(KasihCengkring.MaxBelowFloor.selector, MIN_FLOOR - 1, MIN_FLOOR)
        );
        new KasihCengkring(address(usdc), MIN_FLOOR - 1, owner);
    }

    function test_Constructor_AcceptsMaxEqFloor() public {
        KasihCengkring c = new KasihCengkring(address(usdc), MIN_FLOOR, owner);
        assertEq(c.maxDonation(), MIN_FLOOR);
    }

    function test_Constructor_RejectsNonContractUSDC() public {
        vm.expectRevert(KasihCengkring.InvalidToken.selector);
        new KasihCengkring(makeAddr("notAToken"), DEFAULT_MAX, owner);
    }

    function test_Constructor_RejectsWrongDecimals() public {
        MockERC20 eighteen = new MockERC20("Wrong", "WRONG", 18);
        vm.expectRevert(
            abi.encodeWithSelector(KasihCengkring.InvalidTokenDecimals.selector, uint8(18))
        );
        new KasihCengkring(address(eighteen), DEFAULT_MAX, owner);
    }

    function test_Constructor_RejectsZeroDecimals() public {
        MockERC20 zeroDecimals = new MockERC20("Zero", "ZERO", 0);
        vm.expectRevert(
            abi.encodeWithSelector(KasihCengkring.InvalidTokenDecimals.selector, uint8(0))
        );
        new KasihCengkring(address(zeroDecimals), DEFAULT_MAX, owner);
    }

    // =========================================================================
    //  2 · Registration — happy path & events
    // =========================================================================

    function test_Register_HappyPath() public {
        bytes32 expectedHash = keccak256(bytes("alice"));

        vm.expectEmit(true, true, false, true, address(board));
        emit KasihCengkring.CreatorRegistered(expectedHash, "alice", creator1, payout1);

        vm.prank(creator1);
        board.register("alice", payout1, CREATOR_MIN);

        // Verify getCreator
        (address pa, uint256 minD, bool reg) = board.getCreator("alice");
        assertEq(pa,   payout1);
        assertEq(minD, CREATOR_MIN);
        assertTrue(reg);

        // walletToUsernameHash set
        assertEq(board.walletToUsernameHash(creator1), expectedHash);
    }

    function test_Register_ExactlyMinUsername3Chars() public {
        vm.prank(creator1);
        board.register("abc", payout1, CREATOR_MIN); // 3 chars — boundary success
        (, , bool reg) = board.getCreator("abc");
        assertTrue(reg);
    }

    function test_Register_ExactlyMaxUsername20Chars() public {
        vm.prank(creator1);
        board.register("abcdefghij0123456789", payout1, CREATOR_MIN); // 20 chars
        (, , bool reg) = board.getCreator("abcdefghij0123456789");
        assertTrue(reg);
    }

    function test_Register_MinDonationEqFloor() public {
        vm.prank(creator1);
        board.register("alice", payout1, MIN_FLOOR);
        (, uint256 minD,) = board.getCreator("alice");
        assertEq(minD, MIN_FLOOR);
    }

    // =========================================================================
    //  3 · Registration — username validation failures
    // =========================================================================

    function test_Register_Revert_UsernameTooShort() public {
        vm.prank(creator1);
        vm.expectRevert(KasihCengkring.UsernameInvalid.selector);
        board.register("ab", payout1, CREATOR_MIN); // 2 chars
    }

    function test_Register_Revert_UsernameEmpty() public {
        vm.prank(creator1);
        vm.expectRevert(KasihCengkring.UsernameInvalid.selector);
        board.register("", payout1, CREATOR_MIN);
    }

    function test_Register_Revert_UsernameTooLong() public {
        vm.prank(creator1);
        vm.expectRevert(KasihCengkring.UsernameInvalid.selector);
        board.register("abcdefghij01234567890", payout1, CREATOR_MIN); // 21 chars
    }

    function test_Register_Revert_UsernameWithUppercase() public {
        vm.prank(creator1);
        vm.expectRevert(KasihCengkring.UsernameInvalid.selector);
        board.register("Alice", payout1, CREATOR_MIN);
    }

    function test_Register_Revert_UsernameAllUppercase() public {
        vm.prank(creator1);
        vm.expectRevert(KasihCengkring.UsernameInvalid.selector);
        board.register("ALICE", payout1, CREATOR_MIN);
    }

    function test_Register_Revert_UsernameWithSpace() public {
        vm.prank(creator1);
        vm.expectRevert(KasihCengkring.UsernameInvalid.selector);
        board.register("ali ce", payout1, CREATOR_MIN);
    }

    function test_Register_Revert_UsernameWithHyphen() public {
        vm.prank(creator1);
        vm.expectRevert(KasihCengkring.UsernameInvalid.selector);
        board.register("ali-ce", payout1, CREATOR_MIN);
    }

    function test_Register_Revert_UsernameWithDot() public {
        vm.prank(creator1);
        vm.expectRevert(KasihCengkring.UsernameInvalid.selector);
        board.register("ali.ce", payout1, CREATOR_MIN);
    }

    function test_Register_Revert_UsernameWithAtSign() public {
        vm.prank(creator1);
        vm.expectRevert(KasihCengkring.UsernameInvalid.selector);
        board.register("ali@ce", payout1, CREATOR_MIN);
    }

    // =========================================================================
    //  4 · Registration — reserved usernames
    // =========================================================================

    function test_Register_Revert_ReservedAdmin() public {
        vm.prank(creator1);
        vm.expectRevert(KasihCengkring.UsernameReserved.selector);
        board.register("admin", payout1, CREATOR_MIN);
    }

    function test_Register_Revert_ReservedApp() public {
        vm.prank(creator1);
        vm.expectRevert(KasihCengkring.UsernameReserved.selector);
        board.register("app", payout1, CREATOR_MIN);
    }

    function test_Register_Revert_ReservedApi() public {
        vm.prank(creator1);
        vm.expectRevert(KasihCengkring.UsernameReserved.selector);
        board.register("api", payout1, CREATOR_MIN);
    }

    function test_Register_Revert_ReservedSupport() public {
        vm.prank(creator1);
        vm.expectRevert(KasihCengkring.UsernameReserved.selector);
        board.register("support", payout1, CREATOR_MIN);
    }

    function test_Register_Revert_ReservedHelp() public {
        vm.prank(creator1);
        vm.expectRevert(KasihCengkring.UsernameReserved.selector);
        board.register("help", payout1, CREATOR_MIN);
    }

    function test_Register_Revert_ReservedOwner() public {
        vm.prank(creator1);
        vm.expectRevert(KasihCengkring.UsernameReserved.selector);
        board.register("owner", payout1, CREATOR_MIN);
    }

    function test_Register_Revert_ReservedKasih() public {
        vm.prank(creator1);
        vm.expectRevert(KasihCengkring.UsernameReserved.selector);
        board.register("kasih", payout1, CREATOR_MIN);
    }

    function test_Register_Revert_ReservedDonate() public {
        vm.prank(creator1);
        vm.expectRevert(KasihCengkring.UsernameReserved.selector);
        board.register("donate", payout1, CREATOR_MIN);
    }

    function test_Register_Revert_ReservedWww() public {
        vm.prank(creator1);
        vm.expectRevert(KasihCengkring.UsernameReserved.selector);
        board.register("www", payout1, CREATOR_MIN);
    }

    // =========================================================================
    //  5 · Registration — duplicate / wallet conflicts
    // =========================================================================

    function test_Register_Revert_UsernameTaken() public {
        _registerAlice();
        vm.prank(creator2);
        vm.expectRevert(KasihCengkring.UsernameTaken.selector);
        board.register("alice", payout2, CREATOR_MIN);
    }

    function test_Register_Revert_AlreadyRegistered() public {
        _registerAlice();
        vm.prank(creator1);
        vm.expectRevert(KasihCengkring.AlreadyRegistered.selector);
        board.register("bob", payout1, CREATOR_MIN);
    }

    // =========================================================================
    //  6 · Registration — payout address validation
    // =========================================================================

    function test_Register_Revert_PayoutZero() public {
        vm.prank(creator1);
        vm.expectRevert(KasihCengkring.ZeroAddress.selector);
        board.register("alice", address(0), CREATOR_MIN);
    }

    function test_Register_Revert_PayoutIsUSDC() public {
        vm.prank(creator1);
        vm.expectRevert(KasihCengkring.InvalidPayoutAddress.selector);
        board.register("alice", address(usdc), CREATOR_MIN);
    }

    function test_Register_Revert_PayoutIsContract() public {
        vm.prank(creator1);
        vm.expectRevert(KasihCengkring.InvalidPayoutAddress.selector);
        board.register("alice", address(board), CREATOR_MIN);
    }

    // =========================================================================
    //  7 · Registration — minDonation floor
    // =========================================================================

    function test_Register_Revert_MinBelowFloor() public {
        vm.prank(creator1);
        vm.expectRevert(
            abi.encodeWithSelector(KasihCengkring.MinBelowFloor.selector, MIN_FLOOR - 1, MIN_FLOOR)
        );
        board.register("alice", payout1, MIN_FLOOR - 1);
    }

    function test_Register_Revert_MinIsZero() public {
        vm.prank(creator1);
        vm.expectRevert(
            abi.encodeWithSelector(KasihCengkring.MinBelowFloor.selector, 0, MIN_FLOOR)
        );
        board.register("alice", payout1, 0);
    }

    // =========================================================================
    //  8 · Registration — paused
    // =========================================================================

    function test_Register_Revert_WhenPaused() public {
        vm.prank(owner);
        board.pause();

        vm.prank(creator1);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        board.register("alice", payout1, CREATOR_MIN);
    }

    // =========================================================================
    //  9 · isReserved / isUsernameAvailable views
    // =========================================================================

    function test_IsReserved_TrueForAdmin() public view {
        assertTrue(board.isReserved("admin"));
    }

    function test_IsReserved_FalseForNormal() public view {
        assertFalse(board.isReserved("alice"));
    }

    function test_IsUsernameAvailable_TrueForFreshName() public view {
        assertTrue(board.isUsernameAvailable("alice"));
    }

    function test_IsUsernameAvailable_FalseForReserved() public view {
        assertFalse(board.isUsernameAvailable("admin"));
    }

    function test_IsUsernameAvailable_FalseAfterRegistration() public {
        _registerAlice();
        assertFalse(board.isUsernameAvailable("alice"));
    }

    function test_IsUsernameAvailable_FalseForTooShort() public view {
        assertFalse(board.isUsernameAvailable("ab"));
    }

    function test_IsUsernameAvailable_FalseForTooLong() public view {
        assertFalse(board.isUsernameAvailable("abcdefghij01234567890")); // 21 chars
    }

    function test_IsUsernameAvailable_FalseForUppercase() public view {
        assertFalse(board.isUsernameAvailable("Alice"));
    }

    // =========================================================================
    //  10 · Donate — happy path, balance accounting, events
    // =========================================================================

    function test_Donate_HappyPath_BalanceAccounting() public {
        _registerAlice();
        uint256 amount = 1_000_000; // 1 USDC
        _fundAndApprove(amount);

        uint256 donorBefore  = usdc.balanceOf(donor);
        uint256 payoutBefore = usdc.balanceOf(payout1);
        uint256 boardBefore  = usdc.balanceOf(address(board));

        vm.prank(donor);
        board.donate("alice", "Bob", "Hello!", amount);

        assertEq(usdc.balanceOf(donor),          donorBefore  - amount, "donor balance");
        assertEq(usdc.balanceOf(payout1),        payoutBefore + amount, "payout balance");
        assertEq(usdc.balanceOf(address(board)), boardBefore,           "contract stays 0");
        assertEq(usdc.balanceOf(address(board)), 0,                     "contract is zero");
    }

    function test_Donate_HappyPath_EmitsDonationReceived() public {
        _registerAlice();
        uint256 amount = 1_000_000;
        _fundAndApprove(amount);

        bytes32 usernameHash = keccak256(bytes("alice"));
        uint256 ts = block.timestamp;

        vm.expectEmit(true, true, true, true, address(board));
        emit KasihCengkring.DonationReceived(
            usernameHash,
            "alice",
            donor,
            payout1,
            "Bob",
            "Hello!",
            amount,
            ts
        );

        vm.prank(donor);
        board.donate("alice", "Bob", "Hello!", amount);
    }

    function test_Donate_ConsumesExactAllowance() public {
        _registerAlice();
        uint256 amount = CREATOR_MIN;
        _fundAndApprove(amount);

        assertEq(usdc.allowance(donor, address(board)), amount, "allowance before");
        vm.prank(donor);
        board.donate("alice", "Donor", "msg", amount);
        assertEq(usdc.allowance(donor, address(board)), 0, "no residual allowance");
    }

    function test_Donate_ExactlyEffectiveMin() public {
        _registerAlice();
        _fundAndApprove(CREATOR_MIN);

        vm.prank(donor);
        board.donate("alice", "Donor", "msg", CREATOR_MIN); // == effectiveMin
        assertEq(usdc.balanceOf(payout1), CREATOR_MIN);
    }

    function test_Donate_ExactlyMaxDonation() public {
        _registerAlice();
        _fundAndApprove(DEFAULT_MAX);

        vm.prank(donor);
        board.donate("alice", "Donor", "msg", DEFAULT_MAX);
        assertEq(usdc.balanceOf(payout1), DEFAULT_MAX);
    }

    function test_Donate_EmptyDonorNameAndMessage() public {
        _registerAlice();
        uint256 amount = CREATOR_MIN;
        _fundAndApprove(amount);

        vm.prank(donor);
        board.donate("alice", "", "", amount); // empty strings allowed
        assertEq(usdc.balanceOf(payout1), amount);
    }

    function test_Donate_DonorName40Chars() public {
        _registerAlice();
        string memory name40 = "abcdefghijklmnopqrstuvwxyzabcdefghijklmn"; // 40 chars
        assertEq(bytes(name40).length, 40);
        uint256 amount = CREATOR_MIN;
        _fundAndApprove(amount);

        vm.prank(donor);
        board.donate("alice", name40, "msg", amount);
        assertEq(usdc.balanceOf(payout1), amount);
    }

    function test_Donate_Message200Chars() public {
        _registerAlice();
        // Build exactly 200-char string (5 × 40 'a's = 200)
        string memory msg200 = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
                               "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
                               "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
                               "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
                               "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"; // 200 chars

        // Ensure it really is 200
        uint256 len = bytes(msg200).length;
        assertEq(len, 200);

        uint256 amount = CREATOR_MIN;
        _fundAndApprove(amount);

        vm.prank(donor);
        board.donate("alice", "Donor", msg200, amount);
        assertEq(usdc.balanceOf(payout1), amount);
    }

    // =========================================================================
    //  11 · Donate — revert paths
    // =========================================================================

    function test_Donate_Revert_AmountBelowMin() public {
        _registerAlice();
        uint256 badAmount = CREATOR_MIN - 1;
        _fundAndApprove(badAmount);

        vm.prank(donor);
        vm.expectRevert(
            abi.encodeWithSelector(KasihCengkring.AmountBelowMin.selector, badAmount, CREATOR_MIN)
        );
        board.donate("alice", "Donor", "msg", badAmount);
    }

    function test_Donate_Revert_AmountAboveMax() public {
        _registerAlice();
        uint256 badAmount = DEFAULT_MAX + 1;
        _fundAndApprove(badAmount);

        vm.prank(donor);
        vm.expectRevert(
            abi.encodeWithSelector(KasihCengkring.AmountAboveMax.selector, badAmount, DEFAULT_MAX)
        );
        board.donate("alice", "Donor", "msg", badAmount);
    }

    function test_Donate_Revert_NotRegistered() public {
        _fundAndApprove(CREATOR_MIN);

        vm.prank(donor);
        vm.expectRevert(KasihCengkring.NotRegistered.selector);
        board.donate("alice", "Donor", "msg", CREATOR_MIN); // "alice" never registered
    }

    function test_Donate_Revert_DonorNameTooLong() public {
        _registerAlice();
        string memory name41 = "abcdefghijklmnopqrstuvwxyzabcdefghijklmno"; // 41 chars
        assertEq(bytes(name41).length, 41);
        _fundAndApprove(CREATOR_MIN);

        vm.prank(donor);
        vm.expectRevert(KasihCengkring.DonorNameTooLong.selector);
        board.donate("alice", name41, "msg", CREATOR_MIN);
    }

    function test_Donate_Revert_MessageTooLong() public {
        _registerAlice();
        // Build 201-char string (5 × 40 + 1 = 201)
        string memory msg201 = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
                               "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
                               "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
                               "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
                               "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
                               "a"; // 201 chars
        assertEq(bytes(msg201).length, 201);
        _fundAndApprove(CREATOR_MIN);

        vm.prank(donor);
        vm.expectRevert(KasihCengkring.MessageTooLong.selector);
        board.donate("alice", "Donor", msg201, CREATOR_MIN);
    }

    function test_Donate_Revert_InvalidUsername() public {
        _fundAndApprove(CREATOR_MIN);

        vm.prank(donor);
        vm.expectRevert(KasihCengkring.UsernameInvalid.selector);
        board.donate("ALICE", "Donor", "msg", CREATOR_MIN);
    }

    function test_Donate_Revert_WhenPaused() public {
        _registerAlice();
        _fundAndApprove(CREATOR_MIN);

        vm.prank(owner);
        board.pause();

        vm.prank(donor);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        board.donate("alice", "Donor", "msg", CREATOR_MIN);
    }

    // =========================================================================
    //  12 · effectiveMin boundary — owner lowers maxDonation below creator min
    // =========================================================================

    function test_Donate_EffectiveMinIsMaxWhenMaxLoweredBelowCreatorMin() public {
        // creator registers with high minDonation
        uint256 highMin = 5_000_000; // 5 USDC
        vm.prank(creator1);
        board.register("alice", payout1, highMin);

        // Owner lowers global max below creator's min
        uint256 newMax = 1_000_000; // 1 USDC  (< highMin, >= FLOOR)
        vm.prank(owner);
        board.setMaxDonation(newMax);

        // effectiveMin = min(highMin, newMax) = newMax = 1_000_000
        // amount = newMax should succeed
        _fundAndApprove(newMax);
        vm.prank(donor);
        board.donate("alice", "Donor", "msg", newMax);
        assertEq(usdc.balanceOf(payout1), newMax);
    }

    function test_Donate_Revert_BelowEffectiveMinWhenMaxLowered() public {
        uint256 highMin = 5_000_000;
        vm.prank(creator1);
        board.register("alice", payout1, highMin);

        uint256 newMax = 1_000_000;
        vm.prank(owner);
        board.setMaxDonation(newMax);

        // effectiveMin == newMax; amount = newMax - 1 reverts
        uint256 badAmount = newMax - 1;
        _fundAndApprove(badAmount);
        vm.prank(donor);
        vm.expectRevert(
            abi.encodeWithSelector(KasihCengkring.AmountBelowMin.selector, badAmount, newMax)
        );
        board.donate("alice", "Donor", "msg", badAmount);
    }

    // =========================================================================
    //  13 · setMaxDonation
    // =========================================================================

    function test_SetMaxDonation_HappyPath_EmitsEvent() public {
        uint256 newMax = 20_000e6;

        vm.expectEmit(false, false, false, true, address(board));
        emit KasihCengkring.MaxDonationUpdated(DEFAULT_MAX, newMax);

        vm.prank(owner);
        board.setMaxDonation(newMax);
        assertEq(board.maxDonation(), newMax);
    }

    function test_SetMaxDonation_ExactlyFloor() public {
        vm.prank(owner);
        board.setMaxDonation(MIN_FLOOR);
        assertEq(board.maxDonation(), MIN_FLOOR);
    }

    function test_SetMaxDonation_Revert_BelowFloor() public {
        vm.prank(owner);
        vm.expectRevert(
            abi.encodeWithSelector(KasihCengkring.MaxBelowFloor.selector, MIN_FLOOR - 1, MIN_FLOOR)
        );
        board.setMaxDonation(MIN_FLOOR - 1);
    }

    function test_SetMaxDonation_Revert_NonOwner() public {
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger)
        );
        board.setMaxDonation(DEFAULT_MAX);
    }

    // =========================================================================
    //  14 · Pause / Unpause
    // =========================================================================

    function test_Pause_HappyPath() public {
        vm.prank(owner);
        board.pause();
        assertTrue(board.paused());
    }

    function test_Unpause_HappyPath() public {
        vm.prank(owner);
        board.pause();
        vm.prank(owner);
        board.unpause();
        assertFalse(board.paused());
    }

    function test_Pause_Revert_NonOwner() public {
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger)
        );
        board.pause();
    }

    function test_Unpause_Revert_NonOwner() public {
        vm.prank(owner);
        board.pause();

        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger)
        );
        board.unpause();
    }

    function test_Unpause_ReenablesRegisterAndDonate() public {
        vm.prank(owner);
        board.pause();
        vm.prank(owner);
        board.unpause();

        // register succeeds
        vm.prank(creator1);
        board.register("alice", payout1, CREATOR_MIN);

        // donate succeeds
        _fundAndApprove(CREATOR_MIN);
        vm.prank(donor);
        board.donate("alice", "Donor", "msg", CREATOR_MIN);
        assertEq(usdc.balanceOf(payout1), CREATOR_MIN);
    }

    function test_RenounceOwnership_Reverts() public {
        vm.prank(owner);
        vm.expectRevert(KasihCengkring.RenounceDisabled.selector);
        board.renounceOwnership();
    }

    function test_RenounceOwnership_StillRevertsWhenPaused() public {
        vm.prank(owner);
        board.pause();

        vm.prank(owner);
        vm.expectRevert(KasihCengkring.RenounceDisabled.selector);
        board.renounceOwnership();

        // Owner is intact, so the contract can still be unpaused.
        assertEq(board.owner(), owner);
        vm.prank(owner);
        board.unpause();
        assertFalse(board.paused());
    }

    // =========================================================================
    //  15 · updateMinDonation
    // =========================================================================

    function test_UpdateMinDonation_HappyPath_EmitsEvent() public {
        _registerAlice();
        uint256 newMin = 2_000_000;
        bytes32 uHash  = keccak256(bytes("alice"));

        vm.expectEmit(true, false, false, true, address(board));
        emit KasihCengkring.MinDonationUpdated(uHash, CREATOR_MIN, newMin);

        vm.prank(creator1);
        board.updateMinDonation(newMin);

        (, uint256 minD,) = board.getCreator("alice");
        assertEq(minD, newMin);
    }

    function test_UpdateMinDonation_ExactlyFloor() public {
        _registerAlice();
        vm.prank(creator1);
        board.updateMinDonation(MIN_FLOOR);
        (, uint256 minD,) = board.getCreator("alice");
        assertEq(minD, MIN_FLOOR);
    }

    function test_UpdateMinDonation_Revert_BelowFloor() public {
        _registerAlice();
        vm.prank(creator1);
        vm.expectRevert(
            abi.encodeWithSelector(KasihCengkring.MinBelowFloor.selector, MIN_FLOOR - 1, MIN_FLOOR)
        );
        board.updateMinDonation(MIN_FLOOR - 1);
    }

    function test_UpdateMinDonation_Revert_NotRegistered() public {
        vm.prank(stranger);
        vm.expectRevert(KasihCengkring.NotRegistered.selector);
        board.updateMinDonation(MIN_FLOOR);
    }

    function test_UpdateMinDonation_Revert_WhenPaused() public {
        _registerAlice();
        vm.prank(owner);
        board.pause();

        vm.prank(creator1);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        board.updateMinDonation(MIN_FLOOR);
    }

    // =========================================================================
    //  16 · updatePayoutAddress
    // =========================================================================

    function test_UpdatePayoutAddress_HappyPath_EmitsEvent() public {
        _registerAlice();
        bytes32 uHash  = keccak256(bytes("alice"));
        address newPay = makeAddr("newPayout");

        vm.expectEmit(true, true, true, false, address(board));
        emit KasihCengkring.PayoutAddressUpdated(uHash, payout1, newPay);

        vm.prank(creator1);
        board.updatePayoutAddress(newPay);

        (address pa,,) = board.getCreator("alice");
        assertEq(pa, newPay);
    }

    function test_UpdatePayoutAddress_WorksWhilePaused() public {
        _registerAlice();
        vm.prank(owner);
        board.pause();

        address newPay = makeAddr("newPayoutPaused");
        vm.prank(creator1); // NOT reverted — pause does not block this
        board.updatePayoutAddress(newPay);

        (address pa,,) = board.getCreator("alice");
        assertEq(pa, newPay);
    }

    function test_UpdatePayoutAddress_Revert_ZeroAddress() public {
        _registerAlice();
        vm.prank(creator1);
        vm.expectRevert(KasihCengkring.ZeroAddress.selector);
        board.updatePayoutAddress(address(0));
    }

    function test_UpdatePayoutAddress_Revert_IsUSDC() public {
        _registerAlice();
        vm.prank(creator1);
        vm.expectRevert(KasihCengkring.InvalidPayoutAddress.selector);
        board.updatePayoutAddress(address(usdc));
    }

    function test_UpdatePayoutAddress_Revert_IsContract() public {
        _registerAlice();
        vm.prank(creator1);
        vm.expectRevert(KasihCengkring.InvalidPayoutAddress.selector);
        board.updatePayoutAddress(address(board));
    }

    function test_UpdatePayoutAddress_Revert_NotRegistered() public {
        vm.prank(stranger);
        vm.expectRevert(KasihCengkring.NotRegistered.selector);
        board.updatePayoutAddress(makeAddr("any"));
    }

    function test_UpdatePayoutAddress_DonationsGoToNewAddress() public {
        _registerAlice();
        address newPay = makeAddr("newPayout");
        vm.prank(creator1);
        board.updatePayoutAddress(newPay);

        uint256 amount = CREATOR_MIN;
        _fundAndApprove(amount);

        vm.prank(donor);
        board.donate("alice", "Donor", "msg", amount);

        assertEq(usdc.balanceOf(payout1), 0,      "old payout should be 0");
        assertEq(usdc.balanceOf(newPay),  amount,  "new payout receives funds");
    }

    // =========================================================================
    //  17 · Ownable2Step — two-step ownership transfer
    // =========================================================================

    function test_Ownable2Step_TransferDoesNotChangeOwner() public {
        address newOwner = makeAddr("newOwner");

        vm.prank(owner);
        board.transferOwnership(newOwner);

        // Owner must still be old owner until new owner accepts
        assertEq(board.owner(), owner);
        assertEq(board.pendingOwner(), newOwner);
    }

    function test_Ownable2Step_NewOwnerMustAccept() public {
        address newOwner = makeAddr("newOwner");

        vm.prank(owner);
        board.transferOwnership(newOwner);

        vm.prank(newOwner);
        board.acceptOwnership();

        assertEq(board.owner(), newOwner);
    }

    function test_Ownable2Step_Stranger_CannotAccept() public {
        address newOwner = makeAddr("newOwner");
        vm.prank(owner);
        board.transferOwnership(newOwner);

        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger)
        );
        board.acceptOwnership();
    }

    // =========================================================================
    //  18 · getCreatorByHash and getUsernameHash views
    // =========================================================================

    function test_GetCreatorByHash() public {
        _registerAlice();
        bytes32 uHash = keccak256(bytes("alice"));
        (address pa, uint256 minD, bool reg) = board.getCreatorByHash(uHash);
        assertEq(pa,   payout1);
        assertEq(minD, CREATOR_MIN);
        assertTrue(reg);
    }

    function test_GetUsernameHash() public {
        _registerAlice();
        bytes32 expected = keccak256(bytes("alice"));
        assertEq(board.getUsernameHash(creator1), expected);
    }

    function test_GetUsernameHash_UnregisteredReturnsZero() public view {
        assertEq(board.getUsernameHash(stranger), bytes32(0));
    }

    function test_GetUsernameByHash_Registered() public {
        _registerAlice();
        assertEq(board.getUsernameByHash(keccak256(bytes("alice"))), "alice");
    }

    function test_GetUsernameByHash_UnknownReturnsEmpty() public view {
        assertEq(board.getUsernameByHash(keccak256(bytes("nobody"))), "");
    }

    function test_TryGetCreator_Registered() public {
        _registerAlice();
        (bool valid, address pa, uint256 minD, bool reg) = board.tryGetCreator("alice");
        assertTrue(valid);
        assertEq(pa, payout1);
        assertEq(minD, CREATOR_MIN);
        assertTrue(reg);
    }

    function test_TryGetCreator_ValidButUnregistered() public view {
        (bool valid, address pa, uint256 minD, bool reg) = board.tryGetCreator("bob");
        assertTrue(valid);
        assertEq(pa, address(0));
        assertEq(minD, 0);
        assertFalse(reg);
    }

    function test_TryGetCreator_InvalidDoesNotRevert() public view {
        (bool valid, address pa, uint256 minD, bool reg) = board.tryGetCreator("ALICE");
        assertFalse(valid);
        assertEq(pa, address(0));
        assertEq(minD, 0);
        assertFalse(reg);
    }

    // =========================================================================
    //  19 · Reentrancy guard
    // =========================================================================

    function test_ReentrancyGuard_DonateBlocksReentrantDonate() public {
        _registerAlice();

        // Build the re-entrant calldata (donate calls donate during transferFrom)
        bytes memory reentrantCall = abi.encodeWithSelector(
            KasihCengkring.donate.selector,
            "alice",
            "attacker",
            "reentrant",
            CREATOR_MIN
        );

        // Arm the mock so transferFrom fires the reentrant call
        usdc.armAttack(address(board), reentrantCall);

        // The reentrant call originates from the token contract, so give the token a
        // balance and an allowance. This makes the inner donation succeed if the guard
        // were absent — otherwise the test would pass for unrelated reasons.
        usdc.mint(address(usdc), CREATOR_MIN);
        vm.prank(address(usdc));
        usdc.approve(address(board), CREATOR_MIN);

        // Fund donor for the outer call
        _fundAndApprove(CREATOR_MIN);

        vm.prank(donor);
        board.donate("alice", "attacker", "first", CREATOR_MIN);

        // The guard must have reverted the inner donation, so only the outer one lands.
        assertFalse(usdc.attackSucceeded(), "inner donate should revert under the guard");
        assertEq(usdc.balanceOf(payout1), CREATOR_MIN, "exactly one donation should land");
        assertEq(usdc.balanceOf(address(board)), 0, "contract stays non-custodial");
    }

    // =========================================================================
    //  20 · Fuzz test — donate succeeds iff amount is in [effectiveMin, maxDon]
    // =========================================================================

    function testFuzz_donateSucceedsIffInRange(
        uint256 amount,
        uint256 maxDon,
        uint256 creatorMin
    ) public {
        // ── constrain params ────────────────────────────────────────────────
        maxDon     = bound(maxDon,     MIN_FLOOR, type(uint128).max);
        creatorMin = bound(creatorMin, MIN_FLOOR, type(uint128).max);

        // ── deploy a fresh contract with fuzz maxDon ─────────────────────────
        KasihCengkring c = new KasihCengkring(address(usdc), maxDon, owner);

        // ── register creator ─────────────────────────────────────────────────
        vm.prank(creator1);
        c.register("fuzzcreator", payout1, creatorMin);

        // ── compute effectiveMin ──────────────────────────────────────────────
        uint256 effectiveMin = creatorMin < maxDon ? creatorMin : maxDon;

        // ── bound amount to a reasonable range around the effective range ─────
        amount = bound(amount, 0, maxDon + 100); // include just above max

        // ── fund donor ────────────────────────────────────────────────────────
        usdc.mint(donor, amount + 1); // +1 so balance never underflows
        vm.prank(donor);
        usdc.approve(address(c), type(uint256).max);

        // ── act & assert ──────────────────────────────────────────────────────
        if (amount >= effectiveMin && amount <= maxDon) {
            vm.prank(donor);
            c.donate("fuzzcreator", "D", "m", amount);
            assertEq(usdc.balanceOf(payout1), amount, "payout should receive amount");
            // Reset payout balance for reuse (drain it back to donor to keep state clean)
            // We use the mock's transfer to return funds so next run is clean
            vm.prank(payout1);
            usdc.transfer(donor, amount);
        } else if (amount < effectiveMin) {
            vm.prank(donor);
            vm.expectRevert(
                abi.encodeWithSelector(KasihCengkring.AmountBelowMin.selector, amount, effectiveMin)
            );
            c.donate("fuzzcreator", "D", "m", amount);
        } else {
            // amount > maxDon
            vm.prank(donor);
            vm.expectRevert(
                abi.encodeWithSelector(KasihCengkring.AmountAboveMax.selector, amount, maxDon)
            );
            c.donate("fuzzcreator", "D", "m", amount);
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Handler for invariant tests
// ─────────────────────────────────────────────────────────────────────────────

contract KasihCengkringHandler is Test {
    KasihCengkring internal board;
    MockERC20      internal usdc;
    address        internal owner;

    address internal creator = address(0x1001);
    address internal payout  = address(0x1002);
    address internal donor   = address(0x1003);

    bool internal creatorRegistered;
    bool internal paused;

    uint256 constant MIN_FLOOR   = 100_000;
    uint256 constant CREATOR_MIN = 500_000;

    constructor(KasihCengkring _board, MockERC20 _usdc, address _owner) {
        board = _board;
        usdc  = _usdc;
        owner = _owner;
        vm.label(creator, "handler_creator");
        vm.label(payout,  "handler_payout");
        vm.label(donor,   "handler_donor");
    }

    // ── actions ──────────────────────────────────────────────────────────────

    function register() external {
        if (creatorRegistered) return;
        if (paused) return;
        vm.prank(creator);
        try board.register("handler", payout, CREATOR_MIN) {
            creatorRegistered = true;
        } catch {}
    }

    function donate(uint256 amount) external {
        if (!creatorRegistered) return;
        if (paused) return;

        uint256 maxDon = board.maxDonation();
        (, uint256 creatorMin,) = board.getCreator("handler");
        uint256 effectiveMin = creatorMin < maxDon ? creatorMin : maxDon;

        amount = bound(amount, effectiveMin, maxDon);

        usdc.mint(donor, amount);
        vm.prank(donor);
        usdc.approve(address(board), amount);

        vm.prank(donor);
        try board.donate("handler", "Donor", "msg", amount) {} catch {}
    }

    function updatePayoutAddress(address newPayout) external {
        if (!creatorRegistered) return;
        // Skip invalid addresses
        if (newPayout == address(0)) return;
        if (newPayout == address(usdc)) return;
        if (newPayout == address(board)) return;

        vm.prank(creator);
        try board.updatePayoutAddress(newPayout) {
            payout = newPayout;
        } catch {}
    }

    function updateMinDonation(uint256 newMin) external {
        if (!creatorRegistered) return;
        if (paused) return;
        newMin = bound(newMin, MIN_FLOOR, type(uint128).max);
        vm.prank(creator);
        try board.updateMinDonation(newMin) {} catch {}
    }

    function setMaxDonation(uint256 newMax) external {
        newMax = bound(newMax, MIN_FLOOR, type(uint128).max);
        vm.prank(owner);
        try board.setMaxDonation(newMax) {} catch {}
    }

    function doPause() external {
        if (paused) return;
        vm.prank(owner);
        try board.pause() {
            paused = true;
        } catch {}
    }

    function doUnpause() external {
        if (!paused) return;
        vm.prank(owner);
        try board.unpause() {
            paused = false;
        } catch {}
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Invariant test contract
// ─────────────────────────────────────────────────────────────────────────────

contract KasihCengkringInvariantTest is Test {
    KasihCengkring         internal board;
    MockERC20              internal usdc;
    KasihCengkringHandler  internal handler;

    address internal owner = makeAddr("inv_owner");

    function setUp() public {
        usdc    = new MockERC20("Mock USDC", "mUSDC", 6);

        vm.prank(owner);
        board   = new KasihCengkring(address(usdc), 10_000e6, owner);
        handler = new KasihCengkringHandler(board, usdc, owner);

        // Only let the fuzzer call through the handler
        targetContract(address(handler));
    }

    /// @notice The contract must NEVER accumulate USDC.
    function invariant_ContractBalanceAlwaysZero() public view {
        assertEq(
            usdc.balanceOf(address(board)),
            0,
            "KasihCengkring must never hold USDC"
        );
    }

    /// @notice maxDonation must always be >= MIN_DONATION_FLOOR.
    function invariant_MaxDonationAboveFloor() public view {
        assertGe(board.maxDonation(), board.MIN_DONATION_FLOOR(), "maxDonation must be >= floor");
    }

    /// @notice A registered creator always has a valid payout address and min >= floor.
    function invariant_RegisteredCreatorStateIsValid() public view {
        (address pa, uint256 minD, bool reg) = board.getCreatorByHash(keccak256(bytes("handler")));
        if (!reg) return;

        assertTrue(pa != address(0), "payout must be non-zero");
        assertTrue(pa != address(usdc), "payout must not be the token");
        assertTrue(pa != address(board), "payout must not be the contract");
        assertGe(minD, board.MIN_DONATION_FLOOR(), "creator min must be >= floor");
    }

    /// @notice Paused state must always be a valid boolean (no corruption).
    function invariant_PausedStateConsistent() public view {
        // Just read paused() — if it panics, forge will catch it.
        board.paused();
    }
}
