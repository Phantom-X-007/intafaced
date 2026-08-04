package com.bizzan.bitrade.service;

import com.bizzan.bitrade.constant.*;
import com.bizzan.bitrade.dao.MemberApplicationDao;
import com.bizzan.bitrade.dao.MemberDao;
import com.bizzan.bitrade.entity.*;
import com.bizzan.bitrade.es.ESUtils;
import com.bizzan.bitrade.pagination.PageResult;
import com.bizzan.bitrade.service.Base.BaseService;
import com.bizzan.bitrade.vendor.provider.SMSProvider;
import com.querydsl.core.types.Predicate;
import com.querydsl.jpa.impl.JPAQuery;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import static com.bizzan.bitrade.constant.AuditStatus.AUDIT_DEFEATED;
import static com.bizzan.bitrade.constant.AuditStatus.AUDIT_SUCCESS;
import static com.bizzan.bitrade.constant.RealNameStatus.NOT_CERTIFIED;
import static com.bizzan.bitrade.constant.RealNameStatus.VERIFIED;
import static com.bizzan.bitrade.entity.QMemberApplication.memberApplication;

import java.util.Date;
import java.util.List;

/**
 * @author GS
 * @description 会员审核单Service
 * @date 2017/12/26 15:10
 */
@Service
@Slf4j
public class MemberApplicationService extends BaseService {

    @Autowired
    private MemberApplicationDao memberApplicationDao;

    @Value("${commission.need.real-name:1}")
    private int needRealName ;
    
    @Value("${commission.promotion.second-level:0}")
    private int promotionSecondLevel ;

    @Autowired
    private MemberDao memberDao;

    // No MemberWalletService / RewardRecordService / RewardPromotionSettingService /
    // MemberTransactionService here on purpose: the reward mints that used them were
    // deleted (INTAFACED dual-book — `ledger.*` is the only book). Re-injecting a wallet
    // service into this class is the first step of re-opening a second book.

    @Autowired
    private MemberPromotionService memberPromotionService ;
    
	@Autowired
    private SMSProvider smsProvider;

    @Autowired
    private ESUtils esUtils;


    @Override
    public List<MemberApplication> findAll() {
        return memberApplicationDao.findAll();
    }

    public Page<MemberApplication> findAll(Predicate predicate, Pageable pageable) {
        return memberApplicationDao.findAll(predicate, pageable);
    }

    public MemberApplication findOne(Long id) {
        return memberApplicationDao.findOne(id);
    }

    public MemberApplication save(MemberApplication memberApplication) {
        return memberApplicationDao.save(memberApplication);
    }

    public List<MemberApplication> findLatelyReject(Member member) {
        return memberApplicationDao.findMemberApplicationByMemberAndAuditStatusOrderByIdDesc(member, AuditStatus.AUDIT_DEFEATED);
    }

    /**
     * 条件查询对象 pageNo pageSize 同时传时分页
     *
     * @param predicateList
     * @param pageNo
     * @param pageSize
     * @return
     */
    @Transactional(readOnly = true)
    public PageResult<MemberApplication> query(List<Predicate> predicateList, Integer pageNo, Integer pageSize) {
        List<MemberApplication> list;
        JPAQuery<MemberApplication> jpaQuery = queryFactory.selectFrom(memberApplication);
        if (predicateList != null) {
            jpaQuery.where(predicateList.toArray(new Predicate[predicateList.size()]));
        }
        jpaQuery.orderBy(memberApplication.createTime.desc());
        if (pageNo != null && pageSize != null) {
            list = jpaQuery.offset((pageNo - 1) * pageSize).limit(pageSize).fetch();
        } else {
            list = jpaQuery.fetch();
        }
        return new PageResult<>(list, jpaQuery.fetchCount());
    }

    /**
     * 审核通过
     *
     * @param application
     */
    @Transactional(rollbackFor = Exception.class)
    public void auditPass(MemberApplication application) {
        Member member = application.getMember();
        member.setMemberLevel(MemberLevelEnum.REALNAME);// 实名会员
        member.setRealName(application.getRealName());// 添加会员真实姓名
        member.setIdNumber(application.getIdCard());// 会员身份证号码
        member.setRealNameStatus(VERIFIED);// 会员状态修改已认证
        member.setApplicationTime(new Date());
        memberDao.save(member);
        application.setAuditStatus(AUDIT_SUCCESS);//审核成功
        // Dual-book: promotion/realname wallet mints disabled (INTAFACED).
        // KYC status updates above remain; balance credits must go through ledger.
        if (false && needRealName==1){
            if(member.getInviterId() != null) {
                Member member1 = memberDao.findOne(member.getInviterId());
                promotion(member1, member);
            }
        }
        // 实名奖励 — REMOVED, not disabled (INTAFACED dual-book).
        // The real-name reward credited member_wallet directly. `ledger.*` is the only
        // book, and no ledger recipe exists for this reward yet, so there was nothing to
        // redirect the write to. It is deleted rather than left behind a `= null` guard
        // that one line restores. The KYC workflow above is untouched.
        // Queue: rebuild on a rewardPay recipe when the reward product is specified.
        memberApplicationDao.save(application);
    }
    
    
    /**
     * 推广奖励
     * @param member1  邀请者（一级奖励）
     * @param member   被邀请者
     */
    private void promotion(Member member1, Member member) {
        // Dual-book: never mint promotion balances in Java shell (INTAFACED).
        // Inviter tree counters still update; money must go via ledger.
        member1.setFirstLevel(member1.getFirstLevel() + 1);
        MemberPromotion one = new MemberPromotion();
        one.setInviterId(member1.getId());
        one.setInviteesId(member.getId());
        one.setLevel(PromotionLevel.ONE);
        memberPromotionService.save(one);
        if (promotionSecondLevel == 1 && member1.getInviterId() != null) {
            Member member2 = memberDao.findOne(member1.getInviterId());
            // tree counter only — no wallet mint
            if (member2 != null) {
                member2.setSecondLevel(member2.getSecondLevel() + 1);
                memberDao.save(member2);
            }
        }
        // Everything that used to follow here was UNREACHABLE — it sat after an
        // unconditional `return;`, which JLS 14.21 makes a compile error, not a warning.
        // It was the level-one promotion mint plus a promotionLevelTwo() helper whose
        // whole body was likewise unreachable; both credited member_wallet directly.
        // Both are deleted: `ledger.*` is the only book and no reward recipe exists to
        // redirect them to. The inviter tree counters above are the surviving workflow.
        // Queue: rebuild both levels on a rewardPay recipe.
    }

    public long countAuditing(){
        return memberApplicationDao.countAllByAuditStatus(AuditStatus.AUDIT_ING);
    }

    /**
     * 审核不通过
     *
     * @param application
     */
    @Transactional
    public void auditNotPass(MemberApplication application) {
        Member member = application.getMember();
        member.setRealNameStatus(NOT_CERTIFIED);//会员实名状态未认证
        member.setMemberLevel(MemberLevelEnum.GENERAL);//实名会员
        member.setRealName(null);//重置会员名字
        member.setIdNumber(null);//重置会员身份证号
        member.setApplicationTime(null);//重置会员实名时间
        memberDao.save(member);
        application.setAuditStatus(AUDIT_DEFEATED);//审核失败
        memberApplicationDao.save(application);
    }

    /**
     * 根据身份证号 查询有多条记录
     * @param idCard
     * @return
     */
    public int queryByIdCard(String idCard) {
        return memberApplicationDao.queryByIdCard(idCard);
    }
}
