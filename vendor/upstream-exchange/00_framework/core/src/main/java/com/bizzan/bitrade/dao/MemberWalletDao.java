package com.bizzan.bitrade.dao;

import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import com.bizzan.bitrade.dao.base.BaseDao;
import com.bizzan.bitrade.entity.Coin;
import com.bizzan.bitrade.entity.MemberWallet;

import java.math.BigDecimal;
import java.util.Date;
import java.util.List;

public interface MemberWalletDao extends BaseDao<MemberWallet> {

    /**
     * Dual-book Option B (INTAFACED order-route 2026-07-31): no live second book.
     * Upstream mutated wallet.balance / frozenBalance. Shell is not the books —
     * TS ledger remains balance of record. Queries are no-ops (0 rows); service
     * layer throws. Scan: tooling/ci/vendor-java-money-scan.mjs.
     */
    @Transactional
    @Modifying
    @Query(value = "UPDATE member_wallet SET id = id WHERE 1 = 0", nativeQuery = true)
    int increaseBalance(@Param("walletId") long walletId, @Param("amount") BigDecimal amount);

    /** Dual-book no-op — see increaseBalance. */
    @Transactional
    @Modifying
    @Query(value = "UPDATE member_wallet SET id = id WHERE 1 = 0", nativeQuery = true)
    int decreaseBalance(@Param("walletId") long walletId, @Param("amount") BigDecimal amount);

    /** Dual-book no-op — see increaseBalance. */
    @Transactional
    @Modifying
    @Query(value = "UPDATE member_wallet SET id = id WHERE 1 = 0", nativeQuery = true)
    int freezeBalance(@Param("walletId") long walletId, @Param("amount") BigDecimal amount);

    /** Dual-book no-op — see increaseBalance. */
    @Transactional
    @Modifying
    @Query(value = "UPDATE member_wallet SET id = id WHERE 1 = 0", nativeQuery = true)
    int thawBalance(@Param("walletId") long walletId, @Param("amount") BigDecimal amount);

    /**
     * Dual-book no-op — decrease frozen without returning to available.
     */
    @Transactional
    @Modifying
    @Query(value = "UPDATE member_wallet SET id = id WHERE 1 = 0", nativeQuery = true)
    int decreaseFrozen(@Param("walletId") long walletId, @Param("amount") BigDecimal amount);


    MemberWallet findByCoinAndAddress(Coin coin, String address);

    MemberWallet findByCoinAndMemberId(Coin coin, Long memberId);

    List<MemberWallet> findAllByMemberId(Long memberId);

    List<MemberWallet> findAllByCoin(Coin coin);

    @Query(value="select sum(a.balance)+sum(a.frozen_balance) as allBalance from member_wallet a where a.coin_id = :coinName",nativeQuery = true)
    BigDecimal getWalletAllBalance(@Param("coinName")String coinName);

    
    //查询快照表BHB总数
    @Query(value="select sum(a.balance) as allBalance from member_wallet_:weekDay a where a.coin_id = :coinName AND balance >=10000 AND member_id NOT IN (66946,65859,13029,55)",nativeQuery = true)
    BigDecimal getWalletBalanceAmount(@Param("coinName")String coinName,@Param("weekDay")int weekDay);
    
    
    // INTAFACED residual (2026-07-29): mass-credit jobs disabled.
    // Upstream credited balance in bulk (+to_released / +500). Shell is not the books.
    // Queries are no-ops (0 rows) so a stray caller cannot mint; service also throws.
    @Transactional
    @Modifying
    @Query(value = "UPDATE member_wallet SET id = id WHERE 1 = 0", nativeQuery = true)
    int unfreezeLess();

    /**
     * 查询待释放BHB小于500的
     */
    @Query(value = "select * from member_wallet WHERE to_released<=500 AND to_released>0",nativeQuery = true)
    List<MemberWallet> findUnfreezeLTE();

    /**
     * 查询待释放BHB大于500的
     */
    @Query(value = "select * from member_wallet WHERE to_released>500",nativeQuery = true)
    List<MemberWallet> findUnfreezeGTE();

