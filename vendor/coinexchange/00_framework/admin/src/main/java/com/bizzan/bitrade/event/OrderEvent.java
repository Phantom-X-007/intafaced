package com.bizzan.bitrade.event;

import com.bizzan.bitrade.dao.MemberDao;
import com.bizzan.bitrade.entity.*;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * @author Shaoxianjun
 * @date 2019年01月22日
 */
@Service
public class OrderEvent {
    @Autowired
    private MemberDao memberDao;
    // No wallet / reward-setting services here on purpose — the promotion mints that
    // used them were deleted (INTAFACED dual-book). Re-injecting one is the first step
    // of re-opening a second book in a listener no HTTP door can guard.

    public void onOrderCompleted(Order order) {
        Member member = memberDao.findOne(order.getMemberId());
        member.setTransactions(member.getTransactions() + 1);
        Member member1 = memberDao.findOne(order.getCustomerId());
        member1.setTransactions(member1.getTransactions() + 1);
        // 推广返佣 — REMOVED, not disabled (INTAFACED dual-book).
        // Two levels of OTC promotion reward credited member_wallet on a MANAGED entity,
        // so Hibernate flushed it at commit with no UPDATE to grep for. This is a Spring
        // event listener: the HTTP 410 dual-book door cannot reach it, and the only thing
        // holding the mint off was a `= null` line. `ledger.*` is the only book and no
        // reward recipe exists to redirect the credit to, so it is deleted outright.
        // The transaction counters above — the part that is not money — are untouched.
        // Queue: rebuild both levels on a rewardPay recipe.
    }
}
