package com.bizzan.bitrade.controller.finance;

import static com.bizzan.bitrade.constant.BooleanEnum.IS_FALSE;
import static com.bizzan.bitrade.constant.WithdrawStatus.FAIL;
import static com.bizzan.bitrade.constant.WithdrawStatus.SUCCESS;
import static com.bizzan.bitrade.constant.WithdrawStatus.WAITING;
import static org.springframework.util.Assert.isTrue;
import static org.springframework.util.Assert.notNull;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;

import org.apache.shiro.authz.annotation.Logical;
import org.apache.shiro.authz.annotation.RequiresPermissions;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.Assert;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.SessionAttribute;

import com.bizzan.bitrade.annotation.AccessLog;
import com.bizzan.bitrade.constant.AdminModule;
import com.bizzan.bitrade.constant.BooleanEnum;
import com.bizzan.bitrade.constant.PageModel;
import com.bizzan.bitrade.constant.SysConstant;
import com.bizzan.bitrade.constant.TransactionType;
import com.bizzan.bitrade.constant.WithdrawStatus;
import com.bizzan.bitrade.controller.common.BaseAdminController;
import com.bizzan.bitrade.entity.Admin;
import com.bizzan.bitrade.entity.Member;
import com.bizzan.bitrade.entity.MemberTransaction;
import com.bizzan.bitrade.entity.MemberWallet;
import com.bizzan.bitrade.entity.QMember;
import com.bizzan.bitrade.entity.QWithdrawRecord;
import com.bizzan.bitrade.entity.WithdrawRecord;
import com.bizzan.bitrade.es.ESUtils;
import com.bizzan.bitrade.model.screen.WithdrawRecordScreen;
import com.bizzan.bitrade.service.LocaleMessageSourceService;
import com.bizzan.bitrade.service.MemberService;
import com.bizzan.bitrade.service.MemberTransactionService;
import com.bizzan.bitrade.service.MemberWalletService;
import com.bizzan.bitrade.service.WithdrawRecordService;
import com.bizzan.bitrade.util.MessageResult;
import com.bizzan.bitrade.vendor.provider.SMSProvider;
import com.bizzan.bitrade.vo.WithdrawRecordVO;
import com.querydsl.core.types.Predicate;
import com.sparkframework.security.Encrypt;

import lombok.extern.slf4j.Slf4j;

/**
 * @author Shaoxianjun
 * @description 提现
 * @date 2019/2/25 11:22
 */
@RestController
@Slf4j
@RequestMapping("/finance/withdraw-record")
public class WithdrawRecordController extends BaseAdminController {
    @Autowired
    private WithdrawRecordService withdrawRecordService;

    @Autowired
    private MemberWalletService memberWalletService;

    @Autowired
    private MemberTransactionService memberTransactionService;

    @Autowired
    private LocaleMessageSourceService messageSource;
    @Autowired
    private ESUtils esUtils;

    @Autowired
    private SMSProvider smsProvider;
    
    @Autowired
    private MemberService memberService;


    @Value("${spark.system.md5.key}")
    private String md5Key;

    @RequiresPermissions("finance:withdraw-record:all")
    @GetMapping("/all")
    @AccessLog(module = AdminModule.FINANCE, operation = "所有提现记录WithdrawRecord")
    public MessageResult all() {
        List<WithdrawRecord> withdrawRecordList = withdrawRecordService.findAll();
        if (withdrawRecordList == null || withdrawRecordList.size() < 1) {
            return error(messageSource.getMessage("NO_DATA"));
        }
        return success(withdrawRecordList);
    }

    @RequiresPermissions(value = {"finance:withdraw-record:page-query", "finance:withdraw-record:page-query:success"}, logical = Logical.OR)
    @RequestMapping("/page-query")
    @AccessLog(module = AdminModule.FINANCE, operation = "分页查询提现记录WithdrawRecord")
    public MessageResult pageQuery(
            PageModel pageModel,
            WithdrawRecordScreen screen) {
        List<Predicate> predicates = new ArrayList<>();
        predicates.add(QWithdrawRecord.withdrawRecord.memberId.eq(QMember.member.id));

        if (screen.getMemberId() != null) {
            predicates.add(QWithdrawRecord.withdrawRecord.memberId.eq(screen.getMemberId()));
        }

        if ( !StringUtils.isEmpty(screen.getMobilePhone())){
            Member member = memberService.findByPhone(screen.getMobilePhone());
            predicates.add(QWithdrawRecord.withdrawRecord.memberId.eq(member.getId()));
        }

        if ( !StringUtils.isEmpty(screen.getOrderSn())){
            predicates.add(QWithdrawRecord.withdrawRecord.transactionNumber.eq(screen.getOrderSn()));
        }

        if (screen.getStatus() != null) {
            predicates.add(QWithdrawRecord.withdrawRecord.status.eq(screen.getStatus()));
        }

        if (screen.getIsAuto() != null) {
            predicates.add(QWithdrawRecord.withdrawRecord.isAuto.eq(screen.getIsAuto()));
        }

        if (!StringUtils.isEmpty(screen.getAddress())) {
            predicates.add(QWithdrawRecord.withdrawRecord.address.eq(screen.getAddress()));
        }

        if (!StringUtils.isEmpty(screen.getUnit())) {
            predicates.add(QWithdrawRecord.withdrawRecord.coin.unit.equalsIgnoreCase(screen.getUnit()));
        }

        if (!StringUtils.isEmpty(screen.getAccount())) {
            predicates.add(QMember.member.username.like("%" + screen.getAccount() + "%")
                    .or(QMember.member.realName.like("%" + screen.getAccount() + "%")));
        }

        Page<WithdrawRecordVO> pageListMapResult = withdrawRecordService.joinFind(predicates, pageModel);
        return success(pageListMapResult);
    }