    // INTAFACED residual: snapshot table create from live wallets — permanently no-op.
    @Transactional
    @Modifying
    @Query(value = "UPDATE member_wallet SET id = id WHERE 1 = 0", nativeQuery = true)
    int createWeekTable(@Param("weekDay")int weekDay);


    //根据快照表查询每个人拥有的BHB
    @Query(value="select * from member_wallet_:weekDay a where a.coin_id = :coinName  AND balance>=10000 AND member_id NOT IN (66946,65859,13029,55)",nativeQuery = true)
    List<MemberWallet> geteveryBHB(@Param("coinName")String coinName,@Param("weekDay")int weekDay);

    @Query(value = "select * from member_wallet where  coin_id=:coinId and member_id=:memberId ",nativeQuery =true)
    MemberWallet getMemberWalletByCoinAndMemberId(@Param("coinId") String coinId, @Param("memberId") long memberId);


    /** Disabled dual-book — no-op (service throws first). */
    @Transactional
    @Modifying
    @Query(value="UPDATE member_wallet SET id = id WHERE 1 = 0 AND member_id=:teamId",nativeQuery = true)
    int updateTeamWallet(@Param("teamBalance")BigDecimal teamBalance,@Param("teamId")long teamId);

    /** Dual-book no-op — freeze-from-available path. */
    @Transactional
    @Modifying
    @Query(value = "UPDATE member_wallet SET id = id WHERE 1 = 0", nativeQuery = true)
    int updateMemberWalletByMemberIdAndCoinId(@Param("normalBalance")BigDecimal normalBalance,@Param("coinId")String coinId,@Param("memberId")long memberId);

    /** Dual-book no-op — thaw-into-available path. */
    @Transactional
    @Modifying
    @Query(value = "UPDATE member_wallet SET id = id WHERE 1 = 0", nativeQuery = true)
    int updateMemberWalletByMemberIdAndCoinId(@Param("allBalance")BigDecimal allBalance,@Param("forzenBalance")BigDecimal forzenBalance,@Param("coinId")String coinId,@Param("memberId")long memberId);

    
    /**
     * 根据用户Id和币种ID更新用户钱包
     * @param memberId
     * @param coinId
     * @param balance
     * @return
     */
    /** Disabled dual-book — no-op (service throws first). */
    @Transactional(rollbackFor = Exception.class)
    @Modifying
    @Query(value = "UPDATE member_wallet SET id = id WHERE 1 = 0 AND coin_id=:coinId AND member_id=:memberId",nativeQuery = true)
    int updateByMemberIdAndCoinId(@Param("memberId")long memberId,@Param("coinId")String coinId,@Param("balance")BigDecimal balance);

    /**
     * 增加用户BHB余额 — DISABLED dual-book; no-op (service throws first).
     */

    @Transactional(rollbackFor = Exception.class)
    @Modifying
    @Query(value = "UPDATE member_wallet SET id = id WHERE 1 = 0 AND member_id=:memberId",nativeQuery = true)
    int increaseBalanceForBHB(@Param("balance")BigDecimal mineAmount,@Param("memberId") Long memberId);

//    //初始化超级合伙人BHB的数量
//    @Modifying
//    @Transactional
//    @Query(value="update member_wallet  set balance = '20' where member_id = :memberId and coin_id = 'BHB' ",nativeQuery = true)
//    int initSuperPaterner(@Param("memberId") long memberId);

    /**
     * 币竞猜扣件用户余额
     * @param id
     * @param amount
     * @return
     */
    /** Dual-book no-op — contest/game debit. */
    @Transactional(rollbackFor = Exception.class)
    @Modifying
    @Query(value = "UPDATE member_wallet SET id = id WHERE 1 = 0", nativeQuery = true)
    int updateBalanceByIdAndAmount (@Param("id") long id,@Param("amount") double amount);

    /**
     * Dual-book no-op — increase frozen without debiting available.
     */
    @Transactional(rollbackFor = Exception.class)
    @Modifying
    @Query(value = "UPDATE member_wallet SET id = id WHERE 1 = 0", nativeQuery = true)
	int increaseFrozen(@Param("walletId") Long walletId, @Param("amount") BigDecimal amount);
}
