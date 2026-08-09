package com.bizzan.bitrade.controller;

import static com.bizzan.bitrade.constant.SysConstant.SESSION_MEMBER;
import static com.bizzan.bitrade.util.MessageResult.error;
import static com.bizzan.bitrade.util.MessageResult.success;
import static org.springframework.util.Assert.isTrue;
import static org.springframework.util.Assert.notNull;

import java.math.BigDecimal;
import java.util.Calendar;
import java.util.Date;
import java.util.List;
import java.util.Random;
import java.util.concurrent.TimeUnit;

import javax.annotation.Resource;

import org.apache.shiro.util.Assert;
import org.apache.shiro.util.ByteSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.SessionAttribute;

import com.bizzan.bitrade.annotation.AccessLog;
import com.bizzan.bitrade.constant.AdminModule;
import com.bizzan.bitrade.constant.CommonStatus;
import com.bizzan.bitrade.constant.MemberLevelEnum;
import com.bizzan.bitrade.constant.SysConstant;
import com.bizzan.bitrade.constant.TransactionType;
import com.bizzan.bitrade.entity.Coin;
import com.bizzan.bitrade.entity.Country;
import com.bizzan.bitrade.entity.Location;
import com.bizzan.bitrade.entity.Member;
import com.bizzan.bitrade.entity.MemberTransaction;
import com.bizzan.bitrade.entity.MemberWallet;
import com.bizzan.bitrade.entity.RedEnvelope;
import com.bizzan.bitrade.entity.RedEnvelopeDetail;
import com.bizzan.bitrade.entity.transform.AuthMember;
import com.bizzan.bitrade.event.MemberEvent;
import com.bizzan.bitrade.service.CoinService;
import com.bizzan.bitrade.service.CountryService;
import com.bizzan.bitrade.service.LocaleMessageSourceService;
import com.bizzan.bitrade.service.MemberPromotionService;
import com.bizzan.bitrade.service.MemberService;
import com.bizzan.bitrade.service.MemberTransactionService;
import com.bizzan.bitrade.service.MemberWalletService;
import com.bizzan.bitrade.service.RedEnvelopeDetailService;
import com.bizzan.bitrade.service.RedEnvelopeService;
import com.bizzan.bitrade.util.BigDecimalUtils;
import com.bizzan.bitrade.util.DateUtil;
import com.bizzan.bitrade.util.GeneratorUtil;
import com.bizzan.bitrade.util.IdWorkByTwitter;
import com.bizzan.bitrade.util.Md5;
import com.bizzan.bitrade.util.MessageResult;
import com.bizzan.bitrade.util.ValidateUtil;
import com.bizzan.bitrade.vendor.provider.SMSProvider;
import com.bizzan.bitrade.vo.MemberPromotionStasticVO;

/**
 * 红包
 *
 * @author GS
 * @date 2018年03月19日
 */
@RestController
@RequestMapping(value = "/redenvelope")
public class RedEnvelopeController extends BaseController{
	
	@Autowired
	private RedEnvelopeService redEnvelopeService;
	
	@Autowired
	private RedEnvelopeDetailService redEnvelopeDetailService;
	
	@Autowired
    private MemberPromotionService memberPromotionService;
	
    @Autowired
    private MemberService memberService;
    
    @Autowired
    private MemberWalletService memberWalletService;

    @Autowired
    private MemberTransactionService memberTransactionService;
    
    @Resource
    private LocaleMessageSourceService localeMessageSourceService;
    
    @Autowired
    private CoinService coinService;
    
    @Autowired
    private RedisTemplate redisTemplate;

    @Autowired
    private IdWorkByTwitter idWorkByTwitter;
    
    @Autowired
    private MemberEvent memberEvent;
    
    @Autowired
    private SMSProvider smsProvider;
    
    @Autowired
    private CountryService countryService;
    
    private Random rand = new Random();
    
