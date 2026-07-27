/**
 * The contract surface this service speaks to, hand-written from
 * `contracts/*.sol`.
 *
 * Hand-written rather than generated because there is no Solidity compiler in
 * this toolchain yet (§13 socket `socket.contract-toolchain`), and because the
 * ABI is small enough that a reviewer can diff it against the source by eye.
 *
 * Note what is absent, and stays absent: there is no function on either ABI
 * that this service could call to move a user's funds, because there is no such
 * function on either contract.
 */

export const SESSION_SPEC_COMPONENTS = [
  { name: 'key', type: 'address' },
  { name: 'validAfter', type: 'uint48' },
  { name: 'validUntil', type: 'uint48' },
  { name: 'spendLimitWei', type: 'uint128' },
  { name: 'targets', type: 'address[]' },
  { name: 'selectors', type: 'bytes4[]' },
] as const;

export const accountFactoryAbi = [
  {
    type: 'function',
    name: 'implementation',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
  {
    type: 'function',
    name: 'getAddress',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'userSalt', type: 'bytes32' },
    ],
    outputs: [{ type: 'address' }],
  },
  {
    type: 'function',
    name: 'isDeployed',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'userSalt', type: 'bytes32' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'createAccount',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'userSalt', type: 'bytes32' },
    ],
    outputs: [{ type: 'address' }],
  },
  {
    type: 'event',
    name: 'AccountCreated',
    inputs: [
      { name: 'account', type: 'address', indexed: true },
      { name: 'owner', type: 'address', indexed: true },
      { name: 'userSalt', type: 'bytes32', indexed: true },
    ],
  },
] as const;

export const smartAccountAbi = [
  { type: 'function', name: 'owner', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'entryPoint', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'sessionEpoch', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint64' }] },
  {
    type: 'function',
    name: 'getSession',
    stateMutability: 'view',
    inputs: [{ name: 'sessionKey', type: 'address' }],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'specHash', type: 'bytes32' },
          { name: 'validAfter', type: 'uint48' },
          { name: 'validUntil', type: 'uint48' },
          { name: 'spentWei', type: 'uint128' },
          { name: 'epoch', type: 'uint64' },
          { name: 'revoked', type: 'bool' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'isSessionLive',
    stateMutability: 'view',
    inputs: [{ name: 'sessionKey', type: 'address' }],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'grantSession',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'spec', type: 'tuple', components: SESSION_SPEC_COMPONENTS }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'revokeSession',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'sessionKey', type: 'address' }],
    outputs: [],
  },
  { type: 'function', name: 'bumpSessionEpoch', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  {
    type: 'function',
    name: 'executeWithSession',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spec', type: 'tuple', components: SESSION_SPEC_COMPONENTS },
      { name: 'target', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'data', type: 'bytes' },
    ],
    outputs: [{ type: 'bytes' }],
  },
  {
    type: 'event',
    name: 'SessionGranted',
    inputs: [
      { name: 'sessionKey', type: 'address', indexed: true },
      { name: 'specHash', type: 'bytes32', indexed: false },
      { name: 'validAfter', type: 'uint48', indexed: false },
      { name: 'validUntil', type: 'uint48', indexed: false },
      { name: 'spendLimitWei', type: 'uint128', indexed: false },
      { name: 'targets', type: 'address[]', indexed: false },
      { name: 'selectors', type: 'bytes4[]', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'SessionRevoked',
    inputs: [
      { name: 'sessionKey', type: 'address', indexed: true },
      { name: 'revokedBy', type: 'address', indexed: true },
    ],
  },
] as const;
