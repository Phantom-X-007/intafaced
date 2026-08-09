import { randomUUID } from 'node:crypto';
import type { Sql } from 'postgres';
import { formatAmount, parseAmount, type Amount } from '@intafaced/ledger-client';
import { BankError } from '../errors.js';
import type { SpaceService } from '../spaces/space-service.js';
import type { TransferService } from '../transfers/transfer-service.js';
import { withMoneySpan } from '../tracing.js';

/**
 * BUSINESS BANKING — honest partial (§31:811 / bank.business).
 *
 * Corporate account + multi-user roles + maker/checker for over-threshold
 * transfers. Value moves only via TransferService (bankTransfer recipe).
 *
 * Residual / §13 (not invent-risk here): KYB Lane B, expense cards, invoicing
 * (pay.gateway), multi-recipient payroll atomicity, dedicated org principal.
 */

export type BusinessMemberRole = 'admin' | 'maker' | 'checker';
export type BusinessApprovalStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface BusinessAccount {
  id: string;
  name: string;
  assetId: string;
  spendThreshold: Amount;
  status: 'active' | 'closed';
  createdAt: Date;
}

export interface BusinessMember {
  accountId: string;
  userId: string;
  role: BusinessMemberRole;
}

export interface BusinessApproval {
  id: string;
  accountId: string;
  makerUserId: string;
  checkerUserId: string | null;
  fromSpaceId: string;
  toSpaceId: string;
  assetId: string;
  amount: Amount;
  status: BusinessApprovalStatus;
  transferId: string | null;
  ledgerTxId: string | null;
  rejectionCode: string | null;
  createdAt: Date;
  decidedAt: Date | null;
}

interface AccountRow {
  id: string;
  name: string;
  asset_id: string;
  spend_threshold: string;
  status: 'active' | 'closed';
  created_at: Date;
}

interface MemberRow {
  account_id: string;
  user_id: string;
  role: BusinessMemberRole;
}

interface ApprovalRow {
  id: string;
  account_id: string;
  maker_user_id: string;
  checker_user_id: string | null;
  from_space_id: string;
  to_space_id: string;
  asset_id: string;
  amount: string;
  status: BusinessApprovalStatus;
  transfer_id: string | null;
  ledger_tx_id: string | null;
  rejection_code: string | null;
  created_at: Date;
  decided_at: Date | null;
}

function toAccount(row: AccountRow): BusinessAccount {
  return {
    id: row.id,
    name: row.name,
    assetId: row.asset_id,
    spendThreshold: parseAmount(row.spend_threshold),
    status: row.status,
    createdAt: row.created_at,
  };
}

function toMember(row: MemberRow): BusinessMember {
  return { accountId: row.account_id, userId: row.user_id, role: row.role };
}

function toApproval(row: ApprovalRow): BusinessApproval {
  return {
    id: row.id,
    accountId: row.account_id,
    makerUserId: row.maker_user_id,
    checkerUserId: row.checker_user_id,
    fromSpaceId: row.from_space_id,
    toSpaceId: row.to_space_id,
    assetId: row.asset_id,
    amount: parseAmount(row.amount),
    status: row.status,
    transferId: row.transfer_id,
    ledgerTxId: row.ledger_tx_id,
    rejectionCode: row.rejection_code,
    createdAt: row.created_at,
    decidedAt: row.decided_at,
  };
}

export class BusinessService {
  constructor(
    private readonly sql: Sql,
    private readonly spaces: SpaceService,
    private readonly transfers: TransferService,
  ) {}

  async createAccount(input: { name: string; assetId: string; spendThreshold: Amount; creatorUserId: string }): Promise<BusinessAccount> {
    if (input.spendThreshold <= 0n) {
      throw new BankError('Business spend threshold must be positive', 'bank.business_invalid_threshold');
    }
    const name = input.name.trim();
    if (!name) throw new BankError('Business account needs a name', 'bank.business_invalid_name');

    const rows = await this.sql<AccountRow[]>`
      INSERT INTO bank.business_accounts (name, asset_id, spend_threshold, status)
      VALUES (${name}, ${input.assetId}, ${formatAmount(input.spendThreshold)}::numeric, 'active')
      RETURNING id, name, asset_id, spend_threshold, status, created_at
    `;
    const account = toAccount(rows[0]!);
    await this.sql`
      INSERT INTO bank.business_members (account_id, user_id, role)
      VALUES (${account.id}::uuid, ${input.creatorUserId}, 'admin')
    `;
    await this.spaces.ensurePrimary(input.creatorUserId, input.assetId);
    return account;
  }

