/**
 * KasihCengkring contract configuration.
 */

import { KASIH_ADDRESS_CONTRACT, KASIH_DEPLOY_BLOCK_CONTRACT } from './network';

/** Contract address for the network selected by VITE_ARC_NETWORK. */
export const KASIH_ADDRESS: `0x${string}` = KASIH_ADDRESS_CONTRACT;

export const MIN_DONATION_FLOOR_FALLBACK = 500_000n;

/**
 * First block that contains this contract on the selected network. Log scans start here
 * instead of a rolling 50k window, which turns a ~28-call scan into one call.
 */
export const KASIH_DEPLOY_BLOCK: bigint = KASIH_DEPLOY_BLOCK_CONTRACT;

/** Max blocks per eth_getLogs call. Arc mainnet rejects ranges of 10 000 or more. */
export const LOG_CHUNK = 9_000n;

export const KASIH_ABI = [
  // Constants / views
  {
    type: 'function',
    name: 'MIN_DONATION_FLOOR',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'maxDonation',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'treasury',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
  {
    type: 'function',
    name: 'feeBps',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint16' }],
  },
  {
    type: 'function',
    name: 'flatFee',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'feeFor',
    stateMutability: 'view',
    inputs: [{ name: 'amount', type: 'uint256' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'MAX_FEE_BPS',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint16' }],
  },
  {
    type: 'function',
    name: 'MAX_FLAT_FEE',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'getCreator',
    stateMutability: 'view',
    inputs: [{ name: 'username', type: 'string' }],
    outputs: [
      { name: 'payoutAddress', type: 'address' },
      { name: 'minDonation', type: 'uint256' },
      { name: 'registered', type: 'bool' },
    ],
  },
  {
    type: 'function',
    name: 'tryGetCreator',
    stateMutability: 'view',
    inputs: [{ name: 'username', type: 'string' }],
    outputs: [
      { name: 'valid', type: 'bool' },
      { name: 'payoutAddress', type: 'address' },
      { name: 'minDonation', type: 'uint256' },
      { name: 'registered', type: 'bool' },
    ],
  },
  {
    type: 'function',
    name: 'getUsernameByHash',
    stateMutability: 'view',
    inputs: [{ name: 'usernameHash', type: 'bytes32' }],
    outputs: [{ type: 'string' }],
  },
  {
    type: 'function',
    name: 'isUsernameAvailable',
    stateMutability: 'view',
    inputs: [{ name: 'username', type: 'string' }],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'walletToUsernameHash',
    stateMutability: 'view',
    inputs: [{ name: 'wallet', type: 'address' }],
    outputs: [{ type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'paused',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'bool' }],
  },
  // Writes
  {
    type: 'function',
    name: 'register',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'username', type: 'string' },
      { name: 'payoutAddress', type: 'address' },
      { name: 'minDonation', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'donate',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'username', type: 'string' },
      { name: 'donorName', type: 'string' },
      { name: 'message', type: 'string' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'updatePayoutAddress',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'newPayoutAddress', type: 'address' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'updateMinDonation',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'newMin', type: 'uint256' }],
    outputs: [],
  },
  // Events
  {
    type: 'event',
    name: 'DonationReceived',
    inputs: [
      { name: 'usernameHash', type: 'bytes32', indexed: true },
      { name: 'username', type: 'string', indexed: false },
      { name: 'donor', type: 'address', indexed: true },
      { name: 'creator', type: 'address', indexed: true },
      { name: 'donorName', type: 'string', indexed: false },
      { name: 'message', type: 'string', indexed: false },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'fee', type: 'uint256', indexed: false },
      { name: 'timestamp', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'CreatorRegistered',
    inputs: [
      { name: 'usernameHash', type: 'bytes32', indexed: true },
      { name: 'username', type: 'string', indexed: false },
      { name: 'wallet', type: 'address', indexed: true },
      { name: 'payoutAddress', type: 'address', indexed: false },
    ],
  },
  // Errors (for decoding reverts)
  { type: 'error', name: 'AmountAboveMax', inputs: [{ name: 'amount', type: 'uint256' }, { name: 'maxDonation', type: 'uint256' }] },
  { type: 'error', name: 'AmountBelowMin', inputs: [{ name: 'amount', type: 'uint256' }, { name: 'minimum', type: 'uint256' }] },
  { type: 'error', name: 'UsernameInvalid', inputs: [] },
  { type: 'error', name: 'UsernameTaken', inputs: [] },
  { type: 'error', name: 'UsernameReserved', inputs: [] },
  { type: 'error', name: 'AlreadyRegistered', inputs: [] },
  { type: 'error', name: 'NotRegistered', inputs: [] },
  { type: 'error', name: 'InvalidToken', inputs: [] },
  { type: 'error', name: 'InvalidTokenDecimals', inputs: [{ name: 'decimals', type: 'uint8' }] },
  { type: 'error', name: 'InvalidTreasury', inputs: [] },
  { type: 'error', name: 'FeeAboveCap', inputs: [{ name: 'bps', type: 'uint16' }, { name: 'maxBps', type: 'uint16' }] },
  { type: 'error', name: 'FlatFeeAboveCap', inputs: [{ name: 'flat', type: 'uint256' }, { name: 'maxFlat', type: 'uint256' }] },
  { type: 'error', name: 'FeeExceedsAmount', inputs: [{ name: 'fee', type: 'uint256' }, { name: 'amount', type: 'uint256' }] },
  { type: 'error', name: 'RenounceDisabled', inputs: [] },
] as const;
