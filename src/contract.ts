/**
 * KasihCengkring contract configuration.
 * Address is populated from contract-metadata after deploy.
 * Import the ABI from the Foundry artifact when available; until then use the inline ABI.
 */

export const KASIH_ADDRESS = (
  import.meta.env.VITE_KASIH_ADDRESS || '0x0000000000000000000000000000000000000000'
) as `0x${string}`;

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
] as const;
