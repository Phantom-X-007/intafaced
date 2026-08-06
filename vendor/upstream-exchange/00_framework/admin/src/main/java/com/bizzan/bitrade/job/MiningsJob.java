package com.bizzan.bitrade.job;

import java.math.BigDecimal;
import java.util.Date;
import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import com.bizzan.bitrade.constant.TransactionType;
import com.bizzan.bitrade.entity.Member;
import com.bizzan.bitrade.entity.MemberTransaction;
import com.bizzan.bitrade.entity.MemberWallet;
import com.bizzan.bitrade.entity.MiningOrder;
import com.bizzan.bitrade.entity.MiningOrderDetail;
import com.bizzan.bitrade.service.MemberService;
import com.bizzan.bitrade.service.MemberTransactionService;
import com.bizzan.bitrade.service.MemberWalletService;
import com.bizzan.bitrade.service.MiningOrderDetailService;
import com.bizzan.bitrade.service.MiningOrderService;
import com.bizzan.bitrade.util.DateUtil;
import com.bizzan.bitrade.vendor.provider.SMSProvider;

import lombok.extern.slf4j.Slf4j;

@Component
@Slf4j
public class MiningsJob {
	
	@Autowired
    private SMSProvider smsProvider;

	@Autowired
	private MiningOrderDetailService miningOrderDetailService;
	
	@Autowired
	private MiningOrderService miningOrderService;

	@Autowired
	private MemberWalletService memberWalletService;
	
	@Autowired
	private MemberTransactionService memberTransactionService;
	
	@Autowired
	private MemberService memberService;
	
	/**
	 * 每天晚上10点30发放矿工收益
	 *
	 * DISABLED 2026-07-29 — dual-book residual. This job credits member_wallet
	 * outside the TypeScript ledger. Shell is UI only; books live in svc-ledger.
	 */
	@Scheduled(cron = "0 30 22 * * *")
	public void minings() {
		throw new IllegalStateException(
				"MiningsJob is disabled: Java shell must not mint balances (INTAFACED dual-book residual)");
	}
}
