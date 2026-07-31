package com.bizzan.bitrade.service;

import com.bizzan.bitrade.constant.WithdrawStatus;
import com.bizzan.bitrade.dao.LegalWalletWithdrawDao;
import com.bizzan.bitrade.entity.LegalWalletWithdraw;
import com.bizzan.bitrade.entity.MemberWallet;
import com.bizzan.bitrade.entity.QLegalWalletWithdraw;
import com.bizzan.bitrade.service.Base.TopBaseService;
import com.bizzan.bitrade.util.BigDecimalUtils;
import com.querydsl.core.types.dsl.BooleanExpression;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Date;


@Service
public class LegalWalletWithdrawService extends TopBaseService<LegalWalletWithdraw, LegalWalletWithdrawDao> {
    @Autowired
    private LegalWalletWithdrawDao legalWalletWithdrawDao;

    @Override
    @Autowired
    public void setDao(LegalWalletWithdrawDao legalWalletWithdrawDao) {
        super.setDao(super.dao = legalWalletWithdrawDao);
    }

    public LegalWalletWithdraw findOne(Long id) {
        return legalWalletWithdrawDao.findOne(id);
    }

    //审核通过
    public void pass(LegalWalletWithdraw legalWalletWithdraw) {
        legalWalletWithdraw.setStatus(WithdrawStatus.WAITING);
        legalWalletWithdraw.setDealTime(new Date());//处理时间
        legalWalletWithdrawDao.save(legalWalletWithdraw);
    }

    public LegalWalletWithdraw findDetailWeb(Long id, Long memberId) {
        BooleanExpression and = QLegalWalletWithdraw.legalWalletWithdraw.id.eq(id)
                .and(QLegalWalletWithdraw.legalWalletWithdraw.member.id.eq(memberId));
        return legalWalletWithdrawDao.findOne(and);
    }

    //提现
    @Transactional(rollbackFor = Exception.class)
    public void withdraw(MemberWallet wallet, LegalWalletWithdraw legalWalletWithdraw) {
        throw new IllegalStateException(
                "legal wallet withdraw is disabled: Java shell must not freeze balances (INTAFACED dual-book)");
    }

    //提现不通过
    @Transactional(rollbackFor = Exception.class)
    public void noPass(MemberWallet wallet, LegalWalletWithdraw withdraw) {
        throw new IllegalStateException(
                "legal wallet withdraw noPass is disabled: Java shell must not thaw balances (INTAFACED dual-book)");
    }

    //打款
    @Transactional(rollbackFor = Exception.class)
    public void remit(String paymentInstrument, LegalWalletWithdraw withdraw, MemberWallet wallet) {
        throw new IllegalStateException(
                "legal wallet remit is disabled: Java shell must not debit frozen balances (INTAFACED dual-book)");
    }
}