  async addMember(input: { accountId: string; actorUserId: string; userId: string; role: BusinessMemberRole }): Promise<BusinessMember> {
    await this.assertRole(input.accountId, input.actorUserId, ['admin']);
    const rows = await this.sql<MemberRow[]>`
      INSERT INTO bank.business_members (account_id, user_id, role)
      VALUES (${input.accountId}::uuid, ${input.userId}, ${input.role})
      ON CONFLICT (account_id, user_id) DO UPDATE SET role = EXCLUDED.role
      RETURNING account_id, user_id, role
    `;
    return toMember(rows[0]!);
  }

  async listMembers(accountId: string, actorUserId: string): Promise<BusinessMember[]> {
    await this.assertMember(accountId, actorUserId);
    const rows = await this.sql<MemberRow[]>`
      SELECT account_id, user_id, role FROM bank.business_members
       WHERE account_id = ${accountId}
       ORDER BY created_at ASC
    `;
    return rows.map(toMember);
  }

  async accountsOf(userId: string): Promise<BusinessAccount[]> {
    const rows = await this.sql<AccountRow[]>`
      SELECT a.id, a.name, a.asset_id, a.spend_threshold, a.status, a.created_at
        FROM bank.business_accounts a
        JOIN bank.business_members m ON m.account_id = a.id
       WHERE m.user_id = ${userId} AND a.status = 'active'
       ORDER BY a.created_at DESC
    `;
    return rows.map(toAccount);
  }

  async proposeTransfer(input: {
    accountId: string;
    makerUserId: string;
    fromSpaceId: string;
    toSpaceId: string;
    amount: Amount;
  }): Promise<{ kind: 'posted'; transferId: string; ledgerTxId: string } | { kind: 'pending'; approval: BusinessApproval }> {
    if (input.amount <= 0n) throw new BankError('Transfer amount must be positive', 'bank.below_minimum');
    const account = await this.account(input.accountId);
    if (account.status !== 'active') throw new BankError('Business account is closed', 'bank.business_closed');
    await this.assertRole(input.accountId, input.makerUserId, ['admin', 'maker']);

    const from = await this.spaces.get(input.fromSpaceId);
    const to = await this.spaces.get(input.toSpaceId);
    if (from.assetId !== account.assetId || to.assetId !== account.assetId) {
      throw new BankError(`Business account ${account.assetId} cannot move ${from.assetId}→${to.assetId}`, 'bank.asset_mismatch');
    }
    if (from.userId !== input.makerUserId) {
      throw new BankError('Maker must own the debit space in this partial', 'bank.not_owner');
    }

    if (input.amount < account.spendThreshold) {
      const posted = await this.transfers.transfer({
        transferId: randomUUID(),
        fromSpaceId: input.fromSpaceId,
        toSpaceId: input.toSpaceId,
        amount: input.amount,
      });
      return { kind: 'posted', transferId: posted.transferId, ledgerTxId: posted.ledgerTxId };
    }

    const rows = await this.sql<ApprovalRow[]>`
      INSERT INTO bank.business_approvals
        (account_id, maker_user_id, from_space_id, to_space_id, asset_id, amount, status)
      VALUES (
        ${input.accountId}::uuid, ${input.makerUserId},
        ${input.fromSpaceId}::uuid, ${input.toSpaceId}::uuid,
        ${account.assetId}, ${formatAmount(input.amount)}::numeric, 'pending'
      )
      RETURNING id, account_id, maker_user_id, checker_user_id, from_space_id, to_space_id,
                asset_id, amount, status, transfer_id, ledger_tx_id, rejection_code,
                created_at, decided_at
    `;
    return { kind: 'pending', approval: toApproval(rows[0]!) };
  }

