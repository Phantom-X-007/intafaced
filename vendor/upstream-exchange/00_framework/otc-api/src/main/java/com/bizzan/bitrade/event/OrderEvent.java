package com.bizzan.bitrade.event;

import com.bizzan.bitrade.dao.MemberDao;
import com.bizzan.bitrade.entity.*;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * @author GS
 * @date 2018年01月22日
 */
@Service
public class OrderEvent {
    @Autowired
    private MemberDao memberDao;
    // No wallet / reward-setting / rate services here on purpose — the promotion mints
    // that used them were deleted (INTAFACED dual-book). Re-injecting one is the first
    // step of re-opening a second book in a listener no HTTP door can guard.

    public void onOrderCompleted(Order order) {
        Member member = memberDao.findOne(order.getMemberId());
        member.setTransactions(member.getTransactions() + 1);
        Member member1 = memberDao.findOne(order.getCustomerId());
        member1.setTransactions(member1.getTransactions() + 1);
        // 推广返佣 — REMOVED, not disabled (INTAFACED dual-book).
        // The twin of the admin OrderEvent mint, same shape: two levels of OTC promotion
        // reward written onto a MANAGED wallet entity that Hibernate flushes at commit.
        // A Spring event listener, so no HTTP door covers it, and only a `= null` line
        // stood between it and a live second book. `ledger.*` is the only book and there
        // is no reward recipe to redirect the credit to, so it is deleted outright.
        // The transaction counters above are untouched.
        // Queue: rebuild both levels on a rewardPay recipe.
    }
}
