package com.intafaced.controller;

import static com.intafaced.constant.SysConstant.SESSION_MEMBER;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.util.Assert;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.SessionAttribute;

import com.intafaced.constant.BooleanEnum;
import com.intafaced.constant.CommonStatus;
import com.intafaced.controller.BaseController;
import com.intafaced.entity.Coin;
import com.intafaced.entity.LoginInfo;
import com.intafaced.entity.Member;
import com.intafaced.entity.MemberWallet;
import com.intafaced.entity.Sign;
import com.intafaced.entity.transform.AuthMember;
import com.intafaced.service.MemberService;
import com.intafaced.service.MemberWalletService;
import com.intafaced.service.SignService;
import com.intafaced.util.MessageResult;

/**
 * @author GS
 * @Description:
 * @date 2018/5/49:30
 */
@RestController
@RequestMapping("member")
public class MemberController extends BaseController {
    @Autowired
    private MemberService memberService;
    @Autowired
    private SignService signService;
    @Autowired
    private MemberWalletService walletService;

    @Value("${person.promote.prefix:}")
    private String promotePrefix;
    
    //签到
    @PostMapping("sign-in")
    public MessageResult signIn(@SessionAttribute(SESSION_MEMBER) AuthMember user) {
        //校验 签到活动 币种 会员 会员钱包
        Assert.notNull(user, "The login timeout!");

        Sign sign = signService.fetchUnderway();
        Assert.notNull(sign, "The check-in activity is over!");

        Coin coin = sign.getCoin();
        Assert.isTrue(coin.getStatus() == CommonStatus.NORMAL, "coin disabled!");

        Member member = memberService.findOne(user.getId());
        Assert.notNull(member, "validate member id!");
        Assert.isTrue(member.getSignInAbility() == true, "Have already signed in!");

        MemberWallet memberWallet = walletService.findByCoinAndMember(coin, member);
        Assert.notNull(memberWallet, "Member wallet does not exist!");
        Assert.isTrue(memberWallet.getIsLock() == BooleanEnum.IS_FALSE, "Wallet locked!");

        //签到事件
        memberService.signInIncident(member, memberWallet, sign);

        return success();
    }
    
    /**
     * 获取用户信息
     * @param user
     * @return
     */
    @PostMapping("my-info")
    public MessageResult myInfo(@SessionAttribute(SESSION_MEMBER) AuthMember user) {
        //校验 签到活动 币种 会员 会员钱包
        Assert.notNull(user, "登录信息已超时!");

        Member member = memberService.findOne(user.getId());
        Assert.notNull(member, "登录信息错误!");
        
        Sign sign = signService.fetchUnderway();
        LoginInfo loginInfo;
        if (sign == null) {
            loginInfo = LoginInfo.getLoginInfo(member, member.getToken(), false, promotePrefix);
        } else {
            loginInfo = LoginInfo.getLoginInfo(member, member.getToken(), true, promotePrefix);
        }
        return success(loginInfo);
    }

    @PostMapping("promotion-rank")
    public MessageResult getPromotionRank() {
    	
    	return null;
    }

}