	/**
     * 查看红包详情（根据红包编号查询，注意，不是ID）
     * @param envelopeNo
     * @return
     */
    @RequestMapping(value = "/query")
    private MessageResult envelopeDetail(@RequestParam(value = "envelopeNo", defaultValue = "") String envelopeNo,
    		@RequestParam(value = "code", defaultValue = "") String code) {
    	Assert.notNull(envelopeNo, "无效的红包！");
    	RedEnvelope redEnvelope = redEnvelopeService.findByEnvelopeNo(envelopeNo);
    	Assert.notNull(redEnvelope, "无效的红包！");
    	if(StringUtils.hasText(code)) {
    		Member member = memberService.findMemberByPromotionCode(code);
    		if(member != null) {
    			if(StringUtils.hasText(member.getMobilePhone())) {
    				redEnvelope.setInviteUser(member.getMobilePhone().substring(0, 3) + "****" + member.getMobilePhone().substring(7, member.getMobilePhone().length()));
    			}
    			redEnvelope.setInviteUserAvatar(member.getAvatar());
    		}
    	}
    	return success(redEnvelope);
    }
    
    /**
     * 红包领取详情
     * @param envelopeId
     * @param pageNo
     * @param pageSize
     * @return
     */
    @PostMapping("/query-detail")
    @AccessLog(module = AdminModule.REDENVELOPE, operation = "查看红包领取详情RedEnvelopeController")
    public MessageResult envelopeDetailList(@RequestParam(value = "envelopeId", defaultValue = "0") Long envelopeId,
    		@RequestParam(value = "pageNo", defaultValue = "0") Integer pageNo,
    		@RequestParam(value = "pageSize", defaultValue = "10") Integer pageSize) {
    	
    	Page<RedEnvelopeDetail> detailList = redEnvelopeDetailService.findByEnvelope(envelopeId, pageNo, pageSize);
    	for(int i = 0; i < detailList.getContent().size(); i++) {
    		detailList.getContent().get(i).setUserIdentify(detailList.getContent().get(i).getUserIdentify().substring(0, 3) 
    				+ "****"
    				+ detailList.getContent().get(i).getUserIdentify().substring(7, 11) );
    	}
        return success(detailList);
    }
    
    /**
     * 获取用户发出的所有钱包
     * @param envelopeNo
     * @return
     */
    @RequestMapping(value = "/myenvelope")
    private MessageResult envelopeList(@SessionAttribute(SESSION_MEMBER) AuthMember member,
    		@RequestParam(value = "pageNo", defaultValue = "0") Integer pageNo,
    		@RequestParam(value = "pageSize", defaultValue = "10") Integer pageSize) {
    	
    	Assert.notNull(member, "无效的用户！");
    	Page<RedEnvelope> redEnvelopeList = redEnvelopeService.findByMember(member.getId(), pageNo.intValue(), pageSize.intValue());
    	Assert.notNull(redEnvelopeList, "没有红包！");
    	
    	return success(redEnvelopeList);
    }
    
    /**
     * 我领取到的红包
     * @param member
     * @param envelopeNo
     * @return
     */
    @RequestMapping(value = "/myreceive")
    private MessageResult envelopeList(@SessionAttribute(SESSION_MEMBER) AuthMember member,
    		@RequestParam(value = "envelopeNo", defaultValue = "") String envelopeNo) {
    	
    	Assert.notNull(envelopeNo, "无效的红包！");
    	RedEnvelope redEnvelope = redEnvelopeService.findByEnvelopeNo(envelopeNo);
    	Assert.notNull(redEnvelope, "无效的红包！");
    	
    	// 查询用户是否存在
    	Member authMember = memberService.findOne(member.getId());
    	Assert.notNull(authMember, "非法操作!");
    	
    	List<RedEnvelopeDetail> detailList = redEnvelopeDetailService.findByEnvelopeIdAndMemberId(redEnvelope.getId(), member.getId());
    	
    	return success(detailList);
    }
    