  async approve(input: { approvalId: string; checkerUserId: string }): Promise<{ transferId: string; ledgerTxId: string }> {
    return withMoneySpan('bank.business.approve', { operation: 'business-approve', userId: input.checkerUserId }, async () => {
      const approval = await this.approval(input.approvalId);
      if (approval.status !== 'pending') {
        throw new BankError(`Approval ${approval.id} is ${approval.status}`, 'bank.business_approval_inactive');
      }
      if (approval.makerUserId === input.checkerUserId) {
        throw new BankError('Maker cannot approve their own transfer', 'bank.business_self_approve');
      }
      await this.assertRole(approval.accountId, input.checkerUserId, ['admin', 'checker']);

      const posted = await this.transfers.transfer({
        transferId: approval.id,
        fromSpaceId: approval.fromSpaceId,
        toSpaceId: approval.toSpaceId,
        amount: approval.amount,
      });

      await this.sql`
          UPDATE bank.business_approvals
             SET status = 'approved',
                 checker_user_id = ${input.checkerUserId},
                 transfer_id = ${posted.transferId},
                 ledger_tx_id = ${posted.ledgerTxId},
                 decided_at = now()
           WHERE id = ${approval.id}::uuid AND status = 'pending'
        `;
      return { transferId: posted.transferId, ledgerTxId: posted.ledgerTxId };
    });
  }

  async reject(input: { approvalId: string; checkerUserId: string }): Promise<void> {
    const approval = await this.approval(input.approvalId);
    if (approval.status !== 'pending') {
      throw new BankError(`Approval ${approval.id} is ${approval.status}`, 'bank.business_approval_inactive');
    }
    if (approval.makerUserId === input.checkerUserId) {
      throw new BankError('Maker cannot reject their own transfer as checker', 'bank.business_self_approve');
    }
    await this.assertRole(approval.accountId, input.checkerUserId, ['admin', 'checker']);
    await this.sql`
      UPDATE bank.business_approvals
         SET status = 'rejected',
             checker_user_id = ${input.checkerUserId},
             rejection_code = 'bank.business_rejected',
             decided_at = now()
       WHERE id = ${approval.id}::uuid AND status = 'pending'
    `;
  }

  async listPending(accountId: string, actorUserId: string): Promise<BusinessApproval[]> {
    await this.assertMember(accountId, actorUserId);
    const rows = await this.sql<ApprovalRow[]>`
      SELECT id, account_id, maker_user_id, checker_user_id, from_space_id, to_space_id,
             asset_id, amount, status, transfer_id, ledger_tx_id, rejection_code,
             created_at, decided_at
        FROM bank.business_approvals
       WHERE account_id = ${accountId} AND status = 'pending'
       ORDER BY created_at ASC
    `;
    return rows.map(toApproval);
  }

  private async account(id: string): Promise<BusinessAccount> {
    const rows = await this.sql<AccountRow[]>`
      SELECT id, name, asset_id, spend_threshold, status, created_at
        FROM bank.business_accounts WHERE id = ${id}
    `;
    if (!rows[0]) throw new BankError(`Business account ${id} not found`, 'bank.business_not_found');
    return toAccount(rows[0]);
  }

  private async approval(id: string): Promise<BusinessApproval> {
    const rows = await this.sql<ApprovalRow[]>`
      SELECT id, account_id, maker_user_id, checker_user_id, from_space_id, to_space_id,
             asset_id, amount, status, transfer_id, ledger_tx_id, rejection_code,
             created_at, decided_at
        FROM bank.business_approvals WHERE id = ${id}
    `;
    if (!rows[0]) throw new BankError(`Approval ${id} not found`, 'bank.business_approval_not_found');
    return toApproval(rows[0]);
  }

  private async assertMember(accountId: string, userId: string): Promise<BusinessMember> {
    const rows = await this.sql<MemberRow[]>`
      SELECT account_id, user_id, role FROM bank.business_members
       WHERE account_id = ${accountId} AND user_id = ${userId}
    `;
    if (!rows[0]) throw new BankError('Not a member of this business account', 'bank.business_not_member');
    return toMember(rows[0]);
  }

  private async assertRole(accountId: string, userId: string, allowed: BusinessMemberRole[]): Promise<void> {
    const member = await this.assertMember(accountId, userId);
    if (!allowed.includes(member.role)) {
      throw new BankError(`Role ${member.role} cannot perform this action (need ${allowed.join('|')})`, 'bank.business_role_forbidden');
    }
  }
}
