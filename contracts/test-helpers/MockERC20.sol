// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @dev Minimal ERC-20 mock for unit tests.
///      Supports mint, approve, transfer, transferFrom, balanceOf, allowance, decimals.
///      Also supports an optional "reentrant hook" so reentrancy tests can trigger a callback.
contract MockERC20 {
    string public name;
    string public symbol;
    uint8 public decimals;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    // Optional reentrancy attack hook — set before the triggering transfer.
    address public attackTarget;
    bytes public attackCalldata;
    bool public attackArmed;
    bool public attackSucceeded;
    bool private _inAttack;

    constructor(string memory _name, string memory _symbol, uint8 _decimals) {
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
    }

    function totalSupply() external view returns (uint256) {
        // Not strictly needed but some callers may expect it.
        return 0;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            require(allowed >= amount, "MockERC20: insufficient allowance");
            allowance[from][msg.sender] = allowed - amount;
        }
        _transfer(from, to, amount);

        // Fire reentrancy attack after the transfer if armed.
        if (attackArmed && !_inAttack) {
            _inAttack = true;
            // Record whether the reentrant call succeeded so tests can assert that the
            // guard blocked it, rather than relying on incidental side effects.
            // solhint-disable-next-line avoid-low-level-calls
            (bool ok,) = attackTarget.call(attackCalldata);
            attackSucceeded = ok;
            _inAttack = false;
        }

        return true;
    }

    function armAttack(address target, bytes calldata data) external {
        attackTarget = target;
        attackCalldata = data;
        attackArmed = true;
    }

    function disarmAttack() external {
        attackArmed = false;
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    function _transfer(address from, address to, uint256 amount) internal {
        require(balanceOf[from] >= amount, "MockERC20: insufficient balance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
    }
}