    /**
     * 剩余领取次数（仅登录用户能查看到）
     * @param member
     * @param envelopeNo
     * @return
     */
    @RequestMapping(value = "/lefttimes")
    private MessageResult leftTimes(@SessionAttribute(SESSION_MEMBER) AuthMember member,
    		@RequestParam(value = "envelopeNo", defaultValue = "") String envelopeNo) {
    	int times = 0;
    	// 查询红包是否存在
    	Assert.notNull(envelopeNo, "无效的红包！");
    	RedEnvelope redEnvelope = redEnvelopeService.findByEnvelopeNo(envelopeNo);
    	Assert.notNull(redEnvelope, "无效的红包！");
    	
    	// 查询用户是否存在
    	Member authMember = memberService.findOne(member.getId());
    	Assert.notNull(authMember, "非法操作!");
    	
    	if(redEnvelope.getState() == 1) {
    		return error("该红包已被领完");
    	}
    	
    	if(redEnvelope.getState() == 2) {
    		return error("该红包已过期");
    	}
    	
    	if(redEnvelope.getState() == 0) {
	    	// 判断红包是否过期(过期有两种可能：1、过期了但是已经被领取完；2：过期了红包还有剩余没有被领取
	    	long currentTime = Calendar.getInstance().getTimeInMillis(); // 当前时间戳
	    	if(currentTime >= (redEnvelope.getCreateTime().getTime() + redEnvelope.getExpiredHours() * 60 * 60 * 1000)) {
	    		if(redEnvelope.getReceiveCount() < redEnvelope.getCount()) {
	    			return error("该红包已过期");
		    	}else {
		    		return error("该红包已被领完");
		    	}
	    	}
	    	
	    	// 判断红包是否已被领取完
	    	if(redEnvelope.getReceiveCount() >= redEnvelope.getCount()) {
    			return error("该红包已被领完");
	    	}
    	}
    	
    	// 判断是否领取过红包（邀请加一次领取机会的处理逻辑）
    	// 0: 邀请不增加领取机会
    	// 1: 邀请增加领取机会
    	List<RedEnvelopeDetail> detailList = redEnvelopeDetailService.findByEnvelopeIdAndMemberId(redEnvelope.getId(), member.getId());
    	if(detailList != null && detailList.size() > 0) {
    		if(redEnvelope.getInvite() == 0) {
    			return success(0);
    		}
	    	if(redEnvelope.getInvite() == 1) {
	    		// 查看邀请记录
	    		Date endDate = new Date();
	    		List<MemberPromotionStasticVO> inviteList = memberPromotionService.getDateRangeRank(0, redEnvelope.getCreateTime(), endDate, 10000); // 此处10000表示邀请人数limit
	    		if(inviteList.size() <= detailList.size()) {
	    			return success(0);
	    		}else {
	    			return success(inviteList.size() - detailList.size());
	    		}
	    	}
    	}else {
    		if(redEnvelope.getInvite() == 0) {
    			return success(1);
    		}
	    	if(redEnvelope.getInvite() == 1) {
	    		// 查看邀请记录
	    		Date endDate = new Date();
	    		List<MemberPromotionStasticVO> inviteList = memberPromotionService.getDateRangeRank(0, redEnvelope.getCreateTime(), endDate, 10000); // 此处10000表示邀请人数limit
	    		if(inviteList.size() == 0) {
	    			return success(1); // 从未领取过并且没有邀请过人
	    		}else {
	    			return success(inviteList.size() + 1); // 从未领取过并且期间邀请了人
	    		}
	    	}
    	}
    	return success(0);
    }
    /**
     * 登录用户领取（一般在红包中心、APP红包中心领取）
     * @param member
     * @param pageNo
     * @param pageSize
     * @return
     */
    @RequestMapping(value = "/receivelogin")
    private MessageResult receiveEnvelopeLogin(@SessionAttribute(SESSION_MEMBER) AuthMember member,
    		@RequestParam(value = "envelopeNo", defaultValue = "") String envelopeNo) {
        // Dual-book Option B — claim credited MemberWallet via setBalance.
        // Door covers /redenvelope; body kill matches Grade C residual.
        // Queue: ledger recipe rewardPay (not Java book).
        throw new IllegalStateException(
                "red-envelope claim is disabled: Java shell must not credit balances (INTAFACED dual-book)");
    }

    @RequestMapping(value = "/receive")
    @Transactional(rollbackFor = Exception.class)
    private MessageResult receiveEnvelope(String phone, String verifyCode, String promotionCode,
    								   @RequestParam(value = "envelopeNo", defaultValue = "") String envelopeNo) throws Exception {
        // Dual-book Option B — guest claim path also credited MemberWallet via setBalance.
        // Queue: ledger recipe rewardPay (not Java book).
        throw new IllegalStateException(
                "red-envelope claim is disabled: Java shell must not credit balances (INTAFACED dual-book)");
    }