    @GetMapping("/{id}")
    @RequiresPermissions("finance:withdraw-record:detail")
    @AccessLog(module = AdminModule.FINANCE, operation = "提现记录WithdrawRecord 详情")
    public MessageResult detail(@PathVariable("id") Long id) {
        WithdrawRecord withdrawRecord = withdrawRecordService.findOne(id);
        notNull(withdrawRecord, messageSource.getMessage("NO_DATA"));
        return success(withdrawRecord);
    }

    //一键审核通过
    @RequiresPermissions("finance:withdraw-record:audit-pass")
    @PatchMapping("/audit-pass")
    @AccessLog(module = AdminModule.FINANCE, operation = "提现记录WithdrawRecord一键审核通过")
    public MessageResult auditPass(@RequestParam("ids") Long[] ids) {
        withdrawRecordService.audit(ids, WAITING);
        SimpleDateFormat df = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");
        String date = df.format(new Date());
        for(Long id : ids) {
        	WithdrawRecord record = withdrawRecordService.findOne(id);
        	Member member = memberService.findOne(record.getMemberId());
        	if(member != null) {
        		try {
					smsProvider.sendCustomMessage(member.getMobilePhone(), "尊敬的用户，恭喜您于" + date + "提取 " + record.getCoin().getUnit() + "成功，数量为" + record.getArrivedAmount() + "。");
				} catch (Exception e) {
					e.printStackTrace();
				}
        	}
        }
        return success(messageSource.getMessage("PASS_THE_AUDIT"));
    }

    //一键审核不通过
    @RequiresPermissions("finance:withdraw-record:audit-no-pass")
    @PatchMapping("/audit-no-pass")
    @AccessLog(module = AdminModule.FINANCE, operation = "提现记录WithdrawRecord一键审核不通过")
    public MessageResult auditNoPass(@RequestParam("ids") Long[] ids) {
        withdrawRecordService.audit(ids, FAIL);
        SimpleDateFormat df = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");
        String date = df.format(new Date());
        for(Long id : ids) {
        	WithdrawRecord record = withdrawRecordService.findOne(id);
        	Member member = memberService.findOne(record.getMemberId());
        	if(member != null) {
        		try {
					smsProvider.sendCustomMessage(member.getMobilePhone(), "尊敬的用户，万分抱歉，您于" + date + "提取 " + record.getCoin().getUnit() + "失败，数量为" + record.getArrivedAmount() + "，请联系客服处理。");
				} catch (Exception e) {
					e.printStackTrace();
				}
        	}
        }
        return success(messageSource.getMessage("AUDIT_DOES_NOT_PASS"));
    }

    /**
     * 单个打款 转账成功添加流水号
     *
     * @param id
     * @param transactionNumber
     * @return
     */
    @RequiresPermissions("finance:withdraw-record:add-transaction-number")
    @PatchMapping("/add-transaction-number")
    @AccessLog(module = AdminModule.FINANCE, operation = "添加交易流水号")
    @Transactional(rollbackFor = Exception.class)
    public MessageResult addNumber(
            @RequestParam("id") Long id,
            @RequestParam("transactionNumber") String transactionNumber) {
        // Dual-book Option B — admin has no compose service, so the 410 door never
        // executes. Remittance burned frozen wallet balances without ledger settle.
        // ADR 2026-08-04: agents may throw where only a door stood.
        // Queue if ever re-enabled: ledger recipe withdrawSettle (not Java book).
        throw new IllegalStateException(
                "admin withdraw remittance is disabled: Java shell must not settle balances (INTAFACED dual-book)");
    }

    //批量打款
    @RequiresPermissions("finance:withdraw-record:remittance")
    @PatchMapping("/remittance")
    @AccessLog(module = AdminModule.FINANCE, operation = "提现记录/批量打款")
    @Transactional(rollbackFor = Exception.class)
    public MessageResult remittance(
            @SessionAttribute(SysConstant.SESSION_ADMIN) Admin admin,
            @RequestParam("ids") Long[] ids,
            @RequestParam("transactionNumber") String transactionNumber,
            @RequestParam("password") String password) {
        // Dual-book Option B — same as addNumber: batch remittance debited frozen
        // balances on every selected record. Refuse at method entry.
        // Queue if ever re-enabled: ledger recipe withdrawSettle (not Java book).
        throw new IllegalStateException(
                "admin withdraw remittance is disabled: Java shell must not settle balances (INTAFACED dual-book)");
    }

}
