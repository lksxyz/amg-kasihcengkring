# KasihCengkring

A non-custodial creator donation platform on Arc. Supporters send USDC straight to a
creator's payout address; these are the words the product and the contract use for that
exchange.

## Language

### Money

**Donation**:
A single transfer of USDC from a Donor to a Creator's Payout Address, triggered by one
`donate()` call.
_Avoid_: Tip, payment, contribution

**Gross Donation**:
The amount the Donor approves and the amount the Donation is denominated in.
_Avoid_: Total, amount sent

**Net Donation**:
The amount that actually reaches the Creator's Payout Address, after the Platform Fee.
_Avoid_: Payout, proceeds

**Minimum Donation**:
The smallest Gross Donation a Creator will accept. It is enforced before the Platform Fee is
deducted, so a Donor never has to add the fee on top.
_Avoid_: Threshold, floor

**Platform Fee**:
The portion of a Gross Donation retained by the platform, split into a flat component and a
proportional component. It is borne entirely by the Creator — a Donor never pays more than
the Gross Donation.
_Avoid_: Commission, cut, service charge, revenue share

**Treasury**:
The address that receives Platform Fees. It is not the contract, and the contract never
holds a balance.
_Avoid_: Fee collector, platform wallet, escrow

### People

**Creator**:
A wallet that has claimed a Username and nominated a Payout Address to receive Donations.
_Avoid_: Fundraiser, artist, user, account

**Donor**:
A wallet that sends a Donation. A Donor needs no account, no registration, and no identity.
_Avoid_: Supporter, backer, customer

**Owner**:
The address that controls platform-level settings. The Owner has no access to Donations or
Payout Addresses.
_Avoid_: Admin, operator, maintainer

### Identity

**Username**:
A unique, permanent, non-transferable handle (`a-z 0-9 _`, 3–20 chars) that resolves to a
Creator. It cannot be renamed, sold, or deleted.
_Avoid_: Handle, alias, slug

**Payout Address**:
The address a Creator nominates to receive Net Donations. It is independent of the wallet
that owns the Username and may be changed at any time, including while paused.
_Avoid_: Destination, beneficiary, recipient