    @PostMapping("/code")
    public MessageResult envelopeCode(String phone, String country, Long envelopeId) throws Exception {
        Assert.notNull(country, localeMessageSourceService.getMessage("REQUEST_ILLEGAL"));
        Country country1 = countryService.findOne(country);
        Assert.notNull(country1, localeMessageSourceService.getMessage("REQUEST_ILLEGAL"));
        Assert.notNull(envelopeId, localeMessageSourceService.getMessage("REQUEST_ILLEGAL"));
        
        RedEnvelope redEnvelope = redEnvelopeService.findById(envelopeId);
    	Assert.notNull(redEnvelope, "红包不存在！");
    	
    	if(redEnvelope.getState() == 1) {
    		return error("该红包已被领完!");
    	}
    	
    	if(redEnvelope.getState() == 2) {
    		return error("该红包已过期!");
    	}
    	
    	if(redEnvelope.getState() == 0) {
	    	// 判断红包是否过期(过期有两种可能：1、过期了但是已经被领取完；2：过期了红包还有剩余没有被领取
	    	long currentTime = Calendar.getInstance().getTimeInMillis(); // 当前时间戳
	    	if(currentTime >= (redEnvelope.getCreateTime().getTime() + redEnvelope.getExpiredHours() * 60 * 60 * 1000)) {
	    		if(redEnvelope.getReceiveCount() < redEnvelope.getCount()) {
	    			return error("该红包已过期!");
		    	}else {
		    		return error("该红包已被领完!");
		    	}
	    	}
	    	
	    	// 判断红包是否已被领取完
	    	if(redEnvelope.getReceiveCount() >= redEnvelope.getCount()) {
    			return error("该红包已被领完!");
	    	}
    	}
    	Member member = null;
    	if(memberService.phoneIsExist(phone)) {
	    	// 判断是否领取过红包（邀请加一次领取机会的处理逻辑）
	    	// 0: 邀请不增加领取机会
	    	// 1: 邀请增加领取机会
    		member = memberService.findByPhone(phone);
	    	List<RedEnvelopeDetail> detailList = redEnvelopeDetailService.findByEnvelopeIdAndMemberId(redEnvelope.getId(), member.getId());
	    	if(detailList != null && detailList.size() > 0) {
	    		if(redEnvelope.getInvite() == 0) {
	    			return error("已领取过该红包!");
	    		}
		    	if(redEnvelope.getInvite() == 1) {
		    		// 查看邀请记录
		    		Date endDate = new Date();
		    		List<MemberPromotionStasticVO> inviteList = memberPromotionService.getDateRangeRank(0, redEnvelope.getCreateTime(), endDate, 10000); // 此处10000表示邀请人数limit
		    		if(inviteList.size() <= detailList.size()) {
		    			return error("尚无新邀请好友，无法领取红包！");
		    		}
		    	}
	    	}
    	}
    	
    	
        ValueOperations valueOperations = redisTemplate.opsForValue();
        String key = SysConstant.PHONE_RECEIVE_ENVELOPE_PREFIX + phone;
        Object code = valueOperations.get(key);
        if (code != null) {
            //判断如果请求间隔小于一分钟则请求失败
            if (!BigDecimalUtils.compare(DateUtil.diffMinute((Date) (valueOperations.get(key + "Time"))), BigDecimal.ONE)) {
                return error(localeMessageSourceService.getMessage("FREQUENTLY_REQUEST"));
            }
        }
        String randomCode = String.valueOf(GeneratorUtil.getRandomNumber(100000, 999999));
        MessageResult result;
        if ("86".equals(country1.getAreaCode())) {
            Assert.isTrue(ValidateUtil.isMobilePhone(phone.trim()), localeMessageSourceService.getMessage("PHONE_EMPTY_OR_INCORRECT"));
            result = smsProvider.sendVerifyMessage(phone, randomCode);
        } else {
            result = smsProvider.sendInternationalMessage(randomCode, country1.getAreaCode() + phone);
        }
        if (result.getCode() == 0) {
            valueOperations.getOperations().delete(key);
            valueOperations.getOperations().delete(key + "Time");
            // 缓存验证码
            valueOperations.set(key, randomCode, 10, TimeUnit.MINUTES);
            valueOperations.set(key + "Time", new Date(), 10, TimeUnit.MINUTES);
            return success(localeMessageSourceService.getMessage("SEND_SMS_SUCCESS"));
        } else {
            return error(localeMessageSourceService.getMessage("SEND_SMS_FAILED"));
        }
    }
}
