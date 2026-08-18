package com.bizzan.bitrade.event;

import com.alibaba.fastjson.JSONObject;
import com.bizzan.bitrade.constant.PromotionLevel;
import com.bizzan.bitrade.constant.PromotionRewardType;
import com.bizzan.bitrade.constant.RewardRecordType;
import com.bizzan.bitrade.constant.TransactionType;
import com.bizzan.bitrade.dao.MemberDao;
import com.bizzan.bitrade.entity.*;
import com.bizzan.bitrade.service.*;
import com.bizzan.bitrade.util.BigDecimalUtils;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.util.Date;

/**
 * @author GS
 * @date 2018年01月09日
 */
@Service
@Slf4j
public class MemberEvent {
    @Autowired
    private KafkaTemplate<String, String> kafkaTemplate;
    @Autowired
    private MemberDao memberDao;
    @Autowired
    private MemberPromotionService memberPromotionService;
    @Autowired
    private RewardPromotionSettingService rewardPromotionSettingService;
    @Autowired
    private MemberWalletService memberWalletService;
    @Autowired
    private RewardRecordService rewardRecordService;
    @Autowired
    private MemberTransactionService memberTransactionService;
    /**
     * 如果值为1，推荐注册的推荐人必须被推荐人实名认证才能获得奖励
     */
    @Value("${commission.need.real-name:1}")
    private int needRealName;
    
    @Value("${commission.promotion.second-level:0}")
    private int promotionSecondLevel ;

    /**
     * 注册成功事件
     *
     * @param member 持久化对象
     */
    public void onRegisterSuccess(Member member, String promotionCode) throws InterruptedException {
        JSONObject json = new JSONObject();
        json.put("uid", member.getId());
        //发送给wallet项目consumer处理（）
        kafkaTemplate.send("member-register", json.toJSONString());
        //推广活动
        if (StringUtils.hasText(promotionCode)) {
            Member member1 = memberDao.findMemberByPromotionCode(promotionCode);
            if (member1 != null) {
                member.setInviterId(member1.getId());
                //如果不需要实名认证，直接发放奖励
                if (needRealName == 0) {
                    promotion(member1, member);
                }
            }
        }
    }

    /**
     * 登录成功事件
     *
     * @param member 持久化对象
     */
    public void onLoginSuccess(Member member, String ip) {

    }

    /**
     * Invite graph only. Upstream credited {@code member_wallet.to_released} here
     * (setToReleased) — that is a second-book mint with no ledger recipe, invisible
     * to vendor-java-money-scan (setBalance-only). Deleted per ADR 2026-08-04 Grade D
     * posture: reward mints without a recipe are removed, not short-circuited.
     */
    private void promotion(Member member1, Member member) {
        RewardPromotionSetting rewardPromotionSetting = rewardPromotionSettingService.findByType(PromotionRewardType.REGISTER);
        if (rewardPromotionSetting != null) {
            log.warn(
                    "dual-book: registration promotion wallet mint skipped (to_released) inviter={} invitee={}",
                    member1.getId(),
                    member.getId());
        }
        member1.setFirstLevel(member1.getFirstLevel() + 1);
        MemberPromotion one = new MemberPromotion();
        one.setInviterId(member1.getId());
        one.setInviteesId(member.getId());
        one.setLevel(PromotionLevel.ONE);
        memberPromotionService.save(one);
        
        if (member1.getInviterId() != null) {
            Member member2 = memberDao.findOne(member1.getInviterId());
            // 当A推荐B，B推荐C，如果C通过实名认证，则B和A都可以获得奖励
            promotionLevelTwo(rewardPromotionSetting, member2, member);
        }
    }

    private void promotionLevelTwo(RewardPromotionSetting rewardPromotionSetting, Member member2, Member member) {
        if (rewardPromotionSetting != null) {
            log.warn(
                    "dual-book: level-two promotion wallet mint skipped (to_released) inviter={} invitee={}",
                    member2.getId(),
                    member.getId());
        }
        member2.setSecondLevel(member2.getSecondLevel() + 1);
        MemberPromotion two = new MemberPromotion();
        two.setInviterId(member2.getId());
        two.setInviteesId(member.getId());
        two.setLevel(PromotionLevel.TWO);
        memberPromotionService.save(two);
        if (member2.getInviterId() != null) {
            Member member3 = memberDao.findOne(member2.getInviterId());
            member3.setThirdLevel(member3.getThirdLevel() + 1);
        }
    }

}
